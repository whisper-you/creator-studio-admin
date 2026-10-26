import { useState } from 'react'
import { CheckCircle2, Loader2, Send, Webhook } from 'lucide-react'
import { toast } from 'sonner'
import { channelsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
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
import { Switch } from '@/components/ui/switch'
import { type Channel } from '../data/channels'

interface ChannelWebhookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: Channel | null
  onSaved: (channelName: string, updated: Partial<Channel>) => void
}

function ChannelWebhookForm({
  channel,
  onClose,
  onSaved,
}: {
  channel: Channel
  onClose: () => void
  onSaved: (channelName: string, updated: Partial<Channel>) => void
}) {
  const [account, setAccount] = useState(channel.account || '')
  const [webhookUrl, setWebhookUrl] = useState(channel.webhookUrl || '')
  const [autoPush, setAutoPush] = useState(!!channel.autoPush)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await channelsApi.testWebhook(channel.name, webhookUrl)
      setTestResult({
        ok: res.ok,
        message: res.message || (res.ok ? '测试成功' : '响应异常'),
      })
      if (res.ok) {
        toast.success(`「${channel.name}」连通性测试通过！`)
      } else {
        toast.error(`测试失败: ${res.message}`)
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '连接异常'
      setTestResult({ ok: false, message: errMsg })
      toast.error('网络请求失败')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await channelsApi.update(channel.name, {
        account: account.trim() || null,
        webhookUrl: webhookUrl.trim() || null,
        autoPush,
      })
      onSaved(channel.name, {
        account: account.trim() || undefined,
        webhookUrl: webhookUrl.trim() || undefined,
        autoPush,
      })
      toast.success(`「${channel.name}」分发与 Webhook 配置已保存`)
      onClose()
    } catch (_err) {
      toast.error('保存失败，请检查网络')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <div className='flex items-center gap-2'>
          <div className='flex size-8 items-center justify-center rounded-lg bg-muted'>
            <channel.icon className={`size-5 ${channel.color}`} />
          </div>
          <div>
            <DialogTitle className='text-base'>
              配置「{channel.name}」分发与 Webhook
            </DialogTitle>
            <DialogDescription className='text-xs'>
              设置发布凭证与自动化推送回调，支持自建博客、飞书/钉钉机器人或 GitHub Actions。
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className='space-y-4 py-2 text-sm'>
        <div className='space-y-1.5'>
          <Label htmlFor='channel-account'>绑定账号 / 专栏名称</Label>
          <Input
            id='channel-account'
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder='如: @creator-studio 或 公众号名称'
          />
        </div>

        <div className='space-y-1.5'>
          <div className='flex items-center justify-between'>
            <Label htmlFor='channel-webhook' className='flex items-center gap-1'>
              <Webhook className='size-3.5 text-muted-foreground' />
              <span>自动化推送 Webhook URL</span>
            </Label>
            <span className='text-[11px] text-muted-foreground'>留空则走内置模拟通道</span>
          </div>
          <Input
            id='channel-webhook'
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder='https://api.yourdomain.com/webhooks/article'
            className='font-mono text-xs'
          />
        </div>

        <div className='flex items-center justify-between rounded-lg border p-3'>
          <div className='space-y-0.5'>
            <Label htmlFor='auto-push' className='font-medium cursor-pointer'>
              自动同步分发
            </Label>
            <p className='text-xs text-muted-foreground'>
              当文章状态流转为「已发布」或定时发布触发时，自动推送到该渠道。
            </p>
          </div>
          <Switch
            id='auto-push'
            checked={autoPush}
            onCheckedChange={setAutoPush}
          />
        </div>

        {testResult && (
          <div
            className={`rounded-md p-2.5 text-xs flex items-start gap-2 border ${
              testResult.ok
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
            }`}
          >
            <CheckCircle2 className='size-4 shrink-0 mt-0.5' />
            <div>
              <p className='font-semibold'>{testResult.ok ? '连通性正常' : '连通异常'}</p>
              <p className='mt-0.5 opacity-90'>{testResult.message}</p>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className='flex sm:justify-between items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={handleTest}
          disabled={testing}
          className='gap-1.5'
        >
          {testing ? (
            <Loader2 className='size-3.5 animate-spin' />
          ) : (
            <Send className='size-3.5' />
          )}
          <span>测试 Webhook</span>
        </Button>

        <div className='flex gap-2'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type='button'
            size='sm'
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

export function ChannelWebhookDialog({
  open,
  onOpenChange,
  channel,
  onSaved,
}: ChannelWebhookDialogProps) {
  if (!channel) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <ChannelWebhookForm
          key={channel.name}
          channel={channel}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  )
}
