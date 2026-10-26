import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ArticlesDialogs } from './components/articles-dialogs'
import { ArticlesPrimaryButtons } from './components/articles-primary-buttons'
import { ArticlesProvider, useArticles } from './components/articles-provider'
import { ArticlesTable } from './components/articles-table'
import { parseMarkdownFile } from './utils/parse-markdown'

function ArticlesView() {
  const { setOpen, setInitialImport } = useArticles()
  const [isDraggingOverPage, setIsDraggingOverPage] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current += 1
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOverPage(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDraggingOverPage(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDraggingOverPage(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const mdFiles = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(md|markdown)$/i.test(f.name)
      )
      if (mdFiles.length > 0) {
        const parsed = await Promise.all(
          mdFiles.map(async (f) => {
            const text = await f.text()
            return parseMarkdownFile(f.name, text, f.size)
          })
        )
        setInitialImport(parsed)
        setOpen('import')
        toast.success(`成功解析 ${parsed.length} 个 Markdown 文件`)
      }
    }
  }

  return (
    <div
      className='relative flex min-h-0 flex-1 flex-col'
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 页面全局拖拽释放遮罩 */}
      {isDraggingOverPage && (
        <div className='pointer-events-none absolute inset-0 z-50 m-2 flex animate-in flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/85 text-center backdrop-blur-sm duration-150 zoom-in-95 fade-in'>
          <div className='mb-3 rounded-full bg-primary/10 p-4 text-primary shadow-lg'>
            <Upload className='h-10 w-10 animate-bounce' />
          </div>
          <h3 className='text-xl font-bold tracking-tight'>
            松开鼠标，立即批量导入 Markdown 文章
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
            自动解析 Frontmatter YAML 头信息并生成待导入预览
          </p>
        </div>
      )}

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
    </div>
  )
}

export function Articles() {
  return (
    <ArticlesProvider>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <ArticlesView />
    </ArticlesProvider>
  )
}
