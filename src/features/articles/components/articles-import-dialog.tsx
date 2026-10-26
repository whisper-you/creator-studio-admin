import { useCallback, useRef, useState } from 'react'
import { Upload, Trash2, CheckCircle2, FileCode, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { categories, statuses } from '../data/data'
import { generateArticleIds, type Article } from '../data/schema'
import { useArticlesStore } from '../store'
import {
  parseMarkdownFile,
  type ParsedMarkdownFile,
} from '../utils/parse-markdown'
import { useArticles } from './articles-provider'

interface ArticlesImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ArticlesImportDialog({
  open,
  onOpenChange,
}: ArticlesImportDialogProps) {
  const [dragOver, setDragOver] = useState(false)
  const [extraFiles, setExtraFiles] = useState<ParsedMarkdownFile[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { initialImport, setInitialImport } = useArticles()
  const addArticles = useArticlesStore((s) => s.addArticles)

  const parsedFiles = [...initialImport, ...extraFiles]

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) =>
      /\.(md|markdown)$/i.test(f.name)
    )

    if (files.length === 0) {
      toast.error('未找到有效的 .md 或 .markdown 文件')
      return
    }

    const newParsedList: ParsedMarkdownFile[] = []

    for (const file of files) {
      try {
        const text = await file.text()
        const parsed = parseMarkdownFile(file.name, text, file.size)
        newParsedList.push(parsed)
      } catch (_err) {
        toast.error(`读取文件「${file.name}」失败`)
      }
    }

    if (newParsedList.length > 0) {
      setExtraFiles((prev) => [...prev, ...newParsedList])
      toast.success(`成功解析 ${newParsedList.length} 个 Markdown 文件`)
    }
  }, [])

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handleRemoveItem = (index: number) => {
    if (index < initialImport.length) {
      setInitialImport((prev) => prev.filter((_, i) => i !== index))
    } else {
      const extraIdx = index - initialImport.length
      setExtraFiles((prev) => prev.filter((_, i) => i !== extraIdx))
    }
  }

  const handleClearAll = () => {
    setInitialImport([])
    setExtraFiles([])
  }

  const closeDialog = () => {
    setInitialImport([])
    setExtraFiles([])
    onOpenChange(false)
  }

  const handleConfirmImport = async () => {
    if (parsedFiles.length === 0) return
    setIsImporting(true)

    try {
      const existingArticles = useArticlesStore.getState().articles
      const newIds = generateArticleIds(existingArticles, parsedFiles.length)
      const now = new Date()

      // 作者导入的 Frontmatter 状态统一收敛到草稿/审核中,与状态机权限一致
      const isAuthor = useAuthStore.getState().auth.user?.role === 'author'
      const newArticles: Article[] = parsedFiles.map((file, idx) => {
        const status =
          isAuthor && !['draft', 'in_review'].includes(file.status)
            ? 'draft'
            : file.status
        return {
          id: newIds[idx],
          title: file.title,
          category: file.category,
          status,
          excerpt: file.excerpt,
          content: file.content,
          tags: file.tags,
          platforms: file.platforms,
          views: 0,
          likes: 0,
          scheduledAt: status === 'scheduled' ? file.scheduledAt : undefined,
          publishedAt:
            status === 'published' ? (file.publishedAt ?? now) : undefined,
          createdAt: now,
          updatedAt: now,
        }
      })

      addArticles(newArticles)
      toast.success(`已成功批量导入 ${newArticles.length} 篇文章！`)

      closeDialog()
    } catch (_err) {
      toast.error('导入失败，请检查网络或后端状态')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) closeDialog()
        else onOpenChange(true)
      }}
    >
      <DialogContent className='flex max-h-[90vh] max-w-3xl flex-col'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FileCode className='h-5 w-5 text-primary' />
            批量导入 Markdown 文章
          </DialogTitle>
          <DialogDescription>
            支持将包含 Frontmatter (YAML 头信息) 的本地 .md
            文件拖入解析，一键批量入库。
          </DialogDescription>
        </DialogHeader>

        {/* 隐藏的文件上传 input */}
        <input
          ref={fileInputRef}
          type='file'
          multiple
          accept='.md,.markdown'
          className='hidden'
          onChange={handleFileInputChange}
        />

        <div className='flex flex-1 flex-col gap-4 overflow-hidden'>
          {/* 拖拽投递区域 */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors',
              dragOver
                ? 'border-primary bg-primary/10'
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
            )}
          >
            <div className='mb-3 rounded-full bg-primary/10 p-3 text-primary'>
              <Upload className='h-6 w-6' />
            </div>
            <p className='mb-1 text-sm font-medium'>
              点击选择文件，或直接拖拽一个/多个 .md 文件到此处
            </p>
            <p className='max-w-md text-xs text-muted-foreground'>
              💡 支持 Frontmatter 字段：
              <code className='rounded bg-muted px-1'>title</code>、
              <code className='rounded bg-muted px-1'>category</code>、
              <code className='rounded bg-muted px-1'>tags</code>、
              <code className='rounded bg-muted px-1'>status</code>、
              <code className='rounded bg-muted px-1'>platforms</code> 等； 无
              Frontmatter 时自动从首个一级标题提炼。
            </p>
          </div>

          {/* 解析列表预览 */}
          {parsedFiles.length > 0 && (
            <div className='flex flex-1 flex-col overflow-hidden rounded-md border'>
              <div className='flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
                <span className='font-medium text-foreground'>
                  待导入文章列表（共 {parsedFiles.length} 篇）
                </span>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 px-2 text-xs'
                    onClick={() => fileInputRef.current?.click()}
                  >
                    继续添加
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 px-2 text-xs text-destructive hover:text-destructive'
                    onClick={handleClearAll}
                  >
                    清空列表
                  </Button>
                </div>
              </div>

              <ScrollArea className='h-60'>
                <Table>
                  <TableHeader>
                    <TableRow className='text-xs'>
                      <TableHead>文章标题</TableHead>
                      <TableHead className='w-24'>分类</TableHead>
                      <TableHead className='w-24'>状态</TableHead>
                      <TableHead className='w-24'>字数</TableHead>
                      <TableHead className='w-32'>标签</TableHead>
                      <TableHead className='w-12 text-right'></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedFiles.map((item, idx) => {
                      const categoryMeta = categories.find(
                        (c) => c.value === item.category
                      )
                      const statusMeta = statuses.find(
                        (s) => s.value === item.status
                      )

                      return (
                        <TableRow key={`${item.fileName}-${idx}`}>
                          <TableCell className='py-2'>
                            <div className='flex flex-col'>
                              <span className='line-clamp-1 text-sm font-medium'>
                                {item.title}
                              </span>
                              <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                                <span>{item.fileName}</span>
                                {item.hasFrontmatter && (
                                  <Badge
                                    variant='outline'
                                    className='h-4 border-emerald-300 px-1 text-[10px] text-emerald-600'
                                  >
                                    Frontmatter
                                  </Badge>
                                )}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className='py-2'>
                            <Badge variant='secondary' className='text-xs'>
                              {categoryMeta?.label ?? item.category}
                            </Badge>
                          </TableCell>
                          <TableCell className='py-2'>
                            <Badge variant='outline' className='text-xs'>
                              {statusMeta?.label ?? item.status}
                            </Badge>
                          </TableCell>
                          <TableCell className='py-2 text-xs text-muted-foreground'>
                            {item.wordCount} 字
                          </TableCell>
                          <TableCell className='py-2'>
                            <div className='flex max-w-[120px] flex-wrap gap-1'>
                              {item.tags.slice(0, 2).map((t) => (
                                <Badge
                                  key={t}
                                  variant='secondary'
                                  className='px-1 py-0 text-[10px]'
                                >
                                  {t}
                                </Badge>
                              ))}
                              {item.tags.length > 2 && (
                                <span className='text-[10px] text-muted-foreground'>
                                  +{item.tags.length - 2}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className='py-2 text-right'>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-7 w-7 text-muted-foreground hover:text-destructive'
                              onClick={() => handleRemoveItem(idx)}
                            >
                              <Trash2 className='h-3.5 w-3.5' />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className='mt-4 gap-2 sm:gap-0'>
          <Button
            variant='outline'
            onClick={closeDialog}
            disabled={isImporting}
          >
            取消
          </Button>
          <Button
            onClick={handleConfirmImport}
            disabled={parsedFiles.length === 0 || isImporting}
            className='space-x-1.5'
          >
            {isImporting ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>正在批量入库...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className='h-4 w-4' />
                <span>确认导入（{parsedFiles.length} 篇）</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
