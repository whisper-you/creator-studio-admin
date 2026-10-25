import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { type Locator, userEvent } from 'vitest/browser'
import { SignUpForm } from './sign-up-form'

const FORM_MESSAGES = {
  emailEmpty: '请输入邮箱地址。',
  passwordEmpty: '请输入密码。',
  confirmPasswordEmpty: '请再次输入密码。',
  passwordMismatch: '两次输入的密码不一致。',
} as const

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setUser: vi.fn(),
  setAccessToken: vi.fn(),
  register: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  authApi: { register: mocks.register },
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
  }
})

describe('SignUpForm', () => {
  let screen: RenderResult
  let nameInput: Locator
  let emailInput: Locator
  let passwordInput: Locator
  let confirmPasswordInput: Locator
  let submitButton: Locator

  beforeEach(async () => {
    vi.clearAllMocks()
    screen = await render(<SignUpForm />)
    nameInput = screen.getByRole('textbox', { name: /^昵称$/ })
    emailInput = screen.getByRole('textbox', { name: /^邮箱$/ })
    passwordInput = screen.getByLabelText(/^密码$/, { exact: true })
    confirmPasswordInput = screen.getByLabelText(/^确认密码$/)
    submitButton = screen.getByRole('button', { name: /^创建账号$/ })
  })

  it('renders fields and submit button', async () => {
    await expect.element(nameInput).toBeInTheDocument()
    await expect.element(emailInput).toBeInTheDocument()
    await expect.element(passwordInput).toBeInTheDocument()
    await expect.element(confirmPasswordInput).toBeInTheDocument()
    await expect.element(submitButton).toBeInTheDocument()
  })

  it('shows validation messages when submitting empty form', async () => {
    await userEvent.click(submitButton)

    await expect
      .element(screen.getByText(FORM_MESSAGES.emailEmpty))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(FORM_MESSAGES.passwordEmpty))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(FORM_MESSAGES.confirmPasswordEmpty))
      .toBeInTheDocument()
  })

  it('shows a mismatch error when passwords do not match', async () => {
    await userEvent.fill(nameInput, '测试用户')
    await userEvent.fill(emailInput, 'a@b.com')
    await userEvent.fill(passwordInput, '1234567')
    await userEvent.fill(confirmPasswordInput, '7654321')

    await userEvent.click(submitButton)
    await expect
      .element(screen.getByText(FORM_MESSAGES.passwordMismatch))
      .toBeInTheDocument()
  })

  it('registers, stores the session, and navigates on success', async () => {
    mocks.register.mockResolvedValue({
      accessToken: 'jwt-token',
      user: { id: 'ACC-9', email: 'a@b.com', name: '测试用户' },
    })

    await userEvent.fill(nameInput, '测试用户')
    await userEvent.fill(emailInput, 'a@b.com')
    await userEvent.fill(passwordInput, '1234567')
    await userEvent.fill(confirmPasswordInput, '1234567')
    await userEvent.click(submitButton)

    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalledOnce())
    expect(mocks.register.mock.calls[0]?.slice(0, 3)).toEqual([
      'a@b.com',
      '1234567',
      '测试用户',
    ])
    expect(mocks.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com', name: '测试用户' })
    )
    expect(mocks.setAccessToken).toHaveBeenCalledWith('jwt-token')
    await vi.waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: '/', replace: true })
    )
  })

  it('surfaces server errors without navigating on duplicate email', async () => {
    const axiosLikeError = Object.assign(new Error('该邮箱已被注册'), {
      isAxiosError: true,
      response: { status: 409, data: { message: '该邮箱已被注册' } },
    })
    mocks.register.mockRejectedValue(axiosLikeError)

    await userEvent.fill(nameInput, '测试用户')
    await userEvent.fill(emailInput, 'taken@b.com')
    await userEvent.fill(passwordInput, '1234567')
    await userEvent.fill(confirmPasswordInput, '1234567')
    await userEvent.click(submitButton)

    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalledOnce())
    expect(mocks.setUser).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
