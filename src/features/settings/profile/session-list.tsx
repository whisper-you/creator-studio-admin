import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { format } from 'date-fns'
import { Laptop, LogOut, RefreshCw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { authApi, type SessionItem } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/confirm-dialog'

const describeDevice = (userAgent?: string | null) => {
  if (!userAgent) return '未知设备'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : '浏览器'
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : ''
  return os ? `${browser} · ${os}` : browser
}

const isMobile = (userAgent?: string | null) =>
  /Android|iPhone|iPad|iPod/.test(userAgent ?? '')

const errorMessageOf = (err: unknown, fallback: string) =>
  (isAxiosError(err) &&
    (err.response?.data as { message?: string } | undefined)?.message) ||
  fallback

export function SessionList() {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [revokeTarget, setRevokeTarget] = useState<SessionItem | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [confirmOthers, setConfirmOthers] = useState(false)
  const [revokingOthers, setRevokingOthers] = useState(false)

  useEffect(() => {
    let cancelled = false
    authApi
      .listSessions()
      .then((res) => {
        if (!cancelled) setSessions(res.data)
      })
      .catch(() => {
        if (!cancelled) toast.error('加载登录设备失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const others = sessions.filter((session) => !session.current)

  const revokeOne = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await authApi.revokeSession(revokeTarget.id)
      toast.success('该设备已退出登录')
      setRevokeTarget(null)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(errorMessageOf(err, '退出设备失败,请稍后重试'))
    } finally {
      setRevoking(false)
    }
  }

  const revokeOthers = async () => {
    setRevokingOthers(true)
    try {
      const res = await authApi.revokeOtherSessions()
      toast.success(`已退出 ${res.revokedSessions} 个其他设备`)
      setConfirmOthers(false)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(errorMessageOf(err, '退出其他设备失败,请稍后重试'))
    } finally {
      setRevokingOthers(false)
    }
  }

  return (
    <div>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className='text-lg font-medium'>登录设备</h3>
          <p className='text-sm text-muted-foreground'>
            这些设备当前可免登录访问你的账号。撤销后该设备需要重新输入密码。
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon'
            onClick={() => {
              setLoading(true)
              setRefreshKey((k) => k + 1)
            }}
            disabled={loading}
            title='刷新'
            aria-label='刷新登录设备'
          >
            <RefreshCw className='size-4' />
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setConfirmOthers(true)}
            disabled={loading || others.length === 0 || revokingOthers}
          >
            退出其他设备
          </Button>
        </div>
      </div>
      <Separator className='my-4' />

      <div className='space-y-3'>
        {loading && sessions.length === 0 ? (
          <p className='text-sm text-muted-foreground'>加载中…</p>
        ) : sessions.length === 0 ? (
          <p className='text-sm text-muted-foreground'>暂无有效登录设备</p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className='flex items-start justify-between gap-3 rounded-md border p-3'
            >
              <div className='flex min-w-0 gap-3'>
                {isMobile(session.userAgent) ? (
                  <Smartphone className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
                ) : (
                  <Laptop className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
                )}
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-sm font-medium'>
                      {describeDevice(session.userAgent)}
                    </span>
                    {session.current && (
                      <Badge variant='secondary'>当前设备</Badge>
                    )}
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {session.ip ?? '未知 IP'} · 最近活动{' '}
                    {format(
                      new Date(session.lastUsedAt ?? session.createdAt),
                      'yyyy-MM-dd HH:mm'
                    )}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    登录时间{' '}
                    {format(new Date(session.createdAt), 'yyyy-MM-dd HH:mm')}
                  </p>
                </div>
              </div>
              {!session.current && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setRevokeTarget(session)}
                >
                  <LogOut className='size-3.5' />
                  退出
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title='退出该设备'
        desc={`将立即结束 ${describeDevice(revokeTarget?.userAgent)} 的登录状态,该设备需要重新输入密码。`}
        confirmText={revoking ? '处理中…' : '退出设备'}
        destructive
        isLoading={revoking}
        handleConfirm={revokeOne}
      />

      <ConfirmDialog
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        title='退出其他所有设备'
        desc={`将结束 ${others.length} 个其他设备的登录状态,当前设备不受影响。`}
        confirmText={revokingOthers ? '处理中…' : '全部退出'}
        destructive
        isLoading={revokingOthers}
        handleConfirm={revokeOthers}
      />
    </div>
  )
}
