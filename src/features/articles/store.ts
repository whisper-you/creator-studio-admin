import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'
import { toast } from 'sonner'
import { articles as seedArticles } from './data/articles'
import {
  articleSchema,
  statusFlow,
  type Article,
  type ArticleStatus,
} from './data/schema'
import { articlesApi } from '@/lib/api'

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
  resetArticles: () => void
}

const dateToIso = (d: Date | undefined) => d?.toISOString() ?? null

export const useArticlesStore = create<ArticlesState>()(
  persist(
    (set, get) => {
      /** 乐观更新骨架:先本地生效,服务端失败时回滚 */
      const optimistic = (mutate: () => Article[], sync: () => Promise<void>) => {
        const prev = get().articles
        set({ articles: mutate() })
        if (get().mode !== 'server') return
        sync().catch(() => {
          set({ articles: prev })
          toast.error('数据同步失败,已回滚(请确认后端 pnpm server 是否启动)')
        })
      }

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

        updateArticles: (ids, patch) =>
          optimistic(
            () => {
              const idSet = new Set(ids)
              return get().articles.map((a) =>
                idSet.has(a.id) ? { ...a, ...patch } : a
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
              if (ids.length === 1) await articlesApi.update(ids[0]!, wire)
              else await articlesApi.updateBulk(ids, wire)
            }
          ),

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
                  to === 'published' ? (a.publishedAt ?? new Date()) : a.publishedAt,
                scheduledAt:
                  a.status === 'scheduled' && to !== 'scheduled'
                    ? undefined
                    : a.scheduledAt,
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
              return articlesApi.update(a.id, wire)
            })
          ).catch(() => {
            set({ articles: prev })
            toast.error('状态流转同步失败,已回滚')
          })
        },

        scheduleArticle: (id, date) =>
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
                      updatedAt: new Date(),
                    }
                  : a
              ),
            async () => {
              const wasPublished =
                get().articles.find((a) => a.id === id)?.status === 'published'
              await articlesApi.update(id, {
                status: 'scheduled',
                scheduledAt: date.toISOString(),
                ...(wasPublished ? {} : { publishedAt: null }),
                updatedAt: new Date().toISOString(),
              })
            }
          ),

        unscheduleArticle: (id) =>
          optimistic(
            () =>
              get().articles.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      status: 'draft',
                      scheduledAt: undefined,
                      updatedAt: new Date(),
                    }
                  : a
              ),
            () =>
              articlesApi.update(id, {
                status: 'draft',
                scheduledAt: null,
                updatedAt: new Date().toISOString(),
              })
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
