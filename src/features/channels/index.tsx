import { type ChangeEvent, useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import {
  SlidersHorizontal,
  ArrowUpAZ,
  ArrowDownAZ,
  Settings2,
  Webhook,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { channelsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ChannelWebhookDialog } from './components/channel-webhook-dialog'
import { channels as seedChannels, type Channel } from './data/channels'

const route = getRouteApi('/_authenticated/channels/')

type ChannelType = 'all' | 'connected' | 'notConnected'

const channelText = new Map<ChannelType, string>([
  ['all', '全部渠道'],
  ['connected', '已绑定'],
  ['notConnected', '未绑定'],
])

export function Channels() {
  const {
    filter = '',
    type = 'all',
    sort: initSort = 'asc',
  } = route.useSearch()
  const navigate = route.useNavigate()

  const [sort, setSort] = useState(initSort)
  const [channelType, setChannelType] = useState(type)
  const [searchTerm, setSearchTerm] = useState(filter)
  const [channels, setChannels] = useState<Channel[]>(seedChannels)
  const [connectedSet, setConnectedSet] = useState<Set<string>>(
    () => new Set(seedChannels.filter((c) => c.connected).map((c) => c.name))
  )
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false)

  useEffect(() => {
    channelsApi
      .list()
      .then((rows) => {
        setChannels((prev) =>
          prev.map((c) => {
            const row = rows.find((r) => r.name === c.name)
            return row
              ? {
                  ...c,
                  connected: row.connected,
                  account: row.account ?? c.account,
                  webhookUrl: row.webhookUrl ?? c.webhookUrl,
                  autoPush: row.autoPush ?? c.autoPush,
                }
              : c
          })
        )
        setConnectedSet(
          new Set(rows.filter((r) => r.connected).map((r) => r.name))
        )
      })
      .catch(() => {
        // 后端未启动:保持种子演示数据
      })
  }, [])

  const filteredChannels = channels
    .slice()
    .sort((a, b) =>
      sort === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    )
    .filter((c) =>
      channelType === 'connected'
        ? connectedSet.has(c.name)
        : channelType === 'notConnected'
          ? !connectedSet.has(c.name)
          : true
    )
    .filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
    navigate({
      search: (prev) => ({
        ...prev,
        filter: e.target.value || undefined,
      }),
    })
  }

  const handleTypeChange = (val: ChannelType) => {
    setChannelType(val)
    navigate({
      search: (prev) => ({
        ...prev,
        type: val === 'all' ? undefined : val,
      }),
    })
  }

  const handleSortChange = (val: 'asc' | 'desc') => {
    setSort(val)
    navigate({
      search: (prev) => ({
        ...prev,
        sort: val,
      }),
    })
  }

  const handleToggleConnect = async (channelName: string) => {
    const isConnected = connectedSet.has(channelName)
    const nextState = !isConnected

    setConnectedSet((prev) => {
      const next = new Set(prev)
      if (nextState) next.add(channelName)
      else next.delete(channelName)
      return next
    })

    try {
      await channelsApi.setConnected(channelName, nextState)
      toast.success(
        nextState
          ? `已成功绑定「${channelName}」渠道`
          : `已解绑「${channelName}」渠道`
      )
    } catch (_err) {
      toast.error('网络同步失败，已退回本地演示状态')
    }
  }

  const handleChannelSaved = (name: string, updated: Partial<Channel>) => {
    setChannels((prev) =>
      prev.map((c) => (c.name === name ? { ...c, ...updated } : c))
    )
  }

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      {/* ===== Content ===== */}
      <Main fixed>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>发布渠道</h1>
          <p className='text-muted-foreground'>
            绑定你的发布渠道,配置 Webhook 自动化,发布文章时一键多平台分发。
          </p>
        </div>
        <div className='my-4 flex items-end justify-between sm:my-0 sm:items-center'>
          <div className='flex flex-col gap-4 sm:my-4 sm:flex-row'>
            <Input
              placeholder='搜索渠道...'
              className='h-9 w-40 lg:w-62.5'
              value={searchTerm}
              onChange={handleSearch}
            />
            <Select value={channelType} onValueChange={handleTypeChange}>
              <SelectTrigger className='w-36'>
                <SelectValue>{channelText.get(channelType)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部渠道</SelectItem>
                <SelectItem value='connected'>已绑定</SelectItem>
                <SelectItem value='notConnected'>未绑定</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={sort} onValueChange={handleSortChange}>
            <SelectTrigger className='w-16'>
              <SelectValue>
                <SlidersHorizontal size={18} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent align='end'>
              <SelectItem value='asc'>
                <div className='flex items-center gap-4'>
                  <ArrowUpAZ size={16} />
                  <span>升序</span>
                </div>
              </SelectItem>
              <SelectItem value='desc'>
                <div className='flex items-center gap-4'>
                  <ArrowDownAZ size={16} />
                  <span>降序</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Separator className='shadow-sm' />
        <ul className='faded-bottom no-scrollbar grid gap-4 overflow-auto pt-4 pb-16 md:grid-cols-2 lg:grid-cols-3'>
          {filteredChannels.map((channel) => {
            const connected = connectedSet.has(channel.name)
            return (
              <li
                key={channel.name}
                className='relative flex flex-col justify-between rounded-lg border p-4 transition-shadow hover:shadow-md'
              >
                <div>
                  <div className='mb-4 flex items-center justify-between'>
                    <div
                      className={`flex size-10 items-center justify-center rounded-lg bg-muted p-2`}
                    >
                      <channel.icon className={`size-6 ${channel.color}`} />
                    </div>
                    <div className='flex items-center gap-1.5'>
                      {connected && (
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-8 text-muted-foreground hover:text-foreground'
                          title='配置 Webhook 与分发'
                          onClick={() => {
                            setActiveChannel(channel)
                            setWebhookDialogOpen(true)
                          }}
                        >
                          <Settings2 className='size-4' />
                          <span className='sr-only'>配置</span>
                        </Button>
                      )}
                      <Button
                        variant='outline'
                        size='sm'
                        className={`${connected ? 'border border-blue-300 bg-blue-50 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:hover:bg-blue-900' : ''}`}
                        onClick={() => handleToggleConnect(channel.name)}
                      >
                        {connected ? '已绑定' : '绑定'}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <h2 className='mb-1 flex items-center gap-2 font-semibold'>
                      {channel.name}
                      {channel.account && (
                        <span className='text-xs font-normal text-muted-foreground'>
                          {channel.account}
                        </span>
                      )}
                    </h2>
                    <p className='line-clamp-2 text-xs leading-relaxed text-gray-500'>
                      {channel.desc}
                    </p>
                  </div>
                </div>

                {connected && (
                  <div className='mt-4 flex items-center justify-between border-t pt-2.5 text-[11px] text-muted-foreground'>
                    <div className='flex items-center gap-1.5'>
                      <Webhook className='size-3 text-muted-foreground' />
                      <span className='max-w-36 truncate'>
                        {channel.webhookUrl ? '已配置 Webhook' : '模拟分发通道'}
                      </span>
                    </div>
                    {channel.autoPush ? (
                      <span className='flex items-center gap-0.5 font-medium text-emerald-600'>
                        <Zap className='size-3' />
                        自动分发
                      </span>
                    ) : (
                      <span className='text-muted-foreground'>手动分发</span>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <ChannelWebhookDialog
          open={webhookDialogOpen}
          onOpenChange={setWebhookDialogOpen}
          channel={activeChannel}
          onSaved={handleChannelSaved}
        />
      </Main>
    </>
  )
}
