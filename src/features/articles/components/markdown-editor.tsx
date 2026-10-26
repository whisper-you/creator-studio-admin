import { useState, useRef } from 'react'
import {
  Download,
  Sparkles,
  Check,
  Image as ImageIcon,
  Loader2,
  Smartphone,
  Monitor,
  BookOpen,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { materialsApi } from '@/lib/api'
import { downloadFile } from '@/lib/export-article'
import { cn } from '@/lib/utils'
import { copyFormattedMarkdown, type FormatterTheme } from '@/lib/wechat-formatter'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  articleTitle?: string
}

type PreviewDevice = 'web' | 'wechat' | 'zhihu'

/**
 * 将 File 对象转为 Base64 Data URL
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 10,
  articleTitle = 'article',
}: MarkdownEditorProps) {
  const [copiedTheme, setCopiedTheme] = useState<FormatterTheme | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('web')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * 将图片上传至本地图床，并插入到当前 Markdown 内容中
   */
  const handleUploadAndInsertImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('只能上传图片格式的文件')
      return
    }

    setIsUploading(true)
    const toastId = toast.loading('正在上传图片到本地图床...')

    try {
      const dataUrl = await fileToDataUrl(file)
      let finalUrl = dataUrl

      try {
        const res = await materialsApi.upload({
          dataUrl,
          filename: file.name,
          name: file.name,
          scene: '正文插图',
        })
        if (res.url) {
          finalUrl = res.url
        }
      } catch (_uploadErr) {
        // 离线模式降级：若服务端未启动，直接使用 Base64 Data URL
      }

      // 在光标处插入图片 markdown 语法
      const imageMarkdown = `\n![${file.name.replace(/\.[^.]+$/, '') || '图片'}](${finalUrl})\n`
      const textarea = textareaRef.current

      if (textarea) {
        const start = textarea.selectionStart ?? value.length
        const end = textarea.selectionEnd ?? value.length
        const nextValue =
          value.substring(0, start) + imageMarkdown + value.substring(end)
        onChange(nextValue)
      } else {
        onChange(value ? `${value}\n${imageMarkdown}` : imageMarkdown)
      }

      toast.success('图片已插入 Markdown', { id: toastId })
    } catch (_err) {
      toast.error('上传图片失败，请重试', { id: toastId })
    } finally {
      setIsUploading(false)
    }
  }

  /**
   * 监听剪贴板粘贴 (Ctrl + V)
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          handleUploadAndInsertImage(file)
        }
        return
      }
    }
  }

  /**
   * 监听拖拽图片文件到编辑框
   */
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type.startsWith('image/')) {
        e.preventDefault()
        handleUploadAndInsertImage(file)
        return
      }
    }
  }

  const handleCopyFormatted = async (theme: FormatterTheme, label: string) => {
    if (!value.trim()) {
      toast.warning('文章内容为空，请先编写 Markdown 内容')
      return
    }

    const success = await copyFormattedMarkdown(value, theme)
    if (success) {
      setCopiedTheme(theme)
      toast.success(
        `已复制「${label}」排版富文本，直接在微信公众平台/知乎编辑器中 Ctrl+V 粘贴即可！`
      )
      setTimeout(() => setCopiedTheme(null), 2000)
    } else {
      toast.error('复制排版失败，请确保浏览器允许访问剪贴板')
    }
  }

  const handleExportMd = () => {
    if (!value.trim()) {
      toast.warning('文章内容为空，无需导出')
      return
    }
    const safeTitle = articleTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)
    downloadFile(`${safeTitle || 'article'}.md`, value)
    toast.success('已导出 Markdown 文件')
  }

  return (
    <Tabs defaultValue='edit' className='w-full'>
      <div className='flex items-center justify-between gap-2 pb-1'>
        <TabsList className='h-8'>
          <TabsTrigger value='edit' className='text-xs'>
            编辑
          </TabsTrigger>
          <TabsTrigger value='preview' className='text-xs'>
            多端预览
          </TabsTrigger>
        </TabsList>

        <div className='flex items-center gap-1.5'>
          {/* 上传图片按钮 */}
          <input
            type='file'
            ref={fileInputRef}
            accept='image/*'
            className='hidden'
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUploadAndInsertImage(file)
              e.target.value = ''
            }}
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-7 text-xs font-normal gap-1 text-muted-foreground hover:text-foreground'
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            title='上传或粘贴图片 (支持直接 Ctrl+V)'
          >
            {isUploading ? (
              <Loader2 className='size-3.5 animate-spin' />
            ) : (
              <ImageIcon className='size-3.5 text-blue-500' />
            )}
            <span className='hidden sm:inline'>插入图片</span>
          </Button>

          {/* 一键排版复制 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-7 text-xs font-normal gap-1 text-muted-foreground hover:text-foreground'
              >
                {copiedTheme ? (
                  <Check className='size-3.5 text-green-600' />
                ) : (
                  <Sparkles className='size-3.5 text-emerald-600' />
                )}
                <span>一键排版复制</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-48 text-xs'>
              <DropdownMenuItem
                onClick={() => handleCopyFormatted('wechat', '公众号经典绿')}
                className='gap-2'
              >
                <div className='size-2.5 rounded-full bg-[#07c160]' />
                <span>复制公众号排版 (微信绿)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCopyFormatted('zhihu', '知乎专栏蓝')}
                className='gap-2'
              >
                <div className='size-2.5 rounded-full bg-[#0066ff]' />
                <span>复制知乎排版 (知乎蓝)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCopyFormatted('orange', '活力暖阳橙')}
                className='gap-2'
              >
                <div className='size-2.5 rounded-full bg-[#ff6a00]' />
                <span>复制活力橙排版</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 导出 MD */}
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-7 text-xs font-normal gap-1 text-muted-foreground hover:text-foreground'
            onClick={handleExportMd}
            title='导出当前 Markdown 内容'
          >
            <Download className='size-3.5' />
            <span className='hidden sm:inline'>导出 .md</span>
          </Button>
        </div>
      </div>

      <TabsContent value='edit' className='mt-2 space-y-1.5'>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          onDrop={handleDrop}
          placeholder={
            placeholder ??
            '支持 Markdown 语法与图片粘贴（支持直接截图后按 Ctrl+V 或拖拽图片贴图）…'
          }
          rows={rows}
          className='resize-y font-mono text-sm leading-relaxed'
        />
        <div className='flex items-center justify-between text-[11px] text-muted-foreground px-1'>
          <span>💡 小技巧：直接截图后在此处按 <kbd className='px-1 py-0.5 bg-muted rounded border text-[10px]'>Ctrl+V</kbd> 可快速贴图</span>
          <span>共 {value.length} 字</span>
        </div>
      </TabsContent>

      <TabsContent value='preview' className='mt-2 space-y-3'>
        {/* 多端预览设备切换 */}
        <div className='flex items-center justify-between border-b pb-2 text-xs'>
          <span className='text-muted-foreground font-medium'>终端排版效果：</span>
          <div className='flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg'>
            <button
              type='button'
              onClick={() => setPreviewDevice('web')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors',
                previewDevice === 'web'
                  ? 'bg-background shadow-xs text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Monitor className='size-3.5' />
              <span>Web 网页</span>
            </button>
            <button
              type='button'
              onClick={() => setPreviewDevice('wechat')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors',
                previewDevice === 'wechat'
                  ? 'bg-background shadow-xs text-foreground font-medium text-emerald-600'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Smartphone className='size-3.5' />
              <span>公众号手机端</span>
            </button>
            <button
              type='button'
              onClick={() => setPreviewDevice('zhihu')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors',
                previewDevice === 'zhihu'
                  ? 'bg-background shadow-xs text-foreground font-medium text-blue-600'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BookOpen className='size-3.5' />
              <span>知乎专栏</span>
            </button>
          </div>
        </div>

        {/* 预览容器 */}
        <div className='flex justify-center w-full min-h-64 py-2'>
          {previewDevice === 'wechat' ? (
            /* 仿微信公众号手机容器 */
            <div className='w-full max-w-[390px] rounded-3xl border-4 border-slate-300 dark:border-slate-700 bg-background shadow-xl overflow-hidden p-4 space-y-3'>
              <div className='text-center border-b pb-2'>
                <div className='w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-2' />
                <h3 className='font-bold text-base text-start text-foreground'>
                  {articleTitle || '文章标题'}
                </h3>
                <div className='flex items-center gap-2 text-[11px] text-muted-foreground mt-1'>
                  <span className='text-emerald-600 font-medium'>创作者工坊</span>
                  <span>{new Date().toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
              <div className='prose prose-sm max-w-none dark:prose-invert text-[15px] leading-relaxed'>
                {value.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {value}
                  </ReactMarkdown>
                ) : (
                  <p className='text-muted-foreground text-center py-8'>(暂无正文内容)</p>
                )}
              </div>
              <div className='border-t pt-3 flex justify-between items-center text-xs text-muted-foreground'>
                <span>阅读 10万+</span>
                <div className='flex items-center gap-3'>
                  <span>👍 点赞</span>
                  <span>在看</span>
                </div>
              </div>
            </div>
          ) : previewDevice === 'zhihu' ? (
            /* 仿知乎专栏容器 */
            <div className='w-full max-w-2xl rounded-lg border bg-card p-6 shadow-sm space-y-4'>
              <div className='border-b pb-3'>
                <span className='text-xs font-semibold text-blue-600 uppercase tracking-wider'>
                  知乎专栏 · 技术写作
                </span>
                <h2 className='text-xl font-bold mt-1 text-foreground'>
                  {articleTitle || '文章标题'}
                </h2>
                <div className='flex items-center gap-2 mt-2 text-xs text-muted-foreground'>
                  <div className='size-6 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-[10px]'>
                    创
                  </div>
                  <span className='font-medium text-foreground'>独立创作者</span>
                  <span>· 发布于知乎</span>
                </div>
              </div>
              <div className='prose prose-sm max-w-none dark:prose-invert'>
                {value.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {value}
                  </ReactMarkdown>
                ) : (
                  <p className='text-muted-foreground'>(暂无内容)</p>
                )}
              </div>
            </div>
          ) : (
            /* 标准 Web 预览 */
            <div
              className={cn(
                'prose prose-sm max-w-none w-full rounded-md border p-4 dark:prose-invert bg-card/50',
                'min-h-32'
              )}
            >
              {value.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {value}
                </ReactMarkdown>
              ) : (
                <p className='text-muted-foreground'>(暂无内容)</p>
              )}
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
