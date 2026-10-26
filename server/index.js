import cors from 'cors'
import express from 'express'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { db } from './db/index.js'
import { articlesRouter } from './routes/articles.js'
import { auditRouter } from './routes/audit.js'
import { authRouter } from './routes/auth.js'
import { channelsRouter } from './routes/channels.js'
import { commentsRouter } from './routes/comments.js'
import { distributionRouter } from './routes/distribution.js'
import { materialsRouter } from './routes/materials.js'
import { statsRouter } from './routes/stats.js'
import { checkReadiness, requestContext } from './services/observability.js'
import {
  startScheduler,
  stopScheduler,
  checkAndPublishScheduledArticles,
} from './services/scheduler.js'
import {
  createAuthLimiters,
  createSecurityHeaders,
  resolveCorsOrigins,
  resolveTrustProxy,
} from './services/security.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.API_PORT) || 5180

// 本地自托管图床静态存储目录
const uploadsDir = join(__dirname, '../uploads')
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true })
}

const app = express()
app.set('trust proxy', resolveTrustProxy())
app.use(requestContext)
app.use(createSecurityHeaders())

// 仅放行白名单来源;前后端同源部署时无需任何跨域配置
const corsOrigins = resolveCorsOrigins()
if (corsOrigins.length > 0) {
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || corsOrigins.includes(origin)),
      // HttpOnly refresh cookie 需要跨域携带凭据
      credentials: true,
    })
  )
}

app.use(express.json({ limit: '25mb' }))
app.use('/uploads', express.static(uploadsDir))

const { loginLimiter, registerLimiter, changePasswordLimiter, refreshLimiter } =
  createAuthLimiters()
app.use('/api/auth/login', loginLimiter)
app.use('/api/auth/register', registerLimiter)
app.use('/api/auth/change-password', changePasswordLimiter)
app.use('/api/auth/refresh', refreshLimiter)

app.get('/api/health', (_req, res) => res.json({ ok: true }))
// 就绪检查:数据库可查询 + 上传目录可写;失败返回 503 供编排系统摘流
app.get('/api/health/ready', (_req, res) => {
  const result = checkReadiness({ uploadsDir })
  res.status(result.ok ? 200 : 503).json(result)
})
app.use('/api/auth', authRouter)
app.use('/api/articles', articlesRouter)
app.use('/api/channels', channelsRouter)
app.use('/api/materials', materialsRouter)
app.use('/api/stats', statsRouter)
app.use('/api/comments', commentsRouter)
app.use('/api/distribution', distributionRouter)
app.use('/api/audit-logs', auditRouter)

// 未匹配的 /api 路由统一返回 JSON,避免落到前端 SPA fallback
app.use('/api', (_req, res) => res.status(404).json({ message: '接口不存在' }))

// 生产模式:同端口托管前端构建产物(单服务部署)
const distDir = join(__dirname, '..', 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api\/).*/, (_req, res) =>
    res.sendFile(join(distDir, 'index.html'))
  )
}

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: '服务器内部错误' })
})

// 导出 app 供测试使用;直接运行时才监听端口并启动后台调度器
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  startScheduler()
  const server = app.listen(PORT, () => {
    console.log(`[api] Creator Studio API 已启动:http://localhost:${PORT}`)
  })

  // 优雅停机:停止调度 → 停止接收新连接 → 关闭数据库;超时后强制退出
  const shutdown = (signal) => {
    console.log(`[api] 收到 ${signal},开始优雅停机`)
    stopScheduler()
    const forceExit = setTimeout(() => {
      console.error('[api] 停机超时,强制退出')
      process.exit(1)
    }, 10_000)
    forceExit.unref()

    server.close(() => {
      clearTimeout(forceExit)
      try {
        db.close()
      } catch (err) {
        console.error('[api] 关闭数据库失败:', err)
      }
      console.log('[api] 已优雅退出')
      process.exit(0)
    })
    server.closeIdleConnections?.()
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
}

export { app, startScheduler, stopScheduler, checkAndPublishScheduledArticles }
