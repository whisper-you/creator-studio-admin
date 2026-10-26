import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { nextArticleId } from '../data/schema'
import { useArticlesStore } from '../store'
import { ArticlesMutateDrawer } from './articles-mutate-drawer'
import { useArticles } from './articles-provider'
import { ArticlesScheduleDialog } from './articles-schedule-dialog'
import { ArticlesImportDialog } from './articles-import-dialog'

export function ArticlesDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useArticles()
  const addArticle = useArticlesStore((s) => s.addArticle)
  const updateArticles = useArticlesStore((s) => s.updateArticles)
  const deleteArticles = useArticlesStore((s) => s.deleteArticles)

  return (
    <>
      <ArticlesImportDialog
        key='article-import'
        open={open === 'import'}
        onOpenChange={(isOpen) => setOpen(isOpen ? 'import' : null)}
      />

      <ArticlesMutateDrawer
        key='article-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
        onSubmitData={(values, scheduled) => {
          const now = new Date()
          addArticle({
            id: nextArticleId(useArticlesStore.getState().articles),
            title: values.title,
            category: values.category,
            status: values.status,
            excerpt: values.excerpt,
            content: values.content,
            tags: values.tags
              .split(/[,,、;;\s]+/u)
              .map((t) => t.trim())
              .filter(Boolean),
            platforms: values.platforms,
            views: 0,
            likes: 0,
            scheduledAt: values.status === 'scheduled' ? scheduled : undefined,
            publishedAt: values.status === 'published' ? now : undefined,
            createdAt: now,
            updatedAt: now,
          })
          toast.success(`文章「${values.title}」已创建`)
        }}
      />

      {currentRow && (
        <>
          <ArticlesMutateDrawer
            key={`article-update-${currentRow.id}`}
            open={open === 'update'}
            onOpenChange={() => {
              setOpen('update')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
            onSubmitData={(values, scheduled) => {
              const now = new Date()
              updateArticles([currentRow.id], {
                title: values.title,
                category: values.category,
                status: values.status,
                excerpt: values.excerpt,
                content: values.content,
                tags: values.tags
                  .split(/[,,、;;\s]+/u)
                  .map((t) => t.trim())
                  .filter(Boolean),
                platforms: values.platforms,
                scheduledAt:
                  values.status === 'scheduled' ? scheduled : undefined,
                publishedAt:
                  values.status === 'published' && !currentRow.publishedAt
                    ? now
                    : currentRow.publishedAt,
                updatedAt: now,
              })
              toast.success(`文章 ${currentRow.id} 已更新`)
            }}
          />

          <ArticlesScheduleDialog
            key={`article-schedule-${currentRow.id}`}
            open={open === 'schedule'}
            onOpenChange={() => {
              setOpen('schedule')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
          />

          <ConfirmDialog
            key='article-delete'
            destructive
            open={open === 'delete'}
            onOpenChange={() => {
              setOpen('delete')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            handleConfirm={() => {
              setOpen(null)
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
              deleteArticles([currentRow.id])
              toast.success(`文章 ${currentRow.id} 已删除`)
            }}
            className='max-w-md'
            title={`删除这篇文章:${currentRow.title}?`}
            desc={
              <>
                你即将删除文章 <strong>{currentRow.id}</strong>。
                <br />
                此操作无法撤销。
              </>
            }
            confirmText='删除'
          />
        </>
      )}
    </>
  )
}
