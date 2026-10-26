import { defineConfig } from 'vitest/config'

// server/ 的集成测试跑在 node 环境(需要 node:sqlite),
// 与前端浏览器测试(vite.config.ts)分开
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'server/**/*.test.js',
      'src/features/articles/utils/parse-markdown.test.ts',
      'src/features/articles/utils/wechat-formatter.test.ts',
      'src/features/articles/utils/export-article.test.ts',
      'src/features/articles/utils/ai-assistant.test.ts',
    ],
    hookTimeout: 15000,
  },
})
