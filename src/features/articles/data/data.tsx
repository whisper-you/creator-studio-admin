import {
  Archive,
  BookHeart,
  CalendarClock,
  CheckCircle2,
  FilePenLine,
  Gem,
  Globe,
  GraduationCap,
  Lightbulb,
  MessageCircle,
  Newspaper,
  PenLine,
  SearchCheck,
  Tv,
  Code2,
  type LucideIcon,
} from 'lucide-react'
import {
  type ArticleCategory,
  type ArticlePlatform,
  type ArticleStatus,
} from './schema'

// ============ 状态展示元数据 ============

export const statuses: {
  label: string
  value: ArticleStatus
  icon: LucideIcon
}[] = [
  { label: '草稿', value: 'draft', icon: FilePenLine },
  { label: '审核中', value: 'in_review', icon: SearchCheck },
  { label: '已排期', value: 'scheduled', icon: CalendarClock },
  { label: '已发布', value: 'published', icon: CheckCircle2 },
  { label: '已归档', value: 'archived', icon: Archive },
]

export const statusMeta = (status: ArticleStatus) =>
  statuses.find((s) => s.value === status)

// 状态语义色:让流水线状态一眼可辨(草稿灰 / 审核琥珀 / 排期蓝 / 发布绿 / 归档灰)
export const statusToneClass: Record<ArticleStatus, string> = {
  draft: 'text-zinc-600 dark:text-zinc-400',
  in_review: 'text-amber-600 dark:text-amber-400',
  scheduled: 'text-blue-600 dark:text-blue-400',
  published: 'text-emerald-600 dark:text-emerald-400',
  archived: 'text-zinc-400 dark:text-zinc-600',
}

// ============ 分类展示元数据 ============

export const categories: {
  label: string
  value: ArticleCategory
  icon: LucideIcon
}[] = [
  { label: '技术', value: 'tech', icon: Code2 },
  { label: '教程', value: 'tutorial', icon: GraduationCap },
  { label: '随笔', value: 'essay', icon: PenLine },
  { label: '资讯', value: 'news', icon: Newspaper },
]

export const categoryMeta = (category: ArticleCategory) =>
  categories.find((c) => c.value === category)

// ============ 发布渠道元数据(与 features/channels 保持同一套枚举语义) ============

export const platforms: {
  label: string
  value: ArticlePlatform
  icon: LucideIcon
  color: string
}[] = [
  {
    label: '个人网站',
    value: 'website',
    icon: Globe,
    color: 'text-emerald-600',
  },
  {
    label: '微信公众号',
    value: 'wechat',
    icon: MessageCircle,
    color: 'text-green-600',
  },
  { label: '知乎', value: 'zhihu', icon: Lightbulb, color: 'text-blue-600' },
  {
    label: '小红书',
    value: 'xiaohongshu',
    icon: BookHeart,
    color: 'text-rose-500',
  },
  { label: '掘金', value: 'juejin', icon: Gem, color: 'text-sky-600' },
  { label: 'B 站', value: 'bilibili', icon: Tv, color: 'text-pink-500' },
]

export const platformMeta = (platform: ArticlePlatform) =>
  platforms.find((p) => p.value === platform)
