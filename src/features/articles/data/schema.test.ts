import { describe, expect, it } from 'vitest'
import {
  articleSchema,
  nextArticleId,
  statusFlow,
  ARTICLE_STATUSES,
} from './schema'

describe('文章状态机 statusFlow', () => {
  it('覆盖全部五个状态', () => {
    expect(Object.keys(statusFlow).sort()).toEqual([...ARTICLE_STATUSES].sort())
  })

  it('主链路 draft → in_review → scheduled → published → archived 可走通', () => {
    expect(statusFlow.draft).toContain('in_review')
    expect(statusFlow.in_review).toContain('scheduled')
    expect(statusFlow.scheduled).toContain('published')
    expect(statusFlow.published).toContain('archived')
  })

  it('不允许跳过审核直接发布', () => {
    expect(statusFlow.draft).not.toContain('published')
    expect(statusFlow.draft).not.toContain('scheduled')
  })

  it('每个状态都有可流转的出口(不会卡死)', () => {
    for (const status of ARTICLE_STATUSES) {
      expect(statusFlow[status].length, `${status} 无出口`).toBeGreaterThan(0)
    }
  })
})

describe('nextArticleId', () => {
  it('空列表从 ART-001 开始', () => {
    expect(nextArticleId([])).toBe('ART-001')
  })

  it('按最大序号自增并补零', () => {
    expect(nextArticleId([{ id: 'ART-041' }, { id: 'ART-007' }])).toBe('ART-042')
  })

  it('忽略无法解析的 ID', () => {
    expect(nextArticleId([{ id: 'weird' }])).toBe('ART-001')
  })
})

describe('articleSchema', () => {
  it('把 ISO 字符串解析为 Date(localStorage/JSON 复原路径)', () => {
    const parsed = articleSchema.parse({
      id: 'ART-001',
      title: 't',
      excerpt: '',
      content: '',
      status: 'draft',
      category: 'tech',
      tags: [],
      platforms: ['website'],
      views: 0,
      likes: 0,
      scheduledAt: '2026-10-28T00:00:00.000Z',
      publishedAt: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    })
    expect(parsed.scheduledAt).toBeInstanceOf(Date)
    expect(parsed.publishedAt).toBeUndefined()
    expect(parsed.createdAt).toBeInstanceOf(Date)
  })
})
