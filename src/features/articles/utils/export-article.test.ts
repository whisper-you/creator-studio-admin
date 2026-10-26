import { describe, it, expect } from 'vitest'
import { type Article } from '@/features/articles/data/schema'
import { generateArticleMarkdown } from './export-article'

describe('generateArticleMarkdown', () => {
  const mockArticle: Article = {
    id: 'ART-TEST-1',
    title: '深入理解 TypeScript 泛型',
    excerpt: '泛型是 TS 的核心特性之一。',
    content: '## 泛型基础\n\n泛型提供了类型变量的能力。',
    status: 'published',
    category: 'tech',
    tags: ['TypeScript', '前端'],
    platforms: ['wechat', 'zhihu'],
    views: 1200,
    likes: 45,
    scheduledAt: undefined,
    publishedAt: new Date('2026-03-01T10:00:00Z'),
    createdAt: new Date('2026-03-01T08:00:00Z'),
    updatedAt: new Date('2026-03-01T08:00:00Z'),
  }

  it('正确生成 Frontmatter 和 Markdown 正文', () => {
    const md = generateArticleMarkdown(mockArticle)

    expect(md).toContain('---')
    expect(md).toContain('title: "深入理解 TypeScript 泛型"')
    expect(md).toContain('category: "tech"')
    expect(md).toContain('status: "published"')
    expect(md).toContain('date: "2026-03-01"')
    expect(md).toContain('- "TypeScript"')
    expect(md).toContain('- "wechat"')
    expect(md).toContain('# 深入理解 TypeScript 泛型')
    expect(md).toContain('## 泛型基础')
  })

  it('内容为空时兜底使用 excerpt', () => {
    const noContentArticle: Article = {
      ...mockArticle,
      content: '',
      excerpt: '这是文章摘要内容',
    }

    const md = generateArticleMarkdown(noContentArticle)
    expect(md).toContain('这是文章摘要内容')
  })

  it('标签和发布渠道为空时输出空数组', () => {
    const minimalArticle: Article = {
      ...mockArticle,
      tags: [],
      platforms: [],
    }

    const md = generateArticleMarkdown(minimalArticle)
    expect(md).toContain('tags: []')
    expect(md).toContain('platforms: []')
  })
})
