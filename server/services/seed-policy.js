import { z } from 'zod'

const parseFlag = (value) => {
  if (value === undefined || value === '') return null
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('SEED_DEMO_DATA 仅支持 true / false')
}

function resolveAdminBootstrap(env) {
  const email = (env.ADMIN_EMAIL ?? '').trim()
  const password = env.ADMIN_PASSWORD ?? ''

  if (!email && !password) return null
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL 与 ADMIN_PASSWORD 必须同时设置')
  }
  if (!z.email().safeParse(email).success) {
    throw new Error('ADMIN_EMAIL 不是合法的邮箱地址')
  }
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD 至少需要 8 个字符')
  }

  return {
    email,
    password,
    name: (env.ADMIN_NAME ?? '').trim() || '管理员',
  }
}

/**
 * 演示数据默认只在非生产环境注入;生产环境改为从 ADMIN_EMAIL / ADMIN_PASSWORD
 * 创建初始管理员。SEED_DEMO_DATA 可显式覆盖默认策略(生产环境开启会把演示
 * 账号和内容一并写入,仅用于演示部署)。
 */
export function resolveSeedPolicy(env = process.env) {
  const demo = parseFlag(env.SEED_DEMO_DATA) ?? env.NODE_ENV !== 'production'
  return {
    demo,
    admin: demo ? null : resolveAdminBootstrap(env),
  }
}
