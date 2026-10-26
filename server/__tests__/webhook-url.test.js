import { describe, expect, it } from 'vitest'
import {
  validateWebhookUrl,
  MAX_WEBHOOK_URL_LENGTH,
} from '../services/webhook-url.js'

const check = (url, env = {}) => validateWebhookUrl(url, { env })

describe('Webhook 地址校验', () => {
  it('允许 http/https 与空值', () => {
    expect(check('https://example.com/hook')).toMatchObject({
      ok: true,
      url: 'https://example.com/hook',
    })
    expect(check('http://example.com:8080/hook?token=abc')).toMatchObject({
      ok: true,
      url: 'http://example.com:8080/hook?token=abc',
    })
    expect(check('')).toEqual({ ok: true, url: null })
    expect(check(null)).toEqual({ ok: true, url: null })
    expect(check(undefined)).toEqual({ ok: true, url: null })
  })

  it('拒绝超长地址', () => {
    const base = 'https://example.com/'
    expect(check(base + 'a'.repeat(MAX_WEBHOOK_URL_LENGTH)).ok).toBe(false)
    expect(
      check(base + 'a'.repeat(MAX_WEBHOOK_URL_LENGTH - base.length))
    ).toMatchObject({ ok: true })
  })

  it('拒绝非 http/https 协议与内嵌凭据', () => {
    expect(check('file:///etc/passwd')).toMatchObject({ ok: false })
    expect(check('javascript:alert(1)')).toMatchObject({ ok: false })
    expect(check('ftp://example.com/hook')).toMatchObject({ ok: false })
    expect(check('https://user:pass@example.com/hook').ok).toBe(false)
    expect(check('not a url').ok).toBe(false)
  })

  it('始终拒绝云元数据、链路本地与无效地址', () => {
    expect(check('http://169.254.169.254/latest/meta-data').ok).toBe(false)
    expect(check('http://metadata.google.internal/computeMetadata').ok).toBe(
      false
    )
    expect(check('http://[fe80::1]/hook').ok).toBe(false)
    expect(check('http://[::ffff:169.254.169.254]/hook').ok).toBe(false)
    expect(check('http://0.0.0.0/hook').ok).toBe(false)
  })

  it('默认允许私网,开启 WEBHOOK_BLOCK_PRIVATE 后拒绝', () => {
    const privateUrls = [
      'http://127.0.0.1:8080/hook',
      'http://localhost:8080/hook',
      'http://10.0.0.8/hook',
      'http://172.20.1.2/hook',
      'http://192.168.1.9/hook',
      'http://[::1]/hook',
      'http://[fd00::1]/hook',
    ]
    for (const url of privateUrls) {
      expect(check(url).ok).toBe(true)
      expect(check(url, { WEBHOOK_BLOCK_PRIVATE: 'true' }).ok).toBe(false)
    }
  })
})
