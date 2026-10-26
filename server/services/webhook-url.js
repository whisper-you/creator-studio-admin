import { isIP } from 'node:net'

export const MAX_WEBHOOK_URL_LENGTH = 2048

// 云厂商元数据服务别名,始终拒绝
const METADATA_HOSTS = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'metadata.tencentyun.com',
])

const stripBrackets = (host) =>
  host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host

const ipv4Parts = (host) => host.split('.').map(Number)

const isLinkLocalOrMetadataIPv4 = ([a, b]) => a === 169 && b === 254

const isInvalidIPv4 = ([a, b, c, d]) =>
  (a === 0 && b === 0 && c === 0 && d === 0) ||
  (a === 255 && b === 255 && c === 255 && d === 255)

const isPrivateIPv4 = ([a, b]) =>
  a === 0 ||
  a === 10 ||
  a === 127 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168) ||
  isLinkLocalOrMetadataIPv4([a, b])

/** IPv4-mapped IPv6(::ffff:a.b.c.d)展开为 IPv4 八位组 */
const mappedIPv4Parts = (address) => {
  const suffix = address.slice('::ffff:'.length)
  if (suffix.includes('.')) return ipv4Parts(suffix)
  const [high, low] = suffix.split(':').map((part) => parseInt(part, 16))
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null
  return [high >> 8, high & 0xff, low >> 8, low & 0xff]
}

const isLinkLocalIPv6 = (address) => /^fe[89ab][0-9a-f]?:/i.test(address)

const isPrivateIPv6 = (address) =>
  address === '::1' ||
  address === '::' ||
  isLinkLocalIPv6(address) ||
  /^f[cd][0-9a-f]{0,2}:/i.test(address)

/**
 * 校验 Webhook 地址,防止 SSRF 与协议滥用。
 * - 仅允许 http/https,禁止内嵌账号密码
 * - 始终拒绝云元数据与链路本地地址
 * - WEBHOOK_BLOCK_PRIVATE=true 时额外拒绝本机/私网/内网域名
 * 空值表示清空或走模拟通道,视为合法。
 */
export function validateWebhookUrl(raw, { env = process.env } = {}) {
  if (raw == null) return { ok: true, url: null }
  const value = String(raw).trim()
  if (!value) return { ok: true, url: null }
  if (value.length > MAX_WEBHOOK_URL_LENGTH) {
    return {
      ok: false,
      message: `Webhook 地址不能超过 ${MAX_WEBHOOK_URL_LENGTH} 个字符`,
    }
  }

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, message: 'Webhook 地址必须是合法的 URL' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'Webhook 仅支持 http/https 地址' }
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: 'Webhook 地址不能包含账号密码' }
  }

  const host = stripBrackets(parsed.hostname.toLowerCase()).replace(/\.$/, '')
  if (!host) return { ok: false, message: 'Webhook 地址缺少主机名' }
  if (METADATA_HOSTS.has(host)) {
    return { ok: false, message: '禁止向云元数据服务推送 Webhook' }
  }

  const ipVersion = isIP(host)
  const v4 = ipVersion === 4 ? ipv4Parts(host) : null
  const v6 = ipVersion === 6 ? host : null
  const mapped = v6?.startsWith('::ffff:') ? mappedIPv4Parts(v6) : null

  if (
    (v4 && (isInvalidIPv4(v4) || isLinkLocalOrMetadataIPv4(v4))) ||
    (mapped && (isInvalidIPv4(mapped) || isLinkLocalOrMetadataIPv4(mapped)))
  ) {
    return { ok: false, message: '禁止访问云元数据或链路本地地址' }
  }
  if (v6 && isLinkLocalIPv6(v6)) {
    return { ok: false, message: '禁止访问链路本地地址' }
  }

  if (env.WEBHOOK_BLOCK_PRIVATE === 'true') {
    if (host === 'localhost' || host.endsWith('.localhost')) {
      return { ok: false, message: '当前配置禁止访问本机地址' }
    }
    if (
      (v4 && isPrivateIPv4(v4)) ||
      (mapped && isPrivateIPv4(mapped)) ||
      (v6 && isPrivateIPv6(v6))
    ) {
      return { ok: false, message: '当前配置禁止访问私网地址' }
    }
  }

  return { ok: true, url: value }
}
