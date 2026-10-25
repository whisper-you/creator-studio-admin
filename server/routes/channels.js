import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth } from './auth.js'

export const channelsRouter = Router()
channelsRouter.use(requireAuth)

channelsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM channels ORDER BY rowid').all()
  res.json({
    data: rows.map((r) => ({
      name: r.name,
      account: r.account ?? undefined,
      connected: !!r.connected,
    })),
  })
})

// 绑定/解绑:name 作主键,connected 0/1
channelsRouter.patch(
  '/:name',
  (req, res, next) => {
    // 渠道名含中文与非 URL 安全字符,先解码
    req.params.name = decodeURIComponent(req.params.name)
    next()
  },
  (req, res) => {
    const parsed = z
      .object({ connected: z.boolean() })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ message: '字段校验失败' })

    const result = db
      .prepare('UPDATE channels SET connected = ? WHERE name = ?')
      .run(parsed.data.connected ? 1 : 0, req.params.name)
    if (result.changes === 0) return res.status(404).json({ message: '渠道不存在' })

    const row = db
      .prepare('SELECT * FROM channels WHERE name = ?')
      .get(req.params.name)
    res.json({ name: row.name, account: row.account ?? undefined, connected: !!row.connected })
  }
)
