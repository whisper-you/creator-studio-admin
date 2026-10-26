import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { authApi } from '@/lib/api'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'
import { useArticlesStore } from '@/features/articles/store'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'

  // 刷新页面后用 token 恢复登录用户(/api/auth/me);并全局同步最新文章数据
  useEffect(() => {
    const { auth } = useAuthStore.getState()
    if (auth.accessToken && !auth.user) {
      authApi
        .me()
        .then(auth.setUser)
        .catch(() => auth.reset())
    }

    // 全局同步文章数据(无论从哪个页面进入后台均完成 hydrate)
    void useArticlesStore.getState().hydrate()
  }, [])

  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              // Set content container, so we can use container queries
              '@container/content',

              // If layout is fixed, set the height
              // to 100svh to prevent overflow
              'has-data-[layout=fixed]:h-svh',

              // If layout is fixed and sidebar is inset,
              // set the height to 100svh - spacing (total margins) to prevent overflow
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
            )}
          >
            {children ?? <Outlet />}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  )
}
