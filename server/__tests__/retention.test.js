import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'cs-retention-'))
process.env.SEED_DEMO_DATA = 'true'

const { db } = await import('../db/index.js')
const { pruneOldLogs, resolveRetention } =
  await import('../services/retention.js')

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-27T00:00:00.000Z')
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY_MS).toISOString()

const insertAudit = db.prepare(`
  INSERT INTO audit_logs (actor_id, actor_email, actor_role, action,
    entity_type, entity_id, detail, created_at)
  VALUES ('1', 'ops@test.dev', 'admin', 'article.delete', 'article', 'ART-1',
    NULL, ?)
`)
const insertLog = db.prepare(`
  INSERT INTO distribution_logs (article_id, article_title, channel_name,
    target_url, status, response_code, message, created_at)
  VALUES ('ART-1', '标题', '个人网站', 'simulated://channel-worker',
    'simulated', 200, 'ok', ?)
`)

afterAll(() => {
  db.close()
})

describe('日志留存策略', () => {
  it('默认保留审计 180 天、分发 90 天', () => {
    expect(resolveRetention({})).toEqual({
      auditDays: 180,
      distributionDays: 90,
    })
  })

  it('环境变量可覆盖,0 表示永久保留', () => {
    expect(
      resolveRetention({
        AUDIT_LOG_RETENTION_DAYS: '30',
        DISTRIBUTION_LOG_RETENTION_DAYS: '0',
      })
    ).toEqual({ auditDays: 30, distributionDays: 0 })
  })

  it('空值与非法值回退默认值', () => {
    for (const value of ['', '  ', 'abc', '-1', '1.5']) {
      expect(
        resolveRetention({
          AUDIT_LOG_RETENTION_DAYS: value,
          DISTRIBUTION_LOG_RETENTION_DAYS: value,
        })
      ).toEqual({ auditDays: 180, distributionDays: 90 })
    }
  })

  it('只删除超过留存期的记录', () => {
    insertAudit.run(daysAgo(181))
    insertAudit.run(daysAgo(179))
    insertLog.run(daysAgo(91))
    insertLog.run(daysAgo(89))

    const deleted = pruneOldLogs({
      env: {
        AUDIT_LOG_RETENTION_DAYS: '180',
        DISTRIBUTION_LOG_RETENTION_DAYS: '90',
      },
      now: NOW,
    })

    expect(deleted).toEqual({ audit: 1, distribution: 1 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get().c).toBe(1)
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM distribution_logs').get().c
    ).toBe(1)
    expect(
      db.prepare('SELECT created_at FROM audit_logs').get().created_at
    ).toBe(daysAgo(179))
    expect(
      db.prepare('SELECT created_at FROM distribution_logs').get().created_at
    ).toBe(daysAgo(89))
  })

  it('留存天数为 0 时不做任何删除', () => {
    insertAudit.run(daysAgo(3650))
    insertLog.run(daysAgo(3650))

    const deleted = pruneOldLogs({
      env: {
        AUDIT_LOG_RETENTION_DAYS: '0',
        DISTRIBUTION_LOG_RETENTION_DAYS: '0',
      },
      now: NOW,
    })

    expect(deleted).toEqual({ audit: 0, distribution: 0 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get().c).toBe(2)
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM distribution_logs').get().c
    ).toBe(2)
  })
})
