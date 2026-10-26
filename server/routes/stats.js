import { Router } from 'express'
import { db } from '../db/index.js'
import { requireAuth } from './auth.js'

export const statsRouter = Router()
statsRouter.use(requireAuth)

// 确定性伪随机:以「当天日期」为种子,同一天的曲线跨重启/跨请求一致
function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * GET /api/stats/trend?days=30
 * 近 N 天阅读/点赞趋势:由已发布文章的阅读/点赞总量按日平滑分布,
 * 周末流量上浮 25%。接入真实埋点后可替换为按日聚合查询。
 */
statsRouter.get('/trend', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90)
  const published = db
    .prepare(
      "SELECT views, likes FROM articles WHERE status = 'published' AND published_at IS NOT NULL"
    )
    .all()
  const totalViews = published.reduce((s, a) => s + a.views, 0)
  const totalLikes = published.reduce((s, a) => s + a.likes, 0)
  const dailyBase = totalViews / 45

  const data = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date()
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - i)
    const weekday = day.getDay()
    const season = weekday === 0 || weekday === 6 ? 1.25 : 1
    const daySeed = Number(
      `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`
    )
    const rnd = mulberry32(daySeed)
    const views = Math.max(
      20,
      Math.round(dailyBase * season * (0.72 + rnd() * 0.56))
    )
    data.push({
      date: `${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
      阅读: views,
      点赞: Math.round(views * (0.03 + rnd() * 0.05) + totalLikes / 900),
    })
  }
  res.json({ data })
})
