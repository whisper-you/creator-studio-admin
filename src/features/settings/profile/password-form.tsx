import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { authApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { PasswordInput } from '@/components/password-input'

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, '请输入当前密码。'),
    newPassword: z
      .string()
      .min(1, '请输入新密码。')
      .min(8, '新密码至少需要 8 个字符。')
      .max(72, '新密码不能超过 72 个字符。'),
    confirmPassword: z.string().min(1, '请再次输入新密码。'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '两次输入的新密码不一致。',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: '新密码不能与当前密码相同。',
    path: ['newPassword'],
  })

type PasswordFormValues = z.infer<typeof passwordFormSchema>

export function PasswordForm() {
  const setAccessToken = useAuthStore((s) => s.auth.setAccessToken)
  const setUser = useAuthStore((s) => s.auth.setUser)

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onChange',
  })

  async function onSubmit(data: PasswordFormValues) {
    try {
      const { accessToken, user } = await authApi.changePassword(
        data.currentPassword,
        data.newPassword
      )
      // 旧 token 已随 token_version 递增失效,换用服务端签发的新 token
      setAccessToken(accessToken)
      setUser(user)
      form.reset()
      toast.success('密码已更新,其他设备需重新登录')
    } catch (err) {
      if (isAxiosError(err) && err.response) {
        toast.error(
          (err.response.data as { message?: string })?.message ?? '修改密码失败'
        )
      } else {
        toast.error('后端未启动,密码未修改')
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <FormField
          control={form.control}
          name='currentPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>当前密码</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete='current-password'
                  placeholder='输入当前密码'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='newPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>新密码</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete='new-password'
                  placeholder='至少 8 个字符'
                  {...field}
                />
              </FormControl>
              <FormDescription>
                修改后当前登录保持有效,其他设备的登录状态会全部失效。
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirmPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>确认新密码</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete='new-password'
                  placeholder='再次输入新密码'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit'>修改密码</Button>
      </form>
    </Form>
  )
}
