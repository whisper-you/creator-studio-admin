import { z } from 'zod'
import { hashSync } from 'bcryptjs'
import { Router } from 'express'
import { db } from '../db/index.js'
import { recordAudit } from '../services/audit.js'
import { revokeAllRefreshTokens } from '../services/session.js'
import { requireAuth, requireRole } from './auth.js'

export const usersRouter = Router()
usersRouter.use(requireAuth, requireRole('admin'))

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
})

/** 管理员视角的用户列表:邮箱/昵称搜索 + 活跃会话数 */
usersRouter.get('/', (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ message: '查询参数不合法' })
  }
  const { page, pageSize, q } = parsed.data

  const where = q ? 'WHERE email LIKE @q OR name LIKE @q' : ''
  const params = q ? { q: `%${q}%` } : {}
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM users ${where}`)
    .get(params).c
  const rows = db
    .prepare(
      `SELECT id, email, name, role, created_at FROM users ${where}
       ORDER BY id ASC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })

  const sessions = db
    .prepare(
      `SELECT user_id, COUNT(*) AS c FROM refresh_tokens
       WHERE revoked_at IS NULL AND expires_at > ?
       GROUP BY user_id`
    )
    .all(new Date().toISOString())
  const sessionCount = new Map(sessions.map((row) => [row.user_id, row.c]))

  res.json({
    data: rows.map((row) => ({
      id: String(row.id),
      email: row.email,
      name: row.name,
      role: row.role || 'author',
      createdAt: row.created_at,
      activeSessions: sessionCount.get(row.id) ?? 0,
    })),
    total,
    page,
    pageSize,
  })
})

const findUser = (rawId) => {
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) return null
  return (
    db
      .prepare('SELECT id, email, name, role FROM users WHERE id = ?')
      .get(id) ?? null
  )
}

const roleSchema = z.object({
  role: z.enum(['admin', 'editor', 'author'], {
    message: '角色参数不合法',
  }),
})

/** 调整角色:requireAuth 每次从数据库读取角色,变更立即生效 */
usersRouter.patch('/:id/role', (req, res) => {
  const target = findUser(req.params.id)
  if (!target) return res.status(404).json({ message: '用户不存在' })
  if (String(target.id) === req.userId) {
    return res.status(400).json({ message: '不能通过管理接口修改自己的角色' })
  }

  const parsed = roleSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: parsed.error.issues[0]?.message ?? '角色参数不合法' })
  }

  const from = target.role || 'author'
  const to = parsed.data.role
  if (from !== to) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(to, target.id)
    recordAudit(req, {
      action: 'user.role_change',
      entityType: 'user',
      entityId: target.id,
      detail: { email: target.email, from, to },
    })
  }

  res.json({ ok: true, role: to })
})

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, '新密码至少需要 8 个字符')
    .max(72, '新密码不能超过 72 个字符'),
})

/**
 * 管理员重置他人密码。
 * 重置后递增 token_version 并吊销全部 refresh token,目标用户所有设备立即下线。
 */
usersRouter.post('/:id/reset-password', (req, res) => {
  const target = findUser(req.params.id)
  if (!target) return res.status(404).json({ message: '用户不存在' })
  if (String(target.id) === req.userId) {
    return res.status(400).json({ message: '请在个人设置中修改自己的密码' })
  }

  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: parsed.error.issues[0]?.message ?? '字段校验失败' })
  }

  db.prepare(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?'
  ).run(hashSync(parsed.data.newPassword, 10), target.id)
  const revokedSessions = revokeAllRefreshTokens(target.id, 'password_reset')

  recordAudit(req, {
    action: 'user.reset_password',
    entityType: 'user',
    entityId: target.id,
    detail: { email: target.email, revokedSessions },
  })

  res.json({ ok: true, revokedSessions })
})

/** 强制下线:吊销全部 refresh token 并递增 token_version,让已签发 access token 立即失效 */
usersRouter.post('/:id/force-logout', (req, res) => {
  const target = findUser(req.params.id)
  if (!target) return res.status(404).json({ message: '用户不存在' })
  if (String(target.id) === req.userId) {
    return res.status(400).json({ message: '请使用退出登录来结束自己的会话' })
  }

  db.prepare(
    'UPDATE users SET token_version = token_version + 1 WHERE id = ?'
  ).run(target.id)
  const revokedSessions = revokeAllRefreshTokens(target.id, 'force_logout')

  recordAudit(req, {
    action: 'user.force_logout',
    entityType: 'user',
    entityId: target.id,
    detail: { email: target.email, revokedSessions },
  })

  res.json({ ok: true, revokedSessions })
})
