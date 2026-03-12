<div align="center">

<img src="packages/extension/icons/icon-128.png" width="80" alt="Chrome Collect">

# Chrome Collect

**一键保存网页到本地，永久离线可读**

[![Stars](https://img.shields.io/github/stars/Waasaabii/chrome-collect?style=flat-square&logo=github&color=00d4aa)](https://github.com/Waasaabii/chrome-collect/stargazers)
[![Release](https://img.shields.io/github/v/release/Waasaabii/chrome-collect?style=flat-square&color=0099ff)](https://github.com/Waasaabii/chrome-collect/releases/latest)
[![License](https://img.shields.io/github/license/Waasaabii/chrome-collect?style=flat-square)](LICENSE)

</div>

---

## 是什么

Chrome Collect 现在由三部分组成：

- **Chrome 扩展**：负责抓取当前页面、生成静态 HTML、请求桌面端保存。
- **Desktop App**：系统托盘 + 桌面管理窗口，负责收藏管理、设置、自更新。
- **Native Host**：通过 Chrome Native Messaging 与扩展通信，不再监听 `localhost` 端口。

这次架构已经彻底移除旧版 HTTP 服务：

- 不再使用 `http://localhost:33451`
- 不再暴露 `/api/*`、`/pages/*`、`/export/*`
- 不再兼容旧的裸 `exe + 浏览器访问 localhost` 模式

## 安装与使用

### 正式安装包

前往 [GitHub Releases](https://github.com/Waasaabii/chrome-collect/releases/latest) 下载：

| 文件 | 说明 |
|------|------|
| `chrome-collect-windows-x64.msi` | Windows 安装包，包含桌面端、Native Host 与 Chrome Native Messaging 注册 |
| `chrome-collect-macos.pkg` | macOS 安装包，包含桌面端、Native Host 与 Native Messaging 清单 |
| `chrome-collect-extension.zip` | 固定扩展 ID 的 Chrome 扩展包 |

### 使用步骤

1. 先安装桌面端安装包。
2. 打开 `chrome://extensions/`，开启开发者模式。
3. 解压 `chrome-collect-extension.zip`，点击“加载已解压的扩展程序”。
4. 启动 Chrome Collect Desktop。
5. 在任意网页点击扩展图标，选择“收藏当前页”。

## 当前架构

### 扩展通信

- 扩展后台通过 `chrome.runtime.connectNative` 长连到 `com.chrome_collect.native_host`
- Native Host 通过 `stdin/stdout` 收发版本化 JSON 消息
- 协议强制校验 `protocolVersion`
- 新旧桌面端与扩展不做兼容回退

### 桌面管理界面

- 管理界面由桌面窗口内嵌 React 页面承载
- 前端统一通过 `window.chromeCollect.invoke(method, payload)` 调用桌面端
- 预览、下载 HTML、打开文件夹、检查更新、开机自启都通过桌面桥接完成

### 数据存储

- 数据库存储在用户配置目录下的 `ChromeCollect/data/collect.db`
- HTML 与截图保存在 `ChromeCollect/data/pages/`
- 删除的收藏进入回收站，7 天后自动清理

## 功能

| 功能 | 说明 |
|------|------|
| 完整静态化 | 图片、CSS、字体、背景图内联，离线可读 |
| 截图缩略图 | 自动截取页面截图作为卡片预览 |
| 别名与备注 | 支持自定义标题与备注 |
| 域名分组 | 默认按来源域名聚合展示 |
| 离线预览 | 在桌面窗口或扩展预览页直接查看保存内容 |
| 下载 HTML | 导出单个自包含 HTML 文件 |
| 打开文件夹 | 直接定位本地保存目录 |
| 回收站 | 软删除与恢复、永久删除、自动清理 |
| 自更新 | 读取 GitHub Release 并下载安装包 |

## 项目结构

```text
chrome-collect/
├── packages/
│   ├── extension/                 # Chrome 扩展（Manifest V3 + Native Messaging）
│   │   ├── background/            # Service Worker
│   │   ├── content/               # 页面静态化抓取
│   │   ├── popup/                 # 扩展弹窗
│   │   ├── preview/               # 扩展内预览页
│   │   └── shared/                # 协议与传输层
│   ├── tray/
│   │   ├── cmd/desktop-app/       # 系统托盘 + WebView 桌面窗口
│   │   ├── cmd/native-host/       # Chrome Native Messaging Host
│   │   └── internal/              # 共享服务层与协议定义
│   └── web/                       # React 管理界面
├── scripts/install/
│   ├── windows/                   # MSI 构建脚本与 WiX 清单
│   └── macos/                     # PKG 构建脚本与 Native Host 清单
└── dist/                          # 构建产物
```

## 从源码构建

### 前置要求

- [Bun](https://bun.sh) >= 1.0
- [Go](https://go.dev) >= 1.24
- Windows 打包需要 [WiX Toolset 4](https://wixtoolset.org/)
- macOS 打包需要 `pkgbuild`
- 构建桌面窗口需要启用 CGO，并具备对应平台的 WebView 编译环境

### 常用命令

```bash
bun install
bun run build:web
bun run build:ext
bun run build:app
```

安装包构建：

```bash
bun run build:windows-installer
bun run build:macos-installer
```

本地打开桌面管理窗口：

```bash
bun run dev
```

## 发布产物

GitHub Actions 在打 tag 后会构建并上传：

- Windows MSI
- macOS PKG
- Chrome 扩展 ZIP

## 兼容性边界

- 仅支持 Google Chrome
- 不兼容旧扩展 ID
- 不兼容旧版 `localhost` 协议
- 不兼容旧版单文件裸 `exe` 运行方式

## License

MIT
