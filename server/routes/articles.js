import { Router } from 'express'
import { z } from 'zod'
import { db, articleRowToJson, withTransaction } from '../db.js'
import { requireAuth } from './auth.js'

export const articlesRouter = Router()
articlesRouter.use(requireAuth)

const STATUSES = ['draft', 'in_review', 'scheduled', 'published', 'archived']
const CATEGORIES = ['tech', 'tutorial', 'essay', 'news']
const PLATFORMS = ['website', 'wechat', 'zhihu', 'xiaohongshu', 'juejin', 'bilibili']

const optionalDate = z.preprocess(
  (v) => (v === null || v === '' ? undefined : v),
  z.coerce.date().optional()
)

// PATCH 语义:undefined = 不修改;null = 清空该时间
const patchableDate = z.union([z.literal(null), z.coerce.date()]).optional()

const createSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string(),
  content: z.string(),
  status: z.enum(STATUSES),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string()).default([]),
  platforms: z.array(z.enum(PLATFORMS)).default([]),
  views: z.number().int().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
  scheduledAt: optionalDate,
  publishedAt: optionalDate,
})

// 注意:PATCH 的字段不带 default——否则 zod 会在字段缺失时
// 填入默认值,把 tags/platforms 等意外重置
const patchSchema = z
  .object({
    title: z.string().min(1),
    excerpt: z.string(),
    content: z.string(),
    status: z.enum(STATUSES),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string()),
    platforms: z.array(z.enum(PLATFORMS)),
    views: z.number().int().nonnegative(),
    likes: z.number().int().nonnegative(),
    scheduledAt: patchableDate,
    publishedAt: patchableDate,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: '至少提供一个字段' })

/** 全量行 → SQL 行;PATCH 复用时,undefined 字段会被过滤掉(不参与更新) */
const toSql = (a) => {
  const iso = (d) => (d ? d.toISOString() : null)
  const row = {
    title: a.title,
    excerpt: a.excerpt,
    content: a.content,
    status: a.status,
    category: a.category,
    tags: a.tags === undefined ? undefined : JSON.stringify(a.tags),
    platforms:
      a.platforms === undefined ? undefined : JSON.stringify(a.platforms),
    views: a.views,
    likes: a.likes,
    scheduled_at: a.scheduledAt === undefined ? undefined : iso(a.scheduledAt),
    published_at: a.publishedAt === undefined ? undefined : iso(a.publishedAt),
    updated_at: new Date().toISOString(),
  }
  return Object.fromEntries(
    Object.entries(row).filter(([, v]) => v !== undefined)
  )
}

/**
 * GET /api/articles
 * 服务端分页 + 筛选:page / pageSize / status / category / filter(标题、标签模糊搜索)。
 * pageSize=all 时返回全量(前端当前一次性 hydrate 到客户端 store)。
 */
articlesRouter.get('/', (req, res) => {
  const { page = '1', pageSize = '10', status, category, filter } = req.query
  const where = []
  const params = {}

  if (status) {
    const list = String(status).split(',').filter((s) => STATUSES.includes(s))
    if (list.length) {
      where.push(`status IN (${list.map((_, i) => `@status${i}`).join(',')})`)
      list.forEach((s, i) => (params[`status${i}`] = s))
    }
  }
  if (category) {
    const list = String(category).split(',').filter((c) => CATEGORIES.includes(c))
    if (list.length) {
      where.push(`category IN (${list.map((_, i) => `@category${i}`).join(',')})`)
      list.forEach((c, i) => (params[`category${i}`] = c))
    }
  }
  if (filter) {
    where.push('(title LIKE @filter OR tags LIKE @filter OR id LIKE @filter)')
    params.filter = `%${String(filter)}%`
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = db.prepare(`SELECT COUNT(*) AS c FROM articles ${whereSql}`).get(params).c

  if (String(pageSize) === 'all') {
    const rows = db
      .prepare(`SELECT * FROM articles ${whereSql} ORDER BY created_at DESC`)
      .all(params)
    return res.json({ data: rows.map(articleRowToJson), total, page: 1, pageSize: total })
  }

  const size = Math.min(Math.max(Number(pageSize) || 10, 1), 100)
  const current = Math.max(Number(page) || 1, 1)
  const rows = db
    .prepare(
      `SELECT * FROM articles ${whereSql}
       ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: size, offset: (current - 1) * size })

  res.json({ data: rows.map(articleRowToJson), total, page: current, pageSize: size })
})

articlesRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: '字段校验失败', issues: parsed.error.issues })
  }
  const a = parsed.data
  const now = new Date().toISOString()
  try {
    db.prepare(`
      INSERT INTO articles
        (id, title, excerpt, content, status, category, tags, platforms,
         views, likes, scheduled_at, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      a.id, a.title, a.excerpt, a.content, a.status, a.category,
      JSON.stringify(a.tags), JSON.stringify(a.platforms),
      a.views, a.likes,
      a.scheduledAt?.toISOString() ?? null,
      a.publishedAt?.toISOString() ?? null,
      now, now
    )
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ message: `文章 ID ${a.id} 已存在` })
    }
    throw err
  }
  res.status(201).json(articleRowToJson(db.prepare('SELECT * FROM articles WHERE id = ?').get(a.id)))
})

articlesRouter.patch('/bulk', (req, res) => {
  const schema = z.object({
    ids: z.array(z.string()).min(1),
    patch: patchSchema,
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: '字段校验失败', issues: parsed.error.issues })
  }
  const cols = Object.entries(toSql(parsed.data.patch))
    .map(([k]) => `${k} = @${k}`)
    .join(', ')
  const stmt = db.prepare(`UPDATE articles SET ${cols} WHERE id = @id`)
  const run = withTransaction((ids) => {
    for (const id of ids) stmt.run({ ...toSql(parsed.data.patch), id })
  })
  run(parsed.data.ids)
  res.json({ updated: parsed.data.ids.length })
})

articlesRouter.patch('/:id', (req, res) => {
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: '字段校验失败', issues: parsed.error.issues })
  }
  const cols = Object.entries(toSql(parsed.data))
    .map(([k]) => `${k} = @${k}`)
    .join(', ')
  const result = db
    .prepare(`UPDATE articles SET ${cols} WHERE id = @id`)
    .run({ ...toSql(parsed.data), id: req.params.id })
  if (result.changes === 0) return res.status(404).json({ message: '文章不存在' })
  res.json(articleRowToJson(db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id)))
})

articlesRouter.delete('/:id', (req, res) => {
  const run = withTransaction(() => {
    db.prepare('DELETE FROM comments WHERE article_id = ?').run(req.params.id)
    return db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id)
  })()
  if (run.changes === 0) return res.status(404).json({ message: '文章不存在' })
  res.json({ deleted: run.changes })
})

// 阅读上报:阅读量 +1(前端「最近发布」点击等场景调用)
articlesRouter.post('/:id/view', (req, res) => {
  const result = db
    .prepare('UPDATE articles SET views = views + 1 WHERE id = ?')
    .run(req.params.id)
  if (result.changes === 0) return res.status(404).json({ message: '文章不存在' })
  const row = db.prepare('SELECT id, views FROM articles WHERE id = ?').get(req.params.id)
  res.json(row)
})

articlesRouter.post('/bulk-delete', (req, res) => {
  const parsed = z.object({ ids: z.array(z.string()).min(1) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: '字段校验失败' })
  const deleteComments = db.prepare('DELETE FROM comments WHERE article_id = ?')
  const deleteArticle = db.prepare('DELETE FROM articles WHERE id = ?')
  const run = withTransaction((ids) => {
    for (const id of ids) {
      deleteComments.run(id)
      deleteArticle.run(id)
    }
  })
  run(parsed.data.ids)
  res.json({ deleted: parsed.data.ids.length })
})
