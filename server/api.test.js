// API 集成测试:真实 Express app + 临时目录 SQLite(node 环境跑)
// 覆盖:登录鉴权、CRUD、PATCH 部分更新语义、批量操作、错误分支
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// 必须在 import app 之前设置:db.js 在模块加载时建库
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'cs-api-test-'))
process.env.JWT_SECRET = 'test-secret'

const { app } = await import('./index.js')

let baseUrl
let server

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(
  () => new Promise((resolve) => server.close(() => resolve()))
)

const login = async (email = 'creator@studio.dev', password = 'creator123') => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return res
}

const authed = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})

describe('POST /api/auth/login', () => {
  it('错误密码返回 401', async () => {
    const res = await login('creator@studio.dev', 'wrong')
    expect(res.status).toBe(401)
  })

  it('正确密码签发 JWT 并返回用户', async () => {
    const res = await login()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accessToken).toBeTruthy()
    expect(body.user.email).toBe('creator@studio.dev')
  })
})

describe('文章接口鉴权', () => {
  it('未带 token 返回 401', async () => {
    const res = await fetch(`${baseUrl}/api/articles`)
    expect(res.status).toBe(401)
  })
})

describe('文章 CRUD 全流程', () => {
  let token

  beforeAll(async () => {
    token = (await (await login()).json()).accessToken
  })

  const created = {}

  it('POST 创建文章', async () => {
    const res = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        id: 'ART-TEST-1',
        title: '接口测试文章',
        excerpt: '摘要',
        content: '正文',
        status: 'draft',
        category: 'tech',
        tags: ['测试'],
        platforms: ['website'],
      }),
    })
    expect(res.status).toBe(201)
    created.body = await res.json()
    expect(created.body.tags).toEqual(['测试'])
  })

  it('GET 分页 + 筛选 + 搜索', async () => {
    const res = await fetch(
      `${baseUrl}/api/articles?page=1&pageSize=2&status=draft&filter=接口测试`,
      { headers: authed(token) }
    )
    const body = await res.json()
    expect(body.total).toBeGreaterThanOrEqual(1)
    expect(body.data.length).toBeLessThanOrEqual(2)
    expect(body.data.every((a) => a.status === 'draft')).toBe(true)
    expect(body.data.some((a) => a.id === 'ART-TEST-1')).toBe(true)
  })

  it('PATCH 部分更新不重置其他字段', async () => {
    const res = await fetch(`${baseUrl}/api/articles/ART-TEST-1`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ status: 'published' }),
    })
    const body = await res.json()
    expect(body.status).toBe('published')
    // 关键回归:PATCH 单字段不应清掉 tags/platforms
    expect(body.tags).toEqual(['测试'])
    expect(body.platforms).toEqual(['website'])
    expect(body.title).toBe('接口测试文章')
  })

  it('PATCH scheduledAt: null 清空日期', async () => {
    await fetch(`${baseUrl}/api/articles/ART-TEST-1`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({
        status: 'scheduled',
        scheduledAt: '2026-11-01T12:00:00.000Z',
      }),
    })
    const res = await fetch(`${baseUrl}/api/articles/ART-TEST-1`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ status: 'draft', scheduledAt: null }),
    })
    const body = await res.json()
    expect(body.scheduledAt).toBeUndefined()
  })

  it('PATCH 不存在的文章返回 404', async () => {
    const res = await fetch(`${baseUrl}/api/articles/ART-NOPE`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ status: 'draft' }),
    })
    expect(res.status).toBe(404)
  })

  it('PATCH bulk 批量流转', async () => {
    const res = await fetch(`${baseUrl}/api/articles/bulk`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ ids: ['ART-TEST-1'], patch: { status: 'archived' } }),
    })
    expect(res.status).toBe(200)
    const check = await fetch(`${baseUrl}/api/articles?filter=ART-TEST-1`, {
      headers: authed(token),
    })
    expect((await check.json()).data[0]?.status).toBe('archived')
  })

  it('POST bulk-delete 批量删除', async () => {
    const res = await fetch(`${baseUrl}/api/articles/bulk-delete`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ ids: ['ART-TEST-1'] }),
    })
    expect(res.status).toBe(200)
    const check = await fetch(`${baseUrl}/api/articles?filter=ART-TEST-1`, {
      headers: authed(token),
    })
    expect((await check.json()).total).toBe(0)
  })

  it('非法字段返回 400', async () => {
    const res = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ id: 'X', title: '缺状态' }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /:id/view 阅读上报 +1', async () => {
    await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        id: 'ART-901',
        title: '阅读上报测试',
        excerpt: 'x',
        content: 'y',
        status: 'published',
        category: 'tech',
        views: 10,
      }),
    })
    const res = await fetch(`${baseUrl}/api/articles/ART-901/view`, {
      method: 'POST',
      headers: authed(token),
    })
    const body = await res.json()
    expect(body.views).toBe(11)
    await fetch(`${baseUrl}/api/articles/bulk-delete`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ ids: ['ART-901'] }),
    })
  })
})

describe('渠道接口', () => {
  let token

  beforeAll(async () => {
    token = (await (await login()).json()).accessToken
  })

  it('GET 返回种子渠道(含绑定状态)', async () => {
    const res = await fetch(`${baseUrl}/api/channels`, {
      headers: authed(token),
    })
    const body = await res.json()
    expect(body.data.length).toBe(8)
    const wechat = body.data.find((c) => c.name === '微信公众号')
    expect(wechat.connected).toBe(true)
    expect(wechat.account).toBeTruthy()
  })

  it('PATCH 绑定/解绑持久化', async () => {
    const name = encodeURIComponent('小红书')
    const res = await fetch(`${baseUrl}/api/channels/${name}`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ connected: true }),
    })
    expect((await res.json()).connected).toBe(true)

    // 再读一次,确认落库
    const list = await (await fetch(`${baseUrl}/api/channels`, { headers: authed(token) })).json()
    expect(list.data.find((c) => c.name === '小红书').connected).toBe(true)

    // 还原,避免影响其他用例
    await fetch(`${baseUrl}/api/channels/${name}`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ connected: false }),
    })
  })

  it('PATCH 不存在的渠道返回 404', async () => {
    const res = await fetch(
      `${baseUrl}/api/channels/${encodeURIComponent('不存在')}`,
      {
        method: 'PATCH',
        headers: authed(token),
        body: JSON.stringify({ connected: true }),
      }
    )
    expect(res.status).toBe(404)
  })
})

describe('素材与统计接口', () => {
  let token

  beforeAll(async () => {
    token = (await (await login()).json()).accessToken
  })

  it('GET /api/materials 返回种子素材', async () => {
    const res = await fetch(`${baseUrl}/api/materials`, {
      headers: authed(token),
    })
    const body = await res.json()
    expect(body.data.length).toBe(12)
    expect(body.data[0]).toMatchObject({ type: '标题公式', status: 'active' })
  })

  it('GET /api/stats/trend 返回确定性时序', async () => {
    const res = await fetch(`${baseUrl}/api/stats/trend?days=30`, {
      headers: authed(token),
    })
    const body = await res.json()
    expect(body.data).toHaveLength(30)
    expect(body.data.at(-1).date).toMatch(/^\d{2}-\d{2}$/)
    for (const point of body.data) {
      expect(point.阅读).toBeGreaterThan(point.点赞)
    }
  })
})

describe('注册与个人资料', () => {
  it('POST /api/auth/register 注册并直接签发 token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new-user@test.dev',
        password: 'password123',
        name: '测试新人',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.user).toMatchObject({ email: 'new-user@test.dev', name: '测试新人' })
    expect(body.accessToken).toBeTruthy()
  })

  it('重复邮箱注册返回 409', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new-user@test.dev',
        password: 'password123',
      }),
    })
    expect(res.status).toBe(409)
  })

  it('PATCH /api/auth/me 更新昵称', async () => {
    const token = (await (await login()).json()).accessToken
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ name: '改名后的创作者' }),
    })
    const body = await res.json()
    expect(body.name).toBe('改名后的创作者')
  })
})

describe('评论接口', () => {
  let token

  beforeAll(async () => {
    token = (await (await login()).json()).accessToken
  })

  it('GET 返回种子评论并联表带出文章标题', async () => {
    const res = await fetch(`${baseUrl}/api/comments`, {
      headers: authed(token),
    })
    const body = await res.json()
    expect(body.data.length).toBeGreaterThan(5)
    expect(body.data.every((c) => c.articleTitle)).toBeTruthy()
    expect(
      body.data.some((c) => c.status === 'pending')
    ).toBe(true)
  })

  it('GET ?status=pending 只返回待审', async () => {
    const res = await fetch(`${baseUrl}/api/comments?status=pending`, {
      headers: authed(token),
    })
    const body = await res.json()
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data.every((c) => c.status === 'pending')).toBe(true)
    globalThis.__pendingId = body.data[0].id
  })

  it('PATCH 审核通过并落库', async () => {
    const res = await fetch(`${baseUrl}/api/comments/${globalThis.__pendingId}`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ status: 'approved' }),
    })
    expect((await res.json()).status).toBe('approved')
  })

  it('DELETE 删除评论', async () => {
    const res = await fetch(`${baseUrl}/api/comments/${globalThis.__pendingId}`, {
      method: 'DELETE',
      headers: authed(token),
    })
    expect(res.status).toBe(200)
    const again = await fetch(`${baseUrl}/api/comments/${globalThis.__pendingId}`, {
      method: 'DELETE',
      headers: authed(token),
    })
    expect(again.status).toBe(404)
  })
})
