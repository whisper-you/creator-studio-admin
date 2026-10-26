# Creator Studio Admin · 功能演进与梯队优化路线

本文档梳理了 **Creator Studio Admin (内容创作管理平台)** 的功能梯队规划与实现状态。

---

## 🚀 第一梯队：高频刚需功能 (已全部落地完成 ✅)

核心解决创作者从本地内容搬运、排版、定时发布到备份导出的全流程刚需。

### 1. 本地 Markdown 批量拖拽导入 ✅

- **前端解析引擎**：[parse-markdown.ts](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/lib/parse-markdown.ts) 智能解析 YAML Frontmatter 头信息（标题、分类、标签、状态、发布渠道、发布日期等），并智能截取前 150 字作为摘要，无 Frontmatter 时自动从首行 H1 提取标题。
- **全页面拖拽热区与弹窗**：[articles-import-dialog.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/articles/components/articles-import-dialog.tsx) 支持全页面拖拽捕获、文件多选、表格化解析结果预览、字数统计、单项移除与一键批量导入。
- **后端原子事务接口**：`POST /api/articles/bulk` 支持 SQLite `db.transaction()` 批量写入，保证数据完整性。

### 2. 定时自动发布调度器 (Scheduled Publisher) ✅

- **后台轮询任务引擎**：[scheduler.js](file:///home/luoyun/桌面/my-project/creator-studio-admin/server/scheduler.js) 定时扫描到达排期时间（`scheduled_at <= datetime('now')`）的文章。
- **自动状态机流转**：自动从 `scheduled` 流转为 `published`，写入 `published_at`，并在终端记录详细发布日志。
- **集成测试覆盖**：在 [server/api.test.js](file:///home/luoyun/桌面/my-project/creator-studio-admin/server/api.test.js) 中通过集成测试验证。

### 3. 一键富文本排版复制 (微信公众号 / 知乎 / 橙色主题) ✅

- **内联样式渲染引擎**：[wechat-formatter.ts](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/lib/wechat-formatter.ts) 将 Markdown 转换为包含完全内联 CSS（Inline Styles）的富文本 HTML，完美规避微信公众平台后台过滤 `<style>` 标签的问题。
- **剪贴板双通道注入**：支持 `ClipboardItem` 注入 `text/html`（富文本）与 `text/plain`（纯文本），在微信公众平台后台或知乎编辑器直接 `Ctrl + V` 粘贴，保留标题边框、引用底色、代码块高亮及行内样式。
- **多入口快捷操作**：
  - 文章编辑抽屉中的 Markdown 编辑器右上角一键排版快捷下拉菜单。
  - 文章列表表格各行操作菜单中的「一键排版复制」子菜单。

### 4. 多格式文章导出 (Markdown / CSV / 打印与 PDF) ✅

- **导出模块**：[export-article.ts](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/lib/export-article.ts)
  - **单篇导出**：生成带有标准 Frontmatter 的 `.md` 文件并自动下载。
  - **批量导出**：多选后一键批量导出 Markdown 文件（[articles-bulk-actions.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/articles/components/articles-bulk-actions.tsx)）。
  - **打印与另存为 PDF**：独立 iframe 排版页面，自动调用浏览器打印引擎，支持直接打印或一键另存为高清晰 PDF 文档。

---

## 🎨 第二梯队：提效与创作增强 (已全部落地完成 ✅)

针对创作者的内容产出效率与体验进行深度增强，实现零外置账号依赖的开箱即用体验。

### 1. 本地自托管图床与剪贴板/拖拽贴图 ✅

- **本地静态托管引擎**：[server/index.js](file:///home/luoyun/桌面/my-project/creator-studio-admin/server/index.js) 服务端自动创建并托管 `uploads/` 静态存储目录（`app.use('/uploads', express.static(uploadsDir))`）。
- **图片上传与素材库联动接口**：[server/routes/materials.js](file:///home/luoyun/桌面/my-project/creator-studio-admin/server/routes/materials.js) `POST /api/materials/upload` 接收 Base64 图片数据，保存到本地磁盘，并自动在 SQLite `materials` 数据表中写入素材记录与访问 URL。
- **编辑器无缝交互**：[markdown-editor.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/articles/components/markdown-editor.tsx) 支持直接 `Ctrl+V` 粘贴截图、拖拽图片到编辑区或点击工具栏「插入图片」按钮；无后端时自动优雅降级为 Base64 嵌入，保障离线可用。

### 2. AI 创作辅助工具箱 (AI Assistant) ✅

- **智能启发式引擎**：[ai-assistant.ts](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/lib/ai-assistant.ts) 纯本地运行、0 成本、毫秒级响应，无需任何外部 API Key。
- **5 款风格爆款标题候选**：深度指南式、痛点反常识、数字清单式、真实复盘式、高效启发式，点击一键采用。
- **智能摘要提炼**：自动过滤语法噪点与代码块，提炼 120-150 字精炼导读。
- **推荐标签自动识别**：基于技术领域知识库与词频匹配，自动填入高相关性标签。
- **表单无缝集成**：在 [articles-mutate-drawer.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/articles/components/articles-mutate-drawer.tsx) 中在标题、摘要与标签字段旁提供「AI 爆款标题」、「AI 提炼摘要」与「AI 推荐标签」操作按钮。

### 3. 多终端排版实时效果预览 (Mobile/Desktop Preview) ✅

- 在 [markdown-editor.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/articles/components/markdown-editor.tsx) 的「多端预览」Tab 中支持一键切换：
  - 💻 **Web 网页**：全宽响应式现代排版。
  - 📱 **公众号手机端**：390px 仿 iPhone 机身外观、顶部公众号名称与日期、正文微信排版、底部阅读量与「在看/点赞」互动条。
  - 📖 **知乎专栏**：知乎蓝主题、专栏作者卡片与赞同互动布局。

---

## 🌐 第三梯队：生态与协同拓展 (已全部落地完成 ✅)

从单人内容管家迈向团队协同与多平台自动化分发生态。

### 1. Webhook 自动化与多渠道分发中心 ✅

- **多平台 Webhook 推送引擎**：[server/distribution.js](file:///home/luoyun/桌面/my-project/creator-studio-admin/server/distribution.js) 支持向自建博客、飞书/钉钉群机器人、GitHub Repository Dispatch 发送标准 `article.published` 事件负载。
- **开箱即用模拟与日志溯源**：未配置外部 Webhook 时自动执行仿真分发通道，在 SQLite `distribution_logs` 表中完整记录推送状态、响应码与耗时。
- **定时发布自动分发联动**：[server/scheduler.js](file:///home/luoyun/桌面/my-project/creator-studio-admin/server/scheduler.js) 到达排期时间自动将文章流转为 `published`，并自动分发至开启「自动同步」的渠道。
- **渠道 Webhook 配置与测试弹窗**：[channel-webhook-dialog.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/channels/components/channel-webhook-dialog.tsx) 在渠道卡片上提供专用配置入口，支持输入专栏账号、Webhook URL、自动推送开关，并提供一键连通性测试。
- **单篇多平台手动分发**：在 [articles-row-actions.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/articles/components/articles-row-actions.tsx) 表格行操作中提供「分发到各渠道 (Webhook)」操作。

### 2. 团队权限与工作流协同 (RBAC) ✅

- **三级角色模型**：系统管理员 (`admin`)、审校主编 (`editor`)、签约作者 (`author`)。
- **角色约束与审核流**：
  - 在 [articles-mutate-drawer.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/articles/components/articles-mutate-drawer.tsx) 中，签约作者仅允许保存为「草稿」或提交为「审核中」，禁止直接排期发布或归档。
  - 主编与管理员拥有完整审核、驳回、排期发布与删除权限。
- **一键协同角色切换**：在 [profile-dropdown.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/components/profile-dropdown.tsx) 中展示当前角色彩色徽标，并提供一键切换演示角色的子菜单，方便快速体验不同角色的视角约束。

### 3. 数据看板多维分析升级 ✅

- **多周期时序趋势切换**：在 [trend-chart.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/dashboard/components/trend-chart.tsx) 中支持「近 7 天 / 近 30 天 / 近 90 天」动态平滑切换，带图例指示。
- **环比趋势与互动深度指标**：在 [stat-cards.tsx](file:///home/luoyun/桌面/my-project/creator-studio-admin/src/features/dashboard/components/stat-cards.tsx) 中引入环比增长徽标（`较上期 +18.4%`、`互动率 5.1%`、`周增产出`）。
