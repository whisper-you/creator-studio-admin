import { z } from 'zod'
import { Router } from 'express'
import { db } from '../db/index.js'
import { requireAuth, requireRole } from './auth.js'

export const commentsRouter = Router()
commentsRouter.use(requireAuth)

const COMMENT_STATUSES = ['pending', 'approved', 'rejected']

const rowToJson = (r) => ({
  id: String(r.id),
  articleId: r.article_id,
  articleTitle: r.article_title,
  author: r.author,
  content: r.content,
  status: r.status,
  createdAt: r.created_at,
})

/** GET /api/comments?status=&page=&pageSize= 分页列表(联表带出文章标题) */
commentsRouter.get('/', (req, res) => {
  const parsed = z
    .object({
      status: z.enum(COMMENT_STATUSES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ message: '查询参数不合法' })
  }

  const { status, page, pageSize } = parsed.data
  const where = []
  const params = {}
  if (status) {
    where.push('c.status = @status')
    params.status = status
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = Number(
    db.prepare(`SELECT COUNT(*) AS c FROM comments c ${whereSql}`).get(params).c
  )
  const rows = db
    .prepare(
      `SELECT c.*, a.title AS article_title
       FROM comments c LEFT JOIN articles a ON a.id = c.article_id
       ${whereSql} ORDER BY c.created_at DESC LIMIT @limit OFFSET @offset`
    )
    .all({
      ...params,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
  res.json({ data: rows.map(rowToJson), total, page, pageSize })
})

/** PATCH /api/comments/:id 审核通过/驳回 */
commentsRouter.patch('/:id', requireRole('admin', 'editor'), (req, res) => {
  const parsed = z
    .object({ status: z.enum(['approved', 'rejected']) })
    .safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: '字段校验失败' })

  const result = db
    .prepare('UPDATE comments SET status = ? WHERE id = ?')
    .run(parsed.data.status, req.params.id)
  if (result.changes === 0)
    return res.status(404).json({ message: '评论不存在' })

  const row = db
    .prepare(
      `SELECT c.*, a.title AS article_title
       FROM comments c LEFT JOIN articles a ON a.id = c.article_id
       WHERE c.id = ?`
    )
    .get(req.params.id)
  res.json(rowToJson(row))
})

commentsRouter.delete('/:id', requireRole('admin', 'editor'), (req, res) => {
  const result = db
    .prepare('DELETE FROM comments WHERE id = ?')
    .run(req.params.id)
  if (result.changes === 0)
    return res.status(404).json({ message: '评论不存在' })
  res.json({ deleted: result.changes })
})
