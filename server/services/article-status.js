/**
 * 文章状态与流转规则。
 *
 * 与前端 src/features/articles/data/schema.ts 的 statusFlow 保持一致；
 * 前端只负责隐藏非法入口，真正的越权/非法流转由这里在服务端拦截。
 */
export const ARTICLE_STATUSES = [
  'draft',
  'in_review',
  'scheduled',
  'published',
  'archived',
]

export const STATUS_LABELS = {
  draft: '草稿',
  in_review: '审核中',
  scheduled: '已排期',
  published: '已发布',
  archived: '已归档',
}

const STATUS_FLOW = {
  draft: ['in_review'],
  in_review: ['draft', 'scheduled'],
  scheduled: ['draft', 'published'],
  published: ['archived'],
  archived: ['draft'],
}

/**
 * 是否允许 from → to:
 * - 状态未变化视为合法(编辑正文时前端会回传当前状态)
 * - 排期是横切动作:排期对话框与日历拖拽允许从任意状态进入 scheduled
 */
export function canTransition(from, to) {
  if (!ARTICLE_STATUSES.includes(from) || !ARTICLE_STATUSES.includes(to)) {
    return false
  }
  if (from === to) return true
  if (to === 'scheduled') return true
  return STATUS_FLOW[from].includes(to)
}

export const statusLabel = (status) => STATUS_LABELS[status] ?? status
