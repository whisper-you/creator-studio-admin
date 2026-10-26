import { z } from 'zod'

// ============ 枚举常量(同时供 zod schema 与路由 search 校验复用) ============

export const ARTICLE_STATUSES = [
  'draft',
  'in_review',
  'scheduled',
  'published',
  'archived',
] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export const ARTICLE_CATEGORIES = ['tech', 'tutorial', 'essay', 'news'] as const
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number]

export const ARTICLE_PLATFORMS = [
  'website',
  'wechat',
  'zhihu',
  'xiaohongshu',
  'juejin',
  'bilibili',
] as const
export type ArticlePlatform = (typeof ARTICLE_PLATFORMS)[number]

// ============ Schema ============

const optionalDate = z.preprocess(
  (v) => (v === null || v === '' ? undefined : v),
  z.coerce.date().optional()
)

export const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
  content: z.string(),
  status: z.enum(ARTICLE_STATUSES),
  category: z.enum(ARTICLE_CATEGORIES),
  tags: z.array(z.string()),
  platforms: z.array(z.enum(ARTICLE_PLATFORMS)),
  views: z.number(),
  likes: z.number(),
  scheduledAt: optionalDate,
  publishedAt: optionalDate,
  // 服务端乐观锁版本号;离线演示数据没有该字段
  version: z.number().int().positive().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type Article = z.infer<typeof articleSchema>

// ============ 状态机 ============
// 五态流转:草稿 → 审核中 → 已排期 → 已发布 → 已归档
// 每个状态只允许流转到 statusFlow 中列出的目标状态,
// 行操作菜单、编辑抽屉的可选状态都由此约束。

export const statusFlow: Record<ArticleStatus, ArticleStatus[]> = {
  draft: ['in_review'],
  in_review: ['draft', 'scheduled'],
  scheduled: ['draft', 'published'],
  published: ['archived'],
  archived: ['draft'],
}

// ============ ID 生成(自增序号,展示友好) ============

export function nextArticleId(articles: { id: string }[]): string {
  const max = articles.reduce((acc, a) => {
    const n = Number.parseInt(a.id.replace('ART-', ''), 10)
    return Number.isNaN(n) ? acc : Math.max(acc, n)
  }, 0)
  return `ART-${String(max + 1).padStart(3, '0')}`
}

export function generateArticleIds(
  articles: { id: string }[],
  count: number
): string[] {
  const max = articles.reduce((acc, a) => {
    const n = Number.parseInt(a.id.replace('ART-', ''), 10)
    return Number.isNaN(n) ? acc : Math.max(acc, n)
  }, 0)
  return Array.from(
    { length: count },
    (_, i) => `ART-${String(max + 1 + i).padStart(3, '0')}`
  )
}
