import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'
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
 * 为什么用 zustand + persist 而不是 Tasks 那样的页面级 Context:
 * 文章是「文章管理」「排期日历」「数据总览」三个页面的共享数据源,
 * 需要跨路由保持一致并刷新不丢;Context 方案只适合单页面内的状态。
 */
type ArticlesState = {
  articles: Article[]
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

export const useArticlesStore = create<ArticlesState>()(
  persist(
    (set) => ({
      articles: seedArticles,

      addArticle: (article) =>
        set((state) => ({ articles: [article, ...state.articles] })),

      updateArticles: (ids, patch) => {
        const idSet = new Set(ids)
        set((state) => ({
          articles: state.articles.map((a) =>
            idSet.has(a.id) ? { ...a, ...patch } : a
          ),
        }))
      },

      deleteArticles: (ids) => {
        const idSet = new Set(ids)
        set((state) => ({
          articles: state.articles.filter((a) => !idSet.has(a.id)),
        }))
      },

      transitionStatus: (ids, to) => {
        const idSet = new Set(ids)
        set((state) => ({
          articles: state.articles.map((a) => {
            if (!idSet.has(a.id)) return a
            if (!statusFlow[a.status].includes(to)) return a
            return {
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
          }),
        }))
      },

      scheduleArticle: (id, date) =>
        set((state) => ({
          articles: state.articles.map((a) =>
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
        })),

      unscheduleArticle: (id) =>
        set((state) => ({
          articles: state.articles.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: 'draft',
                  scheduledAt: undefined,
                  updatedAt: new Date(),
                }
              : a
          ),
        })),

      resetArticles: () => set({ articles: seedArticles }),
    }),
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
