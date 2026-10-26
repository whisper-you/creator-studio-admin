import { Router } from 'express'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../db.js'
import { requireAuth } from './auth.js'

export const materialsRouter = Router()
materialsRouter.use(requireAuth)

const __dirname = dirname(fileURLToPath(import.meta.url))
const uploadsDir = join(__dirname, '../../uploads')

const rowToJson = (r) => ({
  id: r.id,
  name: r.name,
  type: r.type,
  scene: r.scene,
  usage: r.usage_count,
  status: r.status,
  url: r.url ?? null,
})

materialsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM materials ORDER BY id DESC').all()
  res.json({ data: rows.map(rowToJson) })
})

/**
 * POST /api/materials/upload
 * 本地自托管图床上传接口(无需任何外部账号、无需云服务配置)
 * 将图片保存至本地 uploads/ 目录，并在素材库中自动记录
 */
materialsRouter.post('/upload', (req, res) => {
  const { dataUrl, filename, name, scene } = req.body || {}
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ message: '缺少图片数据 (dataUrl)' })
  }

  const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!matches) {
    return res.status(400).json({ message: '无效的图片格式，仅支持 base64 图片' })
  }

  const rawExt = matches[1].toLowerCase()
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt
  const base64Data = matches[2]
  const buffer = Buffer.from(base64Data, 'base64')

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true })
  }

  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  const safeBaseName = (filename ? filename.replace(/\.[^/.]+$/, '') : 'image')
    .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')
    .slice(0, 30)
  const savedFilename = `${safeBaseName}-${timestamp}-${randomSuffix}.${ext}`
  const targetPath = join(uploadsDir, savedFilename)

  writeFileSync(targetPath, buffer)

  const url = `/uploads/${savedFilename}`
  const materialName = name || filename || `图片_${timestamp}`

  try {
    const existing = db.prepare('SELECT id, usage_count FROM materials WHERE name = ?').get(materialName)
    if (existing) {
      db.prepare('UPDATE materials SET usage_count = usage_count + 1, url = ? WHERE id = ?').run(url, existing.id)
    } else {
      db.prepare(`
        INSERT INTO materials (name, type, scene, usage_count, status, url)
        VALUES (?, '图片素材', ?, 1, 'active', ?)
      `).run(materialName, scene || '正文插图', url)
    }
  } catch (err) {
    console.error('[materials] 记录素材失败:', err)
  }

  return res.status(201).json({
    ok: true,
    url,
    filename: savedFilename,
    name: materialName,
    size: buffer.length,
  })
})
