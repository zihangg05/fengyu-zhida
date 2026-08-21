# 风语智答 · 风湿免疫病智能科普问答与患教平台

> 响应式静态网站（交互原型 Demo）。面向大众的健康科普教育演示，**仅作科普参考，不提供真实医疗建议、不实现后端能力**。

基于墨刀原型（风语智答）重制的**响应式**版本：在保留原有 5 个页面、浅蓝医疗视觉与全部交互的前提下，适配桌面 / 平板 / 手机，移动端导航自动折叠为汉堡菜单。

## 功能页面

| 页面 | 文件 | 说明 |
| ---- | ---- | ---- |
| 01 智能问答主页 | `index.html` | 对话气泡、引用来源弹窗、发送跳转拒答页 |
| 02 化验单解读 | `lab-reading.html` | 上传卡片 → 模拟报告 + 指标解读切换 |
| 03 免疫机制演示 | `immune-demo.html` | 16:9 演示区 + 滑膜 / 软骨骨组织热区弹窗 |
| 04 后台管理 | `admin.html` | 知识库 / 对话日志表格 + 导出 CSV Toast |
| 05 拒答演示 | `refusal.html` | 高风险提问安全拒答 + 就医提示 + 返回 |

全局：统一顶部导航（当前页高亮）、底部免责声明、引用来源弹窗、移动端汉堡菜单。

## 目录结构

```
fengyu-zhida/
├── index.html              01 智能问答主页
├── lab-reading.html        02 化验单解读
├── immune-demo.html        03 免疫机制演示
├── admin.html              04 后台管理
├── refusal.html            05 拒答演示
├── assets/
│   ├── css/style.css       共享响应式样式（浅蓝医疗风）
│   ├── js/main.js          共享交互（导航/弹窗/状态切换/Toast）
│   └── img/favicon.svg
├── .github/workflows/deploy.yml   GitHub Pages 自动部署
└── README.md
```

## 本地预览

无需任何依赖，直接双击 `index.html` 即可；或启动本地静态服务器（推荐，避免个别浏览器对 `file://` 的限制）：

```bash
# 在项目根目录执行
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

## 部署上线（GitHub Pages）

本站为纯静态站点，已内置 GitHub Actions 工作流（`.github/workflows/deploy.yml`），推送 `main` 分支即自动发布。

### 方式一：使用 GitHub CLI（推荐，可让我代为执行）

1. 安装并登录 GitHub CLI：`gh auth login`
2. 在项目根目录初始化仓库并创建公开仓库：
   ```bash
   git init
   git add .
   git commit -m "feat: 风语智答响应式科普原型"
   gh repo create fengyu-zhida --public --source=. --remote=origin --push
   ```
3. 在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**（首次推送工作流后会自动出现该选项）。
4. 推送后自动部署，站点地址：`https://<你的用户名>.github.io/fengyu-zhida/`

> 我可在你提供 GitHub 用户名并完成 `gh auth login` 后，直接帮你执行上述部署命令。

### 方式二：手动（网页端，无需 CLI）

1. 在 GitHub 新建一个 **Public** 仓库（如 `fengyu-zhida`）。
2. 将本项目全部文件上传 / 推送到该仓库的 `main` 分支（可用 GitHub Desktop 或直接拖拽上传）。
3. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. 等待 Actions 运行完成（约 1–2 分钟），访问 `https://<用户名>.github.io/fengyu-zhida/`。

### 自定义站点路径（项目页 / 用户页）

- 个人/组织页：仓库名必须为 `<用户名>.github.io`，站点根路径即首页。
- 项目页：任意仓库名，首页为 `index.html`，站点位于 `/<仓库名>/` 子路径下；本项目的相对链接已兼容子路径。

### 部署检查清单

- [ ] 所有资源使用相对路径（`assets/...`、`*.html`），无绝对/外部依赖
- [ ] `index.html` 位于仓库根目录
- [ ] Pages Source 已设为 **GitHub Actions**
- [ ] Actions 工作流运行成功（绿色 ✓）
- [ ] 移动端打开汉堡菜单正常、弹窗可开可关
- [ ] 页脚免责声明在每页显示

### 回滚与验证

- **回滚**：在仓库 **Actions** 页面对上一个成功的部署点击 “Re-run” 或回退 commit 后重新推送；GitHub Pages 会保留历史部署，可在 Pages 设置中切换。
- **验证**：部署后访问站点地址，逐页检查导航跳转、弹窗、化验单切换、CSV Toast、拒答返回；用浏览器开发者工具切换设备尺寸确认响应式正常。

## 技术说明

- 纯 HTML / CSS / 原生 JS，零运行时依赖，无构建步骤。
- 移动优先响应式：断点 640 / 768 / 860px；`100dvh` 处理移动端视口高度；弹窗动画遵循 `prefers-reduced-motion`。
- 无障碍：语义化标签、导航 `aria-expanded`、弹窗 `role="dialog"` + ESC 关闭、表单 `label`、可见焦点样式。
