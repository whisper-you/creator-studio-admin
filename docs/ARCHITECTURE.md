# 系统架构与目录规范设计

本文档阐述 `creator-studio-admin` 的模块化分层设计原则与工程目录组织规范。

---

## 🏛️ 整体设计原则

1. **高内聚、低耦合（Feature-First / DDD）**：
   - 业务能力按领域切片归入 `src/features/<feature>/`。
   - 属于特定业务领域（如文章专用的 AI 助手、排版引擎、Markdown 解析）的工具收纳于自身模块目录 `src/features/<feature>/utils/`，而非污染全局公共库。
2. **三层后端架构（Route - Service - DB）**：
   - `server/routes/`：专注于 HTTP 请求参数校验（Zod）、鉴权守卫与状态码返回。
   - `server/services/`：封装复杂业务逻辑（如 Webhook 广播引擎、发布调度 Worker）。
   - `server/db/`：管理 SQLite 数据库连接、WAL 模式配置、结构迁移与数据种子。
3. **环境与数据持久化隔离**：
   - 数据（`server/data/`）与本地图床（`uploads/`）作为外部挂载卷独立保存，代码与存储绝对分离。
   - 自动化测试在执行结束时自动清理产生的临时素材文件，确保工作区干净。

---

## 📂 核心工程目录全景

```text
creator-studio-admin/
├── docs/                         # 规范文档中心
│   ├── ARCHITECTURE.md           # 架构设计与规范（本文档）
│   └── ROADMAP.md                # 演进路线图与历史里程碑
├── server/                       # 生产级轻量后端服务
│   ├── index.js                  # 应用入口、单容器静态托管、调度器挂载
│   ├── db/                       # 数据持久化层
│   │   ├── index.js              # node:sqlite 原生数据库初始化与事务封装
│   │   └── seed.js               # 确定性种子数据生成算法
│   ├── services/                 # 核心业务服务层
│   │   ├── distribution.js       # 多平台 Webhook 分发与通道拟真引擎
│   │   └── scheduler.js          # 定时发布自动调度引擎 (Worker)
│   ├── routes/                   # RESTful API 控制器路由层
│   │   ├── auth.js               # 登录/注册/JWT 签发/RBAC 角色流转
│   │   ├── articles.js           # 文章全功能 CRUD/分页/筛选/批量操作
│   │   ├── channels.js           # 渠道绑定与 Webhook 连通性测试探针
│   │   ├── materials.js          # 本地图床素材上传与列表管理
│   │   ├── distribution.js       # 渠道分发日志查询与手动触发
│   │   ├── comments.js           # 读者评论审核流
│   │   └── stats.js              # 数据看板时序与多维统计
│   └── __tests__/                # 后端自动化测试套件
│       └── api.test.js           # 完整 Express API 集成测试
├── src/                          # 现代化前端工程
│   ├── features/                 # 业务能力切片（Domain-Driven）
│   │   ├── articles/             # 文章管理领域
│   │   │   ├── components/       # 文章表格、编辑抽屉、导入弹窗、Markdown 编辑器
│   │   │   ├── data/             # 文章 Schema 校验与数据源
│   │   │   ├── utils/            # 🌟 文章创作核心引擎
│   │   │   │   ├── ai-assistant.ts     # 本地启发式标题/摘要/标签算法
│   │   │   │   ├── wechat-formatter.ts # 微信公众号与知乎内联排版引擎
│   │   │   │   ├── parse-markdown.ts   # Frontmatter YAML 解析器
│   │   │   │   ├── export-article.ts   # Markdown / A4 PDF 导出器
│   │   │   │   └── download-csv.ts     # CSV 报表导出器
│   │   │   └── store.ts          # 文章持久化与乐观更新 Store
│   │   ├── schedule/             # 内容排期日历模块
│   │   ├── channels/             # 渠道绑定与 Webhook 配置模块
│   │   ├── materials/            # 本地自托管素材库模块
│   │   ├── dashboard/            # 综合数据看板与时序走势
│   │   ├── comments/             # 读者留言审核模块
│   │   ├── auth/                 # 认证与登录界面
│   │   ├── errors/               # 403 / 404 / 500 错误兜底页
│   │   └── settings/             # 个人配置与偏好设置
│   ├── lib/                      # 全局底层基础设施
│   │   ├── api.ts                # Axios 客户端封装（JWT 拦截与错误映射）
│   │   ├── utils.ts              # Tailwind 类名合并（cn）等底层通用工具
│   │   ├── cookies.ts            # Cookie 存储操作
│   │   └── handle-server-error.ts# 统一服务端错误弹窗处理
│   ├── components/               # 通用 UI 组件
│   │   ├── ui/                   # 基于 Radix UI 的原子设计组件 (shadcn)
│   │   ├── layout/               # 布局外框 (Header, Sidebar, Main)
│   │   └── data-table/           # 通用表格零件 (分页, 视图选项, 筛选)
│   └── stores/                   # 全局跨模块状态 (auth-store 等)
└── uploads/                      # 本地自托管图床静态持久化目录
```
