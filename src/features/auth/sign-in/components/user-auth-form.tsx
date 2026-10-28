import { useState } from 'react'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { IconGithub } from '@/assets/brand-icons'
import { useAuthStore } from '@/stores/auth-store'
import { authApi } from '@/lib/api'
import { sleep, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? '请输入邮箱地址。' : undefined),
  }),
  password: z.string().min(1, '请输入密码。'),
})

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)

    toast.promise(
      (async () => {
        const { auth } = useAuthStore.getState()
        const targetPath = redirectTo || '/'

        try {
          // 先请求真实后端(Express + JWT)
          const res = await authApi.login(data.email, data.password)
          auth.setUser(res.user)
          auth.setAccessToken(res.accessToken)
          setIsLoading(false)
          navigate({ to: targetPath, replace: true })
          return `欢迎回来,${res.user.name || res.user.email}!`
        } catch (err) {
          setIsLoading(false)
          if (isAxiosError(err) && err.response) {
            // 后端在线但拒绝了请求(如 401)——不降级,把原因报给用户
            const message =
              (err.response.data as { message?: string })?.message ?? '登录失败'
            throw new Error(message, { cause: err })
          }

          // 后端未启动:离线演示模式(保留 mock 鉴权)
          await sleep(1200)
          auth.setUser({
            id: 'ACC001',
            email: data.email,
            name: '离线演示用户',
          })
          auth.setAccessToken('mock-access-token')
          navigate({ to: targetPath, replace: true })
          toast.message('离线演示模式', {
            description:
              '后端未启动,数据仅保存在本地;运行 pnpm dev:all 可启用完整功能。',
          })
          return `欢迎回来,${data.email}!`
        }
      })(),
      {
        loading: '正在登录...',
        success: (msg) => msg,
        error: (err: Error) => err.message,
      }
    )
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>邮箱</FormLabel>
              <FormControl>
                <Input placeholder='name@example.com' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem className='relative'>
              <FormLabel>密码</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
              <Link
                to='/forgot-password'
                className='absolute inset-e-0 -top-0.5 text-sm font-medium text-muted-foreground hover:opacity-75'
              >
                忘记密码?
              </Link>
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
          登录
        </Button>

        <div className='relative my-2'>
          <div className='absolute inset-0 flex items-center'>
            <span className='w-full border-t' />
          </div>
          <div className='relative flex justify-center text-xs uppercase'>
            <span className='bg-background px-2 text-muted-foreground'>
              或使用第三方登录
            </span>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-2'>
          <Button variant='outline' type='button' disabled={isLoading}>
            <IconGithub className='h-4 w-4' /> GitHub
          </Button>
        </div>
      </form>
    </Form>
  )
}
