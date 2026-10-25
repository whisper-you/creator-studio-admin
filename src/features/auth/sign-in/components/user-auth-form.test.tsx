import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { type Locator, userEvent } from 'vitest/browser'
import { UserAuthForm } from './user-auth-form'

const FORM_MESSAGES = {
  emailEmpty: '请输入邮箱地址。',
  passwordEmpty: '请输入密码。',
} as const

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setUser: vi.fn(),
  setAccessToken: vi.fn(),
  login: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  authApi: { login: mocks.login },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    () => ({
      auth: {
        setUser: mocks.setUser,
        setAccessToken: mocks.setAccessToken,
      },
    }),
    {
      // 组件内部通过 useAuthStore.getState() 取方法
      getState: () => ({
        auth: {
          setUser: mocks.setUser,
          setAccessToken: mocks.setAccessToken,
        },
      }),
    }
  ),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    Link: ({
      children,
      to,
      className,
      ...rest
    }: {
      children?: React.ReactNode
      to: string
      className?: string
    }) => (
      <a href={to} className={className} {...rest}>
        {children}
      </a>
    ),
  }
})

vi.mock('@/lib/utils', async (orig) => ({
  ...(await orig()),
  sleep: vi.fn(() => Promise.resolve()),
}))

describe('UserAuthForm', () => {
  describe('Rendering without redirectTo', () => {
    let screen: RenderResult
    let emailInput: Locator
    let passwordInput: Locator
    let signInButton: Locator
    let forgotPasswordLink: Locator

    beforeEach(async () => {
      vi.clearAllMocks()
      screen = await render(<UserAuthForm />)
      emailInput = screen.getByRole('textbox', { name: /^邮箱$/ })
      passwordInput = screen.getByLabelText(/^密码$/)
      signInButton = screen.getByRole('button', { name: /^登录$/ })
      forgotPasswordLink = screen.getByText(/^忘记密码\?$/)
    })

    it('renders fields, submit button, and forgot password link', async () => {
      await expect.element(emailInput).toBeInTheDocument()
      await expect.element(passwordInput).toBeInTheDocument()
      await expect.element(signInButton).toBeInTheDocument()
      await expect.element(forgotPasswordLink).toBeInTheDocument()
    })

    it('shows validation messages when submitting empty form', async () => {
      await userEvent.click(signInButton)

      await expect
        .element(screen.getByText(FORM_MESSAGES.emailEmpty))
        .toBeInTheDocument()
      await expect
        .element(screen.getByText(FORM_MESSAGES.passwordEmpty))
        .toBeInTheDocument()
    })

    it('calls the auth API, stores token, and navigates on success', async () => {
      mocks.login.mockResolvedValue({
        accessToken: 'jwt-token',
        user: { id: 'ACC-1', email: 'a@b.com', name: '创作者' },
      })

      await userEvent.fill(emailInput, 'a@b.com')
      await userEvent.fill(passwordInput, 'creator123')
      await userEvent.click(signInButton)

      await vi.waitFor(() => expect(mocks.setUser).toHaveBeenCalledOnce())
      expect(mocks.setUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.com', accountNo: 'ACC-1' })
      )
      expect(mocks.setAccessToken).toHaveBeenCalledWith('jwt-token')
      await vi.waitFor(() =>
        expect(mocks.navigate).toHaveBeenCalledWith({
          to: '/',
          replace: true,
        })
      )
    })

    it('surfaces the error and does not navigate on wrong credentials', async () => {
      const axiosLikeError = Object.assign(new Error('邮箱或密码错误'), {
        isAxiosError: true,
        response: { status: 401, data: { message: '邮箱或密码错误' } },
      })
      mocks.login.mockRejectedValue(axiosLikeError)

      await userEvent.fill(emailInput, 'a@b.com')
      await userEvent.fill(passwordInput, 'wrong-password')
      await userEvent.click(signInButton)

      await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledOnce())
      expect(mocks.setUser).not.toHaveBeenCalled()
      expect(mocks.navigate).not.toHaveBeenCalled()
    })

    it('falls back to offline demo auth when the backend is unreachable', async () => {
      // 无 response 属性的报错 = 网络不通 → 走离线演示模式
      mocks.login.mockRejectedValue(new Error('Network Error'))

      await userEvent.fill(emailInput, 'demo@b.com')
      await userEvent.fill(passwordInput, 'creator123')
      await userEvent.click(signInButton)

      await vi.waitFor(() => expect(mocks.setUser).toHaveBeenCalledOnce())
      expect(mocks.setAccessToken).toHaveBeenCalledWith('mock-access-token')
      expect(mocks.navigate).toHaveBeenCalledWith({ to: '/', replace: true })
    })
  })

  it('navigates to redirectTo when provided', async () => {
    vi.clearAllMocks()
    mocks.login.mockResolvedValue({
      accessToken: 'jwt-token',
      user: { id: 'ACC-1', email: 'a@b.com', name: '创作者' },
    })

    const { getByRole, getByLabelText } = await render(
      <UserAuthForm redirectTo='/settings' />
    )

    await userEvent.fill(getByRole('textbox', { name: /邮箱/ }), 'a@b.com')
    await userEvent.fill(getByLabelText('密码'), 'creator123')
    await userEvent.click(getByRole('button', { name: /登录/ }))

    await vi.waitFor(() => expect(mocks.setUser).toHaveBeenCalledOnce())

    await vi.waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/settings',
        replace: true,
      })
    )
  })
})
