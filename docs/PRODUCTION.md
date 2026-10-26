# 生产环境边界说明

> 目标读者：准备把 Creator Studio Admin 部署到真实环境的维护者。
>
> 一句话结论：本项目是 **单机、单进程、单数据库** 的轻量内容工作台，适合个人创作者或小团队内部使用。它不是多租户 SaaS，也不具备水平扩容能力。下面列出的边界在正式上线前必须逐项确认。

---

## 1. 当前部署形态

```text
浏览器
  │  HTTPS (由 Nginx / 云负载均衡终止)
  ▼
单个 Node.js 进程 (Express 5)
  ├── /api/*            后端接口
  ├── /uploads/*        本地图片静态托管
  ├── /dist/*           前端构建产物 (生产模式同端口托管)
  ├── SQLite 文件       server/data/sqlite.db (+ -wal / -shm)
  └── 进程内调度器      每 30 秒扫描一次排期文章
```

所有状态都落在这台机器的两个目录里：

| 状态     | 默认位置                | 说明                                       |
| :------- | :---------------------- | :----------------------------------------- |
| 业务数据 | `server/data/sqlite.db` | 用户、文章、渠道、评论、分发日志、素材记录 |
| 图片文件 | `uploads/`              | 通过 `/uploads/<文件名>` 公开访问          |

Docker 部署时这两个目录分别挂载为 `sqlite-data` 与 `uploads-data` 数据卷；裸机部署时需要自行保证目录持久化并纳入备份。

---

## 2. 数据层边界（SQLite）

**现状**

- 使用 Node.js 原生 `node:sqlite`（`DatabaseSync`），开启 WAL 模式。
- 数据库结构在 `server/db/index.js` 启动时通过 `CREATE TABLE IF NOT EXISTS` 与若干 `ALTER TABLE` 就地迁移。
- 未开启 `PRAGMA foreign_keys`，评论与文章之间没有数据库级外键约束（删除文章时由接口手动清理评论）。
- 未引入迁移版本表，也没有回滚脚本。

**影响**

- 只支持单机读写。SQLite 通过文件锁串行化写入，**不能多实例共享同一个数据库文件**。
- 数据库文件损坏、磁盘写满或容器误删卷都会导致全站不可用。
- 结构变更依赖启动时的幂等语句；复杂迁移（改列类型、拆分表）无法安全地增量执行。

**建议**

- 将 `server/data/` 与 `uploads/` 视为唯一持久化状态，固定挂载到可靠磁盘并做定时快照。
- 上线前在预发环境用生产数据副本完整演练一次启动迁移。
- 当需要多实例或更高并发时，迁移到 PostgreSQL，并引入版本化迁移工具（如 Drizzle / Prisma Migrate / node-pg-migrate）。

---

## 3. 调度器边界

**现状**

- `server/services/scheduler.js` 在应用进程内用 `setInterval` 每 30 秒扫描一次到期排期文章，并直接更新为 `published`，随后触发 `auto_push` 渠道分发。
- 调度器没有独立进程、没有任务队列、没有分布式锁、没有重试。
- 进程重启时会立即扫描一次，因此停机期间到期的文章会在重启后补发。

**影响**

- **只能运行一个实例**。启动多个副本会导致同一篇排期文章被多个进程重复发布、重复分发。
- 分发失败只写日志，不会自动重试；Webhook 接收方需要自行保证幂等。
- 进程长时间停机期间不会按时发布，恢复后集中补发。
- 没有任务执行记录可查询（仅 `console.log`）。

**建议**

- 生产环境保持单副本；如果必须多副本，把调度器拆成独立单实例服务，或使用带锁的任务队列。
- 若对发布时间准确性要求高，改用外部调度（如系统 cron 调用受保护的内部接口）或消息队列延迟任务。
- 为 Webhook 接收方增加幂等键（可使用文章 ID + 发布时间）。

---

## 4. 文件存储边界

**现状**

- 图片以 Base64 形式提交到 `POST /api/materials/upload`，服务端解码后写入本地 `uploads/`，文件名由服务端生成。
- 上传已做格式与大小校验：仅允许 PNG / JPEG / WebP / GIF，单文件上限 5 MB；服务端会校验文件头（魔数）并与声明的 MIME 交叉比对，SVG 及其他格式一律拒绝。前端上传入口同步限制文件类型与大小。
- `uploads/` 通过 `express.static` 直接公开访问，不经过鉴权。
- JSON 请求体上限为 25 MB，Nginx 参考配置中 `client_max_body_size` 为 30 MB；实际单图仍受 5 MB 业务限制。非法 JSON 返回 400、超限请求体返回 413，均为 JSON 错误体而不会误报 500。

**影响**

- 图片与数据库在同一台机器上，磁盘容量、IO 与备份互相影响。
- 没有对象存储、CDN、图片压缩或缩略图；大图会直接占用磁盘与带宽。
- 上传文件的公开 URL 可被任意人访问（适合公开博客配图，不适合私密素材）。
- 多实例部署时各自持有本地文件，无法共享。

**建议**

- 监控磁盘使用率，设置告警；定期清理未被引用的图片。
- 需要多实例或更大流量时，把 `uploads/` 迁移到 S3 兼容对象存储，并保留本地开发降级模式。
- 若素材需要私有化，改为带签名 URL 的下载接口，而不是静态目录。

---

## 5. 分发引擎边界

**现状**

- 已绑定且填写 Webhook URL 的渠道会收到真实 `POST`（超时 6 秒），结果写入 `distribution_logs`。
- Webhook 地址在保存、测试与分发时都会校验：仅允许 http/https、禁止内嵌账号密码，始终拒绝云元数据（如 `169.254.169.254`）与链路本地地址；`WEBHOOK_BLOCK_PRIVATE=true` 时额外拒绝本机/私网/内网域名。请求不自动跟随重定向，避免跳转到内部目标。
- 渠道列表中的 `webhookUrl` 与分发日志中的 `targetUrl` 只对 `admin` / `editor` 返回，作者角色只能看到渠道名称、连接状态与分发结果。
- 未配置 Webhook 的渠道走**模拟分发**，日志状态为 `simulated`，并不会真的发布到微信、知乎等平台。
- 没有重试、没有签名校验、没有幂等键、没有失败告警。

**影响**

- `success` 只代表对方 Webhook 返回了 2xx，不代表内容已在目标平台成功发布。
- 对方短暂不可用时会直接记为失败，需要人工重新触发。
- Webhook 载荷未签名，接收方无法验证来源。

**建议**

- 把分发视为「通知」而非「发布保证」；关键渠道仍需人工确认。
- 在接收端校验来源（共享密钥、HMAC 签名）并做幂等处理。
- 如需可靠投递，引入队列与重试策略，并保留失败告警。
- 地址校验只覆盖字面 IP 与常见内网域名，无法阻止域名解析到私网（DNS rebinding）。对公网开放且担心 SSRF 时，应设置 `WEBHOOK_BLOCK_PRIVATE=true`，并在容器/主机出口加防火墙或代理白名单，限制服务可访问的目标网段。

---

## 6. 认证与安全边界

**现状**

- 登录签发短时 access token（JWT，默认 15 分钟，`ACCESS_TOKEN_TTL` 可调）；`requireAuth` 每次请求从数据库实时读取角色。
- access token 存在可被 JavaScript 读取的 Cookie 中，并在请求头里发送 `Authorization: Bearer`。
- refresh token 为随机 32 字节不透明串，只以 SHA-256 哈希存库（`refresh_tokens` 表），通过 `HttpOnly + SameSite=Lax + Path=/api/auth` 的 Cookie 下发，默认 30 天（`REFRESH_TOKEN_TTL_DAYS` 可调），生产环境强制 `Secure`。
- 每次调用 `POST /api/auth/refresh` 都会轮换 refresh token；已轮换的旧 token 被再次使用视为泄露重放，会吊销该用户全部会话并写入 `auth.refresh_reuse` 审计。
- `POST /api/auth/logout` 吊销当前 refresh token 并清除 Cookie；改密会吊销该用户全部 refresh token（同时递增 `token_version` 让存量 access token 失效），并为当前会话补发新 token。
- 前端在请求返回 401 时自动单飞刷新并重放原请求；刷新失败才清理登录态并跳转登录页。页面刷新后若 access token 已过期，也会静默续期，无需用户重新登录。
- 管理员用户管理：`GET /api/users` 分页/搜索账号并返回活跃会话数与停用状态；`PATCH /api/users/:id/role` 调整角色；`PATCH /api/users/:id/status` 停用/启用账号；`POST /api/users/:id/reset-password` 设置新密码；`POST /api/users/:id/force-logout` 强制下线。角色调整立即生效并写入 `user.role_change` 审计；停用会递增 `token_version`、吊销全部 refresh token 并写入 `user.disable` 审计，启用写入 `user.enable`；重置密码与强制下线都会递增 `token_version`、吊销目标用户全部 refresh token，并分别写入 `user.reset_password` / `user.force_logout` 审计。停用账号无法登录，存量 access token 在 `requireAuth` 中按 `users.disabled_at` 实时拒绝，refresh 也会被拒绝。为避免管理员误伤自己，这些接口均禁止对自己执行（改自己密码请走个人设置，结束自己的会话请走登出）。
- 登录设备列表：`GET /api/auth/sessions` 返回当前账号全部有效会话（User-Agent、IP、创建时间、最近活动时间，并标记 `current`）；`DELETE /api/auth/sessions/:id` 撤销指定非当前会话（撤销当前会话返回 400，请走登出）；`DELETE /api/auth/sessions` 撤销除当前设备外的全部会话并返回撤销数量。撤销立即失效并写入 `auth.session_revoke` / `auth.session_revoke_others` 审计。会话元数据在登录/注册/刷新续期时写入 `refresh_tokens` 的 `user_agent` / `ip` / `last_used_at` 列（ip 为 `req.ip`，反向代理场景依赖 `TRUST_PROXY` 配置）。
- 服务端尚未提供忘记密码邮件重置；`/api/auth/me` 仅支持修改昵称与角色。
- 公开注册固定创建 `author` 用户。
- 认证端点已限流：登录 30 次/15 分钟、注册 5 次/小时、改密 10 次/15 分钟、刷新 120 次/15 分钟，按客户端 IP 计数；单进程内存实现，重启清零。阈值可通过 `AUTH_RATE_LIMIT_*` / `REGISTER_RATE_LIMIT_*` / `CHANGE_PASSWORD_RATE_LIMIT_MAX` / `REFRESH_RATE_LIMIT_MAX` 调整。
- CORS 默认仅同源：开发/测试放行本地 Vite（`localhost:5173`），生产不启用跨域；前后端分域部署时通过 `CORS_ORIGINS`（逗号分隔）显式放行。
- 已启用 Helmet 安全响应头（CSP 放行 Google Fonts 与内联样式，未强制 `upgrade-insecure-requests`）。生产构建已在真实浏览器中验证登录、看板与设置页无 CSP 拦截。
- 部署在反向代理后需设置 `TRUST_PROXY`（如 `1`），否则限流会把所有请求算到代理 IP 上；直连部署保持默认关闭，避免 `X-Forwarded-For` 被伪造。
- 当前未额外启用 CSRF token。access token 通过 `Authorization` 头传递；唯一自动携带的凭据是 `SameSite=Lax` 的 refresh Cookie，跨站 POST 不会带上它，`refresh` / `logout` 因此不可被跨站请求伪造。若后续把 access token 也改成 Cookie 鉴权，必须同步补 CSRF 防护。
- 角色切换接口默认在 `NODE_ENV=production` 下关闭，但可通过 `ALLOW_ROLE_SWITCH=true` 重新开启。

**必须注意**

1. **必须设置强随机 `JWT_SECRET`（至少 32 位）**。非生产环境未设置时会回退到内置开发密钥；生产环境缺失、使用示例占位值或长度不足时，服务会在启动阶段直接抛错拒绝运行。Docker 编排在未提供该变量时也会直接报错。
2. **生产环境不要开启 `ALLOW_ROLE_SWITCH`**。该接口允许已登录用户把自己的角色改成 `admin`，仅用于演示。
3. **演示数据默认只在非生产环境注入**。生产环境空库首次启动必须设置 `ADMIN_EMAIL` / `ADMIN_PASSWORD`（密码至少 8 位），否则服务会拒绝启动；不会创建演示文章、素材、评论或默认口令账号。渠道会写入基础定义，但默认全部为未连接状态。若显式设置 `SEED_DEMO_DATA=true`，会连同 `creator@studio.dev / creator123` 演示账号一起写入，仅限演示部署。
4. access token 仍存在 JS 可读 Cookie 中，XSS 可在其 15 分钟有效期内窃取；生产环境应通过严格 CSP、依赖审计与输入转义降低风险。refresh token 已改为 HttpOnly，无法被脚本读取，且轮换 + 重放检测可限制泄露窗口。access token 签发与校验均固定为 HS256，其他 HMAC 算法与 `alg=none` 伪造令牌会直接返回 401。
5. **生产环境必须启用 HTTPS**。refresh Cookie 在 `NODE_ENV=production` 下带 `Secure`，纯 HTTP 部署会导致浏览器不保存 Cookie，表现为登录后立刻掉线。
6. 改密、管理员重置密码、强制下线与停用账号都会吊销全部 refresh token 并递增 `token_version`，适合密码泄露、人员变动或账号封禁等场景紧急处置。管理员接口无法对自己执行，避免误操作导致当前管理会话立即失效。
7. 前后端分域部署时，除设置 `CORS_ORIGINS` 外，还需保证浏览器允许携带凭据（服务端已开启 `credentials`，前端 axios 已设置 `withCredentials`），且 `Secure` Cookie 要求 HTTPS。
8. 如果站点对公网开放，建议在最外层再增加 WAF 或 Nginx `limit_req` 作为纵深防御。内置限流是单进程内存计数，多副本部署时每个实例各自计数，需改用 Redis 等共享存储。

---

## 7. 并发与一致性

**现状**

- 前端采用乐观更新，写请求失败时整体回滚。
- 文章更新已启用 `version` 乐观锁：客户端 PATCH 时可携带读取时的版本号，版本不匹配返回 `409` 与 `currentVersion`，写入成功后版本自增；批量更新提供 `versions` 映射，任一版本过期则整批回滚。前端遇到 `409` 会回滚本地改动并重新拉取服务端最新数据。
- 阅读上报 `POST /api/articles/:id/view` 只递增 `views`，不改变版本号。
- 文章接口设有字段级上限：标题 200 字符、摘要 600 字符、正文 20 万字符、标签 20 个（每个 30 字符）、文章 ID 64 字符；批量创建/更新/删除单次最多 100 条。批量路由逐条同步查询与写入，限制条数可避免超大数组长时间占用事件循环。
- 文章状态流转已由服务端状态机强制校验：状态只能沿 `draft → in_review → scheduled → published → archived → draft` 流转，排期可从任意状态进入 `scheduled`；非法流转返回 `409`，批量更新中任意一条非法则整批拒绝。
- 角色与归属由服务端校验：`author` 只能维护自己的文章且只能写 `draft` / `in_review`；`editor` 可编辑他人文章但只能删除自己的；`admin` 不受限。
- 敏感操作写入 `audit_logs` 表：改密、角色变更、文章状态变更/删除（含批量）、渠道配置更新、手动分发。管理员可通过 `GET /api/audit-logs` 分页查询并过滤；前端「操作日志」页面仅管理员可见。审计写入失败只告警，不阻断主流程。

**影响**

- 两人同时编辑同一篇文章时，后提交者会收到 409 并自动刷新，不会静默覆盖先保存者。
- 审计日志是应用层记录，数据库管理员仍可直接修改 SQLite 文件；它用于日常追溯，不等同于合规级不可篡改审计。

**建议**

- 对审计留存有强合规要求时，将日志同步到外部不可变存储（如对象存储 WORM / 日志服务）。
- 前端所有写路径都应带上版本号；新增更新接口时沿用同一约定。

---

## 8. 可观测性与运维

**现状**

- `GET /api/health` 为存活探针，只返回 `{ ok: true }`。
- `GET /api/health/ready` 为就绪探针，检查数据库可查询与上传目录可写，失败返回 `503`；Dockerfile 已配置 `HEALTHCHECK`。
- 每个请求都会生成或透传 `X-Request-Id`，响应结束后输出一行 JSON 访问日志（方法、路径、状态码、耗时、用户 ID、请求 ID），便于与网关日志串联。测试环境自动静默。
- 收到 `SIGTERM` / `SIGINT` 时执行优雅停机：停止调度器 → 停止接收新连接 → 关闭 SQLite；超过 10 秒强制退出。
- 仍然没有指标、链路追踪、错误聚合或告警。

**建议**

- 至少接入进程守护（PM2 / systemd / Docker restart policy）与日志轮转。
- 增加磁盘、进程存活、5xx 比例、调度器执行结果的监控告警。
- 单进程内存限流与本地日志在多副本模式下不共享，扩容时需同时调整。

---

## 9. 上线前检查清单

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` 已设置为至少 32 位的强随机值，且未提交到仓库；缺失或过短会导致启动失败
- [ ] `ALLOW_ROLE_SWITCH` 未开启（或确认业务确实需要）
- [ ] 空库首次启动已提供 `ADMIN_EMAIL` / `ADMIN_PASSWORD`（或确认数据库已有用户）
- [ ] `SEED_DEMO_DATA` 未在公网生产环境开启
- [ ] 默认演示账号未被创建；若曾开启演示模式，已删除或改密
- [ ] `server/data/` 与 `uploads/` 已挂载到持久化磁盘
- [ ] 已配置 HTTPS，HTTP 自动跳转（生产 refresh Cookie 带 `Secure`，无 HTTPS 会导致登录后掉线）
- [ ] Nginx `client_max_body_size` 与上传需求匹配（单图业务上限 5 MB）
- [ ] 负载均衡/编排系统已接入 `/api/health/ready` 就绪探针
- [ ] CORS 已按部署形态确认：同源部署保持为空，分域部署已设置 `CORS_ORIGINS` 白名单
- [ ] 反向代理部署已设置 `TRUST_PROXY`，且层数与实际拓扑一致
- [ ] 已按业务量评估认证限流阈值（默认登录 30 次/15 分钟、刷新 120 次/15 分钟）
- [ ] 已确认会话有效期符合预期（默认 access 15 分钟、refresh 30 天）
- [ ] 已配置进程守护与开机自启
- [ ] 已配置数据库与图片目录的定时备份，并验证过恢复
- [ ] 已配置磁盘与进程存活告警
- [ ] 确认只运行 **一个** 应用副本

---

## 10. 备份与恢复

**备份**

1. 推荐使用 SQLite 在线备份，避免直接拷贝正在写入的文件：

   ```bash
   sqlite3 server/data/sqlite.db ".backup '/backup/creator-studio-$(date +%F).db'"
   ```

2. 同时打包图片目录：

   ```bash
   tar -czf "/backup/uploads-$(date +%F).tar.gz" uploads/
   ```

3. 若无法在线备份，先停止应用，再拷贝 `sqlite.db`、`sqlite.db-wal`、`sqlite.db-shm` 三个文件。

**恢复**

1. 停止应用。
2. 用备份文件覆盖 `server/data/sqlite.db`，删除残留的 `-wal` / `-shm` 文件。
3. 解压 `uploads/` 到原位置。
4. 启动应用，访问 `/api/health` 与关键页面确认数据完整。

**建议**：至少保留 7 天日备份，并每季度做一次真实恢复演练。

---

## 11. 扩容演进路径

当出现以下信号时，说明已经超出当前架构的舒适区：

- 需要多实例/高可用；
- 文章与分发日志达到百万级；
- 图片占用磁盘超过单机容量；
- 需要可靠、可重试的异步分发；
- 需要不可篡改审计留存、细粒度权限或多租户隔离。

对应的演进顺序建议：

1. **数据库**：SQLite → PostgreSQL，引入版本化迁移与连接池。
2. **文件**：本地 `uploads/` → 对象存储 + CDN。
3. **调度与分发**：进程内定时器 → 独立 Worker + 队列（BullMQ / Redis / 云队列），支持重试、幂等与死信。
4. **认证**：补充忘记密码邮件重置；多副本时将 refresh token 会话与限流计数迁移到共享存储（Redis/PostgreSQL）。
5. **可观测性**：在现有请求日志基础上补充指标、错误追踪与告警，并将日志集中收集。
6. **部署**：单容器 → 无状态多副本 + 托管数据库 + 对象存储，调度器单独部署。

---

## 12. 适用场景总结

**适合**

- 个人创作者的自建内容工作台；
- 小团队内部（数人到数十人）的内容排期与审核；
- 单机、可接受短时停机的部署环境；
- 以 Webhook 通知为主、人工确认发布的流程。

**不适合直接上线**

- 多租户 SaaS 或对外注册即用的平台；
- 要求高可用、水平扩容、严格发布时效的生产系统；
- 需要可靠消息投递、不可篡改审计留存或细粒度权限隔离的场景。

在这些场景下，请先按第 11 节完成架构演进，而不是直接在当前形态上叠加功能。
