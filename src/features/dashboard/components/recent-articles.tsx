import { useMemo } from 'react'
import { format } from 'date-fns'
import { ArrowUpRight, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { platformMeta } from '@/features/articles/data/data'
import { useArticlesStore } from '@/features/articles/store'
import { fmtCount } from '../data/stats'

/** 最近发布的文章(数据与文章管理实时共享) */
export function RecentArticles() {
  const { articles, recordView } = useArticlesStore()

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

  const handleRecordView = (id: string, title: string) => {
    recordView(id)
    toast.success(`已记录一次访问:「${title}」`)
  }

  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>最近发布</CardTitle>
        <CardDescription>
          共发布 {articles.filter((a) => a.status === 'published').length}{' '}
          篇文章
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {recent.map((a) => (
          <div
            key={a.id}
            role='button'
            tabIndex={0}
            title='点击记录一次访问,阅读量 +1'
            onClick={() => handleRecordView(a.id, a.title)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRecordView(a.id, a.title)
            }}
            className='flex cursor-pointer items-start justify-between gap-3 rounded-md p-1 transition-colors hover:bg-muted/60'
          >
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
        <p className='text-xs text-muted-foreground'>
          点击任意一篇可模拟一次访问,阅读量实时上报到后端
        </p>
      </CardContent>
    </Card>
  )
}
