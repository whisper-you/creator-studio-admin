import { useMemo, useState } from 'react'
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { bestPublishHour, BEST_PUBLISH_TIP } from '@/lib/best-publish-time'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useArticles } from '@/features/articles/components/articles-provider'
import { useArticlesStore } from '@/features/articles/store'

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

/**
 * 内容排期日历(原创功能):
 * - 把左侧「待排期」文章拖到日期格 → scheduleArticle
 * - 已排期卡片可继续拖动到其他日期改期
 * - 今日与未来日期格展示「最佳发布时段」建议
 */
export function ScheduleCalendar() {
  const { articles } = useArticlesStore()
  const { setCurrentRow, setOpen } = useArticles()
  const scheduleArticle = useArticlesStore((s) => s.scheduleArticle)

  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month]
  )

  const scheduledByDay = useMemo(() => {
    const map = new Map<string, typeof articles>()
    for (const a of articles) {
      if (a.status !== 'scheduled' || !a.scheduledAt) continue
      const key = format(a.scheduledAt, 'yyyy-MM-dd')
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    // 同一天内按排期小时排序
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (a.scheduledAt?.getHours() ?? 0) - (b.scheduledAt?.getHours() ?? 0)
      )
    }
    return map
  }, [articles])

  const handleDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault()
    setDragOverDay(null)
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    const target = new Date(day)
    target.setHours(bestPublishHour(day), 0, 0, 0)
    scheduleArticle(id, target)
    const title = articles.find((a) => a.id === id)?.title ?? id
    toast.success(
      `「${title}」已排期到 ${format(day, 'M月d日', { locale: zhCN })} ${bestPublishHour(day)}:00`
    )
  }

  const shiftMonth = (delta: number) =>
    setMonth((m) =>
      startOfMonth(new Date(m.getFullYear(), m.getMonth() + delta, 1))
    )

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-3 rounded-lg border p-3'>
      {/* ===== 月份导航 + 提示 ===== */}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            onClick={() => shiftMonth(-1)}
            aria-label='上一月'
          >
            <ChevronLeft className='size-4' />
          </Button>
          <span className='min-w-28 text-center text-sm font-semibold'>
            {format(month, 'yyyy年M月', { locale: zhCN })}
          </span>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            onClick={() => shiftMonth(1)}
            aria-label='下一月'
          >
            <ChevronRight className='size-4' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='h-8 text-xs'
            onClick={() => setMonth(startOfMonth(new Date()))}
          >
            今天
          </Button>
        </div>
        <p className='flex items-center gap-1 text-xs text-muted-foreground'>
          <Sparkles className='size-3.5 text-amber-500' />
          {BEST_PUBLISH_TIP}
        </p>
      </div>

      {/* ===== 星期表头 + 日期网格(窄屏横向滚动) ===== */}
      <div className='min-h-0 flex-1 overflow-x-auto pb-1'>
        <div className='min-w-[640px]'>
          <div className='grid grid-cols-7 gap-px text-center text-xs text-muted-foreground'>
            {WEEK_LABELS.map((w) => (
              <div key={w} className='py-1'>
                周{w}
              </div>
            ))}
          </div>

          {/* ===== 日期网格 ===== */}
          <div className='mt-1 grid h-full grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-md border bg-border'>
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayArticles = scheduledByDay.get(key) ?? []
              const inMonth = isSameMonth(day, month)
              const canSchedule =
                day >= new Date(new Date().setHours(0, 0, 0, 0))
              const isBestDay = day.getDay() >= 1 && day.getDay() <= 5

              return (
                <div
                  key={key}
                  onDragOver={(e) => {
                    if (!canSchedule) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverDay(key)
                  }}
                  onDragLeave={() =>
                    setDragOverDay((k) => (k === key ? null : k))
                  }
                  onDrop={(e) => handleDrop(e, day)}
                  className={cn(
                    'flex min-h-24 flex-col gap-1 bg-background p-1.5 transition-colors sm:min-h-28',
                    !inMonth && 'bg-muted/40',
                    dragOverDay === key &&
                      'bg-primary/10 ring-1 ring-primary/50 ring-inset',
                    isToday(day) && 'bg-primary/5'
                  )}
                >
                  <div className='flex items-center justify-between'>
                    <span
                      className={cn(
                        'inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                        isToday(day)
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : inMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground/50'
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {canSchedule &&
                      inMonth &&
                      isBestDay &&
                      dayArticles.length === 0 && (
                        <span className='hidden items-center gap-0.5 text-[10px] text-amber-600 sm:flex dark:text-amber-400'>
                          <Sparkles className='size-3' />
                          推荐 {bestPublishHour(day)}:00
                        </span>
                      )}
                  </div>

                  <div className='flex min-h-0 flex-1 flex-col gap-1'>
                    {dayArticles.slice(0, 3).map((a) => {
                      const hour = a.scheduledAt?.getHours() ?? 0
                      const isBest = hour === bestPublishHour(day)
                      return (
                        <div
                          key={a.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', a.id)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onClick={() => {
                            setCurrentRow(a)
                            setOpen('schedule')
                          }}
                          title={`${String(hour).padStart(2, '0')}:00 · ${a.title}`}
                          className='flex cursor-grab items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1 py-0.5 text-[11px] leading-tight hover:bg-blue-100 active:cursor-grabbing dark:border-blue-800 dark:bg-blue-950 dark:hover:bg-blue-900'
                        >
                          <span className='shrink-0 text-muted-foreground tabular-nums'>
                            {String(hour).padStart(2, '0')}
                          </span>
                          {isBest && (
                            <Sparkles className='size-2.5 shrink-0 text-amber-500' />
                          )}
                          <span className='truncate'>{a.title}</span>
                        </div>
                      )
                    })}
                    {dayArticles.length > 3 && (
                      <span className='px-1 text-[11px] text-muted-foreground'>
                        +{dayArticles.length - 3} 篇
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <p className='text-xs text-muted-foreground'>
        拖动左侧「待排期」文章到日期格完成排期 · 拖动蓝色卡片可改期 ·
        点击卡片调整时间
        {scheduledByDay.size > 0 && ` · 本月共 ${scheduledByDay.size} 天有排期`}
      </p>
    </div>
  )
}
