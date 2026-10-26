import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { Download, Printer, Send, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { distributionApi } from '@/lib/api'
import { copyFormattedMarkdown, type FormatterTheme } from '@/lib/wechat-formatter'
import { exportArticleAsMarkdown, printArticle } from '@/lib/export-article'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { statusMeta } from '../data/data'
import { statusFlow, type Article } from '../data/schema'
import { useArticlesStore } from '../store'
import { useArticles } from './articles-provider'

type ArticlesRowActionsProps<TData> = {
  row: Row<TData>
}

export function ArticlesRowActions<TData>({
  row,
}: ArticlesRowActionsProps<TData>) {
  const article = row.original as Article

  const { setOpen, setCurrentRow } = useArticles()
  const transitionStatus = useArticlesStore((s) => s.transitionStatus)
  const user = useAuthStore((s) => s.auth.user)
  const isAuthor = user?.role === 'author'

  const rawNextStatuses = statusFlow[article.status] ?? []
  const nextStatuses = isAuthor
    ? rawNextStatuses.filter((s) => s === 'draft' || s === 'in_review')
    : rawNextStatuses

  const handleTransition = (to: Article['status']) => {
    const meta = statusMeta(to)
    transitionStatus([article.id], to)
    toast.success(`「${article.title}」已流转到「${meta?.label ?? to}」`)
  }

  const handleCopyFormatted = async (theme: FormatterTheme, label: string) => {
    const content = article.content || article.excerpt || ''
    if (!content.trim()) {
      toast.warning('文章内容为空，无法复制排版')
      return
    }

    const success = await copyFormattedMarkdown(content, theme)
    if (success) {
      toast.success(
        `「${article.title}」已复制「${label}」排版，直接在后台 Ctrl+V 粘贴即可！`
      )
    } else {
      toast.error('复制排版失败，请确保浏览器允许访问剪贴板')
    }
  }

  const handleExportMarkdown = () => {
    exportArticleAsMarkdown(article)
    toast.success(`已导出「${article.title}」为 Markdown 文件`)
  }

  const handlePrint = () => {
    printArticle(article)
  }

  const handleDispatchChannels = async () => {
    const toastId = toast.loading(`正在分发「${article.title}」至已绑渠道...`)
    try {
      const res = await distributionApi.dispatch(article.id)
      const count = res.results.length
      toast.success(`「${article.title}」已成功向 ${count} 个渠道分发！`, {
        id: toastId,
      })
    } catch (_err) {
      toast.error('分发异常，请检查网络或后端服务', { id: toastId })
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
        >
          <DotsHorizontalIcon className='h-4 w-4' />
          <span className='sr-only'>打开菜单</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-48'>
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(article)
            setOpen('update')
          }}
        >
          编辑
        </DropdownMenuItem>

        {!isAuthor && (
          <DropdownMenuItem
            onClick={() => {
              setCurrentRow(article)
              setOpen('schedule')
            }}
          >
            {article.status === 'scheduled' ? '重新排期' : '排期发布'}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* 分发到各平台 */}
        <DropdownMenuItem onClick={handleDispatchChannels} className='gap-2'>
          <Send className='size-3.5 text-blue-500' />
          <span>分发到各渠道 (Webhook)</span>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className='gap-2'>
            <Sparkles className='size-3.5 text-emerald-600' />
            <span>一键排版复制</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className='w-44'>
            <DropdownMenuItem
              onClick={() => handleCopyFormatted('wechat', '公众号经典绿')}
              className='gap-2'
            >
              <div className='size-2.5 rounded-full bg-[#07c160]' />
              <span>公众号排版 (微信绿)</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleCopyFormatted('zhihu', '知乎专栏蓝')}
              className='gap-2'
            >
              <div className='size-2.5 rounded-full bg-[#0066ff]' />
              <span>知乎专栏排版 (知乎蓝)</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleCopyFormatted('orange', '活力暖阳橙')}
              className='gap-2'
            >
              <div className='size-2.5 rounded-full bg-[#ff6a00]' />
              <span>活力橙排版</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onClick={handleExportMarkdown} className='gap-2'>
          <Download className='size-3.5 text-muted-foreground' />
          <span>导出 Markdown (.md)</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handlePrint} className='gap-2'>
          <Printer className='size-3.5 text-muted-foreground' />
          <span>打印 / 存为 PDF</span>
        </DropdownMenuItem>

        {nextStatuses.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>状态流转</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {nextStatuses.map((to) => {
                  const meta = statusMeta(to)
                  if (!meta) return null
                  return (
                    <DropdownMenuItem
                      key={to}
                      onClick={() => handleTransition(to)}
                    >
                      <meta.icon className='size-4 text-muted-foreground' />
                      流转到「{meta.label}」
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        {!isAuthor && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setCurrentRow(article)
                setOpen('delete')
              }}
              className='text-destructive focus:text-destructive'
            >
              删除
              <DropdownMenuShortcut>
                <Trash2 size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
