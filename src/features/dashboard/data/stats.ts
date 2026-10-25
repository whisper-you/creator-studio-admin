import { addDays, format, startOfDay } from 'date-fns'
import { platformMeta } from '@/features/articles/data/data'
import {
  ARTICLE_PLATFORMS,
  type Article,
} from '@/features/articles/data/schema'

/**
 * 确定性伪随机:同样的种子永远生成同样的曲线,
 * 避免上游 Overview 组件里 Math.random() 每次刷新跳变的问题。
 */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type TrendPoint = { date: string; 阅读: number; 点赞: number }

/** 近 N 天阅读/点赞趋势(由文章数据推导 + 平滑噪声) */
export function buildTrendSeries(articles: Article[], days = 30): TrendPoint[] {
  const rnd = mulberry32(42)
  const today = startOfDay(new Date())
  const published = articles.filter((a) => a.status === 'published')
  const totalViews = published.reduce((s, a) => s + a.views, 0)
  const dailyBase = totalViews / 45

  const points: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i)
    const weekday = day.getDay()
    const season = weekday === 0 || weekday === 6 ? 1.25 : 1
    const views = Math.max(
      20,
      Math.round(dailyBase * season * (0.72 + rnd() * 0.56))
    )
    points.push({
      date: format(day, 'MM-dd'),
      阅读: views,
      点赞: Math.round(views * (0.03 + rnd() * 0.05)),
    })
  }
  return points
}

/** 创作 → 发布 → 阅读 → 互动 转化漏斗 */
export function buildFunnel(articles: Article[]) {
  return [
    { stage: '创作', value: articles.length },
    {
      stage: '发布',
      value: articles.filter((a) => a.status === 'published').length,
    },
    { stage: '获得阅读', value: articles.filter((a) => a.views > 0).length },
    { stage: '获得互动', value: articles.filter((a) => a.likes > 0).length },
  ]
}

/** 各发布渠道的阅读量分布(文章阅读按渠道数均摊) */
export function buildPlatformStats(articles: Article[]) {
  return ARTICLE_PLATFORMS.map((p) => {
    const list = articles.filter((a) => a.platforms.includes(p) && a.views > 0)
    const views = list.reduce(
      (s, a) => s + Math.round(a.views / a.platforms.length),
      0
    )
    return { platform: platformMeta(p)?.label ?? p, views }
  }).filter((d) => d.views > 0)
}

export const fmtCount = (n: number) =>
  n >= 10000
    ? `${(n / 10000).toFixed(1)}w`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : `${n}`
