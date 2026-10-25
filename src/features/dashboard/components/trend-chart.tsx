import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useArticlesStore } from '@/features/articles/store'
import { buildTrendSeries, fmtCount } from '../data/stats'

/** 近 30 天阅读 / 点赞趋势 */
export function TrendChart() {
  const { articles } = useArticlesStore()
  const data = useMemo(() => buildTrendSeries(articles), [articles])

  return (
    <ResponsiveContainer width='100%' height={320}>
      <AreaChart data={data} margin={{ left: 8, right: 8 }}>
        <defs>
          <linearGradient id='fillViews' x1='0' y1='0' x2='0' y2='1'>
            <stop
              offset='5%'
              stopColor='var(--color-primary)'
              stopOpacity={0.8}
            />
            <stop
              offset='95%'
              stopColor='var(--color-primary)'
              stopOpacity={0.1}
            />
          </linearGradient>
          <linearGradient id='fillLikes' x1='0' y1='0' x2='0' y2='1'>
            <stop
              offset='5%'
              stopColor='var(--color-chart-2)'
              stopOpacity={0.8}
            />
            <stop
              offset='95%'
              stopColor='var(--color-chart-2)'
              stopOpacity={0.1}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray='3 3' />
        <XAxis
          dataKey='date'
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => fmtCount(v)}
        />
        <Tooltip
          formatter={(value) => [fmtCount(Number(value)), undefined]}
          labelClassName='text-muted-foreground'
        />
        <Area
          dataKey='阅读'
          type='monotone'
          fill='url(#fillViews)'
          stroke='var(--color-primary)'
          strokeWidth={2}
        />
        <Area
          dataKey='点赞'
          type='monotone'
          fill='url(#fillLikes)'
          stroke='var(--color-chart-2)'
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
