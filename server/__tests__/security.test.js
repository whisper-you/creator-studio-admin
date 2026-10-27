// 安全中间件:响应头、CORS 白名单与认证限流(真实 Express app + 临时库)
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  resolveCorsOrigins,
  resolveRateLimits,
  resolveTrustProxy,
} from '../services/security.js'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'cs-security-test-'))
process.env.JWT_SECRET = 'test-secret'
// 压低阈值,用少量请求验证 429;默认值见 resolveRateLimits 单测
process.env.AUTH_RATE_LIMIT_MAX = '2'
process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000'
process.env.REGISTER_RATE_LIMIT_MAX = '1'
process.env.CHANGE_PASSWORD_RATE_LIMIT_MAX = '1'
process.env.UPLOAD_RATE_LIMIT_MAX = '3'
process.env.WEBHOOK_RATE_LIMIT_MAX = '2'

const { app } = await import('../index.js')

let baseUrl
let server
let token

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(() => resolve()))

  const uploadsDir = join(process.cwd(), 'uploads')
  if (existsSync(uploadsDir)) {
    for (const file of readdirSync(uploadsDir)) {
      if (file.startsWith('rate-limit-test-')) {
        try {
          unlinkSync(join(uploadsDir, file))
        } catch {
          // 忽略文件已被并发删除
        }
      }
    }
  }
})

const postJson = (path, body, headers = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

describe('安全策略解析', () => {
  it('CORS 默认值:生产仅同源,开发/测试放行本地 Vite', () => {
    expect(resolveCorsOrigins({ NODE_ENV: 'production' })).toEqual([])
    expect(resolveCorsOrigins({ NODE_ENV: 'development' })).toContain(
      'http://localhost:5173'
    )
  })

  it('CORS_ORIGINS 覆盖默认值并按逗号去空格', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS: ' https://a.example.com , https://b.example.com ',
      })
    ).toEqual(['https://a.example.com', 'https://b.example.com'])
  })

  it('TRUST_PROXY 支持 false/true/层数/预设名', () => {
    expect(resolveTrustProxy({})).toBe(false)
    expect(resolveTrustProxy({ TRUST_PROXY: 'false' })).toBe(false)
    expect(resolveTrustProxy({ TRUST_PROXY: 'true' })).toBe(true)
    expect(resolveTrustProxy({ TRUST_PROXY: '2' })).toBe(2)
    expect(resolveTrustProxy({ TRUST_PROXY: 'loopback' })).toBe('loopback')
  })

  it('限流默认值与非法值回退', () => {
    const defaults = resolveRateLimits({})
    expect(defaults.login).toEqual({ windowMs: 15 * 60_000, limit: 30 })
    expect(defaults.register).toEqual({ windowMs: 60 * 60_000, limit: 5 })
    expect(defaults.changePassword).toEqual({
      windowMs: 15 * 60_000,
      limit: 10,
    })
    expect(defaults.refresh).toEqual({ windowMs: 15 * 60_000, limit: 120 })
    expect(defaults.upload).toEqual({ windowMs: 60 * 60_000, limit: 30 })
    expect(defaults.webhook).toEqual({ windowMs: 60_000, limit: 30 })

    const overridden = resolveRateLimits({
      AUTH_RATE_LIMIT_MAX: '7',
      AUTH_RATE_LIMIT_WINDOW_MS: '1000',
      REGISTER_RATE_LIMIT_MAX: 'not-a-number',
      CHANGE_PASSWORD_RATE_LIMIT_MAX: '0',
      UPLOAD_RATE_LIMIT_MAX: '5',
      WEBHOOK_RATE_LIMIT_MAX: '9',
    })
    expect(overridden.login).toEqual({ windowMs: 1000, limit: 7 })
    expect(overridden.register.limit).toBe(5)
    expect(overridden.changePassword.limit).toBe(10)
    expect(overridden.upload.limit).toBe(5)
    expect(overridden.webhook.limit).toBe(9)
  })
})

describe('安全响应头与 CORS', () => {
  it('返回基础安全头与 CSP,且不强制升级 HTTP', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    expect(res.status).toBe(200)

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')

    const csp = res.headers.get('content-security-policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('https://fonts.gstatic.com')
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  it('放行白名单来源并处理预检请求', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173'
    )

    const preflight = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173'
    )
  })

  it('未授权来源不会收到 CORS 放行头', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://evil.example' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('请求体错误处理', () => {
  it('非法 JSON 返回 400 而非 500', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email":',
    })
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect((await res.json()).message).toBe('请求体不是合法的 JSON')
  })

  it('超限请求体返回 413', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(26 * 1024 * 1024),
    })
    expect(res.status).toBe(413)
    expect((await res.json()).message).toBe('请求体过大')
  })
})

describe('认证端点限流', () => {
  const email = 'limited@test.dev'

  it('注册接口超过阈值后返回 429', async () => {
    const first = await postJson('/api/auth/register', {
      email,
      password: 'password123',
      name: '限流测试',
    })
    expect(first.status).toBe(201)
    token = (await first.json()).accessToken

    const second = await postJson('/api/auth/register', {
      email: 'another@test.dev',
      password: 'password123',
      name: '限流测试2',
    })
    expect(second.status).toBe(429)
    expect((await second.json()).message).toContain('请求过于频繁')
  })

  it('改密接口超过阈值后返回 429', async () => {
    const authed = { Authorization: `Bearer ${token}` }
    const first = await postJson(
      '/api/auth/change-password',
      { currentPassword: 'wrong-password', newPassword: 'newpassword1' },
      authed
    )
    expect(first.status).toBe(400)

    const second = await postJson(
      '/api/auth/change-password',
      { currentPassword: 'password123', newPassword: 'newpassword1' },
      authed
    )
    expect(second.status).toBe(429)
  })

  it('登录失败达到阈值后,正确密码也会被暂时拦截', async () => {
    for (let i = 0; i < 2; i += 1) {
      const res = await postJson('/api/auth/login', {
        email,
        password: 'wrong-password',
      })
      expect(res.status).toBe(401)
    }

    const blocked = await postJson('/api/auth/login', {
      email,
      password: 'password123',
    })
    expect(blocked.status).toBe(429)
  })
})

describe('素材上传元数据与频率限制', () => {
  // 1x1 透明 PNG
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  const upload = (body) =>
    postJson('/api/materials/upload', body, {
      Authorization: `Bearer ${token}`,
    })

  it('素材名称超过长度上限返回 400', async () => {
    const res = await upload({ dataUrl: tinyPng, name: 'x'.repeat(81) })
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('素材名称')
  })

  it('超过单用户上传频率后返回 429', async () => {
    for (let i = 0; i < 2; i += 1) {
      const res = await upload({
        dataUrl: tinyPng,
        filename: 'rate-limit-test.png',
      })
      expect(res.status).toBe(201)
    }

    const blocked = await upload({ dataUrl: tinyPng })
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).message).toContain('请求过于频繁')
  })
})

describe('Webhook 测试与分发限流', () => {
  it('超过单用户 Webhook 测试频率后返回 429', async () => {
    const authed = { Authorization: `Bearer ${token}` }
    const escalate = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authed },
      body: JSON.stringify({ role: 'editor' }),
    })
    expect(escalate.status).toBe(200)

    const probe = () =>
      postJson(
        `/api/channels/${encodeURIComponent('个人网站')}/test-webhook`,
        {},
        authed
      )

    for (let i = 0; i < 2; i += 1) {
      const res = await probe()
      expect(res.status).toBe(200)
    }

    const blocked = await probe()
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).message).toContain('请求过于频繁')
  })
})
