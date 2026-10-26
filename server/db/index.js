import { hashSync } from 'bcryptjs'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { resolveSeedPolicy } from '../services/seed-policy.js'
import { buildSeedArticles } from './seed.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// DATA_DIR 可覆盖存储位置(测试用临时目录)，生产默认落盘在 server/data
const dataDir = process.env.DATA_DIR ?? join(__dirname, '../data')
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
    version      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS channels (
    name      TEXT PRIMARY KEY,
    account   TEXT,
    desc      TEXT NOT NULL DEFAULT '',
    connected INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS materials (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT NOT NULL UNIQUE,
    type   TEXT NOT NULL,
    scene  TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    url    TEXT
  );
  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT NOT NULL,
    author     TEXT NOT NULL,
    content    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS distribution_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id    TEXT NOT NULL,
    article_title TEXT NOT NULL,
    channel_name  TEXT NOT NULL,
    target_url    TEXT,
    status        TEXT NOT NULL,
    response_code INTEGER DEFAULT 200,
    message       TEXT,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    TEXT,
    actor_email TEXT,
    actor_role  TEXT,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT,
    detail      TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created
    ON audit_logs (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON audit_logs (action, id DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
    ON audit_logs (entity_type, id DESC);
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    revoked_reason TEXT,
    user_agent TEXT,
    ip         TEXT,
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
    ON refresh_tokens (user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
    ON refresh_tokens (expires_at);
  CREATE INDEX IF NOT EXISTS idx_articles_created
    ON articles (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_status_created
    ON articles (status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_scheduled
    ON articles (status, scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_comments_article
    ON comments (article_id);
  CREATE INDEX IF NOT EXISTS idx_comments_created
    ON comments (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_status_created
    ON comments (status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_distribution_logs_article
    ON distribution_logs (article_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_distribution_logs_created
    ON distribution_logs (created_at);
`)

// 平滑数据库迁移:为旧库补充新列
try {
  db.exec('ALTER TABLE materials ADD COLUMN url TEXT')
} catch (_) {}

try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'")
} catch (_) {}

try {
  db.exec(
    'ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1'
  )
} catch (_) {}

try {
  db.exec('ALTER TABLE users ADD COLUMN disabled_at TEXT')
} catch (_) {}

try {
  db.exec('ALTER TABLE channels ADD COLUMN webhook_url TEXT')
} catch (_) {}

try {
  db.exec(
    'ALTER TABLE channels ADD COLUMN auto_push INTEGER NOT NULL DEFAULT 0'
  )
} catch (_) {}

try {
  db.exec('ALTER TABLE articles ADD COLUMN author_id INTEGER')
} catch (_) {}

try {
  db.exec('ALTER TABLE articles ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
} catch (_) {}

try {
  db.exec('ALTER TABLE refresh_tokens ADD COLUMN revoked_reason TEXT')
} catch (_) {}

try {
  db.exec('ALTER TABLE refresh_tokens ADD COLUMN user_agent TEXT')
} catch (_) {}

try {
  db.exec('ALTER TABLE refresh_tokens ADD COLUMN ip TEXT')
} catch (_) {}

try {
  db.exec('ALTER TABLE refresh_tokens ADD COLUMN last_used_at TEXT')
} catch (_) {}

export function articleRowToJson(row) {
  if (!row) return null
  return {
    id: row.id,
    authorId: row.author_id == null ? undefined : String(row.author_id),
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
    version: row.version ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ========== 初始化种子数据(仅首次) ==========
const seedPolicy = resolveSeedPolicy()
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c
if (userCount === 0) {
  if (seedPolicy.demo) {
    db.prepare(
      "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)"
    ).run(
      'creator@studio.dev',
      '创作者',
      hashSync('creator123', 10),
      new Date().toISOString()
    )
  } else if (seedPolicy.admin) {
    db.prepare(
      "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)"
    ).run(
      seedPolicy.admin.email,
      seedPolicy.admin.name,
      hashSync(seedPolicy.admin.password, 10),
      new Date().toISOString()
    )
  } else {
    throw new Error(
      '空库首次启动需要管理员账号:请设置 ADMIN_EMAIL 与 ADMIN_PASSWORD,或显式开启 SEED_DEMO_DATA=true'
    )
  }
}

const articleCount = db.prepare('SELECT COUNT(*) AS c FROM articles').get().c
if (seedPolicy.demo && articleCount === 0) {
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
    {
      name: '个人网站',
      account: 'blog.example.com',
      desc: '自建博客与作品集,内容资产的主阵地。',
      connected: 1,
    },
    {
      name: '微信公众号',
      account: 'CreatorStudio',
      desc: '深度长文首发平台,支持粉丝留言互动。',
      connected: 1,
    },
    {
      name: '知乎',
      account: '@creator-studio',
      desc: '技术问答与专栏,长尾搜索流量稳定。',
      connected: 1,
    },
    {
      name: '小红书',
      account: null,
      desc: '图文笔记种草,适合教程与工具分享。',
      connected: 0,
    },
    {
      name: '掘金',
      account: null,
      desc: '中文开发者社区,技术文章沉淀好去处。',
      connected: 0,
    },
    {
      name: 'B 站',
      account: null,
      desc: '视频与图文动态,年轻用户聚集地。',
      connected: 0,
    },
    {
      name: '即刻',
      account: null,
      desc: '独立开发者圈子,短内容快速分发。',
      connected: 0,
    },
    {
      name: '邮件订阅',
      account: null,
      desc: '私有订阅列表,不依赖平台算法。',
      connected: 0,
    },
  ]
  if (!seedPolicy.demo) {
    // 生产环境只写入渠道定义,不预置演示账号与连接状态
    seedChannels.forEach((channel) => {
      channel.account = null
      channel.connected = 0
    })
  }
  const insertChannel = db.prepare(
    'INSERT INTO channels (name, account, desc, connected) VALUES (@name, @account, @desc, @connected)'
  )
  withTransaction((rows) => rows.forEach((row) => insertChannel.run(row)))(
    seedChannels
  )
}

const materialCount = db.prepare('SELECT COUNT(*) AS c FROM materials').get().c
if (seedPolicy.demo && materialCount === 0) {
  const seedMaterials = [
    ['数字冲突式标题公式', '标题公式', '技术干货类文章起标题', 42, 'active'],
    [
      '「我如何用 X 做 Y」叙事标题',
      '标题公式',
      '教程与复盘类内容',
      31,
      'active',
    ],
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
  withTransaction((rows) => rows.forEach((r) => insertMaterial.run(...r)))(
    seedMaterials
  )
}

// ========== 评论种子:挂在已发布文章上,状态混合供审核演示 ==========
const commentCount = db.prepare('SELECT COUNT(*) AS c FROM comments').get().c
if (seedPolicy.demo && commentCount === 0) {
  const publishedIds = db
    .prepare("SELECT id FROM articles WHERE status = 'published' ORDER BY id")
    .all()
    .map((r) => r.id)
  const authors = [
    '码农阿伟',
    '前端小林',
    '产品经理大周',
    '独立开发者 Ken',
    '写作爱好者小鹿',
    '设计师 Mia',
    '数据分析师老王',
    '研究生小赵',
    '创业者阿彬',
    '教师莉莉',
  ]
  const contents = [
    '写得太细了,照着做一遍直接跑通了,感谢!',
    '请问下作者用的是哪个版本?我这边报错了。',
    '收藏了,周末就用这个方案重构一下。',
    '有一处没看懂:第二步为什么要先缓存再请求?',
    '同感!我也踩过这个坑,当时排查了一整天。',
    '建议补充一下性能对比的数据,会更有说服力。',
    '这篇必须转发给团队,正好用得上。',
    '排版和配图都很舒服,关注了!',
    '观点不太同意,不过写得很清晰,支持交流。',
    '求出个视频版,文字看着还是费劲。',
  ]
  const statuses = [
    'approved',
    'approved',
    'pending',
    'approved',
    'pending',
    'rejected',
    'approved',
    'pending',
    'approved',
    'pending',
  ]
  const insertComment = db.prepare(
    'INSERT INTO comments (article_id, author, content, status, created_at) VALUES (?, ?, ?, ?, ?)'
  )
  withTransaction(() => {
    publishedIds.slice(0, 10).forEach((articleId, i) => {
      // 每篇挂 1-2 条
      const count = i % 3 === 0 ? 2 : 1
      for (let j = 0; j < count; j++) {
        const idx = (i * 2 + j) % contents.length
        const created = new Date()
        created.setDate(created.getDate() - (i + j))
        created.setHours(9 + ((i + j) % 12), 30, 0, 0)
        insertComment.run(
          articleId,
          authors[idx % authors.length],
          contents[idx],
          statuses[idx],
          created.toISOString()
        )
      }
    })
  })()
}

// ========== 文章归属回填:历史数据与种子数据统一挂到首个用户(种子管理员)名下 ==========
const owner = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()
if (owner) {
  db.prepare('UPDATE articles SET author_id = ? WHERE author_id IS NULL').run(
    owner.id
  )
}
