# 风语智答 · 部署与运维手册（DEPLOY.md）

> 风湿免疫科普响应式静态站。本文档汇总「改完代码怎么上线」「化验单解读后端怎么部署」「3D 模型/问答数据怎么维护」等全部操作流程。  
> 最近更新：2026-08-23

---

## 一、项目概览

| 项       | 内容                                                        |
| ------- | --------------------------------------------------------- |
| 项目      | 风语智答（风湿免疫科普患教平台）                                          |
| 类型      | 纯静态站（HTML + CSS + 原生 JS，无前端框架）                            |
| 本地路径    | `C:/Users/子航/WorkBuddy/2026-08-20-23-33-36/fengyu-zhida/` |
| 仓库      | <https://github.com/zihangg05/fengyu-zhida> （`main` 分支）   |
| 线上地址    | <https://zihangg05.github.io/fengyu-zhida/>               |
| 风格      | 浅蓝医疗风（`#E6F2FF` / `#1E6FD9`），移动优先，断点 640 / 768 / 860px    |
| 化验单解读后端 | 独立 Cloudflare Worker（见第五节）                                |

**核心约束**：GitHub Pages 是纯静态托管，**没有服务端运行时**。因此凡需要"服务端算"的能力（如调用视觉大模型看懂化验单）都必须拆到外部服务（本项目的 Cloudflare Worker）。站点前端代码里写 `/api/interpret` 必然 404，这是设计使然，不是 bug。

---

## 二、目录结构

```
fengyu-zhida/
├── index.html            # 首页：前端规则问答 + 红线拒答 + 引用来源弹窗
├── lab-reading.html      # 化验单解读：上传真实图片 → 调 Worker
├── immune-demo.html      # 免疫机制演示：SVG 动画 + 可旋转 3D 模型 + 图例讲解
├── admin.html            # 管理后台：数据驱动，支持编辑/新增/搜索/筛选/CSV 导出
├── refusal.html          # 安全拒答演示页（独立保留）
├── worker.js             # 独立 Cloudflare Worker（OCR + 科普解读）
├── wrangler.toml         # Worker 部署配置
├── .dev.vars.example     # 本地调试密钥模板（复制为 .dev.vars，勿提交）
├── .gitignore            # 忽略 .dev.vars / .wrangler/ / node_modules/
├── assets/
│   ├── css/style.css     # 全站样式（含 3D、图例、弹窗、问答气泡）
│   ├── js/main.js        # 全站交互（QA、模态框、化验单、3D 图例）
│   ├── data/qa.json      # 问答知识库（pairs + redlines + fallback）
│   ├── data/admin.json   # 管理后台数据（knowledge 知识条目 + logs 对话日志）
│   ├── models/joint.glb           # 3D 关节模型（264KB 压缩版）
│   ├── models/joint_preview.png   # 3D 模型加载前占位图
│   ├── models/draco/              # 本地 Draco 解码器（去 gstatic 外部依赖）
│   │   ├── draco_decoder.js       # 719410 B
│   │   ├── draco_wasm_wrapper.js  # 58763 B
│   │   └── draco_decoder.wasm     # 285747 B
│   └── img/                       # 图标等静态资源
└── .github/workflows/deploy.yml   # GitHub Actions：push 即部署 Pages
```

---

## 三、本地工具链

| 工具                        | 路径 / 安装方式                                                            |
| ------------------------- | -------------------------------------------------------------------- |
| Git                       | 系统自带                                                                 |
| gh CLI                    | `C:/Program Files/GitHub CLI/gh.exe`（若已加入 PATH 可直接 `gh`）             |
| Python                    | `C:/Users/子航/.workbuddy/binaries/python/versions/3.13.12/python.exe` |
| Node                      | `C:/Users/子航/.workbuddy/binaries/node/versions/22.22.2/node.exe`     |
| gltf-transform / wrangler | 装在 `C:/Users/子航/.workbuddy/binaries/node/workspace/node_modules`     |

> 提示：3D 模型压缩与 Worker 部署用到 Node 全局包，建议把上面的 `node_modules` 加进 `NODE_PATH`，或直接 `cd` 到该 workspace 目录执行。

---

## 四、部署工作流 A：静态站（GitHub Pages）

**流程一句话**：改文件 → `git commit` → `git push` → GitHub Actions 自动构建并发布。

### 1. 提交并推送

```bash
cd "C:/Users/子航/WorkBuddy/2026-08-20-23-33-36/fengyu-zhida"
git add -A
git commit -m "简述本次改动"
git push origin main
```

> ⚠️ `git push` 偶发 `github.com:443 Connection reset / Could not connect to server`（网络抖动）。按惯例用重试循环即可：
>
> ```bash
> for i in 1 2 3 4 5; do git push origin main && break; sleep 3; done
> ```

### 2. 自动部署

`push` 到 `main` 会触发 `.github/workflows/deploy.yml`：

- `actions/checkout@v7` 检出
- `actions/configure-pages@v6` 开启 Pages（首次自动 enable）
- `actions/upload-pages-artifact@v5` 把仓库根目录作为静态站点上传
- `actions/deploy-pages@v5` 发布

首次运行后，到仓库 **Settings → Pages** 确认 Source 为 "GitHub Actions"。

### 3. 验证上线

```bash
# 等 Actions 跑完后，校验线上关键文件字节是否一致
curl -sI https://zihangg05.github.io/fengyu-zhida/assets/models/draco/draco_decoder.wasm
```

- 状态码 `200`、Content-Type 为 `application/wasm` 即正常。
- 实际页面：浏览器打开 <https://zihangg05.github.io/fengyu-zhida/> 走查交互。

### 4. 本地预览（可选）

纯静态，任意静态服务器即可：

```bash
cd "C:/Users/子航/WorkBuddy/2026-08-20-23-33-36/fengyu-zhida"
python -m http.server 8080
# 打开 http://localhost:8080
```

---

## 五、部署工作流 B：化验单解读后端（Cloudflare Worker）

GitHub Pages 无服务端，这部分**必须**单独部署到 Cloudflare Worker。前端 `lab-reading.html` 会把压缩后的化验单图片 POST 到 Worker，Worker 调用视觉大模型（OpenAI 兼容接口，可换腾讯混元等）做 OCR + 科普解读后返回 JSON。

### 1. 准备密钥

```bash
cd "C:/Users/子航/WorkBuddy/2026-08-20-23-33-36/fengyu-zhida"
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，把 VISION_API_KEY 换成真实 Key（.dev.vars 已被 .gitignore 忽略，不会提交）
```

`.dev.vars` 内容（本地调试用）：

```
VISION_API_BASE=https://api.openai.com/v1
VISION_API_KEY=sk-你的视觉模型Key
VISION_MODEL=gpt-4o-mini
```

可选项（改 `VISION_API_BASE` / `VISION_MODEL` 即可换混元等）：

- 腾讯混元视觉接口按 OpenAI 兼容格式对接时，把 `VISION_API_BASE` 指向其网关、`VISION_MODEL` 填对应模型名。

### 2. 安装并登录 wrangler

```bash
cd "C:/Users/子航/.workbuddy/binaries/node/workspace"
npm install -g wrangler          # 或在该 workspace 内 npm install wrangler
wrangler login                    # 浏览器授权（或用 API Token + wrangler.toml 的 account_id）
```

> 若用 API Token 而非 `wrangler login`，在 `wrangler.toml` 取消注释填 `account_id = "你的-cloudflare-account-id"`。

### 3. 注入生产密钥（勿明文提交）

```bash
wrangler secret put VISION_API_KEY   # 交互输入真实 Key
wrangler secret put VISION_API_BASE  # 可选
wrangler secret put VISION_MODEL     # 可选
```

### 4. 部署

```bash
cd "C:/Users/子航/WorkBuddy/2026-08-20-23-33-36/fengyu-zhida"
wrangler deploy
```

部署成功后拿到地址，形如：

```
https://fengyu-interpret.<你的-workers-子域>.workers.dev/api/interpret
```

### 5. 回填前端地址

编辑 `lab-reading.html` 第 116 行，把占位换成你的 Worker 地址：

```js
window.LAB_API_URL = "https://fengyu-interpret.<你的-workers-子域>.workers.dev/api/interpret";
```

然后按**第四节**提交推送即可。

> 留空或写 `/api/interpret` 仅在整站迁移到 Cloudflare Pages（自带 Functions）时才可用；当前 GitHub Pages 架构下必须填完整 Worker URL，否则前端会报"后端不可达"。

### 6. 本地调试 Worker（可选）

```bash
wrangler dev     # 读取 .dev.vars，默认 http://localhost:8787/api/interpret
```

---

## 六、3D 模型维护

`immune-demo.html` 中的 `<model-viewer>` 加载 `assets/models/joint.glb`。

**关键坑（已修复）**：`joint.glb` 使用 `KHR_draco_mesh_compression` 压缩，model-viewer 运行时需 Draco 解码器。原方案依赖 `www.gstatic.com` 的解码器，**国内常被墙导致整个 3D 模型加载失败**。现改为**本地托管**解码器：

- 解码器文件：`assets/models/draco/`（draco_decoder.js / draco_wasm_wrapper.js / draco_decoder.wasm）
- model-viewer 通过 `draco-decoder-location="assets/models/draco/"` 指向本地，去除外部 CDN 依赖。

**重新压缩模型（如需替换）**：

```bash
# 用 gltf-transform 简化网格 + Draco 压缩（纹理压缩走 Python Pillow，避开 Windows sharp/libvips bug）
cd "C:/Users/子航/.workbuddy/binaries/node/workspace"
npx gltf-transform simplify input.glb tmp.glb --ratio 0.5
npx gltf-transform draco tmp.glb output.glb --method edgebreaker
# 纹理：用 Python(Pillow) 把 4096 PNG 转 1024 WebP 后重打包
```

> 历史经验：原模型 27MB（纹理 23.5MB / 3 张 4096 PNG）→ 4.2 万面 + Draco + 1024 WebP → 264KB。



---

## 七、问答知识库（qa.json）

`assets/data/qa.json` 结构：

```jsonc
{
  "pairs": [          // 科普问答对
    { "q": "问题关键词", "a": "回复正文", "cite": "来源说明（可空）" }
  ],
  "redlines": [       // 红线拒答（优先拦截，高于普通匹配）
    {
      "type": "diagnosis|prescription|dosage|emergency|alternative|illegal",
      "keywords": ["代购药", "海外购药", "私下买药", "..."],
      "answer": "针对性拒答文案"
    }
  ],
  "fallback": "未匹配任何问答时的兜底回复"
}
```

- 前端逻辑：`initQA()` 拉取 → 归一化 → 关键词打分 → 渲染回复（`cite` 角标触发来源弹窗）。
- 红线：`matchRedline()` 在 `answer()` 中**优先于科普匹配**；命中渲染带「安全提示」标签的拒绝气泡（`.msg.refused`）。
- 改完直接 commit + push 即生效，无需改 JS。

---

## 八、如何获取 / 下载代码

| 方式         | 操作                                                        |
| ---------- | --------------------------------------------------------- |
| GitHub ZIP | 仓库页 **Code → Download ZIP**                               |
| git clone  | `git clone https://github.com/zihangg05/fengyu-zhida.git` |
| 历史某次提交     | 仓库 **Commits → 某次 → Browse files / 下载该版本**                |

---

## 九、常见问题排查

| 现象                    | 根因                                       | 解决                                                           |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| 3D 模型整块加载失败           | Draco 解码器走 gstatic 被墙                    | 已本地托管 `assets/models/draco/`；确认 `draco-decoder-location` 指向它 |
| 化验单页报"AI 解读暂不可"       | GitHub Pages 无服务端，`/api/interpret` 必 404 | 部署 Cloudflare Worker 并回填 `LAB_API_URL`（见第五节）                 |
| 红线问题仍被科普回答            | redlines 关键词覆盖不足                         | 在 `qa.json` 的对应 type 补关键词（如 illegal 加"代购药/海外购药/走私/私下买药"）     |
| git push 报错 443 reset | 网络抖动                                     | 重试循环（见第四节）                                                   |
| 视频卡顿（旧）               | 5.6MB MP4                                | 已替换为内联 SVG + CSS 动画（约 6KB），无需处理                              |

---

## 十、安全与密钥管理

- **密钥只留服务端**：`VISION_API_KEY` 等通过 `wrangler secret put` 注入 Worker，前端永远拿不到。
- **勿提交明文**：`.dev.vars`、`.wrangler/`、`node_modules/` 已在 `.gitignore` 忽略。
- **红线前置**：涉及诊断 / 开药 / 剂量 / 急症 / 替代治疗 / 违规购药的问题，前端优先拒答，不接大模型，避免给出医疗建议。
- **科普定位**：所有页面均标注"仅供科普参考，不能替代医师面诊"。
