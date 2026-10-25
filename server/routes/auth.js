import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { compareSync, hashSync } from 'bcryptjs'
import { z } from 'zod'
import { db } from '../db.js'

const JWT_SECRET = process.env.JWT_SECRET ?? 'creator-studio-dev-secret'
const TOKEN_TTL = '24h'

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  })
}

/** 校验 Authorization: Bearer <jwt>,通过后把 userId 挂到 req 上 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ message: '未登录' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.sub
    req.email = payload.email
    next()
  } catch {
    return res.status(401).json({ message: '登录已过期,请重新登录' })
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
  const result = db
    .prepare(
      'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(email, name, hashSync(password, 10), new Date().toISOString())
  const user = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(result.lastInsertRowid)
  res.status(201).json({
    accessToken: signToken(user),
    user: { id: String(user.id), email: user.email, name: user.name },
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
    user: { id: String(user.id), email: user.email, name: user.name },
  })
})

authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  if (!user) return res.status(401).json({ message: '用户不存在' })
  res.json({ id: String(user.id), email: user.email, name: user.name })
})

// 更新个人资料(昵称)
authRouter.patch('/me', requireAuth, (req, res) => {
  const parsed = z
    .object({ name: z.string().min(1).max(30) })
    .safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: '昵称不能为空' })
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(
    parsed.data.name,
    req.userId
  )
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  res.json({ id: String(user.id), email: user.email, name: user.name })
})
