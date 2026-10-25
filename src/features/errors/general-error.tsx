import { useNavigate, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
  error?: Error
}

export function GeneralError({
  className,
  minimal = false,
  error,
}: GeneralErrorProps) {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className={cn('h-svh w-full', className)}>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        {!minimal && (
          <h1 className='text-[7rem] leading-tight font-bold'>500</h1>
        )}
        <span className='font-medium'>哎呀,出了点问题 {`:')`}</span>
        <p className='text-center text-muted-foreground'>
          给你带来不便非常抱歉。
          <br />
          请稍后再试。
        </p>
        {import.meta.env.DEV && error && (
          <pre className='max-w-3xl overflow-auto rounded-md bg-muted p-4 text-start text-xs whitespace-pre-wrap'>
            {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        )}
        {!minimal && (
          <div className='mt-6 flex gap-4'>
            <Button variant='outline' onClick={() => history.go(-1)}>
              返回
            </Button>
            <Button onClick={() => navigate({ to: '/' })}>回到首页</Button>
          </div>
        )}
      </div>
    </div>
  )
}
