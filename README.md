# 🎨 Creator Studio Admin · 内容创作管理平台

<div align="center">

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4?style=flat-square&logo=tailwindcss)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express)
![SQLite](https://img.shields.io/badge/SQLite-node:sqlite-003B57?style=flat-square&logo=sqlite)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)
![Tests](https://img.shields.io/badge/Tests-148%20Passed-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

<p align="center">
  <b>面向独立创作者与新媒体团队的一站式内容创作、本地图床、定时排期、排版转化与多平台自动化分发管理工作台</b>
</p>

[✨ 核心痛点](#-解决的核心痛点) •
[🚀 功能全览](#-核心功能亮点) •
[🛠️ 技术架构](#-技术架构与选型) •
[⚡ 快速开始](#-快速开始) •
[🐳 生产部署](#-生产部署指南) •
[🧪 质量测试](#-测试与质量保障)

</div>

---

## 💡 解决的核心痛点

在当今多元化的新媒体生态中，独立内容创作者和新媒体运营团队常面临以下五大核心困扰：

1. **跨平台排版成本极高**：微信公众号、知乎专栏、独立技术博客等各个平台渲染标准不一。创作者需在各后台间反复手动调格式、贴图，极易出现样式崩溃或图片外链失效。
2. **素材图床依赖外部服务与高额配置成本**：大多数 CMS 强制要求申请云厂商 OSS/S3 凭证并配置密钥，容易遭遇欠费拦截、外链防盗链失效或鉴权泄露风险。
3. **内容排期缺乏全局视角**：各渠道定时发布机制孤立，缺乏可视化的全局日历排期看板与统一的自动化定时调度中心。
4. **团队协作缺乏流程闭环**：个人作者与审核主编之间缺少轻量级、低门槛的 RBAC（角色权限）审批与状态机约束，容易发生未审误发。
5. **渠道分发与数据割裂**：发布后无法自动触发多平台通知（如博客 Webhook、工作群机器人提醒），阅读与互动数据分散无法统揽。

**Creator Studio Admin** 基于上述痛点而生，提供**零外部第三方账号依赖、开箱即用、前后端一体化**的全生命周期内容生产力平台。

---

## ✨ 核心功能亮点

### ✍️ 1. 现代化创作工作台 (Articles & Markdown Editor)

- **沉浸式双栏 Markdown 编辑器**：支持实时双向滚动预览、GFM 语法扩展（表格、删除线、任务列表）、代码高亮与字数/阅读时长自动统计。
- **本地自托管图床 (Zero-Config)**：
  - 支持快捷键 `Ctrl+V` 直接从剪贴板粘贴截图、文件拖拽导入或按钮上传。
  - 后端自动落盘至 `uploads/` 并同步入库素材库管理。
  - **离线降级机制**：无后端运行时无缝转为 Base64 Data URL 预览，写作体验不中断。
- **离线启发式 AI 写作助手**：
  - **5 大流派高爆标题**：基于正文特征毫秒级生成「好奇悬念向、精准数据向、直击痛点向、干货清单向、故事共鸣向」爆款标题候选，一键置入。
  - **智能摘要提炼**：自动过滤代码块与符号，提取 120-150 字精炼导语。
  - **关键词标签推荐**：自动萃取技术栈与核心关键词。
  - **100% 离线本地算法**：零外部 API Key，零推理成本，响应延迟 `< 10ms`。
- **多端真机排版实时预览**：
  - 🖥️ **Web 宽屏模式**：适合桌面端阅读与技术博客审阅。
  - 📱 **公众号手机端 (390px iPhone 外框)**：1:1 还原移动端微信图文沉浸式阅读感受。
  - 📰 **知乎专栏模式**：模拟中文知乎排版视觉。
- **一键内联富文本复制 (直接 Ctrl+V 到微信公众号 / 知乎)**：
  - 将 Markdown 转换为微信公众号与知乎后台完美识别的内联 CSS 样式。
  - 支持 **极客绿、商务蓝、极简灰** 3 种主流调色板主题。
  - 注入 `text/html` 与 `text/plain` 原生双通道剪贴板，后台直接粘贴不丢样式。
- **本地 Markdown 批量拖拽导入**：
  - 批量拖拽带有 Frontmatter（YAML 头信息）的 `.md` 文件至浏览器。
  - 智能解析提取 `title`、`category`、`tags`、`date`、`status`，支持一键表格预览与 SQLite 批量事务秒级入库。
- **全格式导出能力**：
  - 单篇与批量导出纯净 `.md` 文件（自动重构 Frontmatter 头信息）。
  - 全站文章元数据一键导出为 `.csv` 报表。
  - 独立排版纯净打印视图与无头 iframe 一键另存为 A4 PDF。

---

### 📅 2. 内容排期日历 (Schedule & Automation)

- **拖拽式排期看板**：左侧「待排期文章池」自由拖拽至月历指定日期格完成定档；已排期卡片可任意拖曳快速改期。
- **常驻后台定时发布调度器 (Worker)**：
  - Express 后端集成毫秒级自动化调度任务，严密监听排期时钟。
  - 预定时间到达后，状态机自动流转 `scheduled → published`。
  - 发布瞬间联动触发启用了 `auto_push` 的各渠道分发动作。
- **黄金发布时段建议**：基于历史阅读量与读者互动峰值规则，在日期网格中动态高亮最佳发布时间段。

---

### 🚀 3. 多平台 Webhook 自动化分发 (Distribution Engine)

- **真实 Webhook 外链广播**：
  - 支持为各渠道绑定真实 Webhook URL（如部署在 Vercel/Netlify 的自建博客、GitHub Actions Repository Dispatch、飞书/企业微信/钉钉群推送机器人）。
  - 发布文章时自动通过标准 JSON Payload 广播包含文章 ID、标题、摘要、标签与正文的数据包。
  - 服务端校验 Webhook 地址：仅允许 http/https、禁止内嵌凭据，始终拦截云元数据与链路本地地址；可选 `WEBHOOK_BLOCK_PRIVATE=true` 阻断私网，且不自动跟随重定向。Webhook 地址与分发目标仅对 admin/editor 可见。
- **内置渠道拟真分发**：
  - 针对微信、知乎、掘金、小红书等未配置外部 Hook 的渠道，提供高保真模拟分发逻辑（拟真网络耗时、生成模拟外链回执）。
- **连通性探针与分发日志追踪**：
  - 渠道管理面板支持一键发送 `ping` 测试探针，即时回显网络连通性与响应耗时。
  - `distribution_logs` 全流程日志归档：记录发布流水号、目标渠道、状态（`success` / `failed` / `simulated`）、耗时与返回载荷。

---

### 👥 4. 细粒度 RBAC 团队权限体系 (Multi-Role Collaboration)

- **三级角色架构**：
  | 角色 | 权限范围 |
  | :--- | :--- |
  | 👑 **超级管理员 (Admin)** | 全量管理权限（创建、直接发布、排期发布、删除、分发、系统设置与图床运维） |
  | ✍️ **主编/审批员 (Editor)** | 内容终审权限（可发布、排期、审核通过、执行各渠道分发；不可删除他人文章） |
  | 📝 **创作者 (Author)** | 创作与提交权限（仅可保存草稿 `draft` 或**提交审核 `in_review`**；无权越权发布、排期或物理删除） |
- **服务端强制校验**：所有写操作接口都会校验角色与文章归属（`author_id`），前端菜单隐藏只是体验层，越权请求会返回 403。
- **服务端状态机**：文章状态只能沿 `draft → in_review → scheduled → published → archived → draft` 流转（排期可从任意状态进入 `scheduled`），非法流转返回 409；批量更新中任意一条非法则整批拒绝，不会部分落库。
- **文章乐观锁**：更新携带读取时的 `version`，版本不一致返回 409 与最新版本号；前端自动刷新为服务端数据，避免多人协作时静默覆盖。批量更新同样支持版本映射，任一过期则整批回滚。
- **操作审计日志**：改密、角色变更、管理员重置密码/强制下线、文章状态变更/删除、渠道配置与手动分发都会写入 `audit_logs`；管理员可在「操作日志」页面按动作与操作者筛选追溯。
- **自助改密与令牌吊销**：登录后可在「设置 → 个人资料」修改密码；服务端校验当前密码并递增 `token_version`，该账号所有旧 JWT 立即失效，当前会话自动换发新 token，其他设备需重新登录。
- **短时令牌与静默续期**：access token 默认 15 分钟，refresh token 存于 HttpOnly + SameSite Cookie（默认 30 天）。前端在 401 时自动单飞刷新并重放请求；每次刷新轮换 refresh token，旧 token 被重放会吊销该用户全部会话。退出登录会同时吊销服务端会话。
- **用户与会话管理**：管理员可在「用户管理」中搜索账号、查看活跃会话数，并调整角色、停用/启用账号、重置密码或强制下线。角色变更立即生效（鉴权每次从数据库读取角色），无需对方重新登录；停用会递增 `token_version`、吊销全部 refresh token，目标账号立即掉线且无法登录，启用后恢复；重置密码会设置新密码并吊销会话；强制下线只吊销会话不改密码。所有操作均写入审计日志，且禁止对自己执行（改自己密码请走个人设置，退出自己请走登出）。
- **登录设备管理**：登录会话会记录 User-Agent 与 IP，「设置 → 个人资料」可查看全部有效设备（标记当前设备、最近活动时间），支持单独退出某一设备或一键退出其他所有设备；撤销立即生效并写入 `auth.session_revoke` / `auth.session_revoke_others` 审计。
- **安全边界加固**：Helmet 安全响应头（含 CSP）、CORS 白名单（默认仅同源）、登录/注册/改密限流；图床上传仅允许 PNG/JPEG/WebP/GIF 且单图不超过 5 MB，并校验文件头，详见 [生产环境边界说明](./docs/PRODUCTION.md)。
- **无缝身份切换器**：右上角个人头像下拉框提供一键切换 Admin / Editor / Author 角色，便于多角色流程验证。该功能默认仅在非生产环境开放；生产环境如需保留演示能力，可显式设置 `ALLOW_ROLE_SWITCH=true`。

---

### 📊 5. 数据看板与互动监控 (Analytics & Moderation)

- **多维动态时间走势**：支持在 **最近 7 天 / 30 天 / 90 天** 维度自由切换，阅读量、互动量与粉丝增长曲线联动渲染。
- **环比洞察与核心指标**：自动计算周环比（WoW）增长率，提供互动深度指标看板。
- **创作转化全链路漏斗**：直观展示「创作 → 发布 → 阅读 → 互动」各环节的漏斗留存率。
- **读者评论审核流**：集中展示各渠道留言，支持一键审核通过、驳回违规留言或删除，支持联表关联原文章。

---

## 🛠️ 技术架构与选型

本项目遵循 **「前后端同构轻量化、服务端优先、离线优雅降级、零外部强依赖」** 的架构哲学：

```text
creator-studio-admin/
├── server/                      # 极速轻量后端 (Express 5 + node:sqlite)
│   ├── index.js                 # 后端入口 & 静态托管 dist & 健康检查 & 优雅停机
│   ├── db/                      # node:sqlite 建表、迁移与确定性种子数据
│   ├── services/                # 业务服务层 (状态机 / 调度 / 分发 / 审计 / 安全 / 可观测性)
│   ├── routes/                  # RESTful API 路由模块 (auth, articles, channels, etc.)
│   └── __tests__/               # 服务端集成与专项测试
├── src/                         # 现代化前端 (React 19 + Vite 6 + Tailwind v4)
│   ├── features/                # 业务能力切片 (articles, schedule, channels, audit-logs...)
│   ├── lib/                     # 核心工具层 (API 客户端 / 文章 AI 助手 / 排版 / 导出)
│   ├── stores/                  # 全局状态管理 (Zustand + 持久化 + 服务端同步)
│   └── components/              # 基础 UI 部件 (shadcn/ui + Radix UI)
└── uploads/                     # 本地自托管图床持久化静态资源目录
```

### 核心技术栈清单

| 分层           | 技术选型                          | 说明                                                        |
| :------------- | :-------------------------------- | :---------------------------------------------------------- |
| **前端框架**   | React 19 + TypeScript 5           | 极致渲染性能，拥抱最新 React Hooks 与类型安全标准           |
| **构建工具**   | Vite 6 + `@tailwindcss/vite`      | 秒级冷启动与极速热重载，Tailwind CSS v4 现代样式引擎        |
| **路由与状态** | TanStack Router + Zustand         | 类型安全路由、URL Search 参数双向同步持久化、乐观更新       |
| **表格与展示** | TanStack Table + Recharts         | 高性能数据分页、列显隐、Faceted 筛选器与丰富图表可视化      |
| **UI 组件库**  | Radix UI + shadcn/ui + Lucide     | 优雅可访问的现代化设计系统，全面支持深色/浅色模式           |
| **服务端**     | Express 5 + Node.js `node:sqlite` | 采用 Node 内置原生 SQLite，**零原生编译 (Zero C++ Addons)** |
| **鉴权与加密** | JWT (jsonwebtoken) + bcryptjs     | 标准 Bearer Token 鉴权，密码强哈希存储                      |
| **安全防护**   | Helmet + express-rate-limit       | CSP 等安全响应头、CORS 白名单、认证端点限流                 |
| **测试套件**   | Vitest + Playwright + Coverage    | 包含前端组件浏览器测试与完整服务端 API 集成测试             |

---

## ⚡ 快速开始

### 1. 环境准备

确保您的本地环境中安装了以下基础工具：

- **Node.js** >= `20.12.0` (推荐 Node.js LTS 22，需支持原生 `node:sqlite`)
- **pnpm** >= `9.0.0` (推荐包管理器，亦支持 npm/yarn)

### 2. 获取代码与依赖安装

```bash
# 克隆仓库
git clone https://github.com/whisper-you/creator-studio-admin.git
cd creator-studio-admin

# 安装依赖
pnpm install
```

### 3. 环境配置

项目中提供了标准的配置文件模板：

```bash
cp .env.example .env
```

`.env` 默认配置如下：

```ini
# 前端请求后端 API 基础路径 (开发模式留空默认走 Vite 代理，独立部署时可填写如 http://localhost:5180)
VITE_API_BASE=

# 后端服务监听端口 (默认 5180)
API_PORT=5180

# JWT 鉴权密钥
# - 开发环境可留空,自动回退到内置开发密钥
# - 生产环境必填:至少 32 位随机字符串,可用 `openssl rand -hex 32` 生成
JWT_SECRET=

# 生产环境空库首次启动的管理员账号 (必须成对设置,密码至少 8 位)
# 已有数据库时可省略
ADMIN_EMAIL=
ADMIN_PASSWORD=
# ADMIN_NAME=管理员

# 是否注入演示数据 (文章/素材/评论与默认口令演示账号)
# 默认:开发/测试 true,生产 false。生产环境开启仅用于演示部署
# SEED_DEMO_DATA=false

# 跨域白名单 (逗号分隔)。默认:开发/测试放行本地 Vite,生产仅同源
# 前后端同源部署或使用 Vite 代理时无需配置
# CORS_ORIGINS=https://admin.example.com

# 反向代理层数 (如 Nginx 后设为 1),限流按真实客户端 IP 计数
# TRUST_PROXY=1

# 是否禁止 Webhook 指向本机/私网地址 (默认 false,允许内网接收端)
# WEBHOOK_BLOCK_PRIVATE=true

# 认证端点限流 (默认:登录 30 次/15 分钟,注册 5 次/小时,改密 10 次/15 分钟,刷新 120 次/15 分钟)
# AUTH_RATE_LIMIT_MAX=30
# REGISTER_RATE_LIMIT_MAX=5
# REFRESH_RATE_LIMIT_MAX=120

# 会话有效期 (access token 默认 15 分钟;refresh token 默认 30 天)
# ACCESS_TOKEN_TTL=15m
# REFRESH_TOKEN_TTL_DAYS=30
```

> refresh token 通过 HttpOnly Cookie 下发，生产环境强制 `Secure`，因此**线上必须启用 HTTPS**。

> `pnpm run server` 与 `pnpm start` 会自动加载根目录 `.env`（已存在于 shell 的环境变量优先）。

### 4. 启动开发服务

```bash
# 【推荐】一键同时启动前端 (5173) 与后端 API (5180)
pnpm dev:all

# 仅启动前端 (离线纯前端演示模式)
pnpm dev

# 仅启动后端 API 接口服务
pnpm run server
```

启动完成后，打开浏览器访问：**`http://localhost:5173`**

### 5. 默认内置演示账号（仅开发/演示环境）

非生产环境首次启动时会自动初始化 SQLite 数据库并注入演示数据：

- **超级管理员账号**：`creator@studio.dev`
- **默认密码**：`creator123`

> 生产环境默认不注入演示数据。空库首次启动必须通过 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 创建管理员，否则服务会拒绝启动；只有显式设置 `SEED_DEMO_DATA=true` 才会生成上述演示账号。

---

## 🐳 生产部署指南

本项目原生支持 **单容器全栈部署** 与 **传统 Node.js 主机部署** 两种形态。

> ⚠️ 上线前请先阅读 [生产环境边界说明](./docs/PRODUCTION.md)：当前架构为单机 SQLite + 单进程调度器 + 本地磁盘图床，适用于个人或小团队内部使用，不支持多副本水平扩容。

### 方式一：Docker Compose 一键部署 (强烈推荐)

项目已在 [`docker/`](./docker) 目录下提供多阶段构建镜像定义与容器编排文件。构建阶段编译前端静态资源，运行时阶段采用极简 Node.js Alpine 容器，同时托管后端 API 与前端产物。

```bash
# 0. 生成并导出生产密钥 (compose 会读取当前 shell 环境;缺失或过短会拒绝启动)
export JWT_SECRET=$(openssl rand -hex 32)

# 空库首次启动还需提供初始管理员 (已有数据库时可省略)
export ADMIN_EMAIL=ops@example.com
export ADMIN_PASSWORD='请替换为至少 8 位的强密码'

# 【方式 A】通过 npm scripts 一键启动
pnpm docker:up

# 【方式 B】直接使用 docker compose 指令
docker compose -f docker/compose.yaml up -d --build

# 查看运行状态与容器日志
docker compose -f docker/compose.yaml ps
pnpm docker:logs
```

访问地址：**`http://localhost:3000`**

#### 💾 数据卷持久化说明

Docker 编排配置中已对关键数据目录挂载了具名数据卷：

- `sqlite-data` 挂载至 `/app/server/data`：保障 SQLite 数据库文件在容器重建时不丢失。
- `uploads-data` 挂载至 `/app/uploads`：保障创作者上传的本地图床图片持久化保存。

---

### 方式二：单机 Node.js 原生部署 (PM2 / Systemd)

如需直接在 Linux 服务器上以 Node.js 进程运行：

```bash
# 1. 执行全量编译 (TypeScript 类型校验 + Vite 生产打包)
pnpm build

# 2. 启动生产单服务 (同端口 3000 同时托管 API 与 dist/ 静态前端)
export NODE_ENV=production
export API_PORT=3000
# 生成一次并妥善保存;重启时复用同一个值,避免已签发 token 失效
export JWT_SECRET=$(openssl rand -hex 32)
# 空库首次启动还需提供初始管理员 (已有数据库时可省略)
export ADMIN_EMAIL=ops@example.com
export ADMIN_PASSWORD='请替换为至少 8 位的强密码'
pnpm start
```

若使用 **PM2** 守护进程管理器：

```bash
pm2 start server/index.js --name "creator-studio" --env production
pm2 save
```

---

### 方式三：Nginx 反向代理配置参考

如需配合域名并配置 HTTPS 证书，可参考以下 Nginx 配置：

```nginx
server {
    listen 80;
    server_name studio.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name studio.yourdomain.com;

    ssl_certificate     /etc/nginx/ssl/studio.crt;
    ssl_certificate_key /etc/nginx/ssl/studio.key;

    # 启用 Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # 图床上传文件限制提升
    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🧪 测试与质量保障

项目实施严苛的代码质量与自动化测试工程规范：

```bash
# 执行后端 API 集成测试 (91 个用例覆盖登录鉴权、会话续期与登出、登录设备管理、改密吊销、管理员角色调整/停用启用/重置密码/强制下线、文章 CRUD/乐观锁、图床上传安全、Webhook 地址校验与字段可见性、RBAC、状态机、审计与自动分发)
pnpm test:server

# 执行全量代码静态规范检查 (ESLint 9)
pnpm lint

# 执行 TypeScript 编译与全局类型检查
pnpm build
```

当前测试运行结果：

- `server/__tests__/api.test.js`：91 个 API 接口、refresh token 轮换与重放拦截、登出吊销、改密吊销、登录设备列表与撤销、管理员角色调整/停用启用/重置密码/强制下线与会话失效、乐观锁冲突、上传校验、Webhook 地址校验与字段可见性、审计日志、状态机、RBAC 越权与自动分发过滤测试全部通过。
- `server/__tests__/webhook-url.test.js`：4 个 Webhook 协议、凭据、云元数据/链路本地与私网拦截测试全部通过。
- `server/__tests__/jwt-secret.test.js`：8 个 JWT 密钥解析与生产启动校验测试全部通过。
- `server/__tests__/seed-policy.test.js`：12 个种子数据策略、管理员引导与生产初始化测试全部通过。
- `server/__tests__/security.test.js`：12 个安全响应头、CORS 白名单、认证限流与请求体解析错误（400/413）测试全部通过。
- `server/__tests__/observability.test.js`：5 个健康检查、请求 ID 透传与 API 404 兜底测试全部通过。
- `src/features/articles/utils/parse-markdown.test.ts`：5 个 Frontmatter 解析与容错测试全部通过。
- `src/features/articles/utils/wechat-formatter.test.ts`：4 个内联富文本转换与主题样式测试全部通过。
- `src/features/articles/utils/ai-assistant.test.ts`：4 个本地启发式标题与摘要提取算法测试全部通过。
- `src/features/articles/utils/export-article.test.ts`：3 个 Markdown 与打印报表导出测试全部通过。
- **全套 148 项服务端/工具函数测试与 143 项前端浏览器测试全部通过，0 错误，0 警告。**

---

## 📂 项目工程目录全景

```text
├── docs/                       # 架构设计、生产边界与历史路线图文档
│   ├── ARCHITECTURE.md         # 架构分层与设计规范
│   ├── PRODUCTION.md           # 生产环境边界、备份与扩容说明
│   └── ROADMAP.md              # 功能演进里程碑
├── docker/                     # 生产容器化配置 (Dockerfile & compose.yaml)
├── server/                     # 服务端核心代码 (分层架构)
│   ├── index.js                # Express 入口 (单服务同端口托管 API 与前端)
│   ├── db/                     # 数据持久化层 (SQLite & 种子数据)
│   ├── services/               # 业务服务层 (分发引擎 & 定时发布 Worker & 状态机)
│   ├── routes/                 # 业务 API 路由层 (REST 控制器)
│   └── __tests__/              # 服务端集成测试
├── src/                        # 前端应用源码
│   ├── features/               # 业务领域切片 (DDD 架构)
│   │   ├── articles/           # 文章管理 (含专属 utils: AI 助手/排版/导出/解析)
│   │   ├── schedule/           # 拖拽排期日历与最佳时段
│   │   ├── channels/           # 渠道绑定与 Webhook 配置弹窗
│   │   ├── materials/          # 素材库与图片预览
│   │   ├── dashboard/          # 综合数据看板 (趋势图、环比卡片、漏斗)
│   │   └── comments/           # 读者评论审核流
│   ├── lib/                    # 全局底层基础设施 (API 客户端、通用 utils、Cookies)
│   └── stores/                 # 全局跨模块状态 Store
└── uploads/                    # 本地自托管图床文件上传目录
```

---

## 🗺️ 产品功能演进路线图 (Roadmap)

- [x] **基础设施全链路贯通**：Node.js 原生 SQLite 驱动、JWT 鉴权、无前端假数据驱动 (2026-10-26)
- [x] **第一梯队 (高频刚需)**：
  - [x] 本地 Markdown 批量拖拽导入与 Frontmatter 解析事务入库
  - [x] 微信公众号 / 知乎一键内联富文本排版复制 (多主题调色板)
  - [x] 后台常驻定时发布调度器 (Worker 毫秒级轮询)
  - [x] 多格式数据导出 (Markdown / CSV / 打印 A4 PDF)
- [x] **第二梯队 (提效与创作增强)**：
  - [x] 零账号配置本地自托管图床 (剪贴板粘贴 `Ctrl+V` / 拖拽上传 / 自动同步素材库)
  - [x] 离线启发式 AI 写作助手 (5 大流派爆款标题 / 智能摘要 / 关键词标签)
  - [x] 多端排版真机渲染预览 (Web / 390px iPhone 微信视图 / 知乎专栏)
- [x] **第三梯队 (生态联动与团队协同)**：
  - [x] 多渠道 Webhook 自动分发引擎与全流程状态日志归档
  - [x] 渠道 Webhook 配置管理与即时连通性探针测试
  - [x] 细粒度 RBAC 团队权限体系 (Admin / Editor / Author) 状态机约束
  - [x] 数据看板 7/30/90 天周期切换、图例切换与周环比增长洞察
- [x] **生产加固**：
  - [x] 文章乐观锁与 409 冲突自动刷新
  - [x] 敏感操作审计日志与管理员查询页
  - [x] 管理员用户管理：角色调整、停用/启用、重置密码、强制下线与活跃会话查看
  - [x] 登录设备列表与自助撤销（单设备 / 其他全部设备）
  - [x] 就绪探针、X-Request-Id 结构化访问日志与优雅停机
  - [x] 图床上传格式白名单、5 MB 限制与文件头魔数校验
- [ ] **未来探索**：
  - [ ] GitHub Pages / 线上 Demo 一键预览站
  - [ ] 支持接入本地 Ollama / vLLM 私有大语言模型

---

## 📄 开源许可 (License)

本项目基于 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)（MIT License）进行深度二次原创开发。
所有业务模型、数据表结构、排期调度引擎、排版转换算法与分发系统均为原创编写。
基于 [MIT License](./LICENSE) 协议开源，欢迎自由使用、派生与商业化改造。
