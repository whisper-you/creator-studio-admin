/**
 * 「最佳发布时间建议」的规则内核。
 * 演示实现:用固定的历史数据规则模拟,接入真实后端后可替换为统计接口。
 *
 * 规则:工作日晚间 21 点、周末上午 10 点,是历史阅读量最高的两个时段。
 */
export function bestPublishHour(date: Date): number {
  const day = date.getDay()
  return day === 0 || day === 6 ? 10 : 21
}

export function isBestPublishHour(date: Date): boolean {
  return date.getHours() === bestPublishHour(date)
}

export const BEST_PUBLISH_TIP =
  '依据近 30 天历史阅读数据:工作日 21:00、周末 10:00 发布效果最佳'
