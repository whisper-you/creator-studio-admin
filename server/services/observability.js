import { randomUUID } from 'node:crypto'
import { accessSync, constants } from 'node:fs'
import { db } from '../db/index.js'

/**
 * 请求上下文:透传/生成 X-Request-Id,并在响应结束后输出结构化访问日志。
 * 仅记录 /api 请求;测试环境静默,避免污染断言输出。
 */
export function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id']
  const requestId =
    typeof incoming === 'string' && incoming.trim()
      ? incoming.trim().slice(0, 128)
      : randomUUID()
  req.id = requestId
  res.setHeader('X-Request-Id', requestId)

  const startedAt = process.hrtime.bigint()
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return
    if (!req.originalUrl.startsWith('/api')) return
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'http.request',
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        userId: req.user?.id ?? null,
      })
    )
  })

  next()
}

/**
 * 就绪检查:数据库可查询 + 上传目录可写。
 * 任一失败返回 ok=false,由路由层映射为 503。
 */
export function checkReadiness({ uploadsDir }) {
  const checks = { database: 'ok', uploads: 'ok' }
  try {
    db.prepare('SELECT 1 AS ok').get()
  } catch {
    checks.database = 'error'
  }
  try {
    accessSync(uploadsDir, constants.W_OK)
  } catch {
    checks.uploads = 'error'
  }
  return {
    ok: Object.values(checks).every((v) => v === 'ok'),
    checks,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }
}
