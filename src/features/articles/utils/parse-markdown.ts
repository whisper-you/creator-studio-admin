import {
  type ArticleCategory,
  type ArticlePlatform,
  type ArticleStatus,
} from '@/features/articles/data/schema'

export interface ParsedMarkdownFile {
  fileName: string
  fileSize: number
  title: string
  excerpt: string
  content: string
  category: ArticleCategory
  status: ArticleStatus
  tags: string[]
  platforms: ArticlePlatform[]
  scheduledAt?: Date
  publishedAt?: Date
  wordCount: number
  hasFrontmatter: boolean
  rawFrontmatter: Record<string, unknown>
}

/** 剥离单引号与双引号 */
function stripQuotes(str: string): string {
  const trimmed = str.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** 轻量级 YAML Frontmatter 解析器(支持字符串、列表、数组、基础布尔值) */
export function parseYamlFrontmatter(yamlStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yamlStr.split(/\r?\n/)
  let currentKey = ''
  let inArray = false
  let arrayValues: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // 缩进列表项: - item
    if (trimmed.startsWith('- ') && currentKey) {
      const val = stripQuotes(trimmed.slice(2))
      if (!inArray) {
        inArray = true
        arrayValues = []
      }
      arrayValues.push(val)
      result[currentKey] = arrayValues
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx !== -1) {
      if (inArray && currentKey) {
        inArray = false
      }
      const key = line.slice(0, colonIdx).trim()
      const rawVal = line.slice(colonIdx + 1).trim()
      currentKey = key

      if (!rawVal) {
        result[key] = ''
        continue
      }

      // 内联行数组: [item1, item2]
      if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        const inner = rawVal.slice(1, -1).trim()
        result[key] = inner
          ? inner.split(',').map((s) => stripQuotes(s.trim())).filter(Boolean)
          : []
        continue
      }

      result[key] = stripQuotes(rawVal)
    }
  }

  return result
}

function mapCategory(raw: unknown): ArticleCategory {
  if (typeof raw !== 'string') return 'tech'
  const v = raw.toLowerCase().trim()
  if (['tech', '技术', '技术干货', 'technology', 'dev'].includes(v)) return 'tech'
  if (['tutorial', '教程', '实战', '实战教程', 'guide', 'howto'].includes(v)) return 'tutorial'
  if (['essay', '随笔', '观点', '观点随笔', 'life', 'thought'].includes(v)) return 'essay'
  if (['news', '资讯', '快讯', '行业快讯', 'trend'].includes(v)) return 'news'
  return 'tech'
}

function mapStatus(raw: unknown): ArticleStatus {
  if (typeof raw !== 'string') return 'draft'
  const v = raw.toLowerCase().trim()
  if (['draft', '草稿'].includes(v)) return 'draft'
  if (['in_review', '待审', '审核中'].includes(v)) return 'in_review'
  if (['scheduled', '排期', '已排期'].includes(v)) return 'scheduled'
  if (['published', '发布', '已发布'].includes(v)) return 'published'
  if (['archived', '归档', '已归档'].includes(v)) return 'archived'
  return 'draft'
}

const PLATFORM_ALIASES: Record<string, ArticlePlatform> = {
  website: 'website',
  blog: 'website',
  网站: 'website',
  博客: 'website',
  个人网站: 'website',
  wechat: 'wechat',
  mp: 'wechat',
  微信: 'wechat',
  公众号: 'wechat',
  微信公众号: 'wechat',
  zhihu: 'zhihu',
  知乎: 'zhihu',
  xiaohongshu: 'xiaohongshu',
  xhs: 'xiaohongshu',
  red: 'xiaohongshu',
  小红书: 'xiaohongshu',
  juejin: 'juejin',
  掘金: 'juejin',
  bilibili: 'bilibili',
  bili: 'bilibili',
  b站: 'bilibili',
  'b 站': 'bilibili',
}

function mapPlatforms(raw: unknown): ArticlePlatform[] {
  if (!raw) return ['website']
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,，、]+/)
      : []

  const valid: ArticlePlatform[] = []
  for (const item of items) {
    if (typeof item === 'string') {
      const p = PLATFORM_ALIASES[item.toLowerCase().trim()]
      if (p && !valid.includes(p)) valid.push(p)
    }
  }
  return valid.length > 0 ? valid : ['website']
}

function mapTags(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(/[,，、;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * 解析单个 Markdown 文本，自动提取 Frontmatter YAML 头信息及正文
 */
export function parseMarkdownFile(
  fileName: string,
  rawContent: string,
  fileSize = 0
): ParsedMarkdownFile {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
  const match = rawContent.match(frontmatterRegex)

  let hasFrontmatter = false
  let frontmatter: Record<string, unknown> = {}
  let bodyContent = rawContent

  if (match) {
    hasFrontmatter = true
    frontmatter = parseYamlFrontmatter(match[1])
    bodyContent = rawContent.slice(match[0].length)
  }

  // 1. 标题提取(Frontmatter > 正文首个 # 标题 > 文件名)
  let title: string
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    title = frontmatter.title.trim()
  } else {
    const headingMatch = bodyContent.match(/^#\s+(.+)$/m)
    if (headingMatch) {
      title = headingMatch[1].trim()
    } else {
      title = fileName.replace(/\.(md|markdown)$/i, '').trim()
    }
  }

  // 2. 摘要提取(Frontmatter > 正文第一个文本段落)
  let excerpt = ''
  const rawExcerpt = frontmatter.excerpt || frontmatter.description || frontmatter.summary
  if (typeof rawExcerpt === 'string' && rawExcerpt.trim()) {
    excerpt = rawExcerpt.trim()
  } else {
    const paragraphs = bodyContent.split(/\r?\n\r?\n/)
    for (const p of paragraphs) {
      const clean = p.replace(/^#+\s+.*$/mg, '').trim()
      if (
        clean &&
        !clean.startsWith('-') &&
        !clean.startsWith('*') &&
        !clean.startsWith('>') &&
        !clean.startsWith('```')
      ) {
        excerpt = clean.slice(0, 140) + (clean.length > 140 ? '...' : '')
        break
      }
    }
    if (!excerpt) {
      excerpt = `${title} 的内容简述`
    }
  }

  // 3. 分类、状态、标签、渠道映射
  const category = mapCategory(frontmatter.category || frontmatter.categories)
  const status = mapStatus(frontmatter.status)
  const tags = mapTags(frontmatter.tags || frontmatter.tag || frontmatter.keywords)
  const platforms = mapPlatforms(frontmatter.platforms || frontmatter.channels || frontmatter.platform)

  // 4. 日期处理
  let scheduledAt: Date | undefined
  let publishedAt: Date | undefined
  const rawDate =
    frontmatter.date ||
    frontmatter.publishedAt ||
    frontmatter.published_at ||
    frontmatter.scheduledAt ||
    frontmatter.scheduled_at

  if (rawDate) {
    const parsedDate = new Date(String(rawDate))
    if (!Number.isNaN(parsedDate.getTime())) {
      if (status === 'scheduled') scheduledAt = parsedDate
      else if (status === 'published') publishedAt = parsedDate
    }
  }

  // 计算字数(排除空白字符)
  const wordCount = bodyContent.replace(/\s+/g, '').length

  return {
    fileName,
    fileSize,
    title,
    excerpt,
    content: bodyContent,
    category,
    status,
    tags,
    platforms,
    scheduledAt,
    publishedAt,
    wordCount,
    hasFrontmatter,
    rawFrontmatter: frontmatter,
  }
}
