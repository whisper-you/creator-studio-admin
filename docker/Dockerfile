# ---- 构建:全量依赖 + 前端产物 ----
# NODE_IMAGE 可在拉取官方源受限时替换为镜像源,如:
#   docker build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:24-alpine .
ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- 运行时:仅生产依赖 + server + dist(单容器托管 API 与前端) ----
FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=3000
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
# SQLite 数据与图床上传图片落在这两个目录,部署时挂 volume 持久化
VOLUME ["/app/server/data", "/app/uploads"]
EXPOSE 3000
# 就绪探针:数据库可查询且上传目录可写
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
