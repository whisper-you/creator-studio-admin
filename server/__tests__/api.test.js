// API 集成测试:真实 Express app + 临时目录 SQLite(node 环境跑)
// 覆盖:登录鉴权、CRUD、PATCH 部分更新语义、批量操作、错误分支
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// 必须在 import app 之前设置:db.js 在模块加载时建库
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'cs-api-test-'))
process.env.JWT_SECRET = 'test-secret'
// 集成用例会集中触发登录/注册,调高限流阈值避免误伤;限流本身由 security.test.js 覆盖
process.env.AUTH_RATE_LIMIT_MAX = '10000'
process.env.REGISTER_RATE_LIMIT_MAX = '10000'
process.env.CHANGE_PASSWORD_RATE_LIMIT_MAX = '10000'
process.env.REFRESH_RATE_LIMIT_MAX = '10000'

const { app, checkAndPublishScheduledArticles } = await import('../index.js')

let baseUrl
let server

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  // 自动清理测试上传生成的测试图片
  const { readdirSync, unlinkSync, existsSync } = await import('node:fs')
  const uploadsDir = join(process.cwd(), 'uploads')
  if (existsSync(uploadsDir)) {
    const files = readdirSync(uploadsDir)
    for (const f of files) {
      if (f.startsWith('test-diagram-')) {
        try {
          unlinkSync(join(uploadsDir, f))
        } catch {
          // 忽略并发或已被删除错误
        }
      }
    }
  }
  await new Promise((resolve) => server.close(() => resolve()))
})

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

const refreshCookieOf = (res) => {
  const raw = res.headers
    .getSetCookie?.()
    .find?.((c) => c.startsWith('cs_refresh='))
  return raw ? raw.split(';')[0] : null
}

const refreshWith = (cookie) =>
  fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: cookie ? { Cookie: cookie } : {},
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

  it('POST /bulk 批量创建文章', async () => {
    const res = await fetch(`${baseUrl}/api/articles/bulk`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        articles: [
          {
            id: 'ART-BULK-1',
            title: '批量文章1',
            excerpt: '摘要1',
            content: '正文1',
            status: 'draft',
            category: 'tech',
            tags: ['导入'],
            platforms: ['website'],
          },
          {
            id: 'ART-BULK-2',
            title: '批量文章2',
            excerpt: '摘要2',
            content: '正文2',
            status: 'published',
            category: 'tutorial',
            tags: ['教程'],
            platforms: ['wechat'],
          },
        ],
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.created).toBe(2)
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
      body: JSON.stringify({ excerpt: '摘要(已更新)' }),
    })
    const body = await res.json()
    expect(body.excerpt).toBe('摘要(已更新)')
    expect(body.status).toBe('draft')
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
      body: JSON.stringify({
        ids: ['ART-TEST-1'],
        patch: { status: 'in_review' },
      }),
    })
    expect(res.status).toBe(200)
    const check = await fetch(`${baseUrl}/api/articles?filter=ART-TEST-1`, {
      headers: authed(token),
    })
    expect((await check.json()).data[0]?.status).toBe('in_review')
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

  it('自动发布调度器: 到达排期时间的文章自动流转为 published', async () => {
    const pastDate = new Date(Date.now() - 60000).toISOString()
    await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        id: 'ART-SCHED-AUTO',
        title: '定时发布测试',
        excerpt: 'desc',
        content: 'body',
        status: 'scheduled',
        category: 'tech',
        scheduledAt: pastDate,
      }),
    })

    const published = checkAndPublishScheduledArticles()
    expect(published.some((a) => a.id === 'ART-SCHED-AUTO')).toBe(true)

    const checkRes = await fetch(
      `${baseUrl}/api/articles?filter=ART-SCHED-AUTO`,
      {
        headers: authed(token),
      }
    )
    const checkData = await checkRes.json()
    const autoArticle = checkData.data.find((a) => a.id === 'ART-SCHED-AUTO')
    expect(autoArticle?.status).toBe('published')
    expect(autoArticle?.publishedAt).toBeTruthy()
    expect(autoArticle?.scheduledAt).toBeUndefined()

    // 清理
    await fetch(`${baseUrl}/api/articles/ART-SCHED-AUTO`, {
      method: 'DELETE',
      headers: authed(token),
    })
  })
})

describe('文章乐观锁:版本校验与冲突回滚', () => {
  let token
  const ids = ['ART-OPT-A', 'ART-OPT-B']

  beforeAll(async () => {
    token = (await (await login()).json()).accessToken
    for (const id of ids) {
      await fetch(`${baseUrl}/api/articles`, {
        method: 'POST',
        headers: authed(token),
        body: JSON.stringify({
          id,
          title: `乐观锁-${id}`,
          excerpt: '',
          content: '',
          status: 'draft',
          category: 'tech',
        }),
      })
    }
  })

  afterAll(async () => {
    await fetch(`${baseUrl}/api/articles/bulk-delete`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ ids }),
    })
  })

  const patch = (id, body) =>
    fetch(`${baseUrl}/api/articles/${id}`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify(body),
    })

  it('新建文章 version 从 1 开始,写入成功后自增', async () => {
    const created = await fetch(`${baseUrl}/api/articles?filter=ART-OPT-A`, {
      headers: authed(token),
    })
    expect((await created.json()).data[0]?.version).toBe(1)

    const res = await patch('ART-OPT-A', { version: 1, excerpt: '第一次修改' })
    expect(res.status).toBe(200)
    expect((await res.json()).version).toBe(2)
  })

  it('版本过期返回 409 + currentVersion,且不落库', async () => {
    const res = await patch('ART-OPT-A', {
      version: 1,
      excerpt: '过期写入',
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.currentVersion).toBe(2)

    const check = await fetch(`${baseUrl}/api/articles?filter=ART-OPT-A`, {
      headers: authed(token),
    })
    expect((await check.json()).data[0]?.excerpt).toBe('第一次修改')
  })

  it('带最新版本继续写入成功', async () => {
    const res = await patch('ART-OPT-A', { version: 2, excerpt: '第二次修改' })
    expect(res.status).toBe(200)
    expect((await res.json()).version).toBe(3)
  })

  it('批量写入任一版本过期则整批拒绝', async () => {
    const before = await fetch(`${baseUrl}/api/articles?filter=ART-OPT-`, {
      headers: authed(token),
    })
    const snapshot = (await before.json()).data
    const versionOf = (id) => snapshot.find((a) => a.id === id)?.version ?? 1

    const res = await fetch(`${baseUrl}/api/articles/bulk`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({
        ids,
        patch: { likes: 5 },
        // ART-OPT-B 的版本故意写错
        versions: { 'ART-OPT-A': versionOf('ART-OPT-A'), 'ART-OPT-B': 99 },
      }),
    })
    expect(res.status).toBe(409)
    expect((await res.json()).currentVersion).toBe(1)

    const after = await fetch(`${baseUrl}/api/articles?filter=ART-OPT-`, {
      headers: authed(token),
    })
    const rows = (await after.json()).data
    // 整批回滚:ART-OPT-A 的 likes 不应被更新
    expect(rows.find((a) => a.id === 'ART-OPT-A')?.likes).toBe(0)
  })

  it('批量写入版本全部匹配时成功并各自自增', async () => {
    const list = await fetch(`${baseUrl}/api/articles?filter=ART-OPT-`, {
      headers: authed(token),
    })
    const rows = (await list.json()).data
    const versions = Object.fromEntries(rows.map((a) => [a.id, a.version]))

    const res = await fetch(`${baseUrl}/api/articles/bulk`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ ids, patch: { likes: 7 }, versions }),
    })
    expect(res.status).toBe(200)

    const after = await fetch(`${baseUrl}/api/articles?filter=ART-OPT-`, {
      headers: authed(token),
    })
    const updated = (await after.json()).data
    for (const row of updated) {
      expect(row.likes).toBe(7)
      expect(row.version).toBe(versions[row.id] + 1)
    }
  })

  it('阅读上报不影响版本号', async () => {
    const list = await fetch(`${baseUrl}/api/articles?filter=ART-OPT-A`, {
      headers: authed(token),
    })
    const before = (await list.json()).data[0]

    await fetch(`${baseUrl}/api/articles/ART-OPT-A/view`, {
      method: 'POST',
      headers: authed(token),
    })

    const after = await fetch(`${baseUrl}/api/articles?filter=ART-OPT-A`, {
      headers: authed(token),
    })
    const row = (await after.json()).data[0]
    expect(row.views).toBe(before.views + 1)
    expect(row.version).toBe(before.version)
  })

  it('调度器自动发布也会递增版本号', async () => {
    await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        id: 'ART-OPT-SCHED',
        title: '乐观锁-调度',
        excerpt: '',
        content: '',
        status: 'scheduled',
        category: 'tech',
        scheduledAt: new Date(Date.now() - 60000).toISOString(),
      }),
    })
    checkAndPublishScheduledArticles()

    const check = await fetch(`${baseUrl}/api/articles?filter=ART-OPT-SCHED`, {
      headers: authed(token),
    })
    expect((await check.json()).data[0]?.version).toBe(2)

    await fetch(`${baseUrl}/api/articles/ART-OPT-SCHED`, {
      method: 'DELETE',
      headers: authed(token),
    })
  })
})

describe('服务端状态机:非法流转拦截', () => {
  let token

  beforeAll(async () => {
    token = (await (await login()).json()).accessToken
  })

  const createArticle = (id, status) =>
    fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        id,
        title: `状态机-${id}`,
        excerpt: '',
        content: '',
        status,
        category: 'tech',
      }),
    })

  const patchArticle = (id, body) =>
    fetch(`${baseUrl}/api/articles/${id}`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify(body),
    })

  const getArticle = async (id) => {
    const res = await fetch(`${baseUrl}/api/articles?filter=${id}`, {
      headers: authed(token),
    })
    return (await res.json()).data.find((a) => a.id === id)
  }

  it('草稿不能直接跳到已发布或已归档', async () => {
    expect((await createArticle('ART-SM-1', 'draft')).status).toBe(201)

    const publish = await patchArticle('ART-SM-1', { status: 'published' })
    expect(publish.status).toBe(409)
    expect((await publish.json()).message).toContain('草稿 → 已发布')

    const archive = await patchArticle('ART-SM-1', { status: 'archived' })
    expect(archive.status).toBe(409)

    expect((await getArticle('ART-SM-1'))?.status).toBe('draft')
  })

  it('允许完整链路:草稿 → 审核中 → 已排期 → 已发布 → 已归档 → 草稿', async () => {
    const scheduledAt = new Date(Date.now() + 3600_000).toISOString()

    expect(
      (await patchArticle('ART-SM-1', { status: 'in_review' })).status
    ).toBe(200)
    expect(
      (
        await patchArticle('ART-SM-1', {
          status: 'scheduled',
          scheduledAt,
        })
      ).status
    ).toBe(200)
    expect(
      (await patchArticle('ART-SM-1', { status: 'published' })).status
    ).toBe(200)
    expect(
      (await patchArticle('ART-SM-1', { status: 'archived' })).status
    ).toBe(200)
    expect((await patchArticle('ART-SM-1', { status: 'draft' })).status).toBe(
      200
    )
    expect((await getArticle('ART-SM-1'))?.status).toBe('draft')
  })

  it('保持原状态仅编辑内容不会被判为非法流转', async () => {
    const res = await patchArticle('ART-SM-1', {
      title: '仅改标题',
      status: 'draft',
    })
    expect(res.status).toBe(200)
    expect((await res.json()).title).toBe('仅改标题')
  })

  it('排期是横切动作:已发布文章可直接重新排期', async () => {
    expect((await createArticle('ART-SM-2', 'published')).status).toBe(201)

    const res = await patchArticle('ART-SM-2', {
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('scheduled')
  })

  it('批量更新含非法流转时整体拒绝且不落库', async () => {
    expect((await createArticle('ART-SM-3', 'draft')).status).toBe(201)
    expect((await createArticle('ART-SM-4', 'published')).status).toBe(201)

    const res = await fetch(`${baseUrl}/api/articles/bulk`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({
        ids: ['ART-SM-3', 'ART-SM-4'],
        patch: { status: 'archived' },
      }),
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.message).toContain('ART-SM-3')
    expect(body.message).toContain('草稿 → 已归档')

    // 事务性:同一批次里合法的文章也不能被部分更新
    expect((await getArticle('ART-SM-3'))?.status).toBe('draft')
    expect((await getArticle('ART-SM-4'))?.status).toBe('published')
  })

  it('清理状态机测试数据', async () => {
    const res = await fetch(`${baseUrl}/api/articles/bulk-delete`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        ids: ['ART-SM-1', 'ART-SM-2', 'ART-SM-3', 'ART-SM-4'],
      }),
    })
    expect(res.status).toBe(200)
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
    const list = await (
      await fetch(`${baseUrl}/api/channels`, { headers: authed(token) })
    ).json()
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
    expect(body.data.length).toBeGreaterThanOrEqual(12)
    expect(body.data.some((m) => m.type === '标题公式')).toBe(true)
  })

  it('POST /api/materials/upload 本地自托管图床上传与落库', async () => {
    // 1x1 透明 PNG base64
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const res = await fetch(`${baseUrl}/api/materials/upload`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        dataUrl: tinyPng,
        filename: 'test-diagram.png',
        name: '架构示意图',
        scene: '技术架构',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.url).toMatch(/^\/uploads\/test-diagram-/)
    expect(body.filename).toMatch(/\.png$/)

    // 验证在 GET /api/materials 中已被记录
    const listRes = await fetch(`${baseUrl}/api/materials`, {
      headers: authed(token),
    })
    const listBody = await listRes.json()
    const found = listBody.data.find((m) => m.name === '架构示意图')
    expect(found).toBeDefined()
    expect(found.type).toBe('图片素材')
    expect(found.url).toBe(body.url)
  })

  it('POST /api/materials/upload 缺少 dataUrl 返回 400', async () => {
    const res = await fetch(`${baseUrl}/api/materials/upload`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ filename: 'test.png' }),
    })
    expect(res.status).toBe(400)
  })

  it('拒绝 SVG 上传(可内嵌脚本)', async () => {
    const svg = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')
    const res = await fetch(`${baseUrl}/api/materials/upload`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        dataUrl: `data:image/svg+xml;base64,${svg}`,
        filename: 'evil.svg',
      }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('PNG / JPEG / WebP / GIF')
  })

  it('拒绝内容与声明格式不一致的图片', async () => {
    // 真实 PNG 内容,却声明成 JPEG
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const res = await fetch(`${baseUrl}/api/materials/upload`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        dataUrl: `data:image/jpeg;base64,${tinyPng}`,
        filename: 'fake.jpg',
      }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('实际格式与声明不一致')
  })

  it('拒绝无有效文件头的内容', async () => {
    const fakePng = Buffer.from('not a real png').toString('base64')
    const res = await fetch(`${baseUrl}/api/materials/upload`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        dataUrl: `data:image/png;base64,${fakePng}`,
        filename: 'fake.png',
      }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('图片内容校验失败')
  })

  it('拒绝超过 5MB 的图片', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 512).toString('base64')
    const res = await fetch(`${baseUrl}/api/materials/upload`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        dataUrl: `data:image/png;base64,${big}`,
        filename: 'too-big.png',
      }),
    })
    expect(res.status).toBe(413)
    expect((await res.json()).message).toContain('5MB')
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
    expect(body.user).toMatchObject({
      email: 'new-user@test.dev',
      name: '测试新人',
    })
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

describe('密码修改与 token 版本吊销', () => {
  const email = 'pw-user@test.dev'
  const oldPassword = 'password123'
  const newPassword = 'brand-new-pass1'
  let token

  const changePassword = (body, bearer = token) =>
    fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: authed(bearer),
      body: JSON.stringify(body),
    })

  const getMe = (bearer) =>
    fetch(`${baseUrl}/api/auth/me`, { headers: authed(bearer) })

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: oldPassword, name: '改密测试' }),
    })
    token = (await res.json()).accessToken
  })

  it('未登录返回 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
    })
    expect(res.status).toBe(401)
  })

  it('当前密码错误返回 400,密码保持不变', async () => {
    const res = await changePassword({
      currentPassword: 'wrong-password',
      newPassword,
    })
    expect(res.status).toBe(400)
    expect((await res.json()).message).toBe('当前密码不正确')

    // 原密码仍可登录
    expect((await login(email, oldPassword)).status).toBe(200)
  })

  it('新密码过短返回 400', async () => {
    const res = await changePassword({
      currentPassword: oldPassword,
      newPassword: 'short1',
    })
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('8 个字符')
  })

  it('新密码与当前密码相同返回 400', async () => {
    const res = await changePassword({
      currentPassword: oldPassword,
      newPassword: oldPassword,
    })
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('不能与当前密码相同')
  })

  it('改密成功:返回新 token,旧 token 立即失效', async () => {
    const res = await changePassword({
      currentPassword: oldPassword,
      newPassword,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accessToken).toBeTruthy()
    expect(body.user.email).toBe(email)

    // 旧 token 因 token_version 不匹配被拒绝
    const stale = await getMe(token)
    expect(stale.status).toBe(401)
    expect((await stale.json()).message).toContain('登录状态已失效')

    // 本次返回的新 token 继续可用
    expect((await getMe(body.accessToken)).status).toBe(200)
    token = body.accessToken
  })

  it('旧密码无法再登录,新密码可登录', async () => {
    expect((await login(email, oldPassword)).status).toBe(401)
    const res = await login(email, newPassword)
    expect(res.status).toBe(200)
    expect((await res.json()).user.email).toBe(email)
  })
})

describe('会话续期与登出', () => {
  const email = 'session-user@test.dev'
  const password = 'password123'
  const newPassword = 'session-new-pass1'

  const sessionOf = async (loginEmail = email, loginPassword = password) => {
    const res = await login(loginEmail, loginPassword)
    const body = await res.json()
    return { token: body.accessToken, cookie: refreshCookieOf(res), res }
  }

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: '会话测试' }),
    })
    expect(res.status).toBe(201)
  })

  it('登录下发 HttpOnly 且限定路径的 refresh cookie', async () => {
    const res = await login()
    expect(res.status).toBe(200)
    const raw = res.headers
      .getSetCookie()
      .find((c) => c.startsWith('cs_refresh='))
    expect(raw).toBeTruthy()
    expect(raw).toMatch(/HttpOnly/i)
    expect(raw).toMatch(/Path=\/api\/auth/i)
    expect(raw).toMatch(/SameSite=Lax/i)
  })

  it('未携带 refresh cookie 时返回 401', async () => {
    const res = await refreshWith(null)
    expect(res.status).toBe(401)
  })

  it('刷新返回新 access token,并轮换 refresh token', async () => {
    const { cookie: first } = await sessionOf()
    expect(first).toBeTruthy()

    const res = await refreshWith(first)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accessToken).toBeTruthy()
    expect(body.user.email).toBe(email)

    const second = refreshCookieOf(res)
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
    // 轮换后的新 cookie 可继续刷新
    expect((await refreshWith(second)).status).toBe(200)
  })

  it('重放已轮换的 token 会吊销该用户全部会话并写入审计', async () => {
    const { cookie: first } = await sessionOf()
    const rotated = await refreshWith(first)
    expect(rotated.status).toBe(200)
    const second = refreshCookieOf(rotated)

    expect((await refreshWith(first)).status).toBe(401)
    // 复用检测:同用户刚换出的新 token 也一并失效
    expect((await refreshWith(second)).status).toBe(401)

    const admin = (await (await login()).json()).accessToken
    const logs = await fetch(
      `${baseUrl}/api/audit-logs?action=auth.refresh_reuse`,
      { headers: authed(admin) }
    )
    const body = await logs.json()
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0].entityType).toBe('user')
  })

  it('登出吊销 refresh token 并清除 Cookie', async () => {
    const { cookie } = await sessionOf()
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(204)

    const cleared = res.headers
      .getSetCookie()
      .find((c) => c.startsWith('cs_refresh='))
    expect(cleared).toMatch(/cs_refresh=;/)
    expect((await refreshWith(cookie)).status).toBe(401)
  })

  it('改密吊销其他设备的 refresh token,当前会话续期正常', async () => {
    const { token, cookie: cookieA } = await sessionOf()
    const { cookie: cookieB } = await sessionOf()

    const res = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        currentPassword: password,
        newPassword,
      }),
    })
    expect(res.status).toBe(200)
    const currentCookie = refreshCookieOf(res)

    expect((await refreshWith(cookieA)).status).toBe(401)
    expect((await refreshWith(cookieB)).status).toBe(401)
    expect((await refreshWith(currentCookie)).status).toBe(200)

    // 恢复密码,避免影响后续用例
    const refreshed = await refreshWith(currentCookie)
    const freshToken = (await refreshed.json()).accessToken
    await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: authed(freshToken),
      body: JSON.stringify({
        currentPassword: newPassword,
        newPassword: password,
      }),
    })
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
    expect(body.data.some((c) => c.status === 'pending')).toBe(true)
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
    const res = await fetch(
      `${baseUrl}/api/comments/${globalThis.__pendingId}`,
      {
        method: 'PATCH',
        headers: authed(token),
        body: JSON.stringify({ status: 'approved' }),
      }
    )
    expect((await res.json()).status).toBe('approved')
  })

  it('DELETE 删除评论', async () => {
    const res = await fetch(
      `${baseUrl}/api/comments/${globalThis.__pendingId}`,
      {
        method: 'DELETE',
        headers: authed(token),
      }
    )
    expect(res.status).toBe(200)
    const again = await fetch(
      `${baseUrl}/api/comments/${globalThis.__pendingId}`,
      {
        method: 'DELETE',
        headers: authed(token),
      }
    )
    expect(again.status).toBe(404)
  })
})

describe('第三梯队: Webhook、多渠道分发与 RBAC', () => {
  let token

  beforeAll(async () => {
    token = (await (await login()).json()).accessToken
  })

  it('PATCH /api/channels/:name 配置 Webhook 地址与自动推送开关', async () => {
    const res = await fetch(
      `${baseUrl}/api/channels/${encodeURIComponent('个人网站')}`,
      {
        method: 'PATCH',
        headers: authed(token),
        body: JSON.stringify({
          webhookUrl: 'https://example.com/api/webhook',
          autoPush: true,
        }),
      }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.webhookUrl).toBe('https://example.com/api/webhook')
    expect(body.autoPush).toBe(true)
  })

  it('POST /api/channels/:name/test-webhook 连通性测试', async () => {
    const res = await fetch(
      `${baseUrl}/api/channels/${encodeURIComponent('个人网站')}/test-webhook`,
      {
        method: 'POST',
        headers: authed(token),
        body: JSON.stringify({
          webhookUrl: '', // 传空时触发模拟成功
        }),
      }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.status).toBe('simulated')
  })

  it('POST /api/distribution/dispatch 手动分发文章并生成分发日志', async () => {
    const res = await fetch(`${baseUrl}/api/distribution/dispatch`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        articleId: 'ART-001',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.results.length).toBeGreaterThan(0)

    // 验证日志查询
    const logRes = await fetch(
      `${baseUrl}/api/distribution/logs?articleId=ART-001`,
      {
        headers: authed(token),
      }
    )
    const logBody = await logRes.json()
    expect(logBody.data.length).toBeGreaterThan(0)
    expect(logBody.data[0].articleId).toBe('ART-001')
  })

  it('PATCH /api/auth/me 支持切换用户角色 (RBAC: editor / author / admin)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({
        role: 'editor',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.role).toBe('editor')

    // 还原为 admin
    await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({
        role: 'admin',
      }),
    })
  })
})

describe('服务端 RBAC: 角色、文章归属与越权拦截', () => {
  let adminToken
  let authorToken
  let authorId
  let editorToken

  const registerUser = async (email, name) => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123', name }),
    })
    return { status: res.status, body: await res.json() }
  }

  const setRole = (token, role) =>
    fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ role }),
    })

  beforeAll(async () => {
    adminToken = (await (await login()).json()).accessToken

    const author = await registerUser('rbac-author@test.dev', '权限测试作者')
    authorToken = author.body.accessToken
    authorId = author.body.user.id

    const editor = await registerUser('rbac-editor@test.dev', '权限测试主编')
    await setRole(editor.body.accessToken, 'editor')
    editorToken = editor.body.accessToken
  })

  it('公开注册的默认角色是 author', async () => {
    const { status, body } = await registerUser(
      'rbac-default@test.dev',
      '默认角色'
    )
    expect(status).toBe(201)
    expect(body.user.role).toBe('author')
  })

  it('author 不能直接创建已发布文章', async () => {
    const res = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(authorToken),
      body: JSON.stringify({
        id: 'ART-RBAC-AUTHOR-PUB',
        title: '越权发布',
        excerpt: '',
        content: '',
        status: 'published',
        category: 'tech',
      }),
    })
    expect(res.status).toBe(403)
  })

  it('author 只能编辑自己的文章,且不能直接发布', async () => {
    const created = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(authorToken),
      body: JSON.stringify({
        id: 'ART-RBAC-AUTHOR',
        title: '作者草稿',
        excerpt: '',
        content: '',
        status: 'draft',
        category: 'tech',
      }),
    })
    expect(created.status).toBe(201)
    const createdBody = await created.json()
    expect(createdBody.authorId).toBe(authorId)

    const submit = await fetch(`${baseUrl}/api/articles/ART-RBAC-AUTHOR`, {
      method: 'PATCH',
      headers: authed(authorToken),
      body: JSON.stringify({ status: 'in_review' }),
    })
    expect(submit.status).toBe(200)

    const publish = await fetch(`${baseUrl}/api/articles/ART-RBAC-AUTHOR`, {
      method: 'PATCH',
      headers: authed(authorToken),
      body: JSON.stringify({ status: 'published' }),
    })
    expect(publish.status).toBe(403)

    // 管理员名下的文章不可被作者修改
    const other = await fetch(`${baseUrl}/api/articles/ART-001`, {
      method: 'PATCH',
      headers: authed(authorToken),
      body: JSON.stringify({ title: '越权改名' }),
    })
    expect(other.status).toBe(403)
  })

  it('author 不能删除文章,也不能触发分发', async () => {
    const del = await fetch(`${baseUrl}/api/articles/ART-RBAC-AUTHOR`, {
      method: 'DELETE',
      headers: authed(authorToken),
    })
    expect(del.status).toBe(403)

    const dispatch = await fetch(`${baseUrl}/api/distribution/dispatch`, {
      method: 'POST',
      headers: authed(authorToken),
      body: JSON.stringify({ articleId: 'ART-RBAC-AUTHOR' }),
    })
    expect(dispatch.status).toBe(403)
  })

  it('editor 可编辑他人文章,但不可删除他人文章', async () => {
    const created = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        id: 'ART-RBAC-ADMIN',
        title: '管理员文章',
        excerpt: '',
        content: '',
        status: 'draft',
        category: 'tech',
      }),
    })
    expect(created.status).toBe(201)

    const edit = await fetch(`${baseUrl}/api/articles/ART-RBAC-ADMIN`, {
      method: 'PATCH',
      headers: authed(editorToken),
      body: JSON.stringify({ status: 'in_review' }),
    })
    expect(edit.status).toBe(200)

    const del = await fetch(`${baseUrl}/api/articles/ART-RBAC-ADMIN`, {
      method: 'DELETE',
      headers: authed(editorToken),
    })
    expect(del.status).toBe(403)
  })

  it('editor 可删除自己的文章', async () => {
    const created = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(editorToken),
      body: JSON.stringify({
        id: 'ART-RBAC-EDITOR',
        title: '主编文章',
        excerpt: '',
        content: '',
        status: 'published',
        category: 'tech',
      }),
    })
    expect(created.status).toBe(201)

    const del = await fetch(`${baseUrl}/api/articles/ART-RBAC-EDITOR`, {
      method: 'DELETE',
      headers: authed(editorToken),
    })
    expect(del.status).toBe(200)
  })

  it('admin 可删除任意文章(收尾清理)', async () => {
    for (const id of ['ART-RBAC-ADMIN', 'ART-RBAC-AUTHOR']) {
      const del = await fetch(`${baseUrl}/api/articles/${id}`, {
        method: 'DELETE',
        headers: authed(adminToken),
      })
      expect(del.status).toBe(200)
    }
  })
})

describe('自动分发:仅命中开启 auto_push 的渠道', () => {
  let token

  const patchChannel = (name, body) =>
    fetch(`${baseUrl}/api/channels/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify(body),
    })

  beforeAll(async () => {
    token = (await (await login()).json()).accessToken
  })

  it('排期自动发布只向 auto_push 渠道分发,手动分发不受限', async () => {
    // 清除前序用例留下的真实 webhook,避免测试发起外网请求
    await patchChannel('个人网站', { webhookUrl: null, autoPush: false })
    await patchChannel('微信公众号', { autoPush: true })

    const pastDate = new Date(Date.now() - 60000).toISOString()
    const created = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        id: 'ART-AUTOPUSH-1',
        title: '自动分发测试',
        excerpt: '',
        content: '',
        status: 'scheduled',
        category: 'tech',
        scheduledAt: pastDate,
      }),
    })
    expect(created.status).toBe(201)

    checkAndPublishScheduledArticles()

    const logs = await (
      await fetch(`${baseUrl}/api/distribution/logs?articleId=ART-AUTOPUSH-1`, {
        headers: authed(token),
      })
    ).json()
    expect(logs.data.length).toBeGreaterThan(0)
    expect(logs.data.every((log) => log.channelName === '微信公众号')).toBe(
      true
    )

    // 手动分发仍覆盖全部已绑定渠道
    const manual = await fetch(`${baseUrl}/api/distribution/dispatch`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ articleId: 'ART-AUTOPUSH-1' }),
    })
    const manualBody = await manual.json()
    const channelNames = manualBody.results.map((r) => r.channel)
    expect(channelNames).toContain('微信公众号')
    expect(channelNames).toContain('知乎')
    expect(channelNames).toContain('个人网站')

    // 清理
    await patchChannel('微信公众号', { autoPush: false })
    await fetch(`${baseUrl}/api/articles/ART-AUTOPUSH-1`, {
      method: 'DELETE',
      headers: authed(token),
    })
  })
})

describe('操作审计日志', () => {
  const auditEmail = 'audit-author@test.dev'
  let adminToken
  let authorToken

  const listLogs = (query = '') =>
    fetch(`${baseUrl}/api/audit-logs?pageSize=100&${query}`, {
      headers: authed(adminToken),
    })

  beforeAll(async () => {
    adminToken = (await (await login()).json()).accessToken
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: auditEmail,
        password: 'password123',
        name: '审计作者',
      }),
    })
    authorToken = (await res.json()).accessToken
  })

  it('非管理员访问返回 403', async () => {
    const res = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: authed(authorToken),
    })
    expect(res.status).toBe(403)
  })

  it('管理员可分页查询且返回操作者信息', async () => {
    const res = await fetch(`${baseUrl}/api/audit-logs?page=1&pageSize=5`, {
      headers: authed(adminToken),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBeGreaterThan(0)
    expect(body.data.length).toBeLessThanOrEqual(5)
    expect(body.data[0]).toHaveProperty('action')
    expect(body.data[0]).toHaveProperty('actorEmail')
  })

  it('文章创建/状态流转/删除都会留痕', async () => {
    await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        id: 'ART-AUDIT-1',
        title: '审计测试文章',
        excerpt: '',
        content: '',
        status: 'draft',
        category: 'tech',
      }),
    })
    await fetch(`${baseUrl}/api/articles/ART-AUDIT-1`, {
      method: 'PATCH',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'in_review' }),
    })

    const afterStatus = await (
      await listLogs('entityType=article&action=article.status_change')
    ).json()
    const statusLog = afterStatus.data.find(
      (log) => log.entityId === 'ART-AUDIT-1'
    )
    expect(statusLog).toBeTruthy()
    expect(statusLog.detail).toMatchObject({ from: 'draft', to: 'in_review' })
    expect(statusLog.actorEmail).toBe('creator@studio.dev')

    await fetch(`${baseUrl}/api/articles/ART-AUDIT-1`, {
      method: 'DELETE',
      headers: authed(adminToken),
    })
    const afterDelete = await (
      await listLogs('entityType=article&action=article.delete')
    ).json()
    const deleteLog = afterDelete.data.find(
      (log) => log.entityId === 'ART-AUDIT-1'
    )
    expect(deleteLog).toBeTruthy()
    expect(deleteLog.detail.title).toBe('审计测试文章')
  })

  it('渠道配置更新与分发触发会留痕', async () => {
    await fetch(`${baseUrl}/api/channels/${encodeURIComponent('B 站')}`, {
      method: 'PATCH',
      headers: authed(adminToken),
      body: JSON.stringify({ autoPush: false }),
    })
    const channelLogs = await (
      await listLogs('entityType=channel&action=channel.update')
    ).json()
    expect(channelLogs.data.some((log) => log.entityId === 'B 站')).toBe(true)

    const created = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        id: 'ART-AUDIT-2',
        title: '审计分发文章',
        excerpt: '',
        content: '',
        status: 'published',
        category: 'tech',
      }),
    })
    expect(created.status).toBe(201)

    await fetch(`${baseUrl}/api/distribution/dispatch`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ articleId: 'ART-AUDIT-2' }),
    })
    const dispatchLogs = await (
      await listLogs('action=distribution.dispatch')
    ).json()
    expect(
      dispatchLogs.data.some((log) => log.entityId === 'ART-AUDIT-2')
    ).toBe(true)

    await fetch(`${baseUrl}/api/articles/ART-AUDIT-2`, {
      method: 'DELETE',
      headers: authed(adminToken),
    })
  })

  it('角色变更与修改密码会留痕,并支持按操作者过滤', async () => {
    const roleRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: authed(authorToken),
      body: JSON.stringify({ role: 'editor' }),
    })
    expect(roleRes.status).toBe(200)

    const pwRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: authed(authorToken),
      body: JSON.stringify({
        currentPassword: 'password123',
        newPassword: 'audit-new-pass1',
      }),
    })
    expect(pwRes.status).toBe(200)

    const logs = await (
      await listLogs(`actor=${encodeURIComponent(auditEmail)}`)
    ).json()
    const actions = logs.data.map((log) => log.action)
    expect(actions).toContain('user.role_change')
    expect(actions).toContain('auth.change_password')
    expect(logs.data.every((log) => log.actorEmail === auditEmail)).toBe(true)
  })
})

describe('管理员用户管理:重置密码与强制下线', () => {
  const targetEmail = 'users-target@test.dev'
  let adminToken
  let adminId
  let target
  let authorToken

  const registerUser = async (email, name) => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123', name }),
    })
    const body = await res.json()
    return {
      id: body.user.id,
      token: body.accessToken,
      cookie: refreshCookieOf(res),
    }
  }

  const listUsers = (query = '') =>
    fetch(`${baseUrl}/api/users?pageSize=100&${query}`, {
      headers: authed(adminToken),
    })

  const resetPassword = (id, body, token = adminToken) =>
    fetch(`${baseUrl}/api/users/${id}/reset-password`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify(body),
    })

  const forceLogout = (id, token = adminToken) =>
    fetch(`${baseUrl}/api/users/${id}/force-logout`, {
      method: 'POST',
      headers: authed(token),
    })

  const getMe = (token) =>
    fetch(`${baseUrl}/api/auth/me`, { headers: authed(token) })

  const listAudit = async (action) =>
    (
      await (
        await fetch(`${baseUrl}/api/audit-logs?pageSize=100&action=${action}`, {
          headers: authed(adminToken),
        })
      ).json()
    ).data

  beforeAll(async () => {
    const res = await login()
    const body = await res.json()
    adminToken = body.accessToken
    adminId = body.user.id
    target = await registerUser(targetEmail, '被管理用户')
    const author = await registerUser('users-author@test.dev', '普通作者')
    authorToken = author.token
  })

  it('非管理员访问用户列表、重置密码与强制下线均返回 403', async () => {
    expect(
      (await fetch(`${baseUrl}/api/users`, { headers: authed(authorToken) }))
        .status
    ).toBe(403)
    expect(
      (
        await resetPassword(
          target.id,
          { newPassword: 'new-pass-1x' },
          authorToken
        )
      ).status
    ).toBe(403)
    expect((await forceLogout(target.id, authorToken)).status).toBe(403)
  })

  it('管理员可分页搜索用户,不返回密码哈希', async () => {
    const res = await listUsers('q=users-target')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    const row = body.data[0]
    expect(row).toMatchObject({
      id: target.id,
      email: targetEmail,
      role: 'author',
    })
    expect(row).not.toHaveProperty('password_hash')
    expect(row.activeSessions).toBe(1)

    const all = await (await listUsers()).json()
    expect(all.data.some((u) => u.id === adminId)).toBe(true)
  })

  it('重置密码:参数校验、目标不存在与自我保护', async () => {
    const short = await resetPassword(target.id, { newPassword: 'short1' })
    expect(short.status).toBe(400)
    expect((await short.json()).message).toContain('8 个字符')

    expect(
      (await resetPassword('999999', { newPassword: 'valid-pass-1' })).status
    ).toBe(404)

    const self = await resetPassword(adminId, { newPassword: 'valid-pass-1' })
    expect(self.status).toBe(400)
    expect((await getMe(adminToken)).status).toBe(200)
  })

  it('重置密码立即吊销全部会话,旧密码失效、新密码可登录', async () => {
    const res = await resetPassword(target.id, {
      newPassword: 'target-new-pass1',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.revokedSessions).toBeGreaterThanOrEqual(1)

    // 旧 access token 因 token_version 递增立即失效
    expect((await getMe(target.token)).status).toBe(401)
    // 旧 refresh cookie 已被吊销,无法续期
    expect((await refreshWith(target.cookie)).status).toBe(401)
    // 旧密码无法登录,新密码可以
    expect((await login(targetEmail, 'password123')).status).toBe(401)
    expect((await login(targetEmail, 'target-new-pass1')).status).toBe(200)

    const logs = await listAudit('user.reset_password')
    const log = logs.find((row) => row.entityId === target.id)
    expect(log).toBeTruthy()
    expect(log.actorEmail).toBe('creator@studio.dev')
    expect(log.detail.revokedSessions).toBeGreaterThanOrEqual(1)
  })

  it('强制下线立即失效访问令牌,并可重新登录', async () => {
    const fresh = await login(targetEmail, 'target-new-pass1')
    const session = await fresh.json()
    const cookie = refreshCookieOf(fresh)

    const res = await forceLogout(target.id)
    expect(res.status).toBe(200)
    expect((await res.json()).revokedSessions).toBeGreaterThanOrEqual(1)

    expect((await getMe(session.accessToken)).status).toBe(401)
    expect((await refreshWith(cookie)).status).toBe(401)
    // 密码未变,重新登录立即恢复
    expect((await login(targetEmail, 'target-new-pass1')).status).toBe(200)

    const logs = await listAudit('user.force_logout')
    const log = logs.find((row) => row.entityId === target.id)
    expect(log).toBeTruthy()
    expect(log.detail.revokedSessions).toBeGreaterThanOrEqual(1)
  })

  it('强制下线:目标不存在与自我保护', async () => {
    expect((await forceLogout('999999')).status).toBe(404)
    expect((await forceLogout(adminId)).status).toBe(400)
    expect((await getMe(adminToken)).status).toBe(200)
  })
})
