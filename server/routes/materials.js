import { Router } from 'express'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../db/index.js'
import { requireAuth } from './auth.js'

export const materialsRouter = Router()
materialsRouter.use(requireAuth)

const __dirname = dirname(fileURLToPath(import.meta.url))
const uploadsDir = join(__dirname, '../../uploads')

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

// 仅允许位图格式;SVG 可内嵌脚本,一律拒绝
const ALLOWED_TYPES = {
  png: 'png',
  jpeg: 'jpeg',
  jpg: 'jpeg',
  webp: 'webp',
  gif: 'gif',
}

/** 通过文件头识别真实图片类型,防止伪造 MIME 上传任意内容 */
function detectImageType(buf) {
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png'
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return 'jpeg'
  }
  if (
    buf.length >= 6 &&
    ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString('ascii'))
  ) {
    return 'gif'
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

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
    return res
      .status(400)
      .json({ message: '无效的图片格式，仅支持 base64 图片' })
  }

  const declaredType = ALLOWED_TYPES[matches[1].toLowerCase()]
  if (!declaredType) {
    return res
      .status(400)
      .json({ message: '仅支持 PNG / JPEG / WebP / GIF 格式图片' })
  }

  // base64 长度按 4/3 膨胀,解码前先粗判,避免为大文件分配内存
  const estimatedBytes = Math.floor((matches[2].length * 3) / 4)
  if (estimatedBytes > MAX_UPLOAD_BYTES + 2) {
    return res.status(413).json({ message: '图片不能超过 5MB' })
  }

  const buffer = Buffer.from(matches[2], 'base64')
  if (buffer.length === 0) {
    return res.status(400).json({ message: '图片内容为空' })
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ message: '图片不能超过 5MB' })
  }

  const detectedType = detectImageType(buffer)
  if (!detectedType) {
    return res
      .status(400)
      .json({ message: '图片内容校验失败，文件可能已损坏或并非图片' })
  }
  if (detectedType !== declaredType) {
    return res
      .status(400)
      .json({ message: '图片实际格式与声明不一致，请重新导出后再上传' })
  }

  const ext = detectedType === 'jpeg' ? 'jpg' : detectedType

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
    const existing = db
      .prepare('SELECT id, usage_count FROM materials WHERE name = ?')
      .get(materialName)
    if (existing) {
      db.prepare(
        'UPDATE materials SET usage_count = usage_count + 1, url = ? WHERE id = ?'
      ).run(url, existing.id)
    } else {
      db.prepare(
        `
        INSERT INTO materials (name, type, scene, usage_count, status, url)
        VALUES (?, '图片素材', ?, 1, 'active', ?)
      `
      ).run(materialName, scene || '正文插图', url)
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
