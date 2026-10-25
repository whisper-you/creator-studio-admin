import { useMemo } from 'react'
import {
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useArticlesStore } from '@/features/articles/store'
import { buildFunnel } from '../data/stats'

const COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
]

/** 创作 → 发布 → 阅读 → 互动 转化漏斗 */
export function PublishFunnel() {
  const { articles } = useArticlesStore()
  const data = useMemo(() => buildFunnel(articles), [articles])

  return (
    <ResponsiveContainer width='100%' height={280}>
      <FunnelChart>
        <Tooltip formatter={(value, name) => [`${value} 篇`, name as string]} />
        <Funnel dataKey='value' data={data} isAnimationActive={false}>
          {data.map((entry, i) => (
            <Cell key={entry.stage} fill={COLORS[i % COLORS.length]} />
          ))}
          <LabelList
            position='right'
            dataKey='stage'
            fill='currentColor'
            stroke='none'
            className='fill-foreground text-xs'
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  )
}
