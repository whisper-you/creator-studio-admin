import { useEffect, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { format } from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LogOut,
  RefreshCw,
  UserCog,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { usersApi, type UserListItem } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { PasswordInput } from '@/components/password-input'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

const PAGE_SIZE = 20

const roleLabels: Record<string, string> = {
  admin: '管理员',
  editor: '编辑',
  author: '作者',
}

const roleVariants: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  editor: 'secondary',
  author: 'outline',
}

const errorMessageOf = (err: unknown, fallback: string) =>
  (isAxiosError(err) &&
    (err.response?.data as { message?: string } | undefined)?.message) ||
  fallback

export function UsersPage() {
  const user = useAuthStore((s) => s.auth.user)
  const accessToken = useAuthStore((s) => s.auth.accessToken)

  const [rows, setRows] = useState<UserListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [roleTarget, setRoleTarget] = useState<UserListItem | null>(null)
  const [nextRole, setNextRole] = useState<UserListItem['role']>('author')
  const [savingRole, setSavingRole] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserListItem | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [logoutTarget, setLogoutTarget] = useState<UserListItem | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const authorized = user?.role === 'admin'
  const checking = !user && !!accessToken

  useEffect(() => {
    if (!authorized) return
    let cancelled = false
    usersApi
      .list({ page, pageSize: PAGE_SIZE, q: query || undefined })
      .then((res) => {
        if (cancelled) return
        setRows(res.data)
        setTotal(res.total)
      })
      .catch(() => {
        if (!cancelled) toast.error('加载用户列表失败,请确认后端已启动')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authorized, page, query, refreshKey])

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  const submitRole = async () => {
    if (!roleTarget) return
    setSavingRole(true)
    try {
      await usersApi.setRole(roleTarget.id, nextRole)
      toast.success(
        `已将 ${roleTarget.email} 的角色调整为${roleLabels[nextRole]}`
      )
      setRoleTarget(null)
      setLoading(true)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(errorMessageOf(err, '调整角色失败,请稍后重试'))
    } finally {
      setSavingRole(false)
    }
  }

  const submitReset = async (e: FormEvent) => {
    e.preventDefault()
    if (!resetTarget) return
    if (newPassword.length < 8) {
      toast.error('新密码至少需要 8 个字符')
      return
    }
    setResetting(true)
    try {
      const res = await usersApi.resetPassword(resetTarget.id, newPassword)
      toast.success(
        `已重置 ${resetTarget.email} 的密码,并吊销 ${res.revokedSessions} 个会话`
      )
      setResetTarget(null)
      setNewPassword('')
      setLoading(true)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(errorMessageOf(err, '重置密码失败,请稍后重试'))
    } finally {
      setResetting(false)
    }
  }

  const handleForceLogout = async () => {
    if (!logoutTarget) return
    setLoggingOut(true)
    try {
      const res = await usersApi.forceLogout(logoutTarget.id)
      toast.success(
        `已强制下线 ${logoutTarget.email},吊销 ${res.revokedSessions} 个会话`
      )
      setLogoutTarget(null)
      setLoading(true)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(errorMessageOf(err, '强制下线失败,请稍后重试'))
    } finally {
      setLoggingOut(false)
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

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>用户管理</h1>
            <p className='text-muted-foreground'>
              账号与会话管理 · 共 {total} 个用户
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setLoading(true)
                  setQuery(queryInput.trim())
                  setPage(1)
                }
              }}
              placeholder='按邮箱或昵称搜索'
              className='w-52'
            />
            <Button
              variant='outline'
              onClick={() => {
                setLoading(true)
                setQuery(queryInput.trim())
                setPage(1)
              }}
            >
              搜索
            </Button>
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
                用户管理涉及账号安全,仅管理员可见。
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Users className='size-4' />
                账号列表
              </CardTitle>
              <CardDescription>
                重置密码会立即吊销该用户全部会话;强制下线可让已登录设备立刻退出。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    <TableHead className='w-28'>角色</TableHead>
                    <TableHead className='w-28'>活跃会话</TableHead>
                    <TableHead className='w-44'>注册时间</TableHead>
                    <TableHead className='w-64 text-end'>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className='py-10 text-center text-muted-foreground'
                      >
                        {loading ? '加载中…' : '没有匹配的用户'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const isSelf = user?.id === row.id
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className='font-medium'>
                              {row.name || '未命名'}
                              {isSelf && (
                                <span className='ms-2 text-xs text-muted-foreground'>
                                  (当前账号)
                                </span>
                              )}
                            </div>
                            <div className='text-xs text-muted-foreground'>
                              {row.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                roleVariants[row.role] ?? roleVariants.author
                              }
                            >
                              {roleLabels[row.role] ?? row.role}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-muted-foreground'>
                            {row.activeSessions}
                          </TableCell>
                          <TableCell className='whitespace-nowrap text-muted-foreground'>
                            {format(new Date(row.createdAt), 'yyyy-MM-dd')}
                          </TableCell>
                          <TableCell>
                            <div className='flex justify-end gap-1'>
                              <Button
                                variant='outline'
                                size='icon'
                                className='size-8'
                                disabled={isSelf}
                                title='调整角色'
                                aria-label={`调整 ${row.email} 的角色`}
                                onClick={() => {
                                  setNextRole(row.role)
                                  setRoleTarget(row)
                                }}
                              >
                                <UserCog className='size-3.5' />
                              </Button>
                              <Button
                                variant='outline'
                                size='sm'
                                disabled={isSelf}
                                onClick={() => {
                                  setNewPassword('')
                                  setResetTarget(row)
                                }}
                              >
                                <KeyRound className='size-3.5' />
                                重置密码
                              </Button>
                              <Button
                                variant='outline'
                                size='sm'
                                disabled={isSelf}
                                onClick={() => setLogoutTarget(row)}
                              >
                                <LogOut className='size-3.5' />
                                强制下线
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
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

      <Dialog
        open={!!roleTarget}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null)
        }}
      >
        <DialogContent className='max-w-sm'>
          <DialogHeader>
            <DialogTitle>调整角色</DialogTitle>
            <DialogDescription>
              为 {roleTarget?.email}{' '}
              选择新角色。保存后立即生效,无需对方重新登录。
            </DialogDescription>
          </DialogHeader>
          <div className='my-4 space-y-2'>
            <Label htmlFor='user-role'>角色</Label>
            <Select
              value={nextRole}
              onValueChange={(value) =>
                setNextRole(value as UserListItem['role'])
              }
            >
              <SelectTrigger id='user-role' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='admin'>管理员</SelectItem>
                <SelectItem value='editor'>编辑</SelectItem>
                <SelectItem value='author'>作者</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setRoleTarget(null)}
              disabled={savingRole}
            >
              取消
            </Button>
            <Button
              type='button'
              onClick={submitRole}
              disabled={savingRole || nextRole === roleTarget?.role}
            >
              {savingRole ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
      >
        <DialogContent className='max-w-md'>
          <form onSubmit={submitReset}>
            <DialogHeader>
              <DialogTitle>重置密码</DialogTitle>
              <DialogDescription>
                为 {resetTarget?.email}{' '}
                设置新密码。提交后该用户的所有设备会立即退出登录。
              </DialogDescription>
            </DialogHeader>
            <div className='my-4 space-y-2'>
              <Label htmlFor='reset-new-password'>新密码</Label>
              <PasswordInput
                id='reset-new-password'
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder='至少 8 个字符'
                autoComplete='new-password'
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setResetTarget(null)}
                disabled={resetting}
              >
                取消
              </Button>
              <Button type='submit' disabled={resetting}>
                {resetting ? '提交中…' : '确认重置'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!logoutTarget}
        onOpenChange={(open) => {
          if (!open) setLogoutTarget(null)
        }}
        title='强制下线'
        desc={`将立即吊销 ${logoutTarget?.email ?? ''} 的全部会话,该用户需要重新登录。`}
        confirmText={loggingOut ? '处理中…' : '强制下线'}
        destructive
        isLoading={loggingOut}
        handleConfirm={handleForceLogout}
      />
    </>
  )
}
