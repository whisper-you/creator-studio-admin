import { z } from 'zod'
import axios, { type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { articleSchema, type Article } from '@/features/articles/data/schema'

/**
 * 后端 API 客户端。
 * - 开发环境走 vite 代理(/api → http://localhost:5180)
 * - 生产环境同源部署(Express 托管 dist)时天然同源
 * - 自动携带 JWT;未启动后端时由调用方降级为「离线演示模式」
 */
const api = axios.create({ baseURL: '/api', withCredentials: true })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().auth.accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 这些接口的 401 属于预期业务结果,不能触发静默续期
const AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
]

/** 会话彻底失效:清理本地状态并回到登录页(重复调用只生效一次) */
function handleSessionExpired() {
  const { auth } = useAuthStore.getState()
  if (!auth.accessToken && !auth.user) return
  auth.reset()
  toast.error('登录状态已失效,请重新登录')
  if (
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/sign-in') &&
    !window.location.pathname.startsWith('/sign-up')
  ) {
    const redirect = encodeURIComponent(
      window.location.pathname + window.location.search
    )
    window.location.href = `/sign-in?redirect=${redirect}`
  }
}

// 并发请求同时 401 时只发起一次刷新
let refreshPromise: Promise<LoginResult> | null = null

function refreshSession(): Promise<LoginResult> {
  refreshPromise ??= axios
    .post('/api/auth/refresh', {}, { withCredentials: true })
    .then((res) => {
      const session = loginSchema.parse(res.data)
      const { auth } = useAuthStore.getState()
      auth.setAccessToken(session.accessToken)
      auth.setUser(session.user)
      return session
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error)
    }
    const config = error.config as RetryableConfig | undefined
    const url = config?.url ?? ''
    if (!config || AUTH_PATHS.some((path) => url.includes(path))) {
      return Promise.reject(error)
    }

    // 续期后仍然 401:说明会话已被服务端吊销
    if (config._retried) {
      handleSessionExpired()
      return Promise.reject(error)
    }
    config._retried = true

    try {
      const session = await refreshSession()
      config.headers.Authorization = `Bearer ${session.accessToken}`
      return api.request(config)
    } catch {
      handleSessionExpired()
      return Promise.reject(error)
    }
  }
)

const articleListSchema = z.object({
  data: z.array(articleSchema),
  total: z.number(),
})

const roleSchema = z.enum(['admin', 'editor', 'author']).default('admin')

const loginSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.email(),
    name: z.string(),
    role: roleSchema,
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
  async updateRole(role: 'admin' | 'editor' | 'author') {
    return meSchema.parse((await api.patch('/auth/me', { role })).data)
  },
  /** 改密成功后旧 token 全部失效,服务端返回当前会话的新 token */
  async changePassword(currentPassword: string, newPassword: string) {
    return loginSchema.parse(
      (
        await api.post('/auth/change-password', {
          currentPassword,
          newPassword,
        })
      ).data
    )
  },
  /** 吊销服务端 refresh token 并清除 Cookie */
  async logout() {
    await api.post('/auth/logout')
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
  async createBulk(articles: Article[]): Promise<void> {
    await api.post('/articles/bulk', {
      articles: articles.map((a) => ({
        ...a,
        scheduledAt: a.scheduledAt?.toISOString() ?? null,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    })
  },
  /**
   * 部分更新。patch 里显式传 null 表示清空日期字段;
   * undefined 的字段不会出现在 JSON 里,服务端会跳过它们。
   * 传 version 时启用乐观锁:版本不一致会返回 409。
   */
  async update(
    id: string,
    patch: Record<string, unknown>,
    version?: number
  ): Promise<void> {
    await api.patch(
      `/articles/${id}`,
      version === undefined ? patch : { ...patch, version }
    )
  },
  async updateBulk(
    ids: string[],
    patch: Record<string, unknown>,
    versions?: Record<string, number>
  ): Promise<void> {
    await api.patch(
      '/articles/bulk',
      versions ? { ids, patch, versions } : { ids, patch }
    )
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
      webhookUrl: z.string().nullable().optional(),
      autoPush: z.boolean().default(false),
    })
  ),
})

const materialListSchema = z.object({
  data: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      type: z.string(),
      scene: z.string(),
      usage: z.number(),
      status: z.enum(['active', 'updating', 'deprecated']),
      url: z.string().nullable().optional(),
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
  role: roleSchema,
})

const auditLogSchema = z.object({
  id: z.number(),
  actorId: z.string().nullable().optional(),
  actorEmail: z.string().nullable().optional(),
  actorRole: z.string().nullable().optional(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable().optional(),
  detail: z.unknown().nullable().optional(),
  createdAt: z.string(),
})

const auditLogListSchema = z.object({
  data: z.array(auditLogSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export type AuditLogItem = z.infer<typeof auditLogSchema>

export const auditApi = {
  async list(
    params: {
      page?: number
      pageSize?: number
      action?: string
      entityType?: string
      actor?: string
    } = {}
  ) {
    return auditLogListSchema.parse(
      (await api.get('/audit-logs', { params })).data
    )
  },
}

const userListItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  createdAt: z.string(),
  activeSessions: z.number(),
})

const userListSchema = z.object({
  data: z.array(userListItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export type UserListItem = z.infer<typeof userListItemSchema>

export const usersApi = {
  async list(params: { page?: number; pageSize?: number; q?: string } = {}) {
    return userListSchema.parse((await api.get('/users', { params })).data)
  },
  /** 角色变更立即生效,无需目标用户重新登录 */
  async setRole(id: string, role: UserRole) {
    return (
      await api.patch<{ ok: boolean; role: UserRole }>(`/users/${id}/role`, {
        role,
      })
    ).data
  },
  /** 重置后目标用户全部会话立即失效 */
  async resetPassword(id: string, newPassword: string) {
    return (
      await api.post<{ ok: boolean; revokedSessions: number }>(
        `/users/${id}/reset-password`,
        { newPassword }
      )
    ).data
  },
  async forceLogout(id: string) {
    return (
      await api.post<{ ok: boolean; revokedSessions: number }>(
        `/users/${id}/force-logout`
      )
    ).data
  },
}

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

const distributionLogSchema = z.object({
  data: z.array(
    z.object({
      id: z.number(),
      articleId: z.string(),
      articleTitle: z.string(),
      channelName: z.string(),
      targetUrl: z.string().nullable().optional(),
      status: z.string(),
      responseCode: z.number(),
      message: z.string().nullable().optional(),
      createdAt: z.string(),
    })
  ),
})

export type DistributionLogItem = z.infer<
  typeof distributionLogSchema
>['data'][number]

export const channelsApi = {
  async list() {
    return channelListSchema.parse((await api.get('/channels')).data).data
  },
  /** 绑定/解绑(渠道名含中文,需 URL 编码) */
  async setConnected(name: string, connected: boolean) {
    await api.patch(`/channels/${encodeURIComponent(name)}`, { connected })
  },
  async update(
    name: string,
    patch: {
      connected?: boolean
      account?: string | null
      webhookUrl?: string | null
      autoPush?: boolean
    }
  ) {
    return (await api.patch(`/channels/${encodeURIComponent(name)}`, patch))
      .data
  },
  async testWebhook(name: string, webhookUrl?: string) {
    const res = await api.post<{
      ok: boolean
      status: string
      message: string
      statusCode?: number
    }>(`/channels/${encodeURIComponent(name)}/test-webhook`, { webhookUrl })
    return res.data
  },
}

export const distributionApi = {
  async listLogs(articleId?: string): Promise<DistributionLogItem[]> {
    const res = await api.get('/distribution/logs', {
      params: articleId ? { articleId } : {},
    })
    return distributionLogSchema.parse(res.data).data
  },
  async dispatch(
    articleId: string,
    channels?: string[]
  ): Promise<{
    ok: boolean
    results: Array<{ channel: string; status: string; message: string }>
  }> {
    const res = await api.post('/distribution/dispatch', {
      articleId,
      channels,
    })
    return res.data
  },
}

export const materialsApi = {
  async list() {
    return materialListSchema.parse((await api.get('/materials')).data).data
  },
  async upload(payload: {
    dataUrl: string
    filename?: string
    name?: string
    scene?: string
  }): Promise<{ url: string; filename: string }> {
    const res = await api.post<{ url: string; filename: string }>(
      '/materials/upload',
      payload
    )
    return res.data
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
