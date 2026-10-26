import { useState } from 'react'
import { z } from 'zod'
import { format } from 'date-fns'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { zhCN } from 'date-fns/locale'
import { Calendar as CalendarIcon, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  generateSmartTitles,
  generateSmartSummary,
  generateSmartTags,
  type TitleCandidate,
} from '@/lib/ai-assistant'
import { bestPublishHour } from '@/lib/best-publish-time'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { categories, platforms, statuses } from '../data/data'
import {
  ARTICLE_CATEGORIES,
  ARTICLE_STATUSES,
  nextArticleId,
  statusFlow,
  type Article,
} from '../data/schema'
import { useArticlesStore } from '../store'
import { MarkdownEditor } from './markdown-editor'

type ArticleMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Article
  onSubmitData?: (values: ArticleForm, scheduled: Date | undefined) => void
}

const formSchema = z.object({
  title: z.string().min(1, '请输入标题'),
  category: z.enum(ARTICLE_CATEGORIES),
  status: z.enum(ARTICLE_STATUSES),
  excerpt: z.string().min(1, '请填写摘要'),
  content: z.string(),
  tags: z.string(),
  platforms: z
    .array(
      z.enum([
        'website',
        'wechat',
        'zhihu',
        'xiaohongshu',
        'juejin',
        'bilibili',
      ])
    )
    .min(1, '至少选择一个发布渠道'),
  scheduledAt: z.date().optional(),
})
type ArticleForm = z.infer<typeof formSchema>

const parseTags = (raw: string) =>
  raw
    .split(/[,,、;;\s]+/u)
    .map((t) => t.trim())
    .filter(Boolean)

export function ArticlesMutateDrawer({
  open,
  onOpenChange,
  currentRow,
  onSubmitData,
}: ArticleMutateDrawerProps) {
  const isUpdate = !!currentRow
  const addArticle = useArticlesStore((s) => s.addArticle)
  const updateArticles = useArticlesStore((s) => s.updateArticles)

  const user = useAuthStore((s) => s.auth.user)
  const isAuthor = user?.role === 'author'

  let allowedStatuses = isUpdate
    ? [currentRow.status, ...statusFlow[currentRow.status]]
    : [...ARTICLE_STATUSES]

  if (isAuthor) {
    allowedStatuses = allowedStatuses.filter(
      (s) => s === 'draft' || s === 'in_review'
    )
    if (allowedStatuses.length === 0) allowedStatuses = ['draft']
  }

  const statusOptions = allowedStatuses.map((s) => {
    const meta = statuses.find((x) => x.value === s)!
    return { label: meta.label, value: meta.value }
  })

  const [hour, setHour] = useState<number>(() =>
    currentRow?.scheduledAt
      ? currentRow.scheduledAt.getHours()
      : bestPublishHour(new Date())
  )

  const form = useForm<ArticleForm>({
    resolver: zodResolver(formSchema),
    defaultValues: currentRow
      ? {
          title: currentRow.title,
          category: currentRow.category,
          status: currentRow.status,
          excerpt: currentRow.excerpt,
          content: currentRow.content,
          tags: currentRow.tags.join('、'),
          platforms: currentRow.platforms,
          scheduledAt: currentRow.scheduledAt,
        }
      : {
          title: '',
          category: 'tech',
          status: 'draft',
          excerpt: '',
          content: '',
          tags: '',
          platforms: ['website'],
          scheduledAt: undefined,
        },
  })

  const watchStatus = useWatch({ control: form.control, name: 'status' })
  const watchDate = useWatch({ control: form.control, name: 'scheduledAt' })
  const watchTitle = useWatch({ control: form.control, name: 'title' })
  const watchContent = useWatch({ control: form.control, name: 'content' })
  const watchCategory = useWatch({ control: form.control, name: 'category' })

  const [aiTitleOpen, setAiTitleOpen] = useState(false)
  const [titleCandidates, setTitleCandidates] = useState<TitleCandidate[]>([])

  const handleGenerateAiTitles = () => {
    const candidates = generateSmartTitles(watchContent || '', watchTitle || '')
    setTitleCandidates(candidates)
  }

  const handleSelectTitle = (title: string) => {
    form.setValue('title', title, { shouldValidate: true, shouldDirty: true })
    setAiTitleOpen(false)
    toast.success('已采用 AI 爆款标题')
  }

  const handleAiSummary = () => {
    if (!watchContent?.trim() && !watchTitle?.trim()) {
      toast.warning('请先填写标题或正文内容')
      return
    }
    const summary = generateSmartSummary(watchContent || '', watchTitle || '')
    form.setValue('excerpt', summary, {
      shouldValidate: true,
      shouldDirty: true,
    })
    toast.success('已自动提炼文章摘要')
  }

  const handleAiTags = () => {
    if (!watchContent?.trim() && !watchTitle?.trim()) {
      toast.warning('请先填写标题或正文内容')
      return
    }
    const tags = generateSmartTags(
      watchContent || '',
      watchTitle || '',
      watchCategory
    )
    form.setValue('tags', tags.join('、'), {
      shouldValidate: true,
      shouldDirty: true,
    })
    toast.success(`已推荐并填入 ${tags.length} 个标签`)
  }

  const onSubmit = (values: ArticleForm) => {
    if (values.status === 'scheduled' && !values.scheduledAt) {
      form.setError('scheduledAt', { message: '已排期文章需要选择排期日期' })
      return
    }

    const scheduled = values.scheduledAt
      ? new Date(values.scheduledAt)
      : undefined
    scheduled?.setHours(hour, 0, 0, 0)

    if (onSubmitData) {
      onSubmitData(values, scheduled)
    } else if (isUpdate && currentRow) {
      const now = new Date()
      updateArticles([currentRow.id], {
        title: values.title,
        category: values.category,
        status: values.status,
        excerpt: values.excerpt,
        content: values.content,
        tags: parseTags(values.tags),
        platforms: values.platforms,
        scheduledAt: values.status === 'scheduled' ? scheduled : undefined,
        publishedAt:
          values.status === 'published' && !currentRow.publishedAt
            ? now
            : currentRow.publishedAt,
        updatedAt: now,
      })
      toast.success(`文章 ${currentRow.id} 已更新`)
    } else {
      const now = new Date()
      addArticle({
        id: nextArticleId(useArticlesStore.getState().articles),
        title: values.title,
        category: values.category,
        status: values.status,
        excerpt: values.excerpt,
        content: values.content,
        tags: parseTags(values.tags),
        platforms: values.platforms,
        views: 0,
        likes: 0,
        scheduledAt: values.status === 'scheduled' ? scheduled : undefined,
        publishedAt: values.status === 'published' ? now : undefined,
        createdAt: now,
        updatedAt: now,
      })
      toast.success(`文章「${values.title}」已创建`)
    }
    onOpenChange(false)
    form.reset()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        form.reset()
      }}
    >
      <SheetContent className='flex flex-col'>
        <SheetHeader className='text-start'>
          <SheetTitle>{isUpdate ? '编辑' : '新建'}文章</SheetTitle>
          <SheetDescription>
            {isUpdate
              ? '修改文章信息;状态只能停留在当前状态或按状态机流转。'
              : '填写选题信息,创建后将进入内容流水线。'}
            {isAuthor && '（作者权限：仅可保存草稿或提交主编审核）'}
            完成后点击保存。
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='articles-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='flex-1 space-y-5 overflow-y-auto px-4'
          >
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <div className='flex items-center justify-between'>
                    <FormLabel>标题</FormLabel>
                    <Popover open={aiTitleOpen} onOpenChange={setAiTitleOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-6 text-xs text-emerald-600 dark:text-emerald-400 gap-1 px-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                          onClick={handleGenerateAiTitles}
                        >
                          <Sparkles className='size-3' />
                          <span>AI 爆款标题</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align='end' className='w-80 p-3 space-y-2 text-xs'>
                        <div className='flex items-center justify-between font-medium border-b pb-1.5'>
                          <span className='flex items-center gap-1.5 text-foreground'>
                            <Sparkles className='size-3.5 text-emerald-600' />
                            AI 爆款标题建议
                          </span>
                          <span className='text-[10px] text-muted-foreground'>点击一键采用</span>
                        </div>
                        <div className='space-y-1.5 max-h-60 overflow-y-auto'>
                          {titleCandidates.map((item, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleSelectTitle(item.title)}
                              className='p-2 rounded-md border hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 cursor-pointer transition-colors space-y-1'
                            >
                              <div className='flex items-center justify-between'>
                                <span className='text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium text-muted-foreground'>
                                  {item.styleLabel}
                                </span>
                              </div>
                              <p className='text-xs font-medium text-foreground leading-snug'>{item.title}</p>
                              <p className='text-[11px] text-muted-foreground'>{item.description}</p>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <FormControl>
                    <Input {...field} placeholder='输入文章标题' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>分类</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='status'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>状态</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='tags'
              render={({ field }) => (
                <FormItem>
                  <div className='flex items-center justify-between'>
                    <FormLabel>标签</FormLabel>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='h-6 text-xs text-purple-600 dark:text-purple-400 gap-1 px-1.5 hover:bg-purple-50 dark:hover:bg-purple-950/30'
                      onClick={handleAiTags}
                    >
                      <Sparkles className='size-3' />
                      <span>AI 推荐标签</span>
                    </Button>
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder='用顿号或逗号分隔,如:前端、React'
                    />
                  </FormControl>
                  <FormDescription>便于检索与专题聚合。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='excerpt'
              render={({ field }) => (
                <FormItem>
                  <div className='flex items-center justify-between'>
                    <FormLabel>摘要</FormLabel>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='h-6 text-xs text-blue-600 dark:text-blue-400 gap-1 px-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                      onClick={handleAiSummary}
                    >
                      <Sparkles className='size-3' />
                      <span>AI 提炼摘要</span>
                    </Button>
                  </div>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder='一句话说清这篇文章的价值'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='content'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>正文</FormLabel>
                  <FormControl>
                    <MarkdownEditor
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      rows={8}
                      articleTitle={watchTitle}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='platforms'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>发布渠道</FormLabel>
                  <div className='flex flex-wrap gap-2'>
                    {platforms.map((p) => {
                      const checked = field.value.includes(p.value)
                      return (
                        <label
                          key={p.value}
                          className={cn(
                            'flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                            checked && 'border-primary bg-primary/5'
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              field.onChange(
                                v
                                  ? [...field.value, p.value]
                                  : field.value.filter((x) => x !== p.value)
                              )
                            }
                          />
                          <p.icon className={cn('size-3.5', p.color)} />
                          {p.label}
                        </label>
                      )
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchStatus === 'scheduled' && (
              <div className='space-y-3 rounded-md border p-3'>
                <FormField
                  control={form.control}
                  name='scheduledAt'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>排期日期</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant='outline'
                              className='w-full justify-start font-normal'
                            >
                              <CalendarIcon className='me-1 size-4 opacity-60' />
                              {field.value
                                ? format(field.value, 'yyyy-MM-dd EEEE', {
                                    locale: zhCN,
                                  })
                                : '选择日期'}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className='w-auto p-0' align='start'>
                          <Calendar
                            mode='single'
                            selected={field.value}
                            onSelect={field.onChange}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className='flex items-center gap-2'>
                  <span className='text-sm'>发布时间</span>
                  <Select
                    value={String(hour)}
                    onValueChange={(v) => setHour(Number(v))}
                  >
                    <SelectTrigger className='w-28'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 15 }, (_, i) => i + 8).map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className='text-xs text-muted-foreground'>
                    建议 {bestPublishHour(watchDate ?? new Date())}:00 发布
                  </span>
                </div>
              </div>
            )}
          </form>
        </Form>
        <SheetFooter className='mt-auto'>
          <SheetClose asChild>
            <Button variant='outline'>取消</Button>
          </SheetClose>
          <Button type='submit' form='articles-form'>
            保存
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
