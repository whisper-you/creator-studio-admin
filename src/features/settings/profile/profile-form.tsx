import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const profileFormSchema = z.object({
  username: z
    .string('请输入昵称。')
    .min(2, '昵称至少 2 个字符。')
    .max(30, '昵称最长 30 个字符。'),
  email: z.email({
    error: (iss) =>
      iss.input === undefined ? '请选择要展示的邮箱。' : undefined,
  }),
  bio: z.string().max(160).min(4),
  urls: z
    .array(
      z.object({
        value: z.url('请输入合法的 URL。'),
      })
    )
    .optional(),
})

type ProfileFormValues = z.infer<typeof profileFormSchema>

export function ProfileForm() {
  const authUser = useAuthStore((s) => s.auth.user)
  const setUser = useAuthStore((s) => s.auth.setUser)

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: authUser?.name ?? '',
      email: authUser?.email ?? '',
      bio: '内容创作者,专注技术与效率分享。',
      urls: [{ value: 'https://blog.example.com' }],
    },
    mode: 'onChange',
  })

  const { fields, append } = useFieldArray({
    name: 'urls',
    control: form.control,
  })

  async function onSubmit(data: ProfileFormValues) {
    try {
      // 昵称落库(/api/auth/me);bio/urls 暂为本地演示字段
      const user = await authApi.updateMe(data.username)
      setUser(user)
      toast.success('个人资料已更新')
    } catch (err) {
      if (isAxiosError(err) && err.response) {
        toast.error(
          (err.response.data as { message?: string })?.message ?? '更新失败'
        )
      } else {
        toast.error('后端未启动,资料更新未保存')
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <FormField
          control={form.control}
          name='username'
          render={({ field }) => (
            <FormItem>
              <FormLabel>昵称</FormLabel>
              <FormControl>
                <Input placeholder='创作者昵称' {...field} />
              </FormControl>
              <FormDescription>
                公开展示名称,保存后同步到侧边栏与后端账号。
              </FormDescription>
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='选择展示的邮箱' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {authUser?.email && (
                    <SelectItem value={authUser.email}>
                      {authUser.email}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>登录邮箱,暂不支持修改。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='bio'
          render={({ field }) => (
            <FormItem>
              <FormLabel>个人简介</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='简单介绍一下自己'
                  className='resize-none'
                  {...field}
                />
              </FormControl>
              <FormDescription>演示字段,暂未接入后端存储。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          {fields.map((field, index) => (
            <FormField
              control={form.control}
              key={field.id}
              name={`urls.${index}.value`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={cn(index !== 0 && 'sr-only')}>
                    链接
                  </FormLabel>
                  <FormDescription className={cn(index !== 0 && 'sr-only')}>
                    添加你的网站、博客或社交主页链接(演示字段)。
                  </FormDescription>
                  <FormControl className={cn(index !== 0 && 'mt-1.5')}>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='mt-2'
            onClick={() => append({ value: '' })}
          >
            添加链接
          </Button>
        </div>
        <Button type='submit'>更新资料</Button>
      </form>
    </Form>
  )
}
