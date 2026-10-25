import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashSync } from 'bcryptjs'
import { buildSeedArticles } from './seed.js'
const __dirname = dirname(fileURLToPath(import.meta.url))
// DATA_DIR 可覆盖存储位置(测试用临时目录)
const dataDir = process.env.DATA_DIR ?? join(__dirname, 'data')
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(join(dataDir, 'sqlite.db'))

/** node:sqlite 没有 better-sqlite3 的 db.transaction(),手动封装一个 */
export function withTransaction(fn) {
  return (...args) => {
    db.exec('BEGIN')
    try {
      const result = fn(...args)
      db.exec('COMMIT')
      return result
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS articles (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    excerpt      TEXT NOT NULL DEFAULT '',
    content      TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL,
    category     TEXT NOT NULL,
    tags         TEXT NOT NULL DEFAULT '[]',
    platforms    TEXT NOT NULL DEFAULT '[]',
    views        INTEGER NOT NULL DEFAULT 0,
    likes        INTEGER NOT NULL DEFAULT 0,
    scheduled_at TEXT,
    published_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS channels (
    name      TEXT PRIMARY KEY,
    account   TEXT,
    connected INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS materials (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT NOT NULL UNIQUE,
    type   TEXT NOT NULL,
    scene  TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );
`)

export function articleRowToJson(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    status: row.status,
    category: row.category,
    tags: JSON.parse(row.tags),
    platforms: JSON.parse(row.platforms),
    views: row.views,
    likes: row.likes,
    scheduledAt: row.scheduled_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ========== 初始化种子数据(仅首次) ==========
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c
if (userCount === 0) {
  db.prepare(
    'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).run(
    'creator@studio.dev',
    '创作者',
    hashSync('creator123', 10),
    new Date().toISOString()
  )
}

const articleCount = db.prepare('SELECT COUNT(*) AS c FROM articles').get().c
if (articleCount === 0) {
  const insert = db.prepare(`
    INSERT INTO articles
      (id, title, excerpt, content, status, category, tags, platforms,
       views, likes, scheduled_at, published_at, created_at, updated_at)
    VALUES
      (@id, @title, @excerpt, @content, @status, @category, @tags, @platforms,
       @views, @likes, @scheduledAt, @publishedAt, @createdAt, @updatedAt)
  `)
  const insertMany = withTransaction((rows) => {
    for (const row of rows) insert.run(row)
  })
  insertMany(
    buildSeedArticles().map((a) => ({
      ...a,
      tags: JSON.stringify(a.tags),
      platforms: JSON.stringify(a.platforms),
      scheduledAt: a.scheduledAt?.toISOString() ?? null,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }))
  )
}

// ========== 渠道/素材种子(与前端 data 文件保持同一套定义) ==========
const channelCount = db.prepare('SELECT COUNT(*) AS c FROM channels').get().c
if (channelCount === 0) {
  const seedChannels = [
    { name: '个人网站', account: 'blog.example.com', connected: 1 },
    { name: '微信公众号', account: 'CreatorStudio', connected: 1 },
    { name: '知乎', account: '@creator-studio', connected: 1 },
    { name: '小红书', account: null, connected: 0 },
    { name: '掘金', account: null, connected: 0 },
    { name: 'B 站', account: null, connected: 0 },
    { name: '即刻', account: null, connected: 0 },
    { name: '邮件订阅', account: null, connected: 0 },
  ]
  const insertChannel = db.prepare(
    'INSERT INTO channels (name, account, connected) VALUES (@name, @account, @connected)'
  )
  withTransaction((rows) => rows.forEach((row) => insertChannel.run(row)))(seedChannels)
}

const materialCount = db.prepare('SELECT COUNT(*) AS c FROM materials').get().c
if (materialCount === 0) {
  const seedMaterials = [
    ['数字冲突式标题公式', '标题公式', '技术干货类文章起标题', 42, 'active'],
    ['「我如何用 X 做 Y」叙事标题', '标题公式', '教程与复盘类内容', 31, 'active'],
    ['疑问句钩子标题公式', '标题公式', '观点与随笔类内容', 18, 'active'],
    ['极简白底封面模板', '封面模板', '知乎 / 掘金技术文章', 27, 'active'],
    ['大字报风格封面(3:4)', '封面模板', '小红书图文笔记', 22, 'active'],
    ['公众号首图模板(2.35:1)', '封面模板', '微信公众号推文', 35, 'updating'],
    ['2026 Q4 创作者选题日历', '话题灵感', '月度选题会', 9, 'active'],
    ['AI 工具评测选题清单', '话题灵感', '科技类内容批量产出', 14, 'active'],
    ['独立开发者访谈问题库', '话题灵感', '访谈栏目', 6, 'active'],
    ['10 月各平台流量报告', '数据报告', '复盘与策略调整', 11, 'active'],
    ['2025 全年创作数据年报', '数据报告', '年度总结', 4, 'deprecated'],
    ['爆款拆解:30 篇 10w+ 分析', '数据报告', '新人培训', 16, 'updating'],
  ]
  const insertMaterial = db.prepare(
    'INSERT INTO materials (name, type, scene, usage_count, status) VALUES (?, ?, ?, ?, ?)'
  )
  withTransaction((rows) => rows.forEach((r) => insertMaterial.run(...r)))(seedMaterials)
}
