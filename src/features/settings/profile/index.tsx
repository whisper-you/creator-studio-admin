import { useAuthStore } from '@/stores/auth-store'
import { ContentSection } from '../components/content-section'
import { ProfileForm } from './profile-form'

export function SettingsProfile() {
  // key 绑定用户 id:刷新后 /me 异步恢复用户,恢复完成时表单以真实值重挂载
  const authUserId = useAuthStore((s) => s.auth.user?.id)
  return (
    <ContentSection
      title='个人资料'
      desc='This is how others will see you on the site.'
    >
      <ProfileForm key={authUserId ?? 'anon'} />
    </ContentSection>
  )
}
