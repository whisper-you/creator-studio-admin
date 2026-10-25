import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

/**
 * 轻量 Markdown 编辑器:编辑/预览双 Tab(移动端友好),
 * 预览用 react-markdown + GFM 渲染,样式走 typography prose。
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 8,
}: MarkdownEditorProps) {
  return (
    <Tabs defaultValue='edit' className='w-full'>
      <TabsList className='h-8'>
        <TabsTrigger value='edit' className='text-xs'>
          编辑
        </TabsTrigger>
        <TabsTrigger value='preview' className='text-xs'>
          预览
        </TabsTrigger>
      </TabsList>
      <TabsContent value='edit' className='mt-2'>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            placeholder ??
            '支持 Markdown 语法:## 标题、**加粗**、- 列表、`代码`…'
          }
          rows={rows}
          className='resize-y font-mono text-sm'
        />
      </TabsContent>
      <TabsContent value='preview' className='mt-2'>
        <div
          className={cn(
            'prose prose-sm max-w-none rounded-md border p-3 dark:prose-invert',
            'min-h-24'
          )}
        >
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <p className='text-muted-foreground'>(暂无内容)</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
