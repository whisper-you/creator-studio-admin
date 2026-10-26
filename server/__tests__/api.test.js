// API 集成测试:真实 Express app + 临时目录 SQLite(node 环境跑)
// 覆盖:登录鉴权、CRUD、PATCH 部分更新语义、批量操作、错误分支
import jwt from 'jsonwebtoken'
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

describe('access token 算法约束', () => {
  it('拒绝非 HS256 的签名与 alg=none 伪造令牌', async () => {
    const session = await (await login()).json()
    const noneToken = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
        'base64url'
      ),
      Buffer.from(JSON.stringify({ sub: session.user.id, ver: 1 })).toString(
        'base64url'
      ),
      '',
    ].join('.')

    const forged = [
      jwt.sign({ sub: session.user.id, ver: 1 }, 'test-secret', {
        algorithm: 'HS384',
      }),
      noneToken,
    ]
    for (const token of forged) {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(401)
    }

    const valid = await fetch(`${baseUrl}/api/auth/me`, {
      headers: authed(session.accessToken),
    })
    expect(valid.status).toBe(200)
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

  it('POST /:id/view 同一用户每天只计一次', async () => {
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
    const first = await fetch(`${baseUrl}/api/articles/ART-901/view`, {
      method: 'POST',
      headers: authed(token),
    })
    expect((await first.json()).views).toBe(11)

    const repeated = await fetch(`${baseUrl}/api/articles/ART-901/view`, {
      method: 'POST',
      headers: authed(token),
    })
    expect((await repeated.json()).views).toBe(11)

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

  it('畸形百分号编码的渠道名返回 400 而非 500', async () => {
    const res = await fetch(`${baseUrl}/api/channels/%E0%A4%A`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ connected: true }),
    })
    expect(res.status).toBe(400)

    const probe = await fetch(`${baseUrl}/api/channels/%E0%A4%A/test-webhook`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({}),
    })
    expect(probe.status).toBe(400)
  })

  it('拒绝超长渠道账号名', async () => {
    const res = await fetch(
      `${baseUrl}/api/channels/${encodeURIComponent('知乎')}`,
      {
        method: 'PATCH',
        headers: authed(token),
        body: JSON.stringify({ account: 'x'.repeat(121) }),
      }
    )
    expect(res.status).toBe(400)
  })

  it('拒绝非法 Webhook 地址与云元数据地址', async () => {
    const name = encodeURIComponent('个人网站')
    const patch = (webhookUrl) =>
      fetch(`${baseUrl}/api/channels/${name}`, {
        method: 'PATCH',
        headers: authed(token),
        body: JSON.stringify({ webhookUrl }),
      })

    for (const webhookUrl of [
      'file:///etc/passwd',
      'https://user:pass@example.com/hook',
      'http://169.254.169.254/latest/meta-data',
      'http://[fe80::1]/hook',
    ]) {
      expect((await patch(webhookUrl)).status).toBe(400)
    }

    const saved = await patch('https://example.com/hook')
    expect(saved.status).toBe(200)
    expect((await saved.json()).webhookUrl).toBe('https://example.com/hook')
    // 清空,避免影响后续分发用例
    expect((await patch(null)).status).toBe(200)

    const probe = await fetch(`${baseUrl}/api/channels/${name}/test-webhook`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        webhookUrl: 'http://169.254.169.254/latest/meta-data',
      }),
    })
    expect(probe.status).toBe(400)
  })

  it('作者无权读取渠道的 Webhook 地址', async () => {
    const name = encodeURIComponent('个人网站')
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'channel-author@test.dev',
        password: 'password123',
        name: '渠道作者',
      }),
    })
    const authorToken = (await register.json()).accessToken

    await fetch(`${baseUrl}/api/channels/${name}`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ webhookUrl: 'https://example.com/secret-token' }),
    })

    const asAuthor = await (
      await fetch(`${baseUrl}/api/channels`, {
        headers: authed(authorToken),
      })
    ).json()
    const authorRow = asAuthor.data.find((row) => row.name === '个人网站')
    expect(authorRow.connected).toBeDefined()
    expect(authorRow.webhookUrl).toBeUndefined()

    const asAdmin = await (
      await fetch(`${baseUrl}/api/channels`, { headers: authed(token) })
    ).json()
    expect(asAdmin.data.find((row) => row.name === '个人网站').webhookUrl).toBe(
      'https://example.com/secret-token'
    )

    await fetch(`${baseUrl}/api/channels/${name}`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ webhookUrl: null }),
    })
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

  it('畸形百分号编码的 refresh cookie 返回 401 而非 500', async () => {
    const res = await refreshWith('cs_refresh=%E0%A4%A')
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

describe('登录设备与会话管理', () => {
  const email = 'device-user@test.dev'
  const password = 'password123'

  const openSession = async (userAgent) => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
      },
      body: JSON.stringify({ email, password }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    return { token: body.accessToken, cookie: refreshCookieOf(res) }
  }

  const listSessions = async (token, cookie) => {
    const res = await fetch(`${baseUrl}/api/auth/sessions`, {
      headers: { ...authed(token), Cookie: cookie },
    })
    expect(res.status).toBe(200)
    return res.json()
  }

  const revokeSession = (token, cookie, id) =>
    fetch(`${baseUrl}/api/auth/sessions/${id}`, {
      method: 'DELETE',
      headers: { ...authed(token), Cookie: cookie },
    })

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: '设备测试' }),
    })
    expect(res.status).toBe(201)
  })

  it('列出账号会话,只标记当前设备并回传 UA/IP', async () => {
    const a = await openSession(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 ListA'
    )
    const b = await openSession(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1 ListB'
    )

    const body = await listSessions(a.token, a.cookie)
    expect(body.total).toBeGreaterThanOrEqual(2)
    const current = body.data.filter((session) => session.current)
    expect(current).toHaveLength(1)
    expect(current[0].userAgent).toContain('ListA')
    expect(current[0].ip).toBeTruthy()

    const other = body.data.find(
      (session) => !session.current && session.userAgent?.includes('ListB')
    )
    expect(other).toBeTruthy()
    expect(other.expiresAt).toBeTruthy()
    // 两个设备各自持有独立可用的 refresh token
    expect((await refreshWith(b.cookie)).status).toBe(200)
  })

  it('撤销其他设备后该设备 refresh token 立即失效', async () => {
    const a = await openSession(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 RevokeA'
    )
    const b = await openSession(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/121.0 RevokeB'
    )
    const body = await listSessions(a.token, a.cookie)
    const target = body.data.find(
      (session) => !session.current && session.userAgent?.includes('RevokeB')
    )
    expect(target).toBeTruthy()

    const res = await revokeSession(a.token, a.cookie, target.id)
    expect(res.status).toBe(204)
    expect((await refreshWith(b.cookie)).status).toBe(401)
    // 当前设备会话不受影响
    expect((await refreshWith(a.cookie)).status).toBe(200)

    // 再次撤销同一会话返回 404
    expect((await revokeSession(a.token, a.cookie, target.id)).status).toBe(404)
  })

  it('不能撤销当前设备,也不能撤销他人的会话', async () => {
    const a = await openSession(
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 GuardA'
    )
    const body = await listSessions(a.token, a.cookie)
    const current = body.data.find((session) => session.current)
    expect(current).toBeTruthy()

    const res = await revokeSession(a.token, a.cookie, current.id)
    expect(res.status).toBe(400)

    // 管理员自己的会话 id 对当前用户不可见,按他人会话处理返回 404
    const adminSession = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'creator@studio.dev',
        password: 'creator123',
      }),
    })
    const adminToken = (await adminSession.json()).accessToken
    const adminCookie = refreshCookieOf(adminSession)
    const adminList = await listSessions(adminToken, adminCookie)
    const adminId = adminList.data.find((session) => session.current)?.id
    expect(adminId).toBeTruthy()

    const foreign = await revokeSession(a.token, a.cookie, adminId)
    expect(foreign.status).toBe(404)
    // 他人会话仍然可用
    expect((await refreshWith(adminCookie)).status).toBe(200)
  })

  it('退出其他设备保留当前会话,并写入审计', async () => {
    const a = await openSession(
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 OthersA'
    )
    const b = await openSession(
      'Mozilla/5.0 (Linux; Android 14) Chrome/120 OthersB'
    )

    const res = await fetch(`${baseUrl}/api/auth/sessions`, {
      method: 'DELETE',
      headers: { ...authed(a.token), Cookie: a.cookie },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.revokedSessions).toBeGreaterThanOrEqual(1)

    expect((await refreshWith(b.cookie)).status).toBe(401)
    expect((await refreshWith(a.cookie)).status).toBe(200)

    const remaining = await listSessions(a.token, a.cookie)
    expect(
      remaining.data.some((session) => session.userAgent?.includes('OthersB'))
    ).toBe(false)

    const admin = (await (await login()).json()).accessToken
    for (const action of [
      'auth.session_revoke',
      'auth.session_revoke_others',
    ]) {
      const logs = await fetch(`${baseUrl}/api/audit-logs?action=${action}`, {
        headers: authed(admin),
      })
      const logBody = await logs.json()
      expect(logBody.data.length).toBeGreaterThan(0)
      expect(logBody.data[0].entityType).toBe('user')
    }
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
    expect(logBody.data.some((log) => log.targetUrl)).toBe(true)
  })

  it('分发日志的目标地址仅对 admin/editor 返回', async () => {
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'log-author@test.dev',
        password: 'password123',
        name: '日志作者',
      }),
    })
    const authorToken = (await register.json()).accessToken

    const asAuthor = await (
      await fetch(`${baseUrl}/api/distribution/logs?articleId=ART-001`, {
        headers: authed(authorToken),
      })
    ).json()
    expect(asAuthor.data.length).toBeGreaterThan(0)
    expect(asAuthor.data.every((log) => log.targetUrl === undefined)).toBe(true)
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

  it('author 不能伪造阅读/点赞数据,管理员仍可修正', async () => {
    const draft = {
      id: 'ART-RBAC-METRICS',
      title: '指标测试',
      excerpt: '',
      content: '',
      status: 'draft',
      category: 'tech',
    }
    const inflateCreate = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(authorToken),
      body: JSON.stringify({ ...draft, views: 1000, likes: 50 }),
    })
    expect(inflateCreate.status).toBe(403)

    const inflateBulk = await fetch(`${baseUrl}/api/articles/bulk`, {
      method: 'POST',
      headers: authed(authorToken),
      body: JSON.stringify({ articles: [{ ...draft, views: 5 }] }),
    })
    expect(inflateBulk.status).toBe(403)

    // 作者正常创建(指标为 0)不受影响
    const created = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(authorToken),
      body: JSON.stringify({ ...draft, views: 0, likes: 0 }),
    })
    expect(created.status).toBe(201)

    const patchViews = await fetch(`${baseUrl}/api/articles/ART-RBAC-METRICS`, {
      method: 'PATCH',
      headers: authed(authorToken),
      body: JSON.stringify({ views: 999 }),
    })
    expect(patchViews.status).toBe(403)
    const patchLikes = await fetch(`${baseUrl}/api/articles/ART-RBAC-METRICS`, {
      method: 'PATCH',
      headers: authed(authorToken),
      body: JSON.stringify({ likes: 99 }),
    })
    expect(patchLikes.status).toBe(403)
    const bulkPatch = await fetch(`${baseUrl}/api/articles/bulk`, {
      method: 'PATCH',
      headers: authed(authorToken),
      body: JSON.stringify({
        ids: ['ART-RBAC-METRICS'],
        patch: { views: 999 },
      }),
    })
    expect(bulkPatch.status).toBe(403)

    // 阅读上报接口仍会真实计数
    const view = await fetch(`${baseUrl}/api/articles/ART-RBAC-METRICS/view`, {
      method: 'POST',
      headers: authed(authorToken),
    })
    expect(view.status).toBe(200)
    expect((await view.json()).views).toBe(1)

    // 管理员可修正指标
    const adminPatch = await fetch(`${baseUrl}/api/articles/ART-RBAC-METRICS`, {
      method: 'PATCH',
      headers: authed(adminToken),
      body: JSON.stringify({ views: 42 }),
    })
    expect(adminPatch.status).toBe(200)
    expect((await adminPatch.json()).views).toBe(42)

    const cleanup = await fetch(`${baseUrl}/api/articles/ART-RBAC-METRICS`, {
      method: 'DELETE',
      headers: authed(adminToken),
    })
    expect(cleanup.status).toBe(200)
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

  const setRole = (id, role, token = adminToken) =>
    fetch(`${baseUrl}/api/users/${id}/role`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ role }),
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
    expect((await setRole(target.id, 'admin', authorToken)).status).toBe(403)
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

  it('调整角色立即生效并写入审计,非法角色与自我保护被拒绝', async () => {
    const res = await setRole(target.id, 'editor')
    expect(res.status).toBe(200)
    expect((await res.json()).role).toBe('editor')

    // 角色以数据库为准实时读取,存量 access token 无需重签
    const me = await (await getMe(target.token)).json()
    expect(me.role).toBe('editor')

    expect((await setRole(target.id, 'owner')).status).toBe(400)
    expect((await setRole(adminId, 'author')).status).toBe(400)
    expect((await setRole('999999', 'editor')).status).toBe(404)
    // 自我保护后管理员角色保持 admin
    expect((await (await getMe(adminToken)).json()).role).toBe('admin')

    const logs = await listAudit('user.role_change')
    const log = logs.find((row) => row.entityId === target.id)
    expect(log).toBeTruthy()
    expect(log.detail).toMatchObject({ from: 'author', to: 'editor' })
    expect(log.actorEmail).toBe('creator@studio.dev')
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

describe('管理员停用与启用账号', () => {
  const email = 'disabled-user@test.dev'
  const password = 'password123'
  let adminToken
  let adminId
  let target

  const registerUser = async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: '停用测试' }),
    })
    const body = await res.json()
    return {
      id: body.user.id,
      token: body.accessToken,
      cookie: refreshCookieOf(res),
    }
  }

  const setStatus = (id, disabled, token = adminToken) =>
    fetch(`${baseUrl}/api/users/${id}/status`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ disabled }),
    })

  const findRow = async () => {
    const body = await (
      await fetch(`${baseUrl}/api/users?pageSize=100&q=disabled-user`, {
        headers: authed(adminToken),
      })
    ).json()
    return body.data.find((row) => row.id === target.id)
  }

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
    target = await registerUser()
  })

  it('非管理员不能停用或启用账号', async () => {
    expect((await setStatus(target.id, true, target.token)).status).toBe(403)
  })

  it('停用后立即吊销会话并禁止登录,启用后恢复', async () => {
    const res = await setStatus(target.id, true)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, disabled: true })
    expect(body.revokedSessions).toBeGreaterThanOrEqual(1)

    const row = await findRow()
    expect(row.disabled).toBe(true)
    expect(row.activeSessions).toBe(0)

    // 已签发的 access token 立即失效,refresh 也无法续期
    expect(
      (await fetch(`${baseUrl}/api/auth/me`, { headers: authed(target.token) }))
        .status
    ).toBe(401)
    expect((await refreshWith(target.cookie)).status).toBe(401)

    const blocked = await login(email, password)
    expect(blocked.status).toBe(403)
    expect((await blocked.json()).message).toContain('禁用')

    const enabled = await setStatus(target.id, false)
    expect(enabled.status).toBe(200)
    expect((await enabled.json()).disabled).toBe(false)
    expect((await findRow()).disabled).toBe(false)

    const relogin = await login(email, password)
    expect(relogin.status).toBe(200)

    // 启用后新登录的会话在再次停用时同样立即失效
    const fresh = await relogin.json()
    const freshCookie = refreshCookieOf(relogin)
    expect((await setStatus(target.id, true)).status).toBe(200)
    expect(
      (
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: authed(fresh.accessToken),
        })
      ).status
    ).toBe(401)
    expect((await refreshWith(freshCookie)).status).toBe(401)

    const disableLog = (await listAudit('user.disable')).find(
      (log) => log.entityId === target.id
    )
    expect(disableLog).toBeTruthy()
    expect(disableLog.actorEmail).toBe('creator@studio.dev')
    expect(disableLog.detail.revokedSessions).toBeGreaterThanOrEqual(1)

    const enableLogs = await listAudit('user.enable')
    expect(enableLogs.some((log) => log.entityId === target.id)).toBe(true)
  })

  it('参数校验、目标不存在与自我保护', async () => {
    expect((await setStatus(target.id, 'yes')).status).toBe(400)
    expect((await setStatus('999999', true)).status).toBe(404)
    expect((await setStatus(adminId, true)).status).toBe(400)
    expect(
      (await fetch(`${baseUrl}/api/auth/me`, { headers: authed(adminToken) }))
        .status
    ).toBe(200)
  })
})

describe('文章输入规模上限', () => {
  let token

  const sample = (overrides = {}) => ({
    id: 'ART-LIMIT-1',
    title: '输入上限',
    excerpt: '',
    content: '',
    status: 'draft',
    category: 'tech',
    tags: [],
    platforms: [],
    ...overrides,
  })

  const create = (body) =>
    fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify(body),
    })

  beforeAll(async () => {
    token = (await (await login()).json()).accessToken
  })

  it('拒绝超长标题、正文、标签与文章 ID', async () => {
    expect((await create(sample({ title: 'x'.repeat(201) }))).status).toBe(400)
    expect((await create(sample({ excerpt: 'x'.repeat(601) }))).status).toBe(
      400
    )
    expect(
      (await create(sample({ content: 'x'.repeat(200_001) }))).status
    ).toBe(400)
    expect(
      (
        await create(
          sample({ tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`) })
        )
      ).status
    ).toBe(400)
    expect((await create(sample({ tags: ['x'.repeat(31)] }))).status).toBe(400)
    expect((await create(sample({ id: 'A'.repeat(65) }))).status).toBe(400)
  })

  it('边界内的长正文可以正常保存', async () => {
    const res = await create(sample({ content: 'x'.repeat(200_000) }))
    expect(res.status).toBe(201)
    expect((await res.json()).content.length).toBe(200_000)
    await fetch(`${baseUrl}/api/articles/ART-LIMIT-1`, {
      method: 'DELETE',
      headers: authed(token),
    })
  })

  it('批量接口限制单次条目数', async () => {
    const articles = Array.from({ length: 101 }, (_, i) =>
      sample({ id: `ART-OVER-${i}` })
    )
    const created = await fetch(`${baseUrl}/api/articles/bulk`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ articles }),
    })
    expect(created.status).toBe(400)

    const ids = Array.from({ length: 101 }, (_, i) => `ART-MISS-${i}`)
    const patched = await fetch(`${baseUrl}/api/articles/bulk`, {
      method: 'PATCH',
      headers: authed(token),
      body: JSON.stringify({ ids, patch: { views: 1 } }),
    })
    expect(patched.status).toBe(400)

    const deleted = await fetch(`${baseUrl}/api/articles/bulk-delete`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ ids }),
    })
    expect(deleted.status).toBe(400)
  })
})
