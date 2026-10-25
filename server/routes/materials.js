import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth } from './auth.js'

export const materialsRouter = Router()
materialsRouter.use(requireAuth)

const rowToJson = (r) => ({
  id: r.id,
  name: r.name,
  type: r.type,
  scene: r.scene,
  usage: r.usage_count,
  status: r.status,
})

materialsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM materials ORDER BY id').all()
  res.json({ data: rows.map(rowToJson) })
})
