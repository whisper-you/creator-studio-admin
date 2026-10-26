// 安全中间件:响应头、CORS 白名单与认证限流(真实 Express app + 临时库)
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

const { app } = await import('../index.js')

let baseUrl
let server

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(() => resolve()))
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

    const overridden = resolveRateLimits({
      AUTH_RATE_LIMIT_MAX: '7',
      AUTH_RATE_LIMIT_WINDOW_MS: '1000',
      REGISTER_RATE_LIMIT_MAX: 'not-a-number',
      CHANGE_PASSWORD_RATE_LIMIT_MAX: '0',
    })
    expect(overridden.login).toEqual({ windowMs: 1000, limit: 7 })
    expect(overridden.register.limit).toBe(5)
    expect(overridden.changePassword.limit).toBe(10)
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

describe('认证端点限流', () => {
  const email = 'limited@test.dev'
  let token

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
