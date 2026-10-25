import { z } from 'zod'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth-store'
import { articleSchema, type Article } from '@/features/articles/data/schema'

/**
 * 后端 API 客户端。
 * - 开发环境走 vite 代理(/api → http://localhost:5180)
 * - 生产环境同源部署(Express 托管 dist)时天然同源
 * - 自动携带 JWT;未启动后端时由调用方降级为「离线演示模式」
 */
const api = axios.create({ baseURL: '/api' })

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

type LoginResult = z.infer<typeof loginSchema>

export const authApi = {
  async login(email: string, password: string): Promise<LoginResult> {
    return loginSchema.parse(
      (await api.post('/auth/login', { email, password })).data
    )
  },
  async register(email: string, password: string, name: string) {
    return loginSchema.parse(
      (await api.post('/auth/register', { email, password, name })).data
    )
  },
  /** 用当前 token 换取用户信息(刷新页面后恢复登录态) */
  async me() {
    return meSchema.parse((await api.get('/auth/me')).data)
  },
  async updateMe(name: string) {
    return meSchema.parse((await api.patch('/auth/me', { name })).data)
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
  async updateBulk(
    ids: string[],
    patch: Record<string, unknown>
  ): Promise<void> {
    await api.patch('/articles/bulk', { ids, patch })
  },
  async delete(ids: string[]): Promise<void> {
    if (ids.length === 1) await api.delete(`/articles/${ids[0]}`)
    else await api.post('/articles/bulk-delete', { ids })
  },
  /** 阅读上报:后端 views +1,返回最新阅读量 */
  async recordView(id: string): Promise<number> {
    const { data } = await api.post<{ id: string; views: number }>(
      `/articles/${id}/view`
    )
    return data.views
  },
}

const channelListSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      account: z.string().nullable().optional(),
      connected: z.boolean(),
    })
  ),
})

const materialListSchema = z.object({
  data: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      type: z.enum(['标题公式', '封面模板', '话题灵感', '数据报告']),
      scene: z.string(),
      usage: z.number(),
      status: z.enum(['active', 'updating', 'deprecated']),
    })
  ),
})

const trendSchema = z.object({
  data: z.array(
    z.object({ date: z.string(), 阅读: z.number(), 点赞: z.number() })
  ),
})

const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
})

const commentListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      articleId: z.string(),
      articleTitle: z.string().nullable(),
      author: z.string(),
      content: z.string(),
      status: z.enum(['pending', 'approved', 'rejected']),
      createdAt: z.string(),
    })
  ),
})

export type CommentItem = z.infer<typeof commentListSchema>['data'][number]

export const channelsApi = {
  async list() {
    return channelListSchema.parse((await api.get('/channels')).data).data
  },
  /** 绑定/解绑(渠道名含中文,需 URL 编码) */
  async setConnected(name: string, connected: boolean) {
    await api.patch(`/channels/${encodeURIComponent(name)}`, { connected })
  },
}

export const materialsApi = {
  async list() {
    return materialListSchema.parse((await api.get('/materials')).data).data
  },
}

export const statsApi = {
  /** 近 N 天阅读/点赞趋势(后端按日聚合) */
  async trend(days = 30) {
    return trendSchema.parse(
      (await api.get('/stats/trend', { params: { days } })).data
    ).data
  },
}

export const commentsApi = {
  async list(status?: 'pending' | 'approved' | 'rejected') {
    return commentListSchema.parse(
      (await api.get('/comments', { params: status ? { status } : {} })).data
    ).data
  },
  async setStatus(id: string, status: 'approved' | 'rejected') {
    await api.patch(`/comments/${id}`, { status })
  },
  async remove(id: string) {
    await api.delete(`/comments/${id}`)
  },
}
