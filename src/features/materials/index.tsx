import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { materials } from './data/materials'

const statusBadge = {
  active: { label: '可用', variant: 'default' },
  updating: { label: '整理中', variant: 'secondary' },
  deprecated: { label: '已下线', variant: 'outline' },
} as const

export function Materials() {
  const totalUsage = materials.reduce((acc, m) => acc + m.usage, 0)

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='mb-2 flex items-center justify-between space-y-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>素材库</h1>
            <p className='text-muted-foreground'>
              {materials.length} 个素材 · 累计被引用 {totalUsage} 次
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>创作素材</CardTitle>
            <CardDescription>
              标题公式、封面模板、话题灵感与数据报告,写作时的弹药库。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>素材</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>适用场景</TableHead>
                  <TableHead className='text-end'>被引用</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((m) => (
                  <TableRow key={m.name}>
                    <TableCell className='font-medium'>{m.name}</TableCell>
                    <TableCell>{m.type}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {m.scene}
                    </TableCell>
                    <TableCell className='text-end tabular-nums'>
                      {m.usage} 次
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadge[m.status].variant}>
                        {statusBadge[m.status].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
