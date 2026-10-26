import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEV_JWT_SECRET, resolveJwtSecret } from '../services/jwt-secret.js'

const authEntry = new URL('../routes/auth.js', import.meta.url).href

describe('JWT 密钥解析与生产启动校验', () => {
  it('开发环境未配置时回退到内置密钥', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' })).toBe(DEV_JWT_SECRET)
  })

  it('开发环境保留已配置的密钥(允许短值)', () => {
    expect(
      resolveJwtSecret({ NODE_ENV: 'test', JWT_SECRET: 'test-secret' })
    ).toBe('test-secret')
  })

  it('生产环境未配置时拒绝启动', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET/
    )
  })

  it('生产环境仅空白字符视为未配置', () => {
    expect(() =>
      resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: '   ' })
    ).toThrow(/JWT_SECRET/)
  })

  it('生产环境拒绝示例占位值', () => {
    for (const secret of [DEV_JWT_SECRET, 'change-me-in-production']) {
      expect(() =>
        resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret })
      ).toThrow(/占位值/)
    }
  })

  it('生产环境拒绝少于 32 位的密钥', () => {
    expect(() =>
      resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short-secret' })
    ).toThrow(/32/)
  })

  it('生产环境接受强随机密钥', () => {
    const secret = 'a'.repeat(32)
    expect(
      resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret })
    ).toBe(secret)
  })

  it('生产环境缺密钥时模块加载即失败', () => {
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      DATA_DIR: mkdtempSync(join(tmpdir(), 'cs-jwt-')),
      // 先满足空库初始化要求,确保失败发生在 JWT 密钥解析阶段
      ADMIN_EMAIL: 'ops@example.com',
      ADMIN_PASSWORD: 'password123',
    }
    delete env.JWT_SECRET

    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(authEntry)})`,
      ],
      { env, encoding: 'utf8', timeout: 15_000 }
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('JWT_SECRET')
  })
})
