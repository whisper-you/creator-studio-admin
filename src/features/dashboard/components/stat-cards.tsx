import { useMemo } from 'react'
import { CalendarClock, Eye, FileText, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useArticlesStore } from '@/features/articles/store'
import { fmtCount } from '../data/stats'

export function StatCards() {
  const { articles } = useArticlesStore()

  const stats = useMemo(() => {
    const totalViews = articles.reduce((s, a) => s + a.views, 0)
    const totalLikes = articles.reduce((s, a) => s + a.likes, 0)
    const scheduled = articles.filter((a) => a.status === 'scheduled').length
    return [
      {
        title: '文章总数',
        value: String(articles.length),
        hint: `含 ${articles.filter((a) => a.status === 'draft').length} 篇草稿`,
        icon: FileText,
        tint: 'bg-teal-100 text-teal-600 dark:bg-teal-950/60 dark:text-teal-300',
      },
      {
        title: '总阅读量',
        value: fmtCount(totalViews),
        hint: '全部渠道累计',
        icon: Eye,
        tint: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300',
      },
      {
        title: '总点赞数',
        value: fmtCount(totalLikes),
        hint: '全部渠道累计',
        icon: ThumbsUp,
        tint: 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300',
      },
      {
        title: '待发布',
        value: String(scheduled),
        hint: '已排期待自动发布',
        icon: CalendarClock,
        tint: 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300',
      },
    ]
  }, [articles])

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {stats.map((s) => (
        <Card key={s.title} className='transition-shadow hover:shadow-md'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>{s.title}</CardTitle>
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-lg',
                s.tint
              )}
            >
              <s.icon className='size-4.5' />
            </span>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold tabular-nums'>{s.value}</div>
            <p className='text-xs text-muted-foreground'>{s.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
