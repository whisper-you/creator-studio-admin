import { beforeEach, describe, expect, it, vi } from 'vitest'
import { articles as seedArticles } from './data/articles'
import type { Article } from './data/schema'
import { useArticlesStore } from './store'

// mock 掉 API 层:store 测试只关心「本地乐观更新 + 失败回滚」
const apiMocks = vi.hoisted(() => ({
  listAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateBulk: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  articlesApi: apiMocks,
}))

const base = (over: Partial<Article> = {}): Article => ({
  id: 'ART-001',
  title: '测试文章',
  excerpt: '',
  content: '',
  status: 'draft',
  category: 'tech',
  tags: [],
  platforms: ['website'],
  views: 0,
  likes: 0,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  ...over,
})

/** zustand 单例没有内置 reset:每个用例前显式把状态拨回初始值 */
function resetStore() {
  useArticlesStore.setState({ articles: seedArticles, mode: 'local' })
}

describe('useArticlesStore(离线 local 模式)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    resetStore()
  })

  it('默认是 local 模式,携带种子数据', () => {
    expect(useArticlesStore.getState().mode).toBe('local')
    expect(useArticlesStore.getState().articles.length).toBeGreaterThan(0)
  })

  it('hydrate 成功后切换为 server 模式并替换数据', async () => {
    apiMocks.listAll.mockResolvedValue([base({ id: 'ART-999' })])
    await useArticlesStore.getState().hydrate()
    expect(useArticlesStore.getState().mode).toBe('server')
    expect(useArticlesStore.getState().articles).toHaveLength(1)
  })

  it('hydrate 失败时保持 local 模式,不打断体验', async () => {
    apiMocks.listAll.mockRejectedValue(new Error('backend down'))
    await useArticlesStore.getState().hydrate()
    expect(useArticlesStore.getState().mode).toBe('local')
    expect(useArticlesStore.getState().articles.length).toBeGreaterThan(0)
  })
})

describe('useArticlesStore(server 模式:乐观更新与回滚)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    resetStore()
    apiMocks.listAll.mockResolvedValue([base()])
    void useArticlesStore.getState().hydrate()
  })

  it('addArticle:先本地生效,再同步后端', async () => {
    const created = base({ id: 'ART-777', title: '新文章' })

    useArticlesStore.getState().addArticle(created)
    expect(useArticlesStore.getState().articles[0]?.id).toBe('ART-777')
    await vi.waitFor(() => expect(apiMocks.create).toHaveBeenCalled())
    expect(apiMocks.create.mock.calls[0]?.[0].id).toBe('ART-777')
  })

  it('addArticle:后端失败时回滚本地状态', async () => {
    apiMocks.create.mockRejectedValue(new Error('network'))

    useArticlesStore.getState().addArticle(base({ id: 'ART-777' }))
    await vi.waitFor(() => {
      expect(
        useArticlesStore.getState().articles.some((a) => a.id === 'ART-777')
      ).toBe(false)
    })
    expect(useArticlesStore.getState().articles).toHaveLength(1)
  })

  it('deleteArticles:批量删除本地生效并同步', async () => {
    useArticlesStore.setState({
      articles: [base({ id: 'ART-001' }), base({ id: 'ART-002' })],
    })

    useArticlesStore.getState().deleteArticles(['ART-001', 'ART-002'])
    expect(useArticlesStore.getState().articles).toHaveLength(0)
    await vi.waitFor(() =>
      expect(apiMocks.delete).toHaveBeenCalledWith(['ART-001', 'ART-002'])
    )
  })

  it('transitionStatus:按状态机拒绝非法流转', () => {
    useArticlesStore.getState().transitionStatus(['ART-001'], 'published')
    // draft 不能直接发布,本地状态不变
    expect(useArticlesStore.getState().articles[0]?.status).toBe('draft')
    expect(apiMocks.update).not.toHaveBeenCalled()
  })

  it('transitionStatus:published 时自动写入 publishedAt 并清空排期', () => {
    useArticlesStore.setState({
      articles: [base({ status: 'scheduled', scheduledAt: new Date('2026-10-28') })],
    })

    useArticlesStore.getState().transitionStatus(['ART-001'], 'published')
    const after = useArticlesStore.getState().articles[0]
    expect(after?.status).toBe('published')
    expect(after?.publishedAt).toBeInstanceOf(Date)
    expect(after?.scheduledAt).toBeUndefined()
  })

  it('scheduleArticle:写入排期时间并流转为 scheduled(时间不被清成 0 点)', () => {
    const when = new Date(2026, 9, 28, 21, 0)

    useArticlesStore.getState().scheduleArticle('ART-001', when)
    const after = useArticlesStore.getState().articles[0]
    expect(after?.status).toBe('scheduled')
    expect(after?.scheduledAt?.getHours()).toBe(21)
  })

  it('unscheduleArticle:退回草稿并清空排期', () => {
    useArticlesStore.setState({
      articles: [base({ status: 'scheduled', scheduledAt: new Date('2026-10-28') })],
    })

    useArticlesStore.getState().unscheduleArticle('ART-001')
    const after = useArticlesStore.getState().articles[0]
    expect(after?.status).toBe('draft')
    expect(after?.scheduledAt).toBeUndefined()
    return vi.waitFor(() => expect(apiMocks.update).toHaveBeenCalled())
  })
})
