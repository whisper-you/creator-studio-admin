import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ArticlesDialogs } from '@/features/articles/components/articles-dialogs'
import { ArticlesProvider } from '@/features/articles/components/articles-provider'
import { ScheduleCalendar } from './components/schedule-calendar'
import { UnscheduledPool } from './components/unscheduled-pool'

/**
 * 内容排期日历(原创功能)。
 * 页面复用 ArticlesProvider / ArticlesDialogs:
 * 点击待排期卡片或日历卡片,都会打开统一的排期对话框。
 */
export function Schedule() {
  return (
    <ArticlesProvider>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 lg:flex-row'>
        {/* 移动端限高避免占满整屏;桌面端与日历等高排布 */}
        <div className='h-80 shrink-0 lg:h-auto lg:w-72'>
          <UnscheduledPool />
        </div>
        <ScheduleCalendar />
      </Main>

      <ArticlesDialogs />
    </ArticlesProvider>
  )
}
