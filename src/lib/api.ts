import axios from 'axios'
import { z } from 'zod'
import { articleSchema, type Article } from '@/features/articles/data/schema'
import { useAuthStore } from '@/stores/auth-store'

/**
 * 后端 API 客户端。
 * - 开发环境走 vite 代理(/api → http://localhost:5180)
 * - 生产环境同源部署(Express 托管 dist)时天然同源
 * - 自动携带 JWT;未启动后端时由调用方降级为「离线演示模式」
 */
export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().auth.accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const articleListSchema = z.object({
  data: z.array(articleSchema),
  total: z.number(),
})

const loginSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.email(),
    name: z.string(),
  }),
})

export type LoginResult = z.infer<typeof loginSchema>

export const authApi = {
  async login(email: string, password: string): Promise<LoginResult> {
    return loginSchema.parse((await api.post('/auth/login', { email, password })).data)
  },
}

export const articlesApi = {
  /** 拉全量(前端把 store hydrate 成服务端数据) */
  async listAll(): Promise<Article[]> {
    const parsed = articleListSchema.parse(
      (await api.get('/articles', { params: { pageSize: 'all' } })).data
    )
    return parsed.data
  },
  async create(article: Article): Promise<void> {
    await api.post('/articles', {
      ...article,
      scheduledAt: article.scheduledAt?.toISOString() ?? null,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    })
  },
  /**
   * 部分更新。patch 里显式传 null 表示清空日期字段;
   * undefined 的字段不会出现在 JSON 里,服务端会跳过它们。
   */
  async update(id: string, patch: Record<string, unknown>): Promise<void> {
    await api.patch(`/articles/${id}`, patch)
  },
  async updateBulk(ids: string[], patch: Record<string, unknown>): Promise<void> {
    await api.patch('/articles/bulk', { ids, patch })
  },
  async delete(ids: string[]): Promise<void> {
    if (ids.length === 1) await api.delete(`/articles/${ids[0]}`)
    else await api.post('/articles/bulk-delete', { ids })
  },
}
