import {
  BookHeart,
  Gem,
  Globe,
  Lightbulb,
  Mail,
  MessagesSquare,
  Tv,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export type Channel = {
  name: string
  icon: LucideIcon
  color: string
  connected: boolean
  account?: string
  webhookUrl?: string
  autoPush?: boolean
  desc: string
}

export const channels: Channel[] = [
  {
    name: '个人网站',
    icon: Globe,
    color: 'text-emerald-600',
    connected: true,
    account: 'blog.example.com',
    desc: '自建博客与作品集,内容资产的主阵地。',
  },
  {
    name: '微信公众号',
    icon: MessagesSquare,
    color: 'text-green-600',
    connected: true,
    account: 'CreatorStudio',
    desc: '深度长文首发平台,支持粉丝留言互动。',
  },
  {
    name: '知乎',
    icon: Lightbulb,
    color: 'text-blue-600',
    connected: true,
    account: '@creator-studio',
    desc: '技术问答与专栏,长尾搜索流量稳定。',
  },
  {
    name: '小红书',
    icon: BookHeart,
    color: 'text-rose-500',
    connected: false,
    desc: '图文笔记种草,适合教程与工具分享。',
  },
  {
    name: '掘金',
    icon: Gem,
    color: 'text-sky-600',
    connected: false,
    desc: '中文开发者社区,技术文章沉淀好去处。',
  },
  {
    name: 'B 站',
    icon: Tv,
    color: 'text-pink-500',
    connected: false,
    desc: '视频与图文动态,年轻用户聚集地。',
  },
  {
    name: '即刻',
    icon: Zap,
    color: 'text-amber-500',
    connected: false,
    desc: '独立开发者圈子,短内容快速分发。',
  },
  {
    name: '邮件订阅',
    icon: Mail,
    color: 'text-violet-600',
    connected: false,
    desc: '私有订阅列表,不依赖平台算法。',
  },
]
