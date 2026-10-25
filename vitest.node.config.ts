import { defineConfig } from 'vitest/config'

// server/ 的集成测试跑在 node 环境(需要 node:sqlite),
// 与前端浏览器测试(vite.config.ts)分开
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.js'],
    hookTimeout: 15000,
  },
})
