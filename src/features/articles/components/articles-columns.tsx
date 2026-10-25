import { format } from 'date-fns'
import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import {
  categoryMeta,
  platformMeta,
  statusMeta,
  statusToneClass,
} from '../data/data'
import { type Article } from '../data/schema'
import { ArticlesRowActions } from './articles-row-actions'

const fmtCount = (n: number) =>
  n >= 10000
    ? `${(n / 10000).toFixed(1)}w`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : `${n}`

const fmtDate = (d: Date) => {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return format(d, sameYear ? 'MM-dd' : 'yyyy-MM-dd')
}

export const articlesColumns: ColumnDef<Article>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='全选'
        className='translate-y-0.5'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='选择该行'
        className='translate-y-0.5'
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='标题' />
    ),
    meta: {
      className: 'ps-1 w-1/3 min-w-56',
      tdClassName: 'ps-4',
    },
    cell: ({ row }) => {
      return (
        <div className='flex min-w-0 flex-col gap-1.5 py-1'>
          {/* 标题独立一行,保证在任何缩放/列宽下都完整可见 */}
          <span className='max-w-full truncate font-medium'>
            {row.getValue('title')}
          </span>
          {row.original.tags.length > 0 && (
            <div className='flex flex-wrap items-center gap-1.5'>
              {row.original.tags.map((tag) => (
                <span
                  key={tag}
                  className='rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'
                >
                  # {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='状态' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-4' },
    cell: ({ row }) => {
      const status = statusMeta(row.getValue('status'))
      if (!status) return null
      return (
        <div className='flex w-25 items-center gap-2'>
          {status.icon && (
            <status.icon
              className={cn('size-4', statusToneClass[row.original.status])}
            />
          )}
          <span className='font-medium'>{status.label}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: 'category',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='分类' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-3' },
    cell: ({ row }) => {
      const category = categoryMeta(row.getValue('category'))
      if (!category) return null
      return (
        <div className='flex items-center gap-2'>
          {category.icon && (
            <category.icon className='size-4 text-muted-foreground' />
          )}
          <span>{category.label}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    id: 'platforms',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='渠道' />
    ),
    enableSorting: false,
    cell: ({ row }) => (
      <div className='flex items-center gap-1'>
        {row.original.platforms.map((p) => {
          const meta = platformMeta(p)
          if (!meta) return null
          return (
            <span
              key={p}
              title={meta.label}
              className='flex size-6 items-center justify-center rounded bg-muted'
            >
              <meta.icon className={`size-3.5 ${meta.color}`} />
            </span>
          )
        })}
      </div>
    ),
  },
  {
    accessorKey: 'views',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='阅读' />
    ),
    meta: { className: 'ps-1', tdClassName: 'ps-3' },
    cell: ({ row }) => (
      <div className='tabular-nums'>{fmtCount(row.getValue('views'))}</div>
    ),
  },
  {
    id: 'time',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='发布 / 排期' />
    ),
    accessorFn: (row) => row.publishedAt ?? row.scheduledAt,
    sortingFn: (rowA, rowB, columnId) => {
      const a = rowA.getValue<Date | undefined>(columnId)?.getTime() ?? 0
      const b = rowB.getValue<Date | undefined>(columnId)?.getTime() ?? 0
      return a - b
    },
    cell: ({ row }) => {
      const { status, publishedAt, scheduledAt } = row.original
      if (status === 'published' && publishedAt)
        return <span className='tabular-nums'>发布 {fmtDate(publishedAt)}</span>
      if (status === 'scheduled' && scheduledAt)
        return (
          <span className='text-blue-600 tabular-nums dark:text-blue-400'>
            排期 {fmtDate(scheduledAt)}
          </span>
        )
      return <span className='text-muted-foreground'>—</span>
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <ArticlesRowActions row={row} />,
  },
]
