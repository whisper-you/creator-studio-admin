import { db } from '../db/index.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 解析留存天数:空值或非法值回退默认值,0 表示永久保留。
 */
function parseDays(value, fallback) {
  if (value == null || String(value).trim() === '') return fallback
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

/** 日志留存策略:审计 180 天、分发 90 天,可用环境变量覆盖 */
export function resolveRetention(env = process.env) {
  return {
    auditDays: parseDays(env.AUDIT_LOG_RETENTION_DAYS, 180),
    distributionDays: parseDays(env.DISTRIBUTION_LOG_RETENTION_DAYS, 90),
  }
}

/**
 * 删除超过留存期的审计与分发日志。
 * @returns {{ audit: number, distribution: number }} 各表删除行数
 */
export function pruneOldLogs({ env = process.env, now = new Date() } = {}) {
  const { auditDays, distributionDays } = resolveRetention(env)
  const deleted = { audit: 0, distribution: 0 }

  if (auditDays > 0) {
    const cutoff = new Date(now.getTime() - auditDays * DAY_MS).toISOString()
    deleted.audit = Number(
      db.prepare('DELETE FROM audit_logs WHERE created_at < ?').run(cutoff)
        .changes
    )
  }

  if (distributionDays > 0) {
    const cutoff = new Date(
      now.getTime() - distributionDays * DAY_MS
    ).toISOString()
    deleted.distribution = Number(
      db
        .prepare('DELETE FROM distribution_logs WHERE created_at < ?')
        .run(cutoff).changes
    )
  }

  return deleted
}
