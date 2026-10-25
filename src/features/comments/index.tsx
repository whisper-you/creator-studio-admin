import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { getRouteApi } from '@tanstack/react-router'
import { zhCN } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { commentsApi, type CommentItem } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { commentStatuses, commentStatusMeta, type CommentStatus } from './data'

const route = getRouteApi('/_authenticated/comments/')

type StatusFilter = 'all' | CommentStatus

export function Comments() {
  const { status: initStatus = 'all' } = route.useSearch()
  const navigate = route.useNavigate()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initStatus)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const fetchComments = () => {
    commentsApi
      .list(statusFilter === 'all' ? undefined : statusFilter)
      .then((rows) => {
        setComments(rows)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }

  useEffect(fetchComments, [statusFilter])

  const pendingCount = comments.filter((c) => c.status === 'pending').length

  const handleStatus = async (
    comment: CommentItem,
    status: 'approved' | 'rejected'
  ) => {
    const prev = comments
    setComments((rows) =>
      rows.map((c) => (c.id === comment.id ? { ...c, status } : c))
    )
    const meta = commentStatusMeta(status)
    toast.success(`已${meta?.label ?? status}「${comment.author}」的评论`)
    try {
      await commentsApi.setStatus(comment.id, status)
    } catch {
      setComments(prev)
      toast.error('审核结果同步失败,已回滚')
    }
  }

  const handleDelete = async (comment: CommentItem) => {
    const prev = comments
    setComments((rows) => rows.filter((c) => c.id !== comment.id))
    toast.success('评论已删除')
    try {
      await commentsApi.remove(comment.id)
    } catch {
      setComments(prev)
      toast.error('删除同步失败,已回滚')
    }
  }

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>评论管理</h2>
            <p className='text-muted-foreground'>
              审核各渠道读者留言:通过后展示,驳回或删除不当内容。
            </p>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as StatusFilter)
              navigate({
                search: (prev) => ({
                  ...prev,
                  status: v === 'all' ? undefined : (v as CommentStatus),
                }),
              })
            }}
          >
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>全部评论</SelectItem>
              {commentStatuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='overflow-x-auto rounded-md border'>
          <Table className='min-w-2xl'>
            <TableHeader>
              <TableRow>
                <TableHead>读者 / 内容</TableHead>
                <TableHead className='min-w-40'>评论文章</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className='text-end'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comments.map((c) => {
                const meta = commentStatusMeta(c.status)
                return (
                  <TableRow key={c.id}>
                    <TableCell className='max-w-80'>
                      <div className='flex flex-col gap-1 py-1'>
                        <span className='text-sm font-medium'>{c.author}</span>
                        <p className='text-sm text-muted-foreground'>
                          {c.content}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {c.articleTitle ?? '文章已删除'}
                    </TableCell>
                    <TableCell>
                      {meta && (
                        <span
                          className={cn(
                            'flex items-center gap-1.5 text-sm',
                            meta.tone
                          )}
                        >
                          <meta.icon className='size-4' />
                          {meta.label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground tabular-nums'>
                      {format(c.createdAt, 'MM-dd HH:mm', { locale: zhCN })}
                    </TableCell>
                    <TableCell className='text-end'>
                      <div className='flex justify-end gap-1.5'>
                        {c.status !== 'approved' && (
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-7 text-xs'
                            onClick={() => handleStatus(c, 'approved')}
                          >
                            通过
                          </Button>
                        )}
                        {c.status !== 'rejected' && (
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-7 text-xs'
                            onClick={() => handleStatus(c, 'rejected')}
                          >
                            驳回
                          </Button>
                        )}
                        <Button
                          size='sm'
                          variant='ghost'
                          className='h-7 text-xs text-destructive hover:text-destructive'
                          onClick={() => handleDelete(c)}
                        >
                          <Trash2 className='size-3.5' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {loaded && comments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className='h-24 text-center'>
                    没有符合条件的评论。
                  </TableCell>
                </TableRow>
              )}
              {!loaded && (
                <TableRow>
                  <TableCell colSpan={5} className='h-24 text-center'>
                    加载中…
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {statusFilter === 'all' && pendingCount > 0 && (
          <p className='text-xs text-muted-foreground'>
            当前列表中有 <Badge variant='secondary'>{pendingCount}</Badge>{' '}
            条待审核评论
          </p>
        )}
      </Main>
    </>
  )
}
