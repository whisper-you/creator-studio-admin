import { useState } from 'react'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { IconGithub } from '@/assets/brand-icons'
import { useAuthStore } from '@/stores/auth-store'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'
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

const formSchema = z
  .object({
    name: z.string().min(1, '请输入昵称。').max(30, '昵称最多 30 个字符。'),
    email: z.email({
      error: (iss) => (iss.input === '' ? '请输入邮箱地址。' : undefined),
    }),
    password: z
      .string()
      .min(1, '请输入密码。')
      .refine(
        (value) => value.length === 0 || value.length >= 8,
        '密码至少需要 8 个字符。'
      ),
    confirmPassword: z.string().min(1, '请再次输入密码。'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致。',
    path: ['confirmPassword'],
  })

export function SignUpForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)

    toast.promise(
      (async () => {
        try {
          const res = await authApi.register(
            data.email,
            data.password,
            data.name
          )
          const { auth } = useAuthStore.getState()
          auth.setUser(res.user)
          auth.setAccessToken(res.accessToken)
          setIsLoading(false)
          navigate({ to: '/', replace: true })
          return `注册成功,欢迎加入,${res.user.name}!`
        } catch (err) {
          setIsLoading(false)
          if (isAxiosError(err) && err.response) {
            const message =
              (err.response.data as { message?: string })?.message ?? '注册失败'
            throw new Error(message, { cause: err })
          }
          // 后端未启动:离线演示模式只提示,不创建本地账号
          throw new Error('后端未启动,无法注册;请先运行 pnpm run server', {
            cause: err,
          })
        }
      })(),
      {
        loading: '正在创建账号...',
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
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>昵称</FormLabel>
              <FormControl>
                <Input placeholder='创作者昵称' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
            <FormItem>
              <FormLabel>密码</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirmPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>确认密码</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : <UserPlus />}
          创建账号
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
          <Button
            variant='outline'
            className='w-full'
            type='button'
            disabled={isLoading}
          >
            <IconGithub className='h-4 w-4' /> GitHub
          </Button>
        </div>
      </form>
    </Form>
  )
}
