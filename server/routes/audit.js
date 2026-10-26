import { z } from 'zod'
import { Router } from 'express'
import { listAuditLogs } from '../services/audit.js'
import { requireAuth, requireRole } from './auth.js'

export const auditRouter = Router()
auditRouter.use(requireAuth, requireRole('admin'))

/**
 * GET /api/audit-logs
 * 管理员审计日志查询:分页 + 动作/实体类型/操作者过滤。
 */
auditRouter.get('/', (req, res) => {
  const parsed = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      action: z.string().min(1).optional(),
      entityType: z.string().min(1).optional(),
      actor: z.string().min(1).optional(),
    })
    .safeParse(req.query)

  if (!parsed.success) {
    return res.status(400).json({ message: '查询参数不合法' })
  }

  const { page, pageSize, action, entityType, actor } = parsed.data
  const { rows, total } = listAuditLogs({
    limit: pageSize,
    offset: (page - 1) * pageSize,
    action,
    entityType,
    actor,
  })

  res.json({ data: rows, total, page, pageSize })
})
