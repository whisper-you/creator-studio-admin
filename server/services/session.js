import jwt from 'jsonwebtoken'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '../db/index.js'
import { resolveJwtSecret } from './jwt-secret.js'

// 生产环境缺少强随机密钥时,在模块加载阶段直接抛错终止启动
const JWT_SECRET = resolveJwtSecret()

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL?.trim() || '15m'
const REFRESH_TOKEN_TTL_DAYS = (() => {
  const n = Number(process.env.REFRESH_TOKEN_TTL_DAYS)
  return Number.isInteger(n) && n > 0 ? n : 30
})()

const REFRESH_COOKIE = 'cs_refresh'
// 只随认证接口发送,降低泄露面
const REFRESH_COOKIE_PATH = '/api/auth'
const isProduction = () => process.env.NODE_ENV === 'production'

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, ver: user.token_version ?? 1 },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  )
}

export function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

/** 记录会话来源,供「登录设备」展示与区分 */
export function sessionMeta(req) {
  const userAgent = String(req.headers['user-agent'] ?? '').slice(0, 255)
  return { userAgent: userAgent || null, ip: req.ip ?? null }
}

/** 清理过期记录;已撤销但未过期的保留一段时间,用于识别重放 */
export function cleanupExpiredRefreshTokens() {
  db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(
    new Date().toISOString()
  )
}

export function createRefreshToken(userId, meta = {}) {
  cleanupExpiredRefreshTokens()
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = new Date(
    now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()
  db.prepare(
    `INSERT INTO refresh_tokens
       (user_id, token_hash, expires_at, created_at, user_agent, ip, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    hashRefreshToken(token),
    expiresAt,
    nowIso,
    meta.userAgent ?? null,
    meta.ip ?? null,
    nowIso
  )
  return { token, expiresAt }
}

/**
 * 校验并轮换 refresh token。
 * 已撤销的 token 被再次使用视为泄露重放,直接吊销该用户全部会话。
 */
export function consumeRefreshToken(rawToken, meta = {}) {
  const hash = hashRefreshToken(rawToken)
  const row = db
    .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
    .get(hash)

  if (!row) return { status: 'invalid' }
  if (row.revoked_at) {
    // 只有「轮换后重放」才视为泄露;登出/改密导致的撤销正常拒绝即可
    if (row.revoked_reason === 'rotated') {
      revokeAllRefreshTokens(row.user_id, 'reuse')
      return { status: 'reused', userId: row.user_id }
    }
    return { status: 'invalid' }
  }
  if (row.expires_at <= new Date().toISOString()) return { status: 'expired' }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id)
  if (!user) return { status: 'invalid' }
  if (user.disabled_at) {
    revokeAllRefreshTokens(row.user_id, 'account_disabled')
    return { status: 'disabled', userId: row.user_id }
  }

  // 条件更新防止并发刷新同时轮换成功
  const rotated = db
    .prepare(
      `UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = 'rotated'
       WHERE id = ? AND revoked_at IS NULL`
    )
    .run(new Date().toISOString(), row.id)
  if (rotated.changes === 0) {
    revokeAllRefreshTokens(row.user_id, 'reuse')
    return { status: 'reused', userId: row.user_id }
  }

  const issued = createRefreshToken(row.user_id, meta)
  return { status: 'ok', user, ...issued, userId: row.user_id }
}

export function revokeRefreshToken(rawToken, reason = 'logout') {
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = ?
     WHERE token_hash = ? AND revoked_at IS NULL`
  ).run(new Date().toISOString(), reason, hashRefreshToken(rawToken))
}

export function revokeAllRefreshTokens(userId, reason = 'password_change') {
  return db
    .prepare(
      `UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = ?
       WHERE user_id = ? AND revoked_at IS NULL`
    )
    .run(new Date().toISOString(), reason, userId).changes
}

/** 当前用户全部有效会话,按创建时间倒序 */
export function listUserSessions(userId) {
  return db
    .prepare(
      `SELECT id, user_agent, ip, created_at, last_used_at, expires_at
       FROM refresh_tokens
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC, id DESC`
    )
    .all(userId, new Date().toISOString())
}

/** 用 refresh cookie 反查当前会话 id,用于在设备列表里标记「当前设备」 */
export function findSessionIdByToken(userId, rawToken) {
  if (!rawToken) return null
  const row = db
    .prepare(
      `SELECT id FROM refresh_tokens
       WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL`
    )
    .get(userId, hashRefreshToken(rawToken))
  return row?.id ?? null
}

/** 撤销指定会话;只允许操作属于该用户的记录 */
export function revokeUserSession(userId, sessionId) {
  return db
    .prepare(
      `UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = 'session_revoke'
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
    )
    .run(new Date().toISOString(), sessionId, userId).changes
}

/** 撤销除当前会话外的全部会话 */
export function revokeOtherSessions(userId, currentToken) {
  const now = new Date().toISOString()
  return db
    .prepare(
      `UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = 'session_revoke_others'
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? AND token_hash != ?`
    )
    .run(now, userId, now, currentToken ? hashRefreshToken(currentToken) : '')
    .changes
}

export function readRefreshCookie(req) {
  const header = req.headers.cookie ?? ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: REFRESH_COOKIE_PATH,
    maxAge: new Date(expiresAt).getTime() - Date.now(),
  })
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: REFRESH_COOKIE_PATH,
  })
}
