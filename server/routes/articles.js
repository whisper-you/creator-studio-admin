import { z } from 'zod'
import { Router } from 'express'
import { db, articleRowToJson, withTransaction } from '../db/index.js'
import {
  ARTICLE_STATUSES,
  canTransition,
  statusLabel,
} from '../services/article-status.js'
import { recordAudit } from '../services/audit.js'
import { requireAuth } from './auth.js'

export const articlesRouter = Router()
articlesRouter.use(requireAuth)

const CATEGORIES = ['tech', 'tutorial', 'essay', 'news']
const PLATFORMS = [
  'website',
  'wechat',
  'zhihu',
  'xiaohongshu',
  'juejin',
  'bilibili',
]

const AUTHOR_STATUSES = ['draft', 'in_review']

// 输入规模上限:批量接口逐条查询/写入是同步的,超大数组会长时间阻塞事件循环
const MAX_BULK_ITEMS = 100
const MAX_ID_LENGTH = 64
const MAX_TITLE_LENGTH = 200
const MAX_EXCERPT_LENGTH = 600
const MAX_CONTENT_LENGTH = 200_000
const MAX_TAGS = 20
const MAX_TAG_LENGTH = 30

const idField = z.string().min(1).max(MAX_ID_LENGTH)
const titleField = z.string().min(1).max(MAX_TITLE_LENGTH)
const excerptField = z.string().max(MAX_EXCERPT_LENGTH)
const contentField = z.string().max(MAX_CONTENT_LENGTH)
const tagsField = z.array(z.string().max(MAX_TAG_LENGTH)).max(MAX_TAGS)
const idsField = z.array(idField).min(1).max(MAX_BULK_ITEMS)

const forbidden = (res, message = '当前角色无权执行此操作') =>
  res.status(403).json({ message })

const isAdmin = (user) => user.role === 'admin'
const isEditor = (user) => user.role === 'editor'
const isAuthor = (user) => user.role === 'author'
const ownsArticle = (user, row) => String(row.author_id) === String(user.id)

/** admin 全量;editor 可编辑任意文章;author 仅限自己的文章 */
const canEditArticle = (user, row) =>
  isAdmin(user) || isEditor(user) || ownsArticle(user, row)

/** author 只能写 draft / in_review;currentStatus 放行「保持当前状态」的编辑 */
const authorStatusAllowed = (user, status, currentStatus) =>
  !isAuthor(user) ||
  status === undefined ||
  status === currentStatus ||
  AUTHOR_STATUSES.includes(status)

/** 状态机冲突:与角色越权(403)区分开,便于前端提示具体流转方向 */
const transitionConflict = (res, details) =>
  res.status(409).json({
    message: `不允许的状态流转:${details.join(';')}`,
  })

const optionalDate = z.preprocess(
  (v) => (v === null || v === '' ? undefined : v),
  z.coerce.date().optional()
)

// PATCH 语义:undefined = 不修改;null = 清空该时间
const patchableDate = z.union([z.literal(null), z.coerce.date()]).optional()

const createSchema = z.object({
  id: idField,
  title: titleField,
  excerpt: excerptField,
  content: contentField,
  status: z.enum(ARTICLE_STATUSES),
  category: z.enum(CATEGORIES),
  tags: tagsField.default([]),
  platforms: z.array(z.enum(PLATFORMS)).max(PLATFORMS.length).default([]),
  views: z.number().int().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
  scheduledAt: optionalDate,
  publishedAt: optionalDate,
})

// 注意:PATCH 的字段不带 default——否则 zod 会在字段缺失时
// 填入默认值,把 tags/platforms 等意外重置
const patchSchema = z
  .object({
    title: titleField,
    excerpt: excerptField,
    content: contentField,
    status: z.enum(ARTICLE_STATUSES),
    category: z.enum(CATEGORIES),
    tags: tagsField,
    platforms: z.array(z.enum(PLATFORMS)).max(PLATFORMS.length),
    views: z.number().int().nonnegative(),
    likes: z.number().int().nonnegative(),
    scheduledAt: patchableDate,
    publishedAt: patchableDate,
    // 乐观锁:客户端带上读取时的版本号,不匹配则拒绝写入
    version: z.number().int().positive(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: '至少提供一个字段' })

const versionConflict = (res, currentVersion) =>
  res.status(409).json({
    message: '文章已被他人修改,请刷新后重试',
    currentVersion,
  })

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
    const list = String(status)
      .split(',')
      .filter((s) => ARTICLE_STATUSES.includes(s))
    if (list.length) {
      where.push(`status IN (${list.map((_, i) => `@status${i}`).join(',')})`)
      list.forEach((s, i) => (params[`status${i}`] = s))
    }
  }
  if (category) {
    const list = String(category)
      .split(',')
      .filter((c) => CATEGORIES.includes(c))
    if (list.length) {
      where.push(
        `category IN (${list.map((_, i) => `@category${i}`).join(',')})`
      )
      list.forEach((c, i) => (params[`category${i}`] = c))
    }
  }
  if (filter) {
    where.push('(title LIKE @filter OR tags LIKE @filter OR id LIKE @filter)')
    params.filter = `%${String(filter)}%`
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM articles ${whereSql}`)
    .get(params).c

  if (String(pageSize) === 'all') {
    const rows = db
      .prepare(`SELECT * FROM articles ${whereSql} ORDER BY created_at DESC`)
      .all(params)
    return res.json({
      data: rows.map(articleRowToJson),
      total,
      page: 1,
      pageSize: total,
    })
  }

  const size = Math.min(Math.max(Number(pageSize) || 10, 1), 100)
  const current = Math.max(Number(page) || 1, 1)
  const rows = db
    .prepare(
      `SELECT * FROM articles ${whereSql}
       ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: size, offset: (current - 1) * size })

  res.json({
    data: rows.map(articleRowToJson),
    total,
    page: current,
    pageSize: size,
  })
})

articlesRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: '字段校验失败', issues: parsed.error.issues })
  }
  const a = parsed.data
  if (!authorStatusAllowed(req.user, a.status)) {
    return forbidden(res, '作者仅可创建草稿或提交审核的文章')
  }
  const now = new Date().toISOString()
  try {
    db.prepare(
      `
      INSERT INTO articles
        (id, author_id, title, excerpt, content, status, category, tags, platforms,
         views, likes, scheduled_at, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      a.id,
      req.user.id,
      a.title,
      a.excerpt,
      a.content,
      a.status,
      a.category,
      JSON.stringify(a.tags),
      JSON.stringify(a.platforms),
      a.views,
      a.likes,
      a.scheduledAt?.toISOString() ?? null,
      a.publishedAt?.toISOString() ?? null,
      now,
      now
    )
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ message: `文章 ID ${a.id} 已存在` })
    }
    throw err
  }
  res
    .status(201)
    .json(
      articleRowToJson(
        db.prepare('SELECT * FROM articles WHERE id = ?').get(a.id)
      )
    )
})

articlesRouter.post('/bulk', (req, res) => {
  const schema = z.object({
    articles: z.array(createSchema).min(1).max(MAX_BULK_ITEMS),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: '字段校验失败', issues: parsed.error.issues })
  }
  if (
    isAuthor(req.user) &&
    parsed.data.articles.some((a) => !AUTHOR_STATUSES.includes(a.status))
  ) {
    return forbidden(res, '作者仅可创建草稿或提交审核的文章')
  }
  const now = new Date().toISOString()
  const insert = db.prepare(`
    INSERT INTO articles
      (id, author_id, title, excerpt, content, status, category, tags, platforms,
       views, likes, scheduled_at, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const run = withTransaction((items) => {
    for (const a of items) {
      insert.run(
        a.id,
        req.user.id,
        a.title,
        a.excerpt,
        a.content,
        a.status,
        a.category,
        JSON.stringify(a.tags),
        JSON.stringify(a.platforms),
        a.views,
        a.likes,
        a.scheduledAt?.toISOString() ?? null,
        a.publishedAt?.toISOString() ?? null,
        now,
        now
      )
    }
  })
  try {
    run(parsed.data.articles)
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ message: '存在重复的文章 ID' })
    }
    throw err
  }
  res.status(201).json({ created: parsed.data.articles.length })
})

articlesRouter.patch('/bulk', (req, res) => {
  const schema = z.object({
    ids: idsField,
    patch: patchSchema,
    // 可选:按文章 ID 提供读取时的版本号,任何一条不匹配则整批拒绝
    versions: z.record(z.string(), z.number().int().positive()).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: '字段校验失败', issues: parsed.error.issues })
  }
  const { ids, patch, versions } = parsed.data
  const rows = ids.map((id) =>
    db.prepare('SELECT * FROM articles WHERE id = ?').get(id)
  )
  if (rows.some((row) => !row)) {
    return res.status(404).json({ message: '文章不存在' })
  }
  if (rows.some((row) => !canEditArticle(req.user, row))) {
    return forbidden(res)
  }
  if (!authorStatusAllowed(req.user, patch.status)) {
    return forbidden(res, '作者仅可将文章保存为草稿或提交审核')
  }
  const nextStatus = patch.status
  if (nextStatus) {
    const illegal = rows.filter((row) => !canTransition(row.status, nextStatus))
    if (illegal.length > 0) {
      return transitionConflict(
        res,
        illegal.map(
          (row) =>
            `${row.id} ${statusLabel(row.status)} → ${statusLabel(nextStatus)}`
        )
      )
    }
  }
  if (versions && ids.some((id) => versions[id] === undefined)) {
    return res.status(400).json({ message: 'versions 需覆盖全部文章 ID' })
  }
  if (versions) {
    const stale = rows.find((row) => versions[row.id] !== (row.version ?? 1))
    if (stale) return versionConflict(res, stale.version ?? 1)
  }

  const cols = Object.entries(toSql(patch))
    .map(([k]) => `${k} = @${k}`)
    .join(', ')
  const stmt = db.prepare(
    `UPDATE articles SET ${cols}, version = version + 1
     WHERE id = @id${versions ? ' AND version = @expectedVersion' : ''}`
  )
  const run = withTransaction((items) => {
    for (const item of items) {
      const params = { ...toSql(patch), id: item.id }
      if (versions) params.expectedVersion = versions[item.id]
      // 预检查后仍可能被并发修改:以 WHERE version 的结果兜底并回滚整批
      if (stmt.run(params).changes === 0) {
        throw new Error(`VERSION_CONFLICT:${item.id}`)
      }
    }
  })
  try {
    run(rows)
  } catch (err) {
    if (String(err.message).startsWith('VERSION_CONFLICT:')) {
      const id = String(err.message).slice('VERSION_CONFLICT:'.length)
      const latest = db
        .prepare('SELECT version FROM articles WHERE id = ?')
        .get(id)
      if (!latest) return res.status(404).json({ message: '文章不存在' })
      return versionConflict(res, latest.version ?? 1)
    }
    throw err
  }
  if (nextStatus) {
    recordAudit(req, {
      action: 'article.bulk_status_change',
      entityType: 'article',
      entityId: ids.join(','),
      detail: { ids, to: nextStatus },
    })
  }
  res.json({ updated: ids.length })
})

articlesRouter.patch('/:id', (req, res) => {
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: '字段校验失败', issues: parsed.error.issues })
  }
  const current = db
    .prepare('SELECT * FROM articles WHERE id = ?')
    .get(req.params.id)
  if (!current) return res.status(404).json({ message: '文章不存在' })
  if (!canEditArticle(req.user, current)) return forbidden(res)
  if (!authorStatusAllowed(req.user, parsed.data.status, current.status)) {
    return forbidden(res, '作者仅可将文章保存为草稿或提交审核')
  }
  if (
    parsed.data.status &&
    !canTransition(current.status, parsed.data.status)
  ) {
    return transitionConflict(res, [
      `${current.id} ${statusLabel(current.status)} → ${statusLabel(parsed.data.status)}`,
    ])
  }
  const expectedVersion = parsed.data.version
  if (
    expectedVersion !== undefined &&
    expectedVersion !== (current.version ?? 1)
  ) {
    return versionConflict(res, current.version ?? 1)
  }

  const cols = Object.entries(toSql(parsed.data))
    .map(([k]) => `${k} = @${k}`)
    .join(', ')
  // WHERE version 兜底预检查与写入之间的并发窗口
  const stmt = db.prepare(
    `UPDATE articles SET ${cols}, version = version + 1
     WHERE id = @id${expectedVersion !== undefined ? ' AND version = @expectedVersion' : ''}`
  )
  const params = { ...toSql(parsed.data), id: req.params.id }
  if (expectedVersion !== undefined) params.expectedVersion = expectedVersion
  const result = stmt.run(params)

  if (result.changes === 0) {
    const latest = db
      .prepare('SELECT version FROM articles WHERE id = ?')
      .get(req.params.id)
    if (!latest) return res.status(404).json({ message: '文章不存在' })
    return versionConflict(res, latest.version ?? 1)
  }
  if (parsed.data.status && parsed.data.status !== current.status) {
    recordAudit(req, {
      action: 'article.status_change',
      entityType: 'article',
      entityId: req.params.id,
      detail: { from: current.status, to: parsed.data.status },
    })
  }
  res.json(
    articleRowToJson(
      db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id)
    )
  )
})

articlesRouter.delete('/:id', (req, res) => {
  const current = db
    .prepare('SELECT * FROM articles WHERE id = ?')
    .get(req.params.id)
  if (!current) return res.status(404).json({ message: '文章不存在' })
  if (isAuthor(req.user)) return forbidden(res, '作者无权删除文章')
  if (isEditor(req.user) && !ownsArticle(req.user, current)) {
    return forbidden(res, '主编不可删除他人文章')
  }
  const run = withTransaction(() => {
    db.prepare('DELETE FROM comments WHERE article_id = ?').run(req.params.id)
    return db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id)
  })()
  if (run.changes === 0) return res.status(404).json({ message: '文章不存在' })
  recordAudit(req, {
    action: 'article.delete',
    entityType: 'article',
    entityId: req.params.id,
    detail: { title: current.title },
  })
  res.json({ deleted: run.changes })
})

// 阅读上报:阅读量 +1(前端「最近发布」点击等场景调用)
articlesRouter.post('/:id/view', (req, res) => {
  const result = db
    .prepare('UPDATE articles SET views = views + 1 WHERE id = ?')
    .run(req.params.id)
  if (result.changes === 0)
    return res.status(404).json({ message: '文章不存在' })
  const row = db
    .prepare('SELECT id, views FROM articles WHERE id = ?')
    .get(req.params.id)
  res.json(row)
})

articlesRouter.post('/bulk-delete', (req, res) => {
  const parsed = z.object({ ids: idsField }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: '字段校验失败' })
  const rows = parsed.data.ids.map((id) =>
    db.prepare('SELECT * FROM articles WHERE id = ?').get(id)
  )
  if (rows.some((row) => !row)) {
    return res.status(404).json({ message: '文章不存在' })
  }
  if (isAuthor(req.user)) return forbidden(res, '作者无权删除文章')
  if (isEditor(req.user) && rows.some((row) => !ownsArticle(req.user, row))) {
    return forbidden(res, '主编不可删除他人文章')
  }
  const deleteComments = db.prepare('DELETE FROM comments WHERE article_id = ?')
  const deleteArticle = db.prepare('DELETE FROM articles WHERE id = ?')
  const run = withTransaction((ids) => {
    for (const id of ids) {
      deleteComments.run(id)
      deleteArticle.run(id)
    }
  })
  run(parsed.data.ids)
  recordAudit(req, {
    action: 'article.bulk_delete',
    entityType: 'article',
    entityId: parsed.data.ids.join(','),
    detail: { ids: parsed.data.ids },
  })
  res.json({ deleted: parsed.data.ids.length })
})
