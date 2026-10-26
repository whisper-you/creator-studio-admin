import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { type Locator, userEvent } from 'vitest/browser'
import { PasswordForm } from './password-form'

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  setAccessToken: vi.fn(),
  setUser: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  authApi: { changePassword: mocks.changePassword },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      auth: {
        setAccessToken: mocks.setAccessToken,
        setUser: mocks.setUser,
      },
    }),
}))

describe('PasswordForm', () => {
  let screen: RenderResult
  let currentPassword: Locator
  let newPassword: Locator
  let confirmPassword: Locator
  let submitButton: Locator

  beforeEach(async () => {
    vi.clearAllMocks()
    screen = await render(<PasswordForm />)
    currentPassword = screen.getByLabelText(/^当前密码$/)
    newPassword = screen.getByLabelText(/^新密码$/)
    confirmPassword = screen.getByLabelText(/^确认新密码$/)
    submitButton = screen.getByRole('button', { name: '修改密码' })
  })

  it('renders three password fields and the submit button', async () => {
    await expect.element(currentPassword).toBeInTheDocument()
    await expect.element(newPassword).toBeInTheDocument()
    await expect.element(confirmPassword).toBeInTheDocument()
    await expect.element(submitButton).toBeInTheDocument()
  })

  it('shows validation messages when submitting empty form', async () => {
    await userEvent.click(submitButton)

    await expect
      .element(screen.getByText('请输入当前密码。'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('请输入新密码。')).toBeInTheDocument()
    await expect
      .element(screen.getByText('请再次输入新密码。'))
      .toBeInTheDocument()
    expect(mocks.changePassword).not.toHaveBeenCalled()
  })

  it('rejects a new password shorter than 8 characters', async () => {
    await userEvent.fill(currentPassword, 'creator123')
    await userEvent.fill(newPassword, 'short12')
    await userEvent.fill(confirmPassword, 'short12')
    await userEvent.click(submitButton)

    await expect
      .element(screen.getByText('新密码至少需要 8 个字符。'))
      .toBeInTheDocument()
    expect(mocks.changePassword).not.toHaveBeenCalled()
  })

  it('rejects mismatched confirmation', async () => {
    await userEvent.fill(currentPassword, 'creator123')
    await userEvent.fill(newPassword, 'newpassword1')
    await userEvent.fill(confirmPassword, 'newpassword2')
    await userEvent.click(submitButton)

    await expect
      .element(screen.getByText('两次输入的新密码不一致。'))
      .toBeInTheDocument()
    expect(mocks.changePassword).not.toHaveBeenCalled()
  })

  it('rejects reusing the current password', async () => {
    await userEvent.fill(currentPassword, 'creator123')
    await userEvent.fill(newPassword, 'creator123')
    await userEvent.fill(confirmPassword, 'creator123')
    await userEvent.click(submitButton)

    await expect
      .element(screen.getByText('新密码不能与当前密码相同。'))
      .toBeInTheDocument()
    expect(mocks.changePassword).not.toHaveBeenCalled()
  })

  it('stores the rotated token and clears the form on success', async () => {
    mocks.changePassword.mockResolvedValue({
      accessToken: 'new-jwt-token',
      user: { id: 'U-1', email: 'a@b.com', name: '创作者', role: 'admin' },
    })

    await userEvent.fill(currentPassword, 'creator123')
    await userEvent.fill(newPassword, 'newpassword1')
    await userEvent.fill(confirmPassword, 'newpassword1')
    await userEvent.click(submitButton)

    await vi.waitFor(() =>
      expect(mocks.changePassword).toHaveBeenCalledWith(
        'creator123',
        'newpassword1'
      )
    )
    expect(mocks.setAccessToken).toHaveBeenCalledWith('new-jwt-token')
    expect(mocks.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'U-1' })
    )

    await vi.waitFor(() => expect(currentPassword).toHaveValue(''))
    expect(newPassword).toHaveValue('')
    expect(confirmPassword).toHaveValue('')
  })

  it('does not store a token when the server rejects the change', async () => {
    mocks.changePassword.mockRejectedValue(
      Object.assign(new Error('当前密码不正确'), {
        isAxiosError: true,
        response: { status: 400, data: { message: '当前密码不正确' } },
      })
    )

    await userEvent.fill(currentPassword, 'wrong-password')
    await userEvent.fill(newPassword, 'newpassword1')
    await userEvent.fill(confirmPassword, 'newpassword1')
    await userEvent.click(submitButton)

    await vi.waitFor(() => expect(mocks.changePassword).toHaveBeenCalledOnce())
    expect(mocks.setAccessToken).not.toHaveBeenCalled()
    expect(mocks.setUser).not.toHaveBeenCalled()
  })
})
