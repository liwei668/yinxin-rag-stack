# ============================================
# 构建阶段
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json* ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 设置环境变量（构建时）
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 构建 Next.js
RUN npm run build

# ============================================
# 运行阶段
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder /app/config ./config
COPY --from=builder /app/data ./data

# 复制 Next.js 独立输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 创建上传目录
RUN mkdir -p /app/public/uploads && chown nextjs:nodejs /app/public/uploads

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
