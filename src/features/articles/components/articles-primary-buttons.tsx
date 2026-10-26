import { Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useArticles } from './articles-provider'

export function ArticlesPrimaryButtons() {
  const { setOpen } = useArticles()
  return (
    <div className='flex items-center gap-2'>
      <Button
        variant='outline'
        className='space-x-1'
        onClick={() => setOpen('import')}
      >
        <Upload size={16} />
        <span>导入 Markdown</span>
      </Button>
      <Button className='space-x-1' onClick={() => setOpen('create')}>
        <span>新建文章</span> <Plus size={18} />
      </Button>
    </div>
  )
}
