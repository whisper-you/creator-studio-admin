import { useMemo } from 'react'
import { format } from 'date-fns'
import { ArrowUpRight, Eye } from 'lucide-react'
import { useArticlesStore } from '@/features/articles/store'
import { platformMeta } from '@/features/articles/data/data'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { fmtCount } from '../data/stats'

/** 最近发布的文章(数据与文章管理实时共享) */
export function RecentArticles() {
  const { articles } = useArticlesStore()

  const recent = useMemo(
    () =>
      articles
        .filter((a) => a.status === 'published' && a.publishedAt)
        .sort(
          (a, b) =>
            (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)
        )
        .slice(0, 5),
    [articles]
  )

  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>最近发布</CardTitle>
        <CardDescription>
          共发布 {articles.filter((a) => a.status === 'published').length} 篇文章
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {recent.map((a) => (
          <div key={a.id} className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium'>{a.title}</p>
              <div className='mt-1 flex items-center gap-2 text-xs text-muted-foreground'>
                <span>{format(a.publishedAt!, 'MM-dd')}</span>
                {a.platforms.slice(0, 3).map((p) => {
                  const meta = platformMeta(p)
                  return meta ? (
                    <meta.icon key={p} className={`size-3.5 ${meta.color}`} />
                  ) : null
                })}
              </div>
            </div>
            <Badge variant='secondary' className='shrink-0 tabular-nums'>
              <Eye className='me-1 size-3' />
              {fmtCount(a.views)}
              <ArrowUpRight className='ms-1 size-3' />
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
