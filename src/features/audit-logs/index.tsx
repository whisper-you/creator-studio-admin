import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, RefreshCw, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { auditApi, type AuditLogItem } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

const PAGE_SIZE = 20

const actionLabels: Record<string, string> = {
  'auth.change_password': '修改密码',
  'auth.refresh_reuse': '会话重放拦截',
  'auth.session_revoke': '撤销登录设备',
  'auth.session_revoke_others': '退出其他设备',
  'user.role_change': '角色变更',
  'user.disable': '停用用户',
  'user.enable': '启用用户',
  'user.reset_password': '重置用户密码',
  'user.force_logout': '强制下线用户',
  'article.status_change': '文章状态变更',
  'article.bulk_status_change': '批量状态变更',
  'article.delete': '删除文章',
  'article.bulk_delete': '批量删除文章',
  'channel.update': '渠道配置更新',
  'distribution.dispatch': '触发渠道分发',
}

const entityLabels: Record<string, string> = {
  article: '文章',
  channel: '渠道',
  user: '用户',
}

const formatDetail = (detail: unknown) => {
  if (detail == null) return '—'
  if (typeof detail === 'string') return detail
  return JSON.stringify(detail)
}

export function AuditLogs() {
  const user = useAuthStore((s) => s.auth.user)
  const accessToken = useAuthStore((s) => s.auth.accessToken)

  const [rows, setRows] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('all')
  const [actorInput, setActorInput] = useState('')
  const [actor, setActor] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const authorized = user?.role === 'admin'
  // 刷新页面时 /me 尚未返回,先展示加载态而不是误判无权限
  const checking = !user && !!accessToken

  useEffect(() => {
    if (!authorized) return
    let cancelled = false
    auditApi
      .list({
        page,
        pageSize: PAGE_SIZE,
        action: action === 'all' ? undefined : action,
        actor: actor || undefined,
      })
      .then((res) => {
        if (cancelled) return
        setRows(res.data)
        setTotal(res.total)
      })
      .catch(() => {
        if (!cancelled) toast.error('加载操作日志失败,请确认后端已启动')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authorized, page, action, actor, refreshKey])

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>操作日志</h1>
            <p className='text-muted-foreground'>
              敏感操作审计记录 · 共 {total} 条
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setLoading(true)
                  setActor(actorInput.trim())
                  setPage(1)
                }
              }}
              placeholder='按操作者邮箱筛选'
              className='w-52'
            />
            <Button
              variant='outline'
              onClick={() => {
                setLoading(true)
                setActor(actorInput.trim())
                setPage(1)
              }}
            >
              筛选
            </Button>
            <Select
              value={action}
              onValueChange={(value) => {
                setLoading(true)
                setAction(value)
                setPage(1)
              }}
            >
              <SelectTrigger className='w-44'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部动作</SelectItem>
                {Object.entries(actionLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant='ghost'
              size='icon'
              onClick={() => {
                setLoading(true)
                setRefreshKey((k) => k + 1)
              }}
              title='刷新'
            >
              <RefreshCw className='size-4' />
            </Button>
          </div>
        </div>

        {checking ? (
          <Card>
            <CardContent className='py-16 text-center text-muted-foreground'>
              正在校验权限…
            </CardContent>
          </Card>
        ) : !authorized ? (
          <Card>
            <CardHeader>
              <CardTitle>无权访问</CardTitle>
              <CardDescription>
                操作日志包含敏感审计信息,仅管理员可见。
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <ScrollText className='size-4' />
                审计记录
              </CardTitle>
              <CardDescription>
                密码修改、角色变更、文章发布/删除、渠道配置与分发触发都会留痕。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-44'>时间</TableHead>
                    <TableHead>操作者</TableHead>
                    <TableHead>动作</TableHead>
                    <TableHead>对象</TableHead>
                    <TableHead>详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className='py-10 text-center text-muted-foreground'
                      >
                        {loading ? '加载中…' : '暂无审计记录'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className='whitespace-nowrap text-muted-foreground'>
                          {format(
                            new Date(row.createdAt),
                            'yyyy-MM-dd HH:mm:ss'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className='font-medium'>
                            {row.actorEmail ?? '系统'}
                          </div>
                          {row.actorRole && (
                            <div className='text-xs text-muted-foreground'>
                              {row.actorRole}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant='secondary'>
                            {actionLabels[row.action] ?? row.action}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {entityLabels[row.entityType] ?? row.entityType}
                          {row.entityId ? ` · ${row.entityId}` : ''}
                        </TableCell>
                        <TableCell>
                          <code className='block max-w-[320px] truncate text-xs text-muted-foreground'>
                            {formatDetail(row.detail)}
                          </code>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className='mt-4 flex items-center justify-between'>
                <span className='text-sm text-muted-foreground'>
                  第 {page} / {totalPages} 页
                </span>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page <= 1 || loading}
                    onClick={() => {
                      setLoading(true)
                      setPage((p) => Math.max(p - 1, 1))
                    }}
                  >
                    <ChevronLeft className='size-4' />
                    上一页
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page >= totalPages || loading}
                    onClick={() => {
                      setLoading(true)
                      setPage((p) => Math.min(p + 1, totalPages))
                    }}
                  >
                    下一页
                    <ChevronRight className='size-4' />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </Main>
    </>
  )
}
