import { useMemo } from 'react'
import { GripVertical, Inbox } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useArticles } from '@/features/articles/components/articles-provider'
import { categoryMeta } from '@/features/articles/data/data'
import { useArticlesStore } from '@/features/articles/store'

/**
 * 「待排期」池:草稿与审核中的文章。
 * 拖拽到右侧日历的任意日期格即可完成排期(zustand 数据实时同步)。
 */
export function UnscheduledPool() {
  const { articles } = useArticlesStore()
  const { setCurrentRow, setOpen } = useArticles()

  const pool = useMemo(
    () =>
      articles
        .filter((a) => a.status === 'draft' || a.status === 'in_review')
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    [articles]
  )

  return (
    <div className='flex h-full flex-col gap-3 rounded-lg border p-3'>
      <div className='flex items-center justify-between'>
        <h3 className='flex items-center gap-1.5 text-sm font-semibold'>
          <Inbox className='size-4' />
          待排期
        </h3>
        <Badge variant='secondary' className='tabular-nums'>
          {pool.length}
        </Badge>
      </div>
      <p className='text-xs text-muted-foreground'>
        把文章拖到右侧日期格完成排期;点击卡片也可以直接选日期。
      </p>

      <ScrollArea className='flex-1'>
        <div className='flex flex-col gap-2 pe-2'>
          {pool.map((a) => {
            const category = categoryMeta(a.category)
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
                className='group flex cursor-grab items-center gap-2 rounded-md border bg-background p-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 active:cursor-grabbing'
              >
                <GripVertical className='size-3.5 shrink-0 text-muted-foreground/60' />
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-medium'>{a.title}</p>
                  <p className='mt-0.5 flex items-center gap-1 text-xs text-muted-foreground'>
                    {category && (
                      <>
                        <category.icon className='size-3' />
                        {category.label} ·{' '}
                      </>
                    )}
                    {a.status === 'draft' ? '草稿' : '审核中'}
                  </p>
                </div>
              </div>
            )
          })}
          {pool.length === 0 && (
            <p className='py-8 text-center text-sm text-muted-foreground'>
              全部排完,太棒了 🎉
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
