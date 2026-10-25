import { type ChangeEvent, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { SlidersHorizontal, ArrowUpAZ, ArrowDownAZ } from 'lucide-react'
import { toast } from 'sonner'
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
import { channels as initialChannels } from './data/channels'

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
  // 绑定状态:演示为前端内存态,接后端后改为请求
  const [connectedSet, setConnectedSet] = useState<Set<string>>(
    () => new Set(initialChannels.filter((c) => c.connected).map((c) => c.name))
  )

  const filteredChannels = initialChannels
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

  const handleTypeChange = (value: ChannelType) => {
    setChannelType(value)
    navigate({
      search: (prev) => ({
        ...prev,
        type: value === 'all' ? undefined : value,
      }),
    })
  }

  const handleSortChange = (sort: 'asc' | 'desc') => {
    setSort(sort)
    navigate({ search: (prev) => ({ ...prev, sort }) })
  }

  const handleToggleConnect = (name: string) => {
    setConnectedSet((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
        toast.success(`已解绑「${name}」`)
      } else {
        next.add(name)
        toast.success(`「${name}」绑定成功,可通过文章管理一键分发`)
      }
      return next
    })
  }

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
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
            绑定你的发布渠道,发布文章时一键多平台分发。
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
                className='rounded-lg border p-4 hover:shadow-md'
              >
                <div className='mb-8 flex items-center justify-between'>
                  <div
                    className={`flex size-10 items-center justify-center rounded-lg bg-muted p-2`}
                  >
                    <channel.icon className={`size-6 ${channel.color}`} />
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    className={`${connected ? 'border border-blue-300 bg-blue-50 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:hover:bg-blue-900' : ''}`}
                    onClick={() => handleToggleConnect(channel.name)}
                  >
                    {connected ? '已绑定' : '绑定'}
                  </Button>
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
                  <p className='line-clamp-2 text-gray-500'>{channel.desc}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </Main>
    </>
  )
}
