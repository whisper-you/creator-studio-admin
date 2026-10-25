import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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

  const nextStatuses = statusFlow[article.status]

  const handleTransition = (to: Article['status']) => {
    const meta = statusMeta(to)
    transitionStatus([article.id], to)
    toast.success(`「${article.title}」已流转到「${meta?.label ?? to}」`)
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
      <DropdownMenuContent align='end' className='w-44'>
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(article)
            setOpen('update')
          }}
        >
          编辑
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(article)
            setOpen('schedule')
          }}
        >
          {article.status === 'scheduled' ? '重新排期' : '排期发布'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>状态流转</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {nextStatuses.map((to) => {
              const meta = statusMeta(to)
              if (!meta) return null
              return (
                <DropdownMenuItem key={to} onClick={() => handleTransition(to)}>
                  <meta.icon className='size-4 text-muted-foreground' />
                  流转到「{meta.label}」
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(article)
            setOpen('delete')
          }}
        >
          删除
          <DropdownMenuShortcut>
            <Trash2 size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
