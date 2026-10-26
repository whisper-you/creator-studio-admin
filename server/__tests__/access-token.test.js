// access token 算法约束:只接受 HS256,拒绝其他 HMAC 算法与 alg=none
import jwt from 'jsonwebtoken'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'cs-token-test-'))
process.env.JWT_SECRET = 'test-secret'

const { signAccessToken, verifyAccessToken } =
  await import('../services/session.js')

const noneToken = (payload) =>
  [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url'
    ),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    '',
  ].join('.')

describe('access token 算法约束', () => {
  it('签发的令牌使用 HS256 且可正常校验', () => {
    const token = signAccessToken({
      id: 7,
      email: 'author@test.dev',
      token_version: 2,
    })
    const [header] = token.split('.')
    expect(JSON.parse(Buffer.from(header, 'base64url').toString()).alg).toBe(
      'HS256'
    )

    const payload = verifyAccessToken(token)
    expect(payload).toMatchObject({
      sub: '7',
      email: 'author@test.dev',
      ver: 2,
    })
  })

  it('拒绝同一密钥签发的 HS384 / HS512 令牌', () => {
    for (const algorithm of ['HS384', 'HS512']) {
      const token = jwt.sign({ sub: '7', ver: 1 }, 'test-secret', {
        algorithm,
      })
      expect(() => verifyAccessToken(token)).toThrow()
    }
  })

  it('拒绝 alg=none 的无签名令牌', () => {
    expect(() => verifyAccessToken(noneToken({ sub: '7', ver: 1 }))).toThrow()
  })
})
