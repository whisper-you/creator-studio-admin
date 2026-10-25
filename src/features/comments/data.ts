import { CheckCircle2, Clock3, XCircle, type LucideIcon } from 'lucide-react'

export type CommentStatus = 'pending' | 'approved' | 'rejected'

export const commentStatuses: {
  label: string
  value: CommentStatus
  icon: LucideIcon
  tone: string
}[] = [
  {
    label: '待审核',
    value: 'pending',
    icon: Clock3,
    tone: 'text-amber-600 dark:text-amber-400',
  },
  {
    label: '已通过',
    value: 'approved',
    icon: CheckCircle2,
    tone: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    label: '已驳回',
    value: 'rejected',
    icon: XCircle,
    tone: 'text-rose-600 dark:text-rose-400',
  },
]

export const commentStatusMeta = (status: CommentStatus) =>
  commentStatuses.find((s) => s.value === status)
