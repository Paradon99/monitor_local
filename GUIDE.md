# 监控评分工作台重构与开发指南

## 1. 技术栈选型分析

为了满足**界面美观**、**便于部署**、**多人协作**以及**复杂计分逻辑**的需求，推荐以下现代 Web 开发技术栈：

### 核心框架: Next.js (React Framework)
*   **理由**: 
    *   **部署便捷**: 与 Vercel（部署平台）是同一家公司出品，完美适配，一键部署。
    *   **性能优异**: 支持服务端渲染（SSR）和静态生成，首屏加载快。
    *   **生态丰富**: 拥有庞大的组件库生态。

### 语言: TypeScript
*   **理由**: 评分系统涉及复杂的计算逻辑和数据结构（如 PDF 中的公式），TypeScript 的强类型系统能有效防止计算错误，便于维护。

### 样式库: Tailwind CSS + Shadcn/UI
*   **理由**: 
    *   **Tailwind**: 原子化 CSS，编写速度快，无需手写大量 CSS 文件，极易实现“美观、现代化”的界面。
    *   **Shadcn/UI**: 基于 Tailwind 的高质量组件库，提供现成的精美组件（卡片、表格、滑块等），极大提升开发效率和颜值。

### 数据库与协作: Firebase (Google) 或 Supabase
*   **理由**:
    *   **实时同步**: 这里的核心需求是**多人协作**。Firebase 的 Firestore 数据库支持 Realtime Updates，一方修改分数，通过 WebSocket 自动推送到所有人的屏幕，无需手动刷新。
    *   **Serverless**: 无需购买服务器，直接在前端调用 SDK 即可，非常适合个人或小团队项目。
    *   **免费额度**: 对于内部工具，免费额度绰绰有余。

---

## 2. 部署操作指南 (M1 MacBook Pro -> Vercel)

### 第一步：本地环境准备
1.  **安装 Node.js**: 
    *   访问 [nodejs.org](https://nodejs.org/) 下载 LTS 版本安装包并安装。
    *   在终端输入 `node -v` 检查是否安装成功。
2.  **安装 Git**: 
    *   Mac 通常自带。输入 `git --version` 检查。

### 第二步：初始化项目
在 VSCode 的终端中执行：
```bash
# 创建 Next.js 项目 (选择 Typescript, Tailwind, ESLint)
npx create-next-app@latest monitor-scoring-app

# 进入目录
cd monitor-scoring-app

# 安装 UI 组件库 (Shadcn/UI)
npx shadcn-ui@latest init
```

### 第三步：开发与协作功能实现 (Firebase)
1.  访问 [Firebase Console](https://console.firebase.google.com/) 创建新项目。
2.  创建 **Firestore Database**。
3.  在 VSCode 中安装 SDK: `npm install firebase`。
4.  在项目中创建 `lib/firebase.ts`，粘贴 Firebase 提供的配置代码。
5.  将本地的 `localStorage` 逻辑替换为 Firebase 的 `onSnapshot` 监听，实现多人实时同步。

### 第四步：部署到 Vercel (外网访问)
1.  将代码提交到 GitHub。
    *   GitHub Desktop 或 命令行 `git push`。
2.  访问 [Vercel.com](https://vercel.com/) 并注册。
3.  点击 **"Add New..." -> "Project"**。
4.  选择你刚才上传的 GitHub 仓库。
5.  点击 **"Deploy"**。
6.  等待约 1 分钟，Vercel 会生成一个 `https://your-project.vercel.app` 的网址，即可发送给同事进行多人协作。

---

## 3. 计分模块设计 (基于 PDF)

### 数据结构设计
*   **ScoreModel**:
    *   `coverage`: 基础覆盖分 (60分)
        *   `package`: 套餐覆盖 (45分 - 扣分制)
        *   `standardization`: 标准化 (10分 - 公式计算)
        *   `documentation`: 文档化 (5分)
    *   `detection`: 故障检测 (20分)
    *   `alert`: 告警配置 (10分)
    *   `team`: 团队能力 (10分)

### 核心算法逻辑
*   **标准化得分 (1.1.2)**: 
    $$ Score = \sum_{i=1}^{N} \frac{10 - X_i}{N} $$
    *   其中 $N$ 为工具数量。
    *   $X_i$ 为该工具未覆盖场景的扣分 (基于 30%/50%/70% 阈值)。
    *   程序实现：遍历所有选中的工具，计算每个工具的场景覆盖率，得出 $X_i$，最后求和平均。

