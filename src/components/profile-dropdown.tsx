import { Link } from '@tanstack/react-router'
import { Shield, ShieldAlert, UserCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { authApi } from '@/lib/api'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'

const roleMeta: Record<UserRole, { label: string; badgeClass: string; icon: typeof Shield }> = {
  admin: {
    label: '系统管理员',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 border-red-200 dark:border-red-800',
    icon: ShieldAlert,
  },
  editor: {
    label: '审校主编',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    icon: Shield,
  },
  author: {
    label: '签约作者',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    icon: UserCheck,
  },
}

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((s) => s.auth.user)
  const setUser = useAuthStore((s) => s.auth.setUser)

  const currentRole: UserRole = user?.role || 'admin'
  const currentRoleInfo = roleMeta[currentRole] ?? roleMeta.admin

  const handleSwitchRole = async (targetRole: UserRole) => {
    try {
      await authApi.updateRole(targetRole)
      if (user) {
        setUser({ ...user, role: targetRole })
      }
      toast.success(`角色权限已切换至「${roleMeta[targetRole].label}」`)
    } catch (_err) {
      if (user) {
        setUser({ ...user, role: targetRole })
      }
      toast.success(`演示模式：已切换至「${roleMeta[targetRole].label}」视角`)
    }
  }

  const initials = user?.name ? user.name.slice(0, 2).toUpperCase() : 'CS'

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
            <Avatar className='h-8 w-8'>
              <AvatarImage src='/avatars/01.png' alt='avatar' />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-60' align='end' forceMount>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col gap-1.5'>
              <div className='flex items-center justify-between'>
                <p className='text-sm leading-none font-medium truncate max-w-32'>
                  {user?.name || '创作者'}
                </p>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${currentRoleInfo.badgeClass}`}
                >
                  {currentRoleInfo.label}
                </span>
              </div>
              <p className='text-xs leading-none text-muted-foreground truncate'>
                {user?.email || 'creator@studio.dev'}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to='/settings'>
                个人中心
                <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to='/settings'>
                设置
                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>

            {/* RBAC 角色模拟切换 */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className='gap-2'>
                <Users className='size-3.5 text-muted-foreground' />
                <span>协同角色切换</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className='w-44'>
                <DropdownMenuItem
                  onClick={() => handleSwitchRole('admin')}
                  className={currentRole === 'admin' ? 'font-semibold text-primary' : ''}
                >
                  <ShieldAlert className='size-3.5 text-red-500 mr-1' />
                  系统管理员
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSwitchRole('editor')}
                  className={currentRole === 'editor' ? 'font-semibold text-primary' : ''}
                >
                  <Shield className='size-3.5 text-blue-500 mr-1' />
                  审校主编
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSwitchRole('author')}
                  className={currentRole === 'author' ? 'font-semibold text-primary' : ''}
                >
                  <UserCheck className='size-3.5 text-emerald-500 mr-1' />
                  签约作者
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            退出登录
            <DropdownMenuShortcut className='text-current'>
              ⇧⌘Q
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
