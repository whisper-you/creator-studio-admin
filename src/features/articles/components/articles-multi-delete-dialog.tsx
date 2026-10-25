import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { sleep } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'

type ArticlesMultiDeleteDialogProps<TData> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: Table<TData>
  onDelete?: () => void
}

const CONFIRM_WORD = 'DELETE'

export function ArticlesMultiDeleteDialog<TData>({
  open,
  onOpenChange,
  table,
  onDelete,
}: ArticlesMultiDeleteDialogProps<TData>) {
  const [value, setValue] = useState('')

  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleDelete = () => {
    if (value.trim() !== CONFIRM_WORD) {
      toast.error(`请输入「${CONFIRM_WORD}」以确认操作。`)
      return
    }

    onOpenChange(false)

    toast.promise(sleep(800), {
      loading: '正在删除文章...',
      success: () => {
        onDelete?.()
        setValue('')
        table.resetRowSelection()
        return `已删除 ${selectedRows.length} 篇文章`
      },
      error: '出错了',
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      form='articles-multi-delete-form'
      disabled={value.trim() !== CONFIRM_WORD}
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='me-1 inline-block stroke-destructive'
            size={18}
          />{' '}
          删除 {selectedRows.length} 篇文章
        </span>
      }
      desc={
        <form
          id='articles-multi-delete-form'
          onSubmit={(e) => {
            e.preventDefault()
            handleDelete()
          }}
          className='space-y-4'
        >
          <p className='mb-2'>
            确定要删除选中的文章吗?
            <br />
            此操作无法撤销。
          </p>

          <Label className='my-4 flex flex-col items-start gap-1.5'>
            <span>输入「{CONFIRM_WORD}」以确认:</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`输入「${CONFIRM_WORD}」以确认。`}
              autoFocus
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>警告!</AlertTitle>
            <AlertDescription>
              请谨慎操作,该操作无法回滚。
            </AlertDescription>
          </Alert>
        </form>
      }
      confirmText='删除'
      destructive
    />
  )
}
