import { type Table } from '@tanstack/react-table'
import { CircleArrowUp, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { downloadCsv } from '@/lib/download-csv'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { statuses } from '../data/data'
import { type Article } from '../data/schema'
import { useArticlesStore } from '../store'
import { ArticlesMultiDeleteDialog } from './articles-multi-delete-dialog'
import { useArticles } from './articles-provider'

type ArticlesBulkActionsProps<TData> = {
  table: Table<TData>
}

export function ArticlesBulkActions<TData>({
  table,
}: ArticlesBulkActionsProps<TData>) {
  const { open, setOpen } = useArticles()
  const transitionStatus = useArticlesStore((s) => s.transitionStatus)
  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleBulkStatusChange = (to: Article['status']) => {
    const selected = selectedRows.map((row) => row.original as Article)
    transitionStatus(
      selected.map((a) => a.id),
      to
    )
    const meta = statuses.find((s) => s.value === to)
    toast.success(
      `已将 ${selected.length} 篇文章状态更新为「${meta?.label ?? to}」`
    )
    table.resetRowSelection()
  }

  const handleBulkExport = () => {
    const selected = selectedRows.map((row) => row.original as Article)
    downloadCsv('articles.csv', [
      ['ID', '标题', '状态', '分类', '渠道', '阅读', '点赞'],
      ...selected.map((a) => [
        a.id,
        a.title,
        a.status,
        a.category,
        a.platforms.join('|'),
        String(a.views),
        String(a.likes),
      ]),
    ])
    toast.success(`已导出 ${selected.length} 篇文章到 CSV。`)
    table.resetRowSelection()
  }

  const handleBulkDelete = () => {
    useArticlesStore
      .getState()
      .deleteArticles(selectedRows.map((row) => (row.original as Article).id))
    toast.success(`已删除 ${selectedRows.length} 篇文章。`)
    table.resetRowSelection()
  }

  return (
    <>
      <BulkActionsToolbar table={table} entityName='篇文章'>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='outline'
                  size='icon'
                  className='size-8'
                  aria-label='批量更新状态'
                  title='批量更新状态'
                >
                  <CircleArrowUp />
                  <span className='sr-only'>批量更新状态</span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>批量更新状态</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent sideOffset={14}>
            {statuses.map((status) => (
              <DropdownMenuItem
                key={status.value}
                onClick={() => handleBulkStatusChange(status.value)}
              >
                {status.icon && (
                  <status.icon className='size-4 text-muted-foreground' />
                )}
                {status.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              size='icon'
              className='size-8'
              aria-label='导出 CSV'
              title='导出 CSV'
              onClick={handleBulkExport}
            >
              <Download />
              <span className='sr-only'>导出 CSV</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>导出 CSV</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              size='icon'
              className='size-8'
              aria-label='批量删除'
              title='批量删除'
              onClick={() => setOpen('delete-multi')}
            >
              <Trash2 />
              <span className='sr-only'>批量删除</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>批量删除</p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      <ArticlesMultiDeleteDialog
        open={open === 'delete-multi'}
        onOpenChange={(v) => setOpen(v ? 'delete-multi' : null)}
        table={table}
        onDelete={handleBulkDelete}
      />
    </>
  )
}
