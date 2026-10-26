import { z } from 'zod'
import { Router } from 'express'
import { db } from '../db/index.js'
import { recordAudit } from '../services/audit.js'
import { testWebhook } from '../services/distribution.js'
import {
  validateWebhookUrl,
  MAX_WEBHOOK_URL_LENGTH,
} from '../services/webhook-url.js'
import { requireAuth, requireRole } from './auth.js'

export const channelsRouter = Router()
channelsRouter.use(requireAuth)

const webhookUrlField = z
  .string()
  .max(MAX_WEBHOOK_URL_LENGTH, 'Webhook 地址超出长度限制')
  .nullable()
  .optional()

channelsRouter.get('/', (req, res) => {
  // Webhook 地址可能内含签名密钥,只对可配置渠道的角色返回
  const canManage = req.user?.role === 'admin' || req.user?.role === 'editor'
  const rows = db.prepare('SELECT * FROM channels ORDER BY rowid').all()
  res.json({
    data: rows.map((r) => ({
      name: r.name,
      account: r.account ?? undefined,
      connected: !!r.connected,
      webhookUrl: canManage ? (r.webhook_url ?? undefined) : undefined,
      autoPush: !!r.auto_push,
    })),
  })
})

// 更新渠道配置(绑定状态、账号名、Webhook 地址与自动推送开关)
// Express 已对路由参数解码,这里不要再 decodeURIComponent,否则畸形编码会抛 URIError
channelsRouter.patch('/:name', requireRole('admin', 'editor'), (req, res) => {
  const parsed = z
    .object({
      connected: z.boolean().optional(),
      account: z.string().max(120).nullable().optional(),
      webhookUrl: webhookUrlField,
      autoPush: z.boolean().optional(),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: '字段校验失败' })
  }

  const { connected, account, webhookUrl, autoPush } = parsed.data
  const current = db
    .prepare('SELECT * FROM channels WHERE name = ?')
    .get(req.params.name)
  if (!current) {
    return res.status(404).json({ message: '渠道不存在' })
  }

  let nextWebhookUrl = current.webhook_url
  if (webhookUrl !== undefined) {
    const checked = validateWebhookUrl(webhookUrl)
    if (!checked.ok) {
      return res.status(400).json({ message: checked.message })
    }
    nextWebhookUrl = checked.url
  }

  const nextConnected =
    connected !== undefined ? (connected ? 1 : 0) : current.connected
  const nextAccount = account !== undefined ? account : current.account
  const nextAutoPush =
    autoPush !== undefined ? (autoPush ? 1 : 0) : current.auto_push

  db.prepare(
    `
      UPDATE channels
      SET connected = ?, account = ?, webhook_url = ?, auto_push = ?
      WHERE name = ?
    `
  ).run(
    nextConnected,
    nextAccount,
    nextWebhookUrl,
    nextAutoPush,
    req.params.name
  )

  // 只记录变更字段名与开关值,避免把含密钥的 Webhook 地址写进审计日志
  recordAudit(req, {
    action: 'channel.update',
    entityType: 'channel',
    entityId: req.params.name,
    detail: {
      fields: Object.keys(parsed.data),
      connected: !!nextConnected,
      autoPush: !!nextAutoPush,
    },
  })

  const updated = db
    .prepare('SELECT * FROM channels WHERE name = ?')
    .get(req.params.name)
  res.json({
    name: updated.name,
    account: updated.account ?? undefined,
    connected: !!updated.connected,
    webhookUrl: updated.webhook_url ?? undefined,
    autoPush: !!updated.auto_push,
  })
})

// 测试 Webhook 连通性
channelsRouter.post(
  '/:name/test-webhook',
  requireRole('admin', 'editor'),
  async (req, res) => {
    const channel = db
      .prepare('SELECT * FROM channels WHERE name = ?')
      .get(req.params.name)
    if (!channel) {
      return res.status(404).json({ message: '渠道不存在' })
    }

    const parsed = z
      .object({ webhookUrl: webhookUrlField })
      .safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ message: '字段校验失败' })
    }

    const { webhookUrl } = parsed.data
    const checked = validateWebhookUrl(
      webhookUrl !== undefined ? webhookUrl : channel.webhook_url
    )
    if (!checked.ok) {
      return res.status(400).json({ message: checked.message })
    }

    const result = await testWebhook(channel.name, checked.url)
    res.json(result)
  }
)
