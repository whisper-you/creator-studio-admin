import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveSeedPolicy } from '../services/seed-policy.js'

const dbEntry = new URL('../db/index.js', import.meta.url).href

const script = [
  `const { db } = await import(${JSON.stringify(dbEntry)})`,
  "const count = (table) => db.prepare('SELECT COUNT(*) AS c FROM ' + table).get().c",
  "const admin = db.prepare('SELECT email, role FROM users ORDER BY id LIMIT 1').get() ?? null",
  "const connected = db.prepare('SELECT COUNT(*) AS c FROM channels WHERE connected = 1').get().c",
  "console.log(JSON.stringify({ users: count('users'), articles: count('articles'), channels: count('channels'), materials: count('materials'), comments: count('comments'), connected, admin }))",
].join('\n')

const tempDataDir = () => mkdtempSync(join(tmpdir(), 'cs-seed-'))

const runDbInit = (dataDir, overrides = {}) => {
  const env = { ...process.env, DATA_DIR: dataDir, ...overrides }
  for (const key of [
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'ADMIN_NAME',
    'SEED_DEMO_DATA',
  ]) {
    if (!(key in overrides)) delete env[key]
  }
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env,
    encoding: 'utf8',
    timeout: 15_000,
  })
}

const parseResult = (result) => {
  expect(result.status).toBe(0)
  return JSON.parse(result.stdout.trim().split('\n').at(-1))
}

describe('种子数据策略', () => {
  it('开发环境默认注入演示数据', () => {
    expect(resolveSeedPolicy({ NODE_ENV: 'development' })).toEqual({
      demo: true,
      admin: null,
    })
  })

  it('生产环境默认不注入演示数据,也不自动创建账号', () => {
    expect(resolveSeedPolicy({ NODE_ENV: 'production' })).toEqual({
      demo: false,
      admin: null,
    })
  })

  it('生产环境可通过 SEED_DEMO_DATA=true 显式开启演示数据', () => {
    expect(
      resolveSeedPolicy({
        NODE_ENV: 'production',
        SEED_DEMO_DATA: 'true',
      }).demo
    ).toBe(true)
  })

  it('开发环境可通过 SEED_DEMO_DATA=false 关闭演示数据', () => {
    expect(
      resolveSeedPolicy({
        NODE_ENV: 'development',
        SEED_DEMO_DATA: 'false',
      }).demo
    ).toBe(false)
  })

  it('SEED_DEMO_DATA 只接受 true / false', () => {
    expect(() =>
      resolveSeedPolicy({ NODE_ENV: 'production', SEED_DEMO_DATA: 'yes' })
    ).toThrow(/SEED_DEMO_DATA/)
  })

  it('管理员账号必须成对配置', () => {
    expect(() =>
      resolveSeedPolicy({ NODE_ENV: 'production', ADMIN_EMAIL: 'a@b.com' })
    ).toThrow(/同时设置/)
    expect(() =>
      resolveSeedPolicy({
        NODE_ENV: 'production',
        ADMIN_PASSWORD: 'password123',
      })
    ).toThrow(/同时设置/)
  })

  it('管理员邮箱与密码需要满足最低要求', () => {
    expect(() =>
      resolveSeedPolicy({
        NODE_ENV: 'production',
        ADMIN_EMAIL: 'not-an-email',
        ADMIN_PASSWORD: 'password123',
      })
    ).toThrow(/邮箱/)
    expect(() =>
      resolveSeedPolicy({
        NODE_ENV: 'production',
        ADMIN_EMAIL: 'ops@example.com',
        ADMIN_PASSWORD: 'short',
      })
    ).toThrow(/8/)
  })

  it('合法配置返回管理员引导信息', () => {
    expect(
      resolveSeedPolicy({
        NODE_ENV: 'production',
        ADMIN_EMAIL: 'ops@example.com',
        ADMIN_PASSWORD: 'password123',
      }).admin
    ).toEqual({
      email: 'ops@example.com',
      password: 'password123',
      name: '管理员',
    })
    expect(
      resolveSeedPolicy({
        NODE_ENV: 'production',
        ADMIN_EMAIL: 'ops@example.com',
        ADMIN_PASSWORD: 'password123',
        ADMIN_NAME: '运维',
      }).admin?.name
    ).toBe('运维')
  })
})

describe('生产环境数据库初始化', () => {
  it('空库且未提供管理员账号时拒绝启动', () => {
    const result = runDbInit(tempDataDir(), { NODE_ENV: 'production' })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('ADMIN_EMAIL')
  })

  it('空库使用引导管理员启动,且不注入演示内容', () => {
    const data = parseResult(
      runDbInit(tempDataDir(), {
        NODE_ENV: 'production',
        ADMIN_EMAIL: 'ops@example.com',
        ADMIN_PASSWORD: 'password123',
        ADMIN_NAME: '运维',
      })
    )

    expect(data.users).toBe(1)
    expect(data.admin).toEqual({ email: 'ops@example.com', role: 'admin' })
    expect(data.articles).toBe(0)
    expect(data.materials).toBe(0)
    expect(data.comments).toBe(0)
    expect(data.channels).toBe(8)
    expect(data.connected).toBe(0)
  })

  it('显式开启演示数据时保留完整的演示环境', () => {
    const data = parseResult(
      runDbInit(tempDataDir(), {
        NODE_ENV: 'production',
        SEED_DEMO_DATA: 'true',
      })
    )

    expect(data.admin).toEqual({
      email: 'creator@studio.dev',
      role: 'admin',
    })
    expect(data.articles).toBeGreaterThan(0)
    expect(data.materials).toBeGreaterThan(0)
    expect(data.connected).toBeGreaterThan(0)
  })

  it('已有用户的数据库不强制要求管理员引导配置', () => {
    const dataDir = tempDataDir()
    parseResult(runDbInit(dataDir, { NODE_ENV: 'development' }))

    const prod = runDbInit(dataDir, { NODE_ENV: 'production' })
    expect(prod.status).toBe(0)
  })
})
