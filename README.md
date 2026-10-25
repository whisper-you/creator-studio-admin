# Creator Studio Admin · 内容创作管理平台

面向**独立内容创作者**的管理后台:文章管理、内容排期日历、多平台发布渠道绑定、数据总览。
基于 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) 二次开发,感谢原作者的 MIT 开源 UI 方案。

> 业务领域、数据模型、页面结构与交互均为本项目原创改造;上游项目仅作为 UI 壳与工程化的起点。

## 功能

### 文章管理(核心模块)
- 五态状态机:`draft → in_review → scheduled → published → archived`,行操作/批量操作均按状态机约束可流转的目标状态
- 表格全家桶:全局搜索、状态/分类 Faceted 筛选、分页、列显隐、行选择,筛选与分页状态**同步进 URL**,刷新/分享链接不丢
- 新建/编辑(抽屉表单 + zod 校验)、删除、二次确认、批量删除、CSV 导出
- 数据持久化:zustand + persist(localStorage),跨页面共享、刷新不丢

### 内容排期日历(原创功能)
- 月历视图,把左侧「待排期」文章**拖拽**到某一天完成排期,已排期卡片可继续拖动改期
- 与文章管理共享同一份数据:日历上改状态,文章列表实时同步
- **最佳发布时间建议**:基于历史阅读数据的规则模拟,在日期格里高亮推荐时段

### 数据总览
- 核心指标卡:文章总数 / 总阅读 / 总点赞 / 待发布
- 近 30 天阅读与点赞趋势(AreaChart)
- 创作 → 发布 → 阅读 → 互动**转化漏斗**(FunnelChart)
- 各渠道阅读分布、分类占比、最近发布列表

### 发布渠道
- 公众号 / 知乎 / 小红书 / 掘金 / B 站等渠道绑定管理,支持搜索、类型筛选、排序(筛选状态同步 URL)

### 其他
- 明暗主题、响应式、RTL、全局搜索命令面板(⌘K)、登录鉴权(mock JWT 过期时间)、错误页、设置中心

## 技术栈

Vite · React 19 · TypeScript · TanStack Router(类型安全路由 + URL Search 校验)· TanStack Table · Zustand · zod · react-hook-form · Recharts · Tailwind CSS v4 · shadcn/ui

## 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # 类型检查 + 生产构建
pnpm lint       # ESLint
```

演示账号:任意邮箱 + 7 位以上密码即可登录(mock 鉴权)。

## 目录结构

```text
src/
├── features/            # 业务模块(厚)
│   ├── articles/        # 文章管理:schema、状态机、store、表格
│   ├── schedule/        # 排期日历(原创)
│   ├── channels/        # 发布渠道
│   ├── materials/       # 素材库
│   ├── dashboard/       # 数据总览
│   ├── auth/ errors/ settings/
├── routes/              # 路由文件(薄):只做 search 校验 + 挂 feature
├── components/
│   ├── ui/              # shadcn/ui 组件(领域无关)
│   ├── layout/          # 侧边栏、头部等布局壳
│   └── data-table/      # 通用表格零件(工具栏/分页/筛选器)
├── stores/              # 全局状态(鉴权)
├── hooks/               # use-table-url-state 等
└── context/             # 主题、字体、方向、搜索
```

## Roadmap

- [ ] 真后端:Express + SQLite + JWT,文章/评论 CRUD、分页筛选
- [ ] 评论审核模块
- [ ] Vitest 单测 + Playwright E2E + CI + Docker 部署
- [ ] Markdown 编辑器接入正文

## License

基于 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)(MIT)改造,原版权声明见 [LICENSE](./LICENSE)。
