import {
  Construction,
  LayoutDashboard,
  Monitor,
  Bug,
  FileText,
  FileX,
  HelpCircle,
  Lock,
  Bell,
  Share2,
  Palette,
  ServerOff,
  Settings,
  Wrench,
  UserCog,
  UserX,
  CalendarDays,
  FolderOpen,
  ShieldCheck,
} from 'lucide-react'
import { Logo } from '@/assets/logo'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: '创作者',
    email: 'creator@studio.dev',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Creator Studio',
      logo: Logo,
      plan: '内容创作管理平台',
    },
  ],
  navGroups: [
    {
      title: '创作',
      items: [
        {
          title: '数据总览',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: '文章管理',
          url: '/articles',
          icon: FileText,
        },
        {
          title: '排期日历',
          url: '/schedule',
          icon: CalendarDays,
        },
        {
          title: '发布渠道',
          url: '/channels',
          icon: Share2,
        },
        {
          title: '素材库',
          url: '/materials',
          icon: FolderOpen,
        },
      ],
    },
    {
      title: '页面',
      items: [
        {
          title: '认证',
          icon: ShieldCheck,
          items: [
            {
              title: '登录',
              url: '/sign-in',
            },
            {
              title: '注册',
              url: '/sign-up',
            },
            {
              title: '忘记密码',
              url: '/forgot-password',
            },
          ],
        },
        {
          title: '错误页',
          icon: Bug,
          items: [
            {
              title: '未授权',
              url: '/errors/unauthorized',
              icon: Lock,
            },
            {
              title: '禁止访问',
              url: '/errors/forbidden',
              icon: UserX,
            },
            {
              title: '页面不存在',
              url: '/errors/not-found',
              icon: FileX,
            },
            {
              title: '服务器错误',
              url: '/errors/internal-server-error',
              icon: ServerOff,
            },
            {
              title: '维护中',
              url: '/errors/maintenance-error',
              icon: Construction,
            },
          ],
        },
      ],
    },
    {
      title: '其他',
      items: [
        {
          title: '设置',
          icon: Settings,
          items: [
            {
              title: '个人资料',
              url: '/settings',
              icon: UserCog,
            },
            {
              title: '账号',
              url: '/settings/account',
              icon: Wrench,
            },
            {
              title: '外观',
              url: '/settings/appearance',
              icon: Palette,
            },
            {
              title: '通知',
              url: '/settings/notifications',
              icon: Bell,
            },
            {
              title: '显示',
              url: '/settings/display',
              icon: Monitor,
            },
          ],
        },
        {
          title: '帮助中心',
          url: '/help-center',
          icon: HelpCircle,
        },
      ],
    },
  ],
}
