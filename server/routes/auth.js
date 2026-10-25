import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { compareSync } from 'bcryptjs'
import { z } from 'zod'
import { db } from '../db.js'

const JWT_SECRET = process.env.JWT_SECRET ?? 'creator-studio-dev-secret'
const TOKEN_TTL = '24h'

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export function signToken(user) {
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
