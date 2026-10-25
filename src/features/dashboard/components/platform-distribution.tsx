import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useArticlesStore } from '@/features/articles/store'
import { buildPlatformStats, fmtCount } from '../data/stats'

/** 各发布渠道阅读量分布(横向条形图) */
export function PlatformDistribution() {
  const { articles } = useArticlesStore()
  const data = useMemo(() => buildPlatformStats(articles), [articles])

  return (
    <ResponsiveContainer width='100%' height={280}>
      <BarChart data={data} layout='vertical' margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} strokeDasharray='3 3' />
        <XAxis
          type='number'
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => fmtCount(v)}
        />
        <YAxis
          type='category'
          dataKey='platform'
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <Tooltip formatter={(value) => [fmtCount(Number(value)), '阅读量']} />
        <Bar
          dataKey='views'
          fill='var(--color-chart-2)'
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
