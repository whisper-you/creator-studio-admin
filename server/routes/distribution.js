import { z } from 'zod'
import { Router } from 'express'
import { db, articleRowToJson } from '../db/index.js'
import { recordAudit } from '../services/audit.js'
import {
  dispatchArticle,
  getDistributionLogs,
} from '../services/distribution.js'
import { createWebhookLimiter } from '../services/security.js'
import { requireAuth, requireRole } from './auth.js'

export const distributionRouter = Router()
distributionRouter.use(requireAuth)

const webhookLimiter = createWebhookLimiter()

/**
 * GET /api/distribution/logs
 * 获取各渠道分发日志 (可按 articleId 筛选)
 */
distributionRouter.get('/logs', (req, res) => {
  const articleId =
    typeof req.query.articleId === 'string' ? req.query.articleId : null
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
  const rows = getDistributionLogs(articleId, limit)
  // 目标地址可能包含 Webhook 密钥,只对可配置渠道的角色返回
  const canManage = req.user?.role === 'admin' || req.user?.role === 'editor'

  res.json({
    data: rows.map((r) => ({
      id: r.id,
      articleId: r.article_id,
      articleTitle: r.article_title,
      channelName: r.channel_name,
      targetUrl: canManage ? r.target_url : undefined,
      status: r.status,
      responseCode: r.response_code,
      message: r.message,
      createdAt: r.created_at,
    })),
  })
})

/**
 * POST /api/distribution/dispatch
 * 手动触发将文章分发到各平台渠道
 */
distributionRouter.post(
  '/dispatch',
  requireRole('admin', 'editor'),
  webhookLimiter,
  async (req, res) => {
    const parsed = z
      .object({
        articleId: z.string(),
        channels: z.array(z.string()).optional(),
      })
      .safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({ message: '缺少 articleId 参数' })
    }

    const { articleId, channels } = parsed.data
    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId)
    if (!row) {
      return res.status(404).json({ message: '文章不存在' })
    }

    const article = articleRowToJson(row)
    const results = await dispatchArticle(article, channels)

    recordAudit(req, {
      action: 'distribution.dispatch',
      entityType: 'article',
      entityId: articleId,
      detail: {
        requested: channels ?? null,
        channels: results.map((r) => r.channel),
        failed: results.filter((r) => r.status !== 'success').length,
      },
    })

    res.json({
      ok: true,
      articleId,
      results,
    })
  }
)
