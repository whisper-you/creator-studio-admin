import { z } from 'zod'
import { compareSync, hashSync } from 'bcryptjs'
import { Router } from 'express'
import { db } from '../db/index.js'
import { recordAudit } from '../services/audit.js'
import { resolveJwtSecret } from '../services/jwt-secret.js'
import {
  clearRefreshCookie,
  consumeRefreshToken,
  createRefreshToken,
  findSessionIdByToken,
  listUserSessions,
  readRefreshCookie,
  revokeAllRefreshTokens,
  revokeOtherSessions,
  revokeRefreshToken,
  revokeUserSession,
  sessionMeta,
  setRefreshCookie,
  signAccessToken,
  verifyAccessToken,
} from '../services/session.js'

// 生产环境缺少强随机密钥时,在模块加载阶段直接抛错终止启动
resolveJwtSecret()
const USER_ROLES = ['admin', 'editor', 'author']

// 邮箱统一小写入库/查询,避免大小写变体产生重复账号或登录失败
const emailField = z.email().transform((email) => email.toLowerCase())

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
})

/** 角色自助切换默认仅用于本地/演示环境,生产环境可通过 ALLOW_ROLE_SWITCH 显式覆盖 */
function isRoleSwitchAllowed() {
  if (process.env.ALLOW_ROLE_SWITCH === 'true') return true
  if (process.env.ALLOW_ROLE_SWITCH === 'false') return false
  return process.env.NODE_ENV !== 'production'
}

/** 签发短时 access token,并把 refresh token 写入 HttpOnly Cookie */
function issueSession(req, res, user) {
  const refresh = createRefreshToken(user.id, sessionMeta(req))
  setRefreshCookie(res, refresh.token, refresh.expiresAt)
  return { accessToken: signAccessToken(user), user: userToJson(user) }
}

const userToJson = (u) => ({
  id: String(u.id),
  email: u.email,
  name: u.name,
  role: u.role || 'author',
})

/**
 * 校验 Authorization: Bearer <jwt>,通过后把用户信息挂到 req.user 上。
 * 角色以数据库为准实时读取,避免角色调整后旧 token 仍持有过期权限。
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ message: '未登录' })
  try {
    const payload = verifyAccessToken(token)
    const user = db
      .prepare(
        'SELECT id, email, name, role, token_version, disabled_at FROM users WHERE id = ?'
      )
      .get(payload.sub)
    if (!user) return res.status(401).json({ message: '用户不存在' })
    // 停用后即使 access token 未过期也立即拒绝
    if (user.disabled_at) {
      return res.status(401).json({ message: '账号已被禁用,请联系管理员' })
    }
    // 改密后 token_version 递增,旧 token 立即失效
    if (Number(payload.ver ?? 1) !== Number(user.token_version ?? 1)) {
      return res.status(401).json({ message: '登录状态已失效,请重新登录' })
    }
    req.user = {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role || 'author',
    }
    req.userId = req.user.id
    req.email = user.email
    next()
  } catch {
    return res.status(401).json({ message: '登录已过期,请重新登录' })
  }
}

/** 角色守卫:必须放在 requireAuth 之后使用 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: '未登录' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: '当前角色无权执行此操作' })
    }
    next()
  }
}

export const authRouter = Router()

const registerSchema = loginSchema.extend({
  // bcrypt 只使用前 72 字节,超出部分会被静默截断,因此按字节限制上限
  password: z
    .string()
    .min(8, '密码至少需要 8 个字符')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, '密码不能超过 72 字节'),
  name: z.string().min(1).max(30).default('新创作者'),
})

authRouter.post('/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: '请输入合法的邮箱与密码' })
  }
  const { email, password, name } = parsed.data
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (exists) {
    return res.status(409).json({ message: '该邮箱已被注册' })
  }
  // 公开注册一律从 author 起步,防止通过注册接口直接获得管理权限
  const result = db
    .prepare(
      'INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      email,
      name,
      hashSync(password, 10),
      'author',
      new Date().toISOString()
    )
  const user = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(result.lastInsertRowid)
  res.status(201).json(issueSession(req, res, user))
})

authRouter.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: '请输入合法的邮箱与密码' })
  }
  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(parsed.data.email)
  if (!user || !compareSync(parsed.data.password, user.password_hash)) {
    return res.status(401).json({ message: '邮箱或密码错误' })
  }
  if (user.disabled_at) {
    return res.status(403).json({ message: '账号已被禁用,请联系管理员' })
  }
  res.json(issueSession(req, res, user))
})

/**
 * 静默续期:用 HttpOnly Cookie 里的 refresh token 换新的 access token。
 * 每次刷新都会轮换 refresh token;已撤销 token 被重放时吊销该用户全部会话。
 */
authRouter.post('/refresh', (req, res) => {
  const raw = readRefreshCookie(req)
  if (!raw) {
    return res.status(401).json({ message: '登录已过期,请重新登录' })
  }

  const result = consumeRefreshToken(raw, sessionMeta(req))
  if (result.status === 'reused') {
    recordAudit(
      { user: { id: result.userId } },
      {
        action: 'auth.refresh_reuse',
        entityType: 'user',
        entityId: result.userId,
      }
    )
  }
  if (result.status !== 'ok') {
    clearRefreshCookie(res)
    if (result.status === 'disabled') {
      return res.status(403).json({ message: '账号已被禁用,请联系管理员' })
    }
    return res.status(401).json({
      message:
        result.status === 'reused'
          ? '登录状态已失效,请重新登录'
          : '登录已过期,请重新登录',
    })
  }

  setRefreshCookie(res, result.token, result.expiresAt)
  res.json({
    accessToken: signAccessToken(result.user),
    user: userToJson(result.user),
  })
})

/** 登出:吊销当前 refresh token 并清除 Cookie(access token 到期前仍有效,故不要求鉴权) */
authRouter.post('/logout', (req, res) => {
  const raw = readRefreshCookie(req)
  if (raw) revokeRefreshToken(raw)
  clearRefreshCookie(res)
  res.status(204).end()
})

/** 当前账号的登录设备列表(仅返回未撤销且未过期的会话) */
authRouter.get('/sessions', requireAuth, (req, res) => {
  const currentId = findSessionIdByToken(req.userId, readRefreshCookie(req))
  const rows = listUserSessions(req.userId)
  res.json({
    data: rows.map((row) => ({
      id: row.id,
      userAgent: row.user_agent ?? null,
      ip: row.ip ?? null,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at ?? null,
      expiresAt: row.expires_at,
      current: row.id === currentId,
    })),
    total: rows.length,
  })
})

/** 撤销自己的某个非当前会话 */
authRouter.delete('/sessions/:id', requireAuth, (req, res) => {
  const sessionId = Number(req.params.id)
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(404).json({ message: '会话不存在或已失效' })
  }
  const currentId = findSessionIdByToken(req.userId, readRefreshCookie(req))
  if (sessionId === currentId) {
    return res
      .status(400)
      .json({ message: '请使用退出登录来结束当前设备的会话' })
  }

  const revoked = revokeUserSession(req.userId, sessionId)
  if (revoked === 0) {
    return res.status(404).json({ message: '会话不存在或已失效' })
  }
  recordAudit(req, {
    action: 'auth.session_revoke',
    entityType: 'user',
    entityId: req.userId,
    detail: { sessionId },
  })
  res.status(204).end()
})

/** 退出其他所有设备,保留当前会话 */
authRouter.delete('/sessions', requireAuth, (req, res) => {
  const revokedSessions = revokeOtherSessions(
    req.userId,
    readRefreshCookie(req)
  )
  if (revokedSessions > 0) {
    recordAudit(req, {
      action: 'auth.session_revoke_others',
      entityType: 'user',
      entityId: req.userId,
      detail: { revokedSessions },
    })
  }
  res.json({ ok: true, revokedSessions })
})

authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  if (!user) return res.status(401).json({ message: '用户不存在' })
  res.json(userToJson(user))
})

// 更新个人资料(昵称与角色切换)
authRouter.patch('/me', requireAuth, (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).max(30).optional(),
      role: z.enum(USER_ROLES).optional(),
    })
    .safeParse(req.body)
  if (!parsed.success)
    return res.status(400).json({ message: '参数格式不正确' })

  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  if (!current) return res.status(404).json({ message: '用户不存在' })

  const roleChanged =
    parsed.data.role !== undefined && parsed.data.role !== current.role
  if (roleChanged && !isRoleSwitchAllowed()) {
    return res.status(403).json({ message: '当前环境已禁用角色切换' })
  }

  const nextName =
    parsed.data.name !== undefined ? parsed.data.name : current.name
  const nextRole =
    parsed.data.role !== undefined ? parsed.data.role : current.role || 'author'

  db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').run(
    nextName,
    nextRole,
    req.userId
  )
  if (roleChanged) {
    recordAudit(req, {
      action: 'user.role_change',
      entityType: 'user',
      entityId: req.userId,
      detail: { from: current.role || 'author', to: nextRole },
    })
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  res.json(userToJson(user))
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z
    .string()
    .min(8, '新密码至少需要 8 个字符')
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= 72,
      '新密码不能超过 72 字节'
    ),
})

/**
 * 修改密码:校验当前密码后更新哈希并递增 token_version。
 * 返回新 token 保持当前会话可用,其他设备上的旧 token 立即失效。
 */
authRouter.post('/change-password', requireAuth, (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: parsed.error.issues[0]?.message ?? '字段校验失败' })
  }

  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  if (!current) return res.status(404).json({ message: '用户不存在' })

  const { currentPassword, newPassword } = parsed.data
  if (!compareSync(currentPassword, current.password_hash)) {
    return res.status(400).json({ message: '当前密码不正确' })
  }
  if (compareSync(newPassword, current.password_hash)) {
    return res.status(400).json({ message: '新密码不能与当前密码相同' })
  }

  db.prepare(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?'
  ).run(hashSync(newPassword, 10), req.userId)
  // 改密后其他设备的 refresh token 一并失效,再为当前会话补发
  revokeAllRefreshTokens(req.userId)

  recordAudit(req, {
    action: 'auth.change_password',
    entityType: 'user',
    entityId: req.userId,
  })

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  res.json(issueSession(req, res, user))
})
