// 演示种子数据:与前端 src/features/articles/data/articles.ts 保持同一套题库,
// 用固定种子的伪随机保证每次建库数据一致。日期相对「当前时间」生成,
// 保证排期日历在任何时候打开都有数据。

const TITLE_POOL = [
  ['我用 React 19 的 use() 重构了数据请求层', 'tech'],
  ['TanStack Router 类型安全路由实战指南', 'tutorial'],
  ['AI 时代,程序员的护城河在哪里?', 'essay'],
  ['Vite 8 正式发布:打包速度再提升 40%', 'news'],
  ['从零搭建一个属于你的内容创作工作流', 'tutorial'],
  ['zustand persist 中间件源码解析', 'tech'],
  ['写作两年,我踩过的 12 个坑', 'essay'],
  ['Tailwind CSS v4 的引擎重写意味着什么', 'news'],
  ['如何用 zod 管理前后端共享类型', 'tutorial'],
  ['独立开发者的一天:7:00 - 23:00', 'essay'],
  ['Zsh 到 Fish:我的终端迁移记录', 'tech'],
  ['小红书运营入门:定位、选题与冷启动', 'tutorial'],
  ['Elasticsearch 还是 Meilisearch?站内搜索选型', 'tech'],
  ['一份可复用的技术文章写作模板', 'tutorial'],
  ['为什么我把博客从 Next.js 迁回了 Astro', 'tech'],
  ['GNOME 50 上手体验:更克制的 Linux 桌面', 'news'],
  ['副业收入破千后的复盘与取舍', 'essay'],
  ['React Server Components 常见误区盘点', 'tech'],
  ['给新人的 Git 协作生存指南', 'tutorial'],
  ['AI 辅助编程工具横评:谁最适合日常开发', 'news'],
  ['我的 2026 内容矩阵:一稿多发怎么做', 'tutorial'],
  ['深入理解 CSS Grid 的子网格', 'tech'],
  ['停更一个月后,数据告诉我什么', 'essay'],
  ['Deno 3 发布:npm 兼容与任务队列', 'news'],
  ['手把手教你部署一个静态博客到 Netlify', 'tutorial'],
  ['TypeScript 6.0 的类型系统变化解读', 'tech'],
  ['内容创作者需要懂一点数据分析', 'tutorial'],
  ['减法生活:我删掉了 80% 的订阅源', 'essay'],
  ['Bun vs Node:2026 年该怎么选', 'news'],
  ['做一个能自动生成封面图的命令行工具', 'tutorial'],
  ['浏览器存储的五个冷知识', 'tech'],
  ['从 Blogger 到自建站:十年建站史', 'essay'],
]

const TAG_POOL = [
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

const PLATFORMS = [
  'website',
  'wechat',
  'zhihu',
  'xiaohongshu',
  'juejin',
  'bilibili',
]

// mulberry32:确定性伪随机
function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const daysFromNow = (days, hour = 20) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

export function buildSeedArticles() {
  const rnd = mulberry32(20261026)
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
  const int = (min, max) => min + Math.floor(rnd() * (max - min + 1))
  const sample = (arr, n) => [...arr].sort(() => rnd() - 0.5).slice(0, n)

  return Array.from({ length: 56 }, (_, i) => {
    const [title, category] = TITLE_POOL[i % TITLE_POOL.length]
    const status =
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

    const platforms = sample(PLATFORMS, int(1, 4))
    const views =
      status === 'published'
        ? int(800, 52000)
        : status === 'archived'
          ? int(300, 12000)
          : 0

    return {
      id: `ART-${String(i + 1).padStart(3, '0')}`,
      title,
      excerpt: `《${title}》:一次可复用的实践复盘,含完整步骤与避坑清单。`,
      content: `这是《${title}》的正文内容。本文从实际场景出发,先讲清楚问题是什么,再给出可落地的解决方案,最后补充常见的坑与排查思路。`,
      status,
      category,
      tags: sample(TAG_POOL, int(1, 3)),
      platforms,
      views,
      likes: views > 0 ? Math.round(views * (0.02 + rnd() * 0.07)) : 0,
      scheduledAt:
        status === 'scheduled'
          ? daysFromNow(int(-5, 8), pick([12, 18, 20, 21]))
          : null,
      publishedAt:
        status === 'published' ? daysFromNow(-int(1, 60), int(9, 21)) : null,
      createdAt: daysFromNow(-int(10, 90), int(8, 22)),
      updatedAt: daysFromNow(-int(0, 7), int(8, 22)),
    }
  })
}
