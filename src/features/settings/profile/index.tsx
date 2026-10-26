import { useAuthStore } from '@/stores/auth-store'
import { Separator } from '@/components/ui/separator'
import { ContentSection } from '../components/content-section'
import { PasswordForm } from './password-form'
import { ProfileForm } from './profile-form'

export function SettingsProfile() {
  // key 绑定用户 id:刷新后 /me 异步恢复用户,恢复完成时表单以真实值重挂载
  const authUserId = useAuthStore((s) => s.auth.user?.id)
  return (
    <ContentSection
      title='个人资料'
      desc='This is how others will see you on the site.'
    >
      <div className='space-y-10'>
        <ProfileForm key={authUserId ?? 'anon'} />
        <div>
          <h3 className='text-lg font-medium'>修改密码</h3>
          <p className='text-sm text-muted-foreground'>
            修改后当前会话自动续期,其他设备上的登录状态立即失效。
          </p>
          <Separator className='my-4' />
          <PasswordForm />
        </div>
      </div>
    </ContentSection>
  )
}
