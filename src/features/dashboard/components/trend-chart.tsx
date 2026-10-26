import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { statsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useArticlesStore } from '@/features/articles/store'
import { buildTrendSeries, fmtCount } from '../data/stats'

/** 近 7 / 30 / 90 天阅读与点赞多维趋势图 */
export function TrendChart() {
  const [days, setDays] = useState<number>(30)
  const { articles } = useArticlesStore()

  const { data: serverData } = useQuery({
    queryKey: ['stats', 'trend', days],
    queryFn: () => statsApi.trend(days),
    staleTime: 60_000,
    retry: 1,
  })

  const fallback = useMemo(
    () => buildTrendSeries(articles).slice(-days),
    [articles, days]
  )
  const data = serverData ?? fallback

  return (
    <div className='space-y-3'>
      {/* 周期切换与图例 */}
      <div className='flex items-center justify-between px-1 text-xs'>
        <div className='flex items-center gap-3'>
          <span className='flex items-center gap-1.5'>
            <span className='size-2.5 rounded-full bg-primary' />
            <span className='font-medium text-muted-foreground'>阅读量</span>
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='size-2.5 rounded-full bg-[var(--color-chart-2)]' />
            <span className='font-medium text-muted-foreground'>点赞数</span>
          </span>
        </div>

        <div className='flex items-center gap-1 rounded-lg bg-muted/60 p-0.5'>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type='button'
              onClick={() => setDays(d)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                days === d
                  ? 'bg-background font-semibold text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              近 {d} 天
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width='100%' height={300}>
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
    </div>
  )
}
