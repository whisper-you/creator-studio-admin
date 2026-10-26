import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/index.js'
import { requireAuth } from './auth.js'
import { testWebhook } from '../services/distribution.js'

export const channelsRouter = Router()
channelsRouter.use(requireAuth)

channelsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM channels ORDER BY rowid').all()
  res.json({
    data: rows.map((r) => ({
      name: r.name,
      account: r.account ?? undefined,
      connected: !!r.connected,
      webhookUrl: r.webhook_url ?? undefined,
      autoPush: !!r.auto_push,
    })),
  })
})

// 更新渠道配置(绑定状态、账号名、Webhook 地址与自动推送开关)
channelsRouter.patch(
  '/:name',
  (req, res, next) => {
    req.params.name = decodeURIComponent(req.params.name)
    next()
  },
  (req, res) => {
    const parsed = z
      .object({
        connected: z.boolean().optional(),
        account: z.string().nullable().optional(),
        webhookUrl: z.string().nullable().optional(),
        autoPush: z.boolean().optional(),
      })
      .safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ message: '字段校验失败' })
    }

    const { connected, account, webhookUrl, autoPush } = parsed.data
    const current = db.prepare('SELECT * FROM channels WHERE name = ?').get(req.params.name)
    if (!current) {
      return res.status(404).json({ message: '渠道不存在' })
    }

    const nextConnected = connected !== undefined ? (connected ? 1 : 0) : current.connected
    const nextAccount = account !== undefined ? account : current.account
    const nextWebhookUrl = webhookUrl !== undefined ? webhookUrl : current.webhook_url
    const nextAutoPush = autoPush !== undefined ? (autoPush ? 1 : 0) : current.auto_push

    db.prepare(`
      UPDATE channels
      SET connected = ?, account = ?, webhook_url = ?, auto_push = ?
      WHERE name = ?
    `).run(nextConnected, nextAccount, nextWebhookUrl, nextAutoPush, req.params.name)

    const updated = db.prepare('SELECT * FROM channels WHERE name = ?').get(req.params.name)
    res.json({
      name: updated.name,
      account: updated.account ?? undefined,
      connected: !!updated.connected,
      webhookUrl: updated.webhook_url ?? undefined,
      autoPush: !!updated.auto_push,
    })
  }
)

// 测试 Webhook 连通性
channelsRouter.post(
  '/:name/test-webhook',
  (req, res, next) => {
    req.params.name = decodeURIComponent(req.params.name)
    next()
  },
  async (req, res) => {
    const { webhookUrl } = req.body || {}
    const channel = db.prepare('SELECT * FROM channels WHERE name = ?').get(req.params.name)
    if (!channel) {
      return res.status(404).json({ message: '渠道不存在' })
    }

    const urlToTest = webhookUrl !== undefined ? webhookUrl : channel.webhook_url
    const result = await testWebhook(channel.name, urlToTest)
    res.json(result)
  }
)
