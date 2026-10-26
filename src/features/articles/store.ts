import { z } from 'zod'
import { toast } from 'sonner'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { articlesApi } from '@/lib/api'
import { articles as seedArticles } from './data/articles'
import {
  articleSchema,
  statusFlow,
  type Article,
  type ArticleStatus,
} from './data/schema'

/**
 * 文章全局数据仓库。
 *
 * 同步策略(M2 起为「服务端优先 + 离线降级」):
 * - hydrate():进入应用时尝试从后端拉全量,成功则进入 server 模式
 * - 写操作全部「乐观更新」:先改本地,再异步同步后端;失败则回滚并提示
 * - 后端未启动时自动退回 local 模式,行为与 M1 版本一致(内存 + localStorage)
 */
type SyncMode = 'local' | 'server'

type ArticlesState = {
  articles: Article[]
  mode: SyncMode
  hydrate: () => Promise<void>
  addArticle: (article: Article) => void
  addArticles: (articles: Article[]) => void
  updateArticles: (
    ids: Article['id'][],
    patch: Partial<Omit<Article, 'id'>>
  ) => void
  deleteArticles: (ids: Article['id'][]) => void
  /** 按状态机流转,并自动维护 publishedAt / scheduledAt 的副作用 */
  transitionStatus: (ids: Article['id'][], to: ArticleStatus) => void
  /** 日历拖拽/排期对话框共用:设置排期时间并流转到 scheduled */
  scheduleArticle: (id: Article['id'], date: Date) => void
  /** 取消排期:退回草稿 */
  unscheduleArticle: (id: Article['id']) => void
  /** 阅读上报:本地 views +1,服务端专用接口落库 */
  recordView: (id: Article['id']) => void
  resetArticles: () => void
}

const dateToIso = (d: Date | undefined) => d?.toISOString() ?? null

/** 乐观锁版本号:本地先 +1,服务端成功后以其返回值为准(下次 hydrate 刷新) */
const bumpVersion = (a: Article): number => (a.version ?? 1) + 1

const isConflictError = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { response?: { status?: number } }).response?.status === 409

export const useArticlesStore = create<ArticlesState>()(
  persist(
    (set, get) => {
      /** 同步失败:回滚本地;409 冲突时额外拉取服务端最新数据 */
      const handleSyncError = (
        prev: Article[],
        err: unknown,
        fallback = '数据同步失败,已回滚(请确认后端 pnpm run server 是否启动)'
      ) => {
        set({ articles: prev })
        if (isConflictError(err)) {
          toast.error('文章已被他人修改,已刷新为最新数据')
          void get().hydrate()
          return
        }
        toast.error(fallback)
      }

      /** 乐观更新骨架:先本地生效,服务端失败时回滚 */
      const optimistic = (
        mutate: () => Article[],
        sync: () => Promise<void>
      ) => {
        const prev = get().articles
        set({ articles: mutate() })
        if (get().mode !== 'server') return
        // Promise.resolve 包一层:sync 同步抛错(或返回 undefined)也能被捕获回滚
        Promise.resolve()
          .then(sync)
          .catch((err) => handleSyncError(prev, err))
      }

      /** 读当前本地版本号,供写请求带上乐观锁 */
      const versionsOf = (ids: Article['id'][]) =>
        Object.fromEntries(
          ids.map((id) => [
            id,
            get().articles.find((a) => a.id === id)?.version,
          ])
        ) as Record<string, number | undefined>

      return {
        articles: seedArticles,
        mode: 'local',

        hydrate: async () => {
          try {
            const articles = await articlesApi.listAll()
            set({ articles, mode: 'server' })
          } catch {
            // 后端不可用:保持 local 模式,不打断体验
          }
        },

        addArticle: (article) =>
          optimistic(
            () => [article, ...get().articles],
            () => articlesApi.create(article)
          ),

        addArticles: (newArticles) =>
          optimistic(
            () => [...newArticles, ...get().articles],
            () => articlesApi.createBulk(newArticles)
          ),

        updateArticles: (ids, patch) => {
          const versions = versionsOf(ids)
          optimistic(
            () => {
              const idSet = new Set(ids)
              return get().articles.map((a) =>
                idSet.has(a.id)
                  ? { ...a, ...patch, version: bumpVersion(a) }
                  : a
              )
            },
            async () => {
              // 表单是全量提交:undefined 的日期字段按「清空」语义传 null
              const wire = {
                title: patch.title,
                excerpt: patch.excerpt,
                content: patch.content,
                status: patch.status,
                category: patch.category,
                tags: patch.tags,
                platforms: patch.platforms,
                views: patch.views,
                likes: patch.likes,
                scheduledAt:
                  patch.scheduledAt === undefined
                    ? null
                    : dateToIso(patch.scheduledAt),
                publishedAt:
                  patch.publishedAt === undefined
                    ? null
                    : dateToIso(patch.publishedAt),
                updatedAt: new Date().toISOString(),
              }
              if (ids.length === 1) {
                await articlesApi.update(ids[0]!, wire, versions[ids[0]!])
                return
              }
              // 批量接口要求 versions 覆盖全部 ID,离线数据缺版本号时退回无锁更新
              const complete = ids.every((id) => versions[id] !== undefined)
                ? (versions as Record<string, number>)
                : undefined
              await articlesApi.updateBulk(ids, wire, complete)
            }
          )
        },

        deleteArticles: (ids) =>
          optimistic(
            () => {
              const idSet = new Set(ids)
              return get().articles.filter((a) => !idSet.has(a.id))
            },
            () => articlesApi.delete(ids)
          ),

        transitionStatus: (ids, to) => {
          const idSet = new Set(ids)
          // 先在本地按状态机应用副作用,再逐条同步(各文章的 publishedAt 不同)
          const versions = versionsOf(ids)
          const prev = get().articles
          const changed: Article[] = []
          set({
            articles: prev.map((a) => {
              if (!idSet.has(a.id)) return a
              if (!statusFlow[a.status].includes(to)) return a
              const next: Article = {
                ...a,
                status: to,
                publishedAt:
                  to === 'published'
                    ? (a.publishedAt ?? new Date())
                    : a.publishedAt,
                scheduledAt:
                  a.status === 'scheduled' && to !== 'scheduled'
                    ? undefined
                    : a.scheduledAt,
                version: bumpVersion(a),
                updatedAt: new Date(),
              }
              changed.push(next)
              return next
            }),
          })
          if (get().mode !== 'server' || changed.length === 0) return
          Promise.all(
            changed.map((a) => {
              const wire: Record<string, unknown> = {
                status: a.status,
                updatedAt: a.updatedAt.toISOString(),
              }
              // 从 scheduled 离开时清空排期;发布时写入发布时间
              if (a.status !== 'scheduled' && to !== 'scheduled')
                wire.scheduledAt = null
              if (to === 'published' && a.publishedAt)
                wire.publishedAt = a.publishedAt.toISOString()
              return articlesApi.update(a.id, wire, versions[a.id])
            })
          ).catch((err) =>
            handleSyncError(prev, err, '状态流转同步失败,已回滚')
          )
        },

        scheduleArticle: (id, date) => {
          const target = get().articles.find((a) => a.id === id)
          const version = target?.version
          const wasPublished = target?.status === 'published'
          optimistic(
            () =>
              get().articles.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      status: 'scheduled',
                      scheduledAt: date,
                      publishedAt:
                        a.status === 'published' ? a.publishedAt : undefined,
                      version: bumpVersion(a),
                      updatedAt: new Date(),
                    }
                  : a
              ),
            () =>
              articlesApi.update(
                id,
                {
                  status: 'scheduled',
                  scheduledAt: date.toISOString(),
                  ...(wasPublished ? {} : { publishedAt: null }),
                  updatedAt: new Date().toISOString(),
                },
                version
              )
          )
        },

        unscheduleArticle: (id) => {
          const version = get().articles.find((a) => a.id === id)?.version
          optimistic(
            () =>
              get().articles.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      status: 'draft',
                      scheduledAt: undefined,
                      version: bumpVersion(a),
                      updatedAt: new Date(),
                    }
                  : a
              ),
            () =>
              articlesApi.update(
                id,
                {
                  status: 'draft',
                  scheduledAt: null,
                  updatedAt: new Date().toISOString(),
                },
                version
              )
          )
        },

        recordView: (id) =>
          optimistic(
            () =>
              get().articles.map((a) =>
                a.id === id ? { ...a, views: a.views + 1 } : a
              ),
            () => articlesApi.recordView(id).then(() => undefined)
          ),

        resetArticles: () => set({ articles: seedArticles }),
      }
    },
    {
      name: 'creator-studio-articles',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // localStorage 里日期被序列化成 ISO 字符串,重新 hydrate 时用
      // zod schema 解析,把字符串再变回 Date,并顺带做一次数据校验
      merge: (persisted, current) => {
        const parsed = z
          .array(articleSchema)
          .safeParse((persisted as { articles?: unknown })?.articles)
        return {
          ...current,
          articles: parsed.success ? parsed.data : current.articles,
        }
      },
    }
  )
)
