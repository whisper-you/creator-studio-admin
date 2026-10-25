import { faker } from '@faker-js/faker'
import {
  ARTICLE_CATEGORIES,
  ARTICLE_PLATFORMS,
  type Article,
  type ArticleCategory,
  type ArticlePlatform,
  type ArticleStatus,
} from './schema'

// 固定随机种子,保证每次刷新 mock 数据一致
faker.seed(20261026)

// 标题池:贴近「技术/教程/随笔/资讯」四类内容创作者的真实选题
const titlePool: { title: string; category: ArticleCategory }[] = [
  { title: '我用 React 19 的 use() 重构了数据请求层', category: 'tech' },
  { title: 'TanStack Router 类型安全路由实战指南', category: 'tutorial' },
  { title: 'AI 时代,程序员的护城河在哪里?', category: 'essay' },
  { title: 'Vite 8 正式发布:打包速度再提升 40%', category: 'news' },
  { title: '从零搭建一个属于你的内容创作工作流', category: 'tutorial' },
  { title: 'zustand persist 中间件源码解析', category: 'tech' },
  { title: '写作两年,我踩过的 12 个坑', category: 'essay' },
  { title: 'Tailwind CSS v4 的引擎重写意味着什么', category: 'news' },
  { title: '如何用 zod 管理前后端共享类型', category: 'tutorial' },
  { title: '独立开发者的一天:7:00 - 23:00', category: 'essay' },
  { title: 'Zsh 到 Fish:我的终端迁移记录', category: 'tech' },
  { title: '小红书运营入门:定位、选题与冷启动', category: 'tutorial' },
  { title: 'Elasticsearch 还是 Meilisearch?站内搜索选型', category: 'tech' },
  { title: '一份可复用的技术文章写作模板', category: 'tutorial' },
  { title: '为什么我把博客从 Next.js 迁回了 Astro', category: 'tech' },
  { title: 'GNOME 50 上手体验:更克制的 Linux 桌面', category: 'news' },
  { title: '副业收入破千后的复盘与取舍', category: 'essay' },
  { title: 'React Server Components 常见误区盘点', category: 'tech' },
  { title: '给新人的 Git 协作生存指南', category: 'tutorial' },
  { title: 'AI 辅助编程工具横评:谁最适合日常开发', category: 'news' },
  { title: '我的 2026 内容矩阵:一稿多发怎么做', category: 'tutorial' },
  { title: '深入理解 CSS Grid 的子网格', category: 'tech' },
  { title: '停更一个月后,数据告诉我什么', category: 'essay' },
  { title: 'Deno 3 发布:npm 兼容与任务队列', category: 'news' },
  { title: '手把手教你部署一个静态博客到 Netlify', category: 'tutorial' },
  { title: 'TypeScript 6.0 的类型系统变化解读', category: 'tech' },
  { title: '内容创作者需要懂一点数据分析', category: 'tutorial' },
  { title: '减法生活:我删掉了 80% 的订阅源', category: 'essay' },
  { title: 'Bun vs Node:2026 年该怎么选', category: 'news' },
  { title: '做一个能自动生成封面图的命令行工具', category: 'tutorial' },
  { title: '浏览器存储的五个冷知识', category: 'tech' },
  { title: '从 Blogger 到自建站:十年建站史', category: 'essay' },
]

const tagPool = [
  'AI',
  '前端',
  'React',
  '效率工具',
  '副业',
  '写作',
  '独立开发',
  '开源',
  '职业发展',
  '设计',
  '数据分析',
  '出海',
]

const contentParagraph = (title: string) =>
  `这是《${title}》的正文内容。本文从实际场景出发,先讲清楚问题是什么,再给出可落地的解决方案,最后补充常见的坑与排查思路。` +
  `写作的目的是把一次性的探索变成可检索的资产:当类似问题再次出现时,能直接把链接甩给未来的自己。` +
  `如果你在实践中有不同的思路,欢迎在评论区交流;本文也会随着工具链的演进持续更新。`

const pickPlatforms = (status: ArticleStatus): ArticlePlatform[] => {
  if (status === 'draft') return [faker.helpers.arrayElement(ARTICLE_PLATFORMS)]
  return faker.helpers.arrayElements(ARTICLE_PLATFORMS, {
    min: status === 'published' ? 2 : 1,
    max: 4,
  })
}

const daysFromNow = (days: number, hour = 20, minute = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d
}

export const articles: Article[] = Array.from({ length: 56 }, (_, i) => {
  const { title, category } = titlePool[i % titlePool.length]!
  // 状态分布:让列表、日历、总览都有数据可看
  const status: ArticleStatus =
    i < 20
      ? 'published'
      : i < 30
        ? 'draft'
        : i < 36
          ? 'scheduled'
          : i < 44
            ? 'in_review'
            : i < 50
              ? 'archived'
              : 'draft'

  const platforms = pickPlatforms(status)
  const createdAt = faker.date.recent({ days: 90, refDate: new Date() })
  const publishedAt =
    status === 'published'
      ? faker.date.recent({ days: 60, refDate: new Date() })
      : undefined
  // 已排期文章集中在「当前月份」附近,保证排期日历首屏就有内容
  const scheduledAt =
    status === 'scheduled'
      ? daysFromNow(
          i % 2 === 0
            ? faker.number.int({ min: -5, max: 5 })
            : faker.number.int({ min: 1, max: 8 }),
          faker.helpers.arrayElement([12, 18, 20, 21])
        )
      : undefined

  const views =
    status === 'published'
      ? faker.number.int({ min: 800, max: 52000 })
      : status === 'archived'
        ? faker.number.int({ min: 300, max: 12000 })
        : 0

  return {
    id: `ART-${String(i + 1).padStart(3, '0')}`,
    title,
    excerpt: `《${title}》:一次可复用的实践复盘,含完整步骤与避坑清单。`,
    content: contentParagraph(title),
    status,
    category,
    tags: faker.helpers.arrayElements(tagPool, { min: 1, max: 3 }),
    platforms,
    views,
    likes: views > 0 ? Math.round(views * faker.number.float({ min: 0.02, max: 0.09 })) : 0,
    scheduledAt,
    publishedAt,
    createdAt,
    updatedAt: faker.date.recent({ days: 7, refDate: new Date() }),
  }
})

// 导出几组常用派生数据,供日历/总览直接使用
export const scheduledArticles = articles.filter(
  (a) => a.status === 'scheduled' && a.scheduledAt
)

export { ARTICLE_CATEGORIES, ARTICLE_PLATFORMS }
