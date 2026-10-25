import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ArticlesDialogs } from './components/articles-dialogs'
import { ArticlesPrimaryButtons } from './components/articles-primary-buttons'
import { ArticlesProvider } from './components/articles-provider'
import { ArticlesTable } from './components/articles-table'

export function Articles() {
  return (
    <ArticlesProvider>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>文章管理</h2>
            <p className='text-muted-foreground'>
              管理你的选题、草稿与发布节奏,支持按状态机流转。
            </p>
          </div>
          <ArticlesPrimaryButtons />
        </div>
        <ArticlesTable />
      </Main>

      <ArticlesDialogs />
    </ArticlesProvider>
  )
}
