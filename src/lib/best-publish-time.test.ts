import { describe, expect, it } from 'vitest'
import { bestPublishHour, isBestPublishHour } from './best-publish-time'

describe('最佳发布时间建议(规则模拟)', () => {
  it('工作日推荐 21:00', () => {
    // 2026-10-26 是周一
    expect(bestPublishHour(new Date(2026, 9, 26))).toBe(21)
    expect(bestPublishHour(new Date(2026, 9, 30))).toBe(21) // 周五
  })

  it('周末推荐 10:00', () => {
    expect(bestPublishHour(new Date(2026, 9, 24))).toBe(10) // 周六
    expect(bestPublishHour(new Date(2026, 9, 25))).toBe(10) // 周日
  })

  it('isBestPublishHour 按小时判断', () => {
    const monday = new Date(2026, 9, 26, 21, 30)
    expect(isBestPublishHour(monday)).toBe(true)
    expect(isBestPublishHour(new Date(2026, 9, 26, 9, 0))).toBe(false)
  })
})
