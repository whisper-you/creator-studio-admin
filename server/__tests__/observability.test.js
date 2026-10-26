// 可观测性:存活/就绪探针、请求 ID 透传、API 404 JSON 兜底
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'cs-obs-test-'))
process.env.JWT_SECRET = 'test-secret'

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

describe('健康检查与请求上下文', () => {
  it('GET /api/health 存活探针返回 200', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('GET /api/health/ready 就绪探针校验数据库与上传目录', async () => {
    const res = await fetch(`${baseUrl}/api/health/ready`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.checks).toEqual({ database: 'ok', uploads: 'ok' })
    expect(typeof body.uptime).toBe('number')
    expect(body.timestamp).toBeTruthy()
  })

  it('无请求 ID 时自动生成,并回写到响应头', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })

  it('客户端传入的 X-Request-Id 会透传', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { 'X-Request-Id': 'trace-abc-123' },
    })
    expect(res.headers.get('x-request-id')).toBe('trace-abc-123')
  })

  it('未知 /api 路由返回 JSON 404 而不是前端页面', async () => {
    const res = await fetch(`${baseUrl}/api/not-exists`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ message: '接口不存在' })
  })
})
