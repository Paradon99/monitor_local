
# 监控评分协作台开发指南 (Vercel Postgres 版)

本指南介绍如何将评分工具转化为支持**多人协作**的全栈应用。

## 1. 架构说明

*   **前端**: Next.js (React) + Tailwind CSS
*   **后端**: Next.js API Routes (`/api/monitor-data`)
*   **数据库**: Vercel Postgres (存储 JSONB 数据)

**优势**:
*   所有用户访问同一个 URL，看到的数据完全一致。
*   点击“提交保存”后，数据写入云端数据库，不再丢失。
*   支持任意数量的系统评分和工具配置。

## 2. 部署步骤

### 第一步：创建 Next.js 项目
在本地终端执行：
```bash
npx create-next-app@latest monitor-app
# 选项: TypeScript=Yes, Tailwind=Yes, App Router=Yes
cd monitor-app
npm install @vercel/postgres
```

### 第二步：添加文件
1.  **后端 API**:
    *   创建文件 `app/api/monitor-data/route.ts`。
    *   将 `app_api_route.ts` 中的代码复制进去。
2.  **前端页面**:
    *   将 `app/page.tsx` 的内容替换为 `index.tsx` 中的代码（注意：需要将 `index.tsx` 中的 `createRoot` 部分移除，改为 `export default function Home() { ... }` 的 Next.js 写法）。
    *   或者保持 `index.tsx` 为组件，在 `page.tsx` 中引入。

### 第三步：配置数据库 (Vercel)
1.  将代码推送到 GitHub。
2.  在 Vercel 中导入项目。
3.  在 Vercel 项目控制台 -> **Storage** -> **Create Database** (选择 Postgres)。
4.  创建后，点击 **"Connect Project"** 关联你的项目。
5.  点击 **"Query"** 标签页，复制 `db_schema.sql` 中的 SQL 语句并执行，初始化表结构。

### 第四步：环境变量
Vercel 会自动为关联的项目添加 `POSTGRES_URL` 等环境变量，**无需手动配置**。

### 第五步：完成
等待 Vercel 构建完成，访问生成的 URL 即可开始多人协作。
