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
