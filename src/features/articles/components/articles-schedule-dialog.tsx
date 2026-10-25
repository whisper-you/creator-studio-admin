import { useState } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Calendar as CalendarIcon, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { bestPublishHour, BEST_PUBLISH_TIP } from '@/lib/best-publish-time'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { platformMeta, statusMeta } from '../data/data'
import { type Article } from '../data/schema'
import { useArticlesStore } from '../store'

const startOfDay = (d: Date) => {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8) // 8:00 - 22:00

type ArticlesScheduleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Article
}

/**
 * 排期对话框:文章管理页的行操作与排期日历共用。
 * 选中日期后可一键套用「最佳发布时段」建议。
 */
export function ArticlesScheduleDialog({
  open,
  onOpenChange,
  currentRow,
}: ArticlesScheduleDialogProps) {
  const scheduleArticle = useArticlesStore((s) => s.scheduleArticle)

  const [date, setDate] = useState<Date | undefined>(
    () => currentRow.scheduledAt ?? new Date(currentRow.updatedAt)
  )
  const [hour, setHour] = useState<number>(() =>
    currentRow.scheduledAt
      ? currentRow.scheduledAt.getHours()
      : bestPublishHour(new Date(currentRow.updatedAt))
  )

  const handleConfirm = () => {
    if (!date) {
      toast.error('请选择排期日期')
      return
    }
    const scheduled = new Date(date)
    scheduled.setHours(hour, 0, 0, 0)
    scheduleArticle(currentRow.id, scheduled)
    toast.success(
      `「${currentRow.title}」已排期到 ${format(scheduled, 'M月d日 HH:00', { locale: zhCN })}`
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>排期发布 · {currentRow.title}</DialogTitle>
          <DialogDescription>
            选择发布日期与时间,保存后文章状态将流转为「已排期」。
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
            <span className='rounded bg-muted px-1.5 py-0.5'>
              {statusMeta(currentRow.status)?.label}
            </span>
            {currentRow.platforms.map((p) => {
              const meta = platformMeta(p)
              return meta ? (
                <span key={p} className='flex items-center gap-1'>
                  <meta.icon className={`size-3.5 ${meta.color}`} />
                  {meta.label}
                </span>
              ) : null
            })}
          </div>

          <div className='flex items-center gap-3'>
            <Label className='w-14'>日期</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  className='w-48 justify-start font-normal'
                >
                  <CalendarIcon className='me-1 size-4 opacity-60' />
                  {date
                    ? format(date, 'yyyy-MM-dd EEEE', { locale: zhCN })
                    : '选择日期'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-auto p-0' align='start'>
                <Calendar
                  mode='single'
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => startOfDay(d) < startOfDay(new Date())}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className='flex items-center gap-3'>
            <Label className='w-14'>时间</Label>
            <Select
              value={String(hour)}
              onValueChange={(v) => setHour(Number(v))}
            >
              <SelectTrigger className='w-28'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {String(h).padStart(2, '0')}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='text-xs'
              onClick={() => setHour(bestPublishHour(date ?? new Date()))}
            >
              <Sparkles className='me-1 size-3.5 text-amber-500' />
              套用最佳时段 {bestPublishHour(date ?? new Date())}:00
            </Button>
          </div>

          <p className='text-xs text-muted-foreground'>{BEST_PUBLISH_TIP}</p>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm}>确认排期</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
