import { useMemo } from 'react'
import { CalendarClock, Eye, FileText, ThumbsUp } from 'lucide-react'
import { useArticlesStore } from '@/features/articles/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      },
      {
        title: '总阅读量',
        value: fmtCount(totalViews),
        hint: '全部渠道累计',
        icon: Eye,
      },
      {
        title: '总点赞数',
        value: fmtCount(totalLikes),
        hint: '全部渠道累计',
        icon: ThumbsUp,
      },
      {
        title: '待发布',
        value: String(scheduled),
        hint: '已排期待自动发布',
        icon: CalendarClock,
      },
    ]
  }, [articles])

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {stats.map((s) => (
        <Card key={s.title}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>{s.title}</CardTitle>
            <s.icon className='h-4 w-4 text-muted-foreground' />
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
