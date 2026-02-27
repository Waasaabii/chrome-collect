<div align="center">

<img src="packages/extension/icons/icon-128.png" width="80" alt="Chrome Collect">

# Chrome Collect

**一键保存网页到本地，永久离线可读**

[![Stars](https://img.shields.io/github/stars/Waasaabii/chrome-collect?style=flat-square&logo=github&color=00d4aa)](https://github.com/Waasaabii/chrome-collect/stargazers)
[![Release](https://img.shields.io/github/v/release/Waasaabii/chrome-collect?style=flat-square&color=0099ff)](https://github.com/Waasaabii/chrome-collect/releases/latest)
[![License](https://img.shields.io/github/license/Waasaabii/chrome-collect?style=flat-square)](LICENSE)

</div>

---

## ✨ 是什么

Chrome Collect 由两部分组成：

- **Chrome 插件**：点击插件图标，一键将当前页面完整静态化（图片/CSS/字体全部 base64 内联），无网络也能完整预览
- **本地 exe**：轻量系统托盘应用，提供 HTTP 服务 + SQLite 存储 + Web 管理界面，单文件 ~10 MB，无需安装

## 🚀 下载安装

### 方式一：直接下载（推荐）

前往 **[Releases](https://github.com/Waasaabii/chrome-collect/releases/latest)** 下载：

| 文件 | 说明 |
|------|------|
| `chrome-collect.exe` | 本地服务 + 管理界面（系统托盘）|
| `extension.zip` | Chrome 插件包 |

### 方式二：从源码构建

**前置要求**：[Bun](https://bun.sh) ≥ 1.0 · [Go](https://go.dev) ≥ 1.21

```bash
git clone git@github.com:Waasaabii/chrome-collect.git
cd chrome-collect
bun run build:app   # 输出 dist/chrome-collect.exe
bun run build:ext   # 输出 dist/extension.zip
```

## 📖 使用步骤

### 1. 启动本地服务

双击 `chrome-collect.exe`，系统托盘出现书签图标 🔖

- 右键 → **打开管理界面** → 浏览器打开 `http://localhost:33451`
- 右键 → **退出** → 关闭服务

### 2. 安装 Chrome 插件

1. 解压 `extension.zip`
2. 打开 `chrome://extensions/` → 开启**开发者模式**
3. 点击**加载已解压的扩展程序** → 选择解压目录

### 3. 开始收藏

在任意网页点击扩展图标 → 点击**收藏当前页** → 右上角出现 ✓

## 🛠 功能

| 功能 | 说明 |
|------|------|
| **完整静态化** | 图片/CSS/字体/背景图全部 base64 内联，零 404 |
| **截图缩略图** | 自动截取页面截图作为卡片预览 |
| **Markdown 备注** | 为每个页面添加支持 Markdown 的备注 |
| **别名编辑** | 双击卡片标题，自定义显示名称 |
| **域名分组** | 默认按来源域名分组展示 |
| **离线预览** | 点击卡片在新标签页预览离线版 |
| **访问原站** | 预览页提供一键跳转原始网址 |
| **下载 HTML** | 导出单个自包含 HTML 文件 |
| **回收站** | 软删除 + 7 天自动清理 |
| **搜索 / 排序** | 实时搜索标题/URL/备注，按时间或大小排序 |
| **批量删除** | 多选后一键批量删除 |

## 📁 项目结构

```
chrome-collect/
├── packages/
│   ├── extension/          # Chrome 插件（Manifest V3）
│   │   ├── background/     # Service Worker：手动收藏逻辑
│   │   ├── content/        # capture.js：页面完整内联化
│   │   └── popup/          # 弹窗界面
│   ├── tray/               # Go 后端（单 exe）
│   │   ├── main.go         # 系统托盘 + HTTP 服务器 + embed
│   │   ├── db.go           # SQLite 数据访问层
│   │   └── routes.go       # REST API 路由
│   └── web/                # React 前端（构建后 embed 进 exe）
├── data/                   # 运行时数据（自动创建）
│   ├── collect.db          # SQLite 数据库
│   └── pages/              # 保存的 HTML + 截图（按域名分组）
└── dist/                   # 构建产物
    ├── chrome-collect.exe
    └── extension.zip
```

## 🔌 API

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/save` | 保存收藏 |
| GET | `/api/bookmarks` | 列表（`?q=` 搜索，`?url=` 精确匹配）|
| GET | `/api/bookmarks/:id` | 单条 |
| PATCH | `/api/bookmarks/:id` | 更新 `alias` / `notes` |
| DELETE | `/api/bookmarks/:id` | 软删除 |
| GET | `/api/stats` | 统计 |
| GET | `/api/bookmarks/:id/download` | 下载 HTML |
| POST | `/api/bookmarks/:id/open-folder` | 在资源管理器定位文件 |
| GET | `/api/trash` | 回收站列表 |
| POST | `/api/trash/:id/restore` | 恢复 |
| DELETE | `/api/trash/:id` | 永久删除 |
| POST | `/api/extension/ping` | 扩展心跳 |

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Waasaabii/chrome-collect&type=Date)](https://star-history.com/#Waasaabii/chrome-collect&Date)

## 📄 License

MIT
