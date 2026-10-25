import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { PlatformDistribution } from './components/platform-distribution'
import { PublishFunnel } from './components/publish-funnel'
import { RecentArticles } from './components/recent-articles'
import { StatCards } from './components/stat-cards'
import { TrendChart } from './components/trend-chart'

export function Dashboard() {
  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      {/* ===== Main ===== */}
      <Main className='flex flex-1 flex-col gap-4'>
        <div className='mb-2 flex items-center justify-between space-y-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>数据总览</h1>
            <p className='text-muted-foreground'>
              你的内容流水线与传播效果,数据与文章管理实时同步。
            </p>
          </div>
        </div>

        <StatCards />

        <Tabs defaultValue='overview' className='space-y-4'>
          <div className='w-full overflow-x-auto pb-2'>
            <TabsList>
              <TabsTrigger value='overview'>概览</TabsTrigger>
              <TabsTrigger value='analytics'>数据分析</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value='overview' className='space-y-4'>
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
              <Card className='col-span-1 lg:col-span-4'>
                <CardHeader>
                  <CardTitle>阅读趋势</CardTitle>
                  <CardDescription>近 30 天阅读与点赞走势</CardDescription>
                </CardHeader>
                <CardContent>
                  <TrendChart />
                </CardContent>
              </Card>
              <div className='col-span-1 lg:col-span-3'>
                <RecentArticles />
              </div>
            </div>
          </TabsContent>
          <TabsContent value='analytics' className='space-y-4'>
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
              <Card>
                <CardHeader>
                  <CardTitle>内容转化漏斗</CardTitle>
                  <CardDescription>
                    创作 → 发布 → 获得阅读 → 获得互动
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PublishFunnel />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>渠道阅读分布</CardTitle>
                  <CardDescription>各发布渠道带来的阅读量</CardDescription>
                </CardHeader>
                <CardContent>
                  <PlatformDistribution />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}
