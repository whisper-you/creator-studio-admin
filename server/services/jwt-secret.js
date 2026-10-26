/** JWT 密钥解析:开发环境允许回退,生产环境必须显式提供强随机值 */

export const DEV_JWT_SECRET = 'creator-studio-dev-secret'

const MIN_PRODUCTION_SECRET_LENGTH = 32
const INSECURE_SECRETS = new Set([
  DEV_JWT_SECRET,
  'change-me-in-production',
  'change-me',
])

/**
 * 开发环境允许回退到内置密钥;生产环境拒绝缺失、占位符与过短密钥。
 */
export function resolveJwtSecret(env = process.env) {
  const secret = (env.JWT_SECRET ?? '').trim()

  if (env.NODE_ENV !== 'production') {
    return secret || DEV_JWT_SECRET
  }
  if (!secret) {
    throw new Error('生产环境必须设置 JWT_SECRET 环境变量')
  }
  if (INSECURE_SECRETS.has(secret)) {
    throw new Error(
      '生产环境的 JWT_SECRET 不能使用示例占位值,请替换为强随机字符串'
    )
  }
  if (secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error(
      `生产环境的 JWT_SECRET 至少需要 ${MIN_PRODUCTION_SECRET_LENGTH} 个字符`
    )
  }
  return secret
}
