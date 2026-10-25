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
- 明暗主题、响应式、RTL、全局搜索命令面板(⌘K)、错误页、设置中心

### 真后端(Express + SQLite + JWT)
- `server/`:Express 5 + Node 内置 `node:sqlite`(零原生编译)+ jsonwebtoken + bcryptjs
- 登录签发 JWT(24h),文章接口全部走鉴权中间件;401 由前端统一处理
- 文章 CRUD + 服务端分页/筛选/搜索接口(`page/pageSize/status/category/filter`),PATCH 支持部分更新与 `null` 清空日期语义
- 前端策略:「服务端优先 + 离线降级」—— 启动时从 API 全量 hydrate,写操作乐观更新、失败自动回滚并提示;后端未启动时退回本地演示模式,页面照常可用

## 技术栈

Vite · React 19 · TypeScript · TanStack Router(类型安全路由 + URL Search 校验)· TanStack Table · Zustand · zod · react-hook-form · Recharts · Tailwind CSS v4 · shadcn/ui · Express 5 · node:sqlite · JWT

## 快速开始

```bash
pnpm install
pnpm dev:all    # 同时启动前端(5173)与后端 API(5180)
pnpm dev        # 仅前端(后端未启动时为离线演示模式)
pnpm server     # 仅后端 API
pnpm build      # 类型检查 + 生产构建
pnpm lint       # ESLint
```

演示账号:`creator@studio.dev` / `creator123`(后端首次启动时自动创建)。

## 目录结构

```text
├── server/              # Express + SQLite 后端
│   ├── index.js         # 应用入口(生产模式同端口托管 dist)
│   ├── db.js            # node:sqlite 建库 + 种子
│   └── routes/          # auth(JWT)/ articles(CRUD+分页筛选)
└── src/
    ├── features/        # 业务模块(厚)
    │   ├── articles/    # 文章管理:schema、状态机、store(服务端同步)、表格
    │   ├── schedule/    # 排期日历(原创)
    │   ├── channels/    # 发布渠道
    │   ├── materials/   # 素材库
    │   ├── dashboard/   # 数据总览
    │   └── auth/ errors/ settings/
    ├── routes/          # 路由文件(薄):只做 search 校验 + 挂 feature
    ├── lib/api.ts       # axios 客户端(JWT 拦截器 + zod 响应校验)
    ├── components/      # ui(shadcn)/ layout / data-table 通用零件
    └── stores/ hooks/ context/
```

## Roadmap

- [x] 真后端:Express + SQLite + JWT,文章 CRUD、分页筛选(2026-10-26)
- [ ] 评论审核模块
- [ ] Vitest 单测 + Playwright E2E + CI + Docker 部署
- [ ] Markdown 编辑器接入正文

## License

基于 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)(MIT)改造,原版权声明见 [LICENSE](./LICENSE)。
