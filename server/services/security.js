import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'

const MINUTE = 60_000
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/**
 * 跨域白名单。未配置时:开发/测试放行本地 Vite,生产仅允许同源。
 * 前后端同源部署或使用 Vite 代理时无需配置。
 */
export function resolveCorsOrigins(env = process.env) {
  const raw = (env.CORS_ORIGINS ?? '').trim()
  if (raw) {
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  }
  return env.NODE_ENV === 'production' ? [] : DEV_ORIGINS
}

/** 反向代理层数;只有确实部署在 Nginx 等代理后面时才应启用,否则 IP 可被伪造 */
export function resolveTrustProxy(env = process.env) {
  const raw = (env.TRUST_PROXY ?? '').trim()
  if (!raw || raw === 'false') return false
  if (raw === 'true') return true
  if (/^\d+$/.test(raw)) return Number(raw)
  return raw
}

export function resolveRateLimits(env = process.env) {
  return {
    login: {
      windowMs: positiveInt(env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * MINUTE),
      limit: positiveInt(env.AUTH_RATE_LIMIT_MAX, 30),
    },
    register: {
      windowMs: positiveInt(env.REGISTER_RATE_LIMIT_WINDOW_MS, 60 * MINUTE),
      limit: positiveInt(env.REGISTER_RATE_LIMIT_MAX, 5),
    },
    changePassword: {
      windowMs: positiveInt(env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * MINUTE),
      limit: positiveInt(env.CHANGE_PASSWORD_RATE_LIMIT_MAX, 10),
    },
    refresh: {
      windowMs: positiveInt(env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * MINUTE),
      limit: positiveInt(env.REFRESH_RATE_LIMIT_MAX, 120),
    },
    upload: {
      windowMs: positiveInt(env.UPLOAD_RATE_LIMIT_WINDOW_MS, 60 * MINUTE),
      limit: positiveInt(env.UPLOAD_RATE_LIMIT_MAX, 30),
    },
    webhook: {
      windowMs: positiveInt(env.WEBHOOK_RATE_LIMIT_WINDOW_MS, MINUTE),
      limit: positiveInt(env.WEBHOOK_RATE_LIMIT_MAX, 30),
    },
  }
}

function createLimiter({ windowMs, limit, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: '请求过于频繁,请稍后再试' },
    ...(keyGenerator ? { keyGenerator } : {}),
  })
}

/** 认证端点限流:按客户端 IP 计数,单进程内存实现(重启即清零) */
export function createAuthLimiters(env = process.env) {
  const limits = resolveRateLimits(env)
  return {
    loginLimiter: createLimiter(limits.login),
    registerLimiter: createLimiter(limits.register),
    changePasswordLimiter: createLimiter(limits.changePassword),
    refreshLimiter: createLimiter(limits.refresh),
  }
}

/** 图片上传限流:按登录用户计数,避免单个账号反复写入大文件占满磁盘 */
export function createUploadLimiter(env = process.env) {
  return createLimiter({
    ...resolveRateLimits(env).upload,
    keyGenerator: (req) => `user:${req.userId}`,
  })
}

/** Webhook 测试与分发限流:按登录用户计数,避免反复触发外部请求 */
export function createWebhookLimiter(env = process.env) {
  return createLimiter({
    ...resolveRateLimits(env).webhook,
    keyGenerator: (req) => `user:${req.userId}`,
  })
}

/**
 * 安全响应头。CSP 需放行 Google Fonts(项目通过外链加载字体)与内联样式
 * (Radix/Recharts 会写 style 属性);未启用 upgrade-insecure-requests,
 * 避免纯 HTTP 部署时把同源静态资源强制升级到 HTTPS。
 */
export function createSecurityHeaders() {
  return helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  })
}
