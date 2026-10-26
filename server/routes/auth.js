import { z } from 'zod'
import { compareSync, hashSync } from 'bcryptjs'
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { db } from '../db/index.js'
import { recordAudit } from '../services/audit.js'
import { resolveJwtSecret } from '../services/jwt-secret.js'

// 生产环境缺少强随机密钥时,在模块加载阶段直接抛错终止启动
const JWT_SECRET = resolveJwtSecret()
const TOKEN_TTL = '24h'
const USER_ROLES = ['admin', 'editor', 'author']

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

/** 角色自助切换默认仅用于本地/演示环境,生产环境可通过 ALLOW_ROLE_SWITCH 显式覆盖 */
function isRoleSwitchAllowed() {
  if (process.env.ALLOW_ROLE_SWITCH === 'true') return true
  if (process.env.ALLOW_ROLE_SWITCH === 'false') return false
  return process.env.NODE_ENV !== 'production'
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, ver: user.token_version ?? 1 },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  )
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
    const payload = jwt.verify(token, JWT_SECRET)
    const user = db
      .prepare(
        'SELECT id, email, name, role, token_version FROM users WHERE id = ?'
      )
      .get(payload.sub)
    if (!user) return res.status(401).json({ message: '用户不存在' })
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
  res.status(201).json({
    accessToken: signToken(user),
    user: userToJson(user),
  })
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
  res.json({
    accessToken: signToken(user),
    user: userToJson(user),
  })
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
    .max(72, '新密码不能超过 72 个字符'),
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

  recordAudit(req, {
    action: 'auth.change_password',
    entityType: 'user',
    entityId: req.userId,
  })

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  res.json({ accessToken: signToken(user), user: userToJson(user) })
})
