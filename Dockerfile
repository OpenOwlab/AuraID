# 基础镜像：Node 22
FROM node:22

# 工作目录
WORKDIR /app

# 复制 package 文件，优先利用缓存
COPY package.json package-lock.json* ./

# 安装依赖
RUN npm install

# 复制剩余源码
COPY . .

# 暴露 LoopClaw 在容器里的端口（按你实际项目改）
EXPOSE 3000

# build 版
# 构建 Next.js 应用（如果 LoopClaw 是 next 项目；如果不是可去掉这一行）
RUN npm run build
CMD ["npm", "start"]

# dev 版
# CMD ["npm", "run", "dev"]