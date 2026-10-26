import { db, withTransaction, articleRowToJson } from '../db/index.js'
import { dispatchArticle } from './distribution.js'

let timer = null

/**
 * 扫描到达排期时间的文章，自动将其状态流转为 published (已发布)。
 * @returns {Array<{ id: string, title: string }>} 自动发布的文章列表
 */
export function checkAndPublishScheduledArticles() {
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    SELECT id, title, scheduled_at FROM articles
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= ?
  `)
  const dueArticles = stmt.all(now)
  if (dueArticles.length === 0) return []

  const updateStmt = db.prepare(`
    UPDATE articles
    SET status = 'published',
        published_at = ?,
        scheduled_at = NULL,
        updated_at = ?,
        version = version + 1
    WHERE id = ?
  `)

  const run = withTransaction((items) => {
    for (const item of items) {
      updateStmt.run(now, now, item.id)
    }
  })
  run(dueArticles)

  console.log(
    `[scheduler] 自动发布了 ${dueArticles.length} 篇到达排期的文章: ${dueArticles.map((a) => a.id).join(', ')}`
  )

  // 触发自动发布后的渠道分发 (Webhook / 模拟推送)
  for (const item of dueArticles) {
    try {
      const fullRow = db
        .prepare('SELECT * FROM articles WHERE id = ?')
        .get(item.id)
      if (fullRow) {
        dispatchArticle(articleRowToJson(fullRow), null, {
          autoPushOnly: true,
        }).catch((err) =>
          console.error(`[scheduler] 文章 ${item.id} 分发失败:`, err)
        )
      }
    } catch (err) {
      console.error(`[scheduler] 准备分发文章 ${item.id} 异常:`, err)
    }
  }

  return dueArticles
}

/**
 * 启动后台轮询定时调度器
 * @param {number} intervalMs 轮询间隔(默认 30 秒)
 */
export function startScheduler(intervalMs = 30000) {
  if (timer) return
  // 启动时立即执行一次检查
  try {
    checkAndPublishScheduledArticles()
  } catch (err) {
    console.error('[scheduler] 初始扫描失败:', err)
  }
  timer = setInterval(() => {
    try {
      checkAndPublishScheduledArticles()
    } catch (err) {
      console.error('[scheduler] 周期扫描失败:', err)
    }
  }, intervalMs)

  // 防止定时器阻塞进程退出
  if (timer.unref) timer.unref()
}

/**
 * 停止后台定时调度器
 */
export function stopScheduler() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
