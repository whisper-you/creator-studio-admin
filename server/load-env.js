import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

// node --watch 与 --env-file-if-exists 组合会在 .env 不存在时崩溃,
// 因此改为显式加载;测试环境跳过,避免读取开发者本地配置。
const envPath = fileURLToPath(new URL('../.env', import.meta.url))

if (!process.env.VITEST && process.env.NODE_ENV !== 'test' && existsSync(envPath)) {
  loadEnvFile(envPath)
}
