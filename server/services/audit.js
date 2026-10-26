import { db } from '../db/index.js'

const ACTIONS = [
  'auth.change_password',
  'auth.refresh_reuse',
  'auth.session_revoke',
  'auth.session_revoke_others',
  'user.role_change',
  'user.disable',
  'user.enable',
  'user.reset_password',
  'user.force_logout',
  'article.status_change',
  'article.bulk_status_change',
  'article.delete',
  'article.bulk_delete',
  'channel.update',
  'distribution.dispatch',
]

export { ACTIONS }

const parseDetail = (raw) => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * 写入敏感操作审计日志。
 * 审计失败只记录告警,不影响主流程(日志不是业务成功的前置条件)。
 */
export function recordAudit(req, { action, entityType, entityId, detail }) {
  try {
    db.prepare(
      `
      INSERT INTO audit_logs
        (actor_id, actor_email, actor_role, action, entity_type, entity_id,
         detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      req.user?.id == null ? null : String(req.user.id),
      req.user?.email ?? null,
      req.user?.role ?? null,
      action,
      entityType,
      entityId == null ? null : String(entityId),
      detail == null ? null : JSON.stringify(detail),
      new Date().toISOString()
    )
  } catch (err) {
    console.error('[audit] 写入审计日志失败:', err)
  }
}

/**
 * 分页查询审计日志,支持按动作/实体类型/操作者邮箱过滤。
 */
export function listAuditLogs({
  limit = 20,
  offset = 0,
  action,
  entityType,
  actor,
} = {}) {
  const where = []
  const params = {}

  if (action) {
    where.push('action = @action')
    params.action = action
  }
  if (entityType) {
    where.push('entity_type = @entityType')
    params.entityType = entityType
  }
  if (actor) {
    where.push('actor_email LIKE @actor')
    params.actor = `%${actor}%`
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`)
    .get(params).c

  const rows = db
    .prepare(
      `SELECT * FROM audit_logs ${whereSql}
       ORDER BY id DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset })

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      detail: parseDetail(row.detail),
      createdAt: row.created_at,
    })),
  }
}
