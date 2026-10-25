import { describe, expect, it } from 'vitest'
import { buildFunnel, buildPlatformStats, buildTrendSeries, mulberry32 } from './stats'
import { type Article } from '@/features/articles/data/schema'

const article = (over: Partial<Article>): Article => ({
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
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  ...over,
})

describe('mulberry32 确定性伪随机', () => {
  it('同一种子序列完全一致', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('buildTrendSeries', () => {
  it('生成指定天数的数据且确定性', () => {
    const articles = [article({ status: 'published', views: 45000 })]
    const s1 = buildTrendSeries(articles, 30)
    const s2 = buildTrendSeries(articles, 30)
    expect(s1).toHaveLength(30)
    expect(s1).toEqual(s2)
  })

  it('阅读曲线始终高于点赞曲线', () => {
    const series = buildTrendSeries(
      [article({ status: 'published', views: 45000 })],
      30
    )
    for (const p of series) {
      expect(p.阅读).toBeGreaterThan(p.点赞)
    }
  })
})

describe('buildFunnel 漏斗单调不增', () => {
  it('创作 ≥ 发布 ≥ 阅读 ≥ 互动', () => {
    const articles = [
      article({ id: '1', status: 'published', views: 100, likes: 5 }),
      article({ id: '2', status: 'published', views: 200, likes: 0 }),
      article({ id: '3', status: 'draft' }),
    ]
    const funnel = buildFunnel(articles)
    expect(funnel.map((f) => f.value)).toEqual([3, 2, 2, 1])
    for (let i = 1; i < funnel.length; i++) {
      expect(funnel[i]!.value).toBeLessThanOrEqual(funnel[i - 1]!.value)
    }
  })
})

describe('buildPlatformStats', () => {
  it('阅读按渠道数均摊并只保留有数据的渠道', () => {
    const stats = buildPlatformStats([
      article({ id: '1', status: 'published', views: 100, platforms: ['website', 'zhihu'] }),
      article({ id: '2', status: 'draft', views: 0, platforms: ['bilibili'] }),
    ])
    const byName = Object.fromEntries(stats.map((s) => [s.platform, s.views]))
    expect(byName['个人网站']).toBe(50)
    expect(byName['知乎']).toBe(50)
    expect(byName['B 站']).toBeUndefined()
  })
})
