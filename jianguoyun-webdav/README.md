# 坚果云 WebDAV 网页端密码管理

[![GitHub](https://img.shields.io/badge/GitHub-urzeye%2Ftampermonkey--scripts-blue?style=flat-square&logo=github)](https://github.com/urzeye/tampermonkey-scripts)
[![Version](https://img.shields.io/badge/version-1.0.4-blue.svg?style=flat-square)](./jianguoyun-webdav.user.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-green.svg?style=flat-square)](https://www.tampermonkey.net/)

> 恢复坚果云网页版在“安全选项”页面中被官方隐藏的 WebDAV 第三方应用密码管理功能，免下载客户端，直接在网页端查看、创建、复制和撤销应用密码（支持 Obsidian / Zotero / KeePass 等）；同时净化侧边栏应用推荐与底部轮播广告。

**脚本文件**: [`jianguoyun-webdav.user.js`](./jianguoyun-webdav.user.js)  
**当前版本**: v1.0.4  
**适配站点**: `https://www.jianguoyun.com/d/home#/safety` 及 `https://www.jianguoyun.com/d/account#safe`

---

## 📖 背景

坚果云官方在新版网页端（`https://www.jianguoyun.com/d/home#/safety`）中，将原本的 WebDAV 第三方应用密码管理表格隐藏，并换成了强制要求用户“下载并安装坚果云客户端”的引导文案。

实际上，坚果云服务器后端的 WebDAV 应用密码管理能力及底层接口依然完备可用。本脚本通过同源轻量接口，在网页端无缝恢复原有的管理界面，省去下载并安装桌面客户端的繁琐步骤。

---

## ✨ 核心特性

- 🔒 **原生还原应用密码管理**：恢复“第三方应用管理”的完整表格视图，展示应用名称、授权日期、应用密码及操作列。
- 🚫 **网页端纯净去广告**：自动移除左侧边栏“应用推荐”推广项及左下角悬浮轮播广告卡片，恢复清爽界面。
- 👁️ **密码安全与明文切换**：密码默认遮蔽显示（`••••••••••••••••`），支持一键切换显示/隐藏明文。
- 📋 **全流程快捷复制**：
  - WebDAV 服务器地址（`https://dav.jianguoyun.com/dav/`）一键复制；
  - 当前账户（邮箱）一键复制；
  - 每项应用密码专属一键复制；
  - 新建密码生成后自动复制到剪贴板。
- ➕ **在线生成与撤销授权**：
  - 支持直接在网页端输入应用名称并生成专属应用密码；
  - 支持对已授权应用进行撤销授权（附带美观的自定义确认模态弹窗）。
- ⚡ **无感适配 SPA 架构**：监听 Hash 路由变化与 DOM 渲染，在切换至 `#/safety` 选项卡时自动挂载，与坚果云新版 UI 设计风格浑然一体。
- 🪶 **纯原生轻量无依赖**：恪守 KISS 原则，零第三方冗余依赖，极致轻量，开箱即用。

---

## 🚀 安装方法

1. 安装浏览器脚本管理器扩展：[Tampermonkey（油猴）](https://www.tampermonkey.net/)。
2. 点击下载或将 [`jianguoyun-webdav.user.js`](./jianguoyun-webdav.user.js) 内容新建至 Tampermonkey 脚本编辑器中保存。
3. 打开或刷新 [坚果云 - 安全选项](https://www.jianguoyun.com/d/home#/safety) 页面，即可看到已恢复的第三方应用管理面板。

---

## 🛠️ WebDAV 配置说明

在第三方应用（如 **Obsidian**、**Zotero**、**KeePass**、**WPS** 等）配置 WebDAV 同步时，请填写：

| 配置项 | 值 | 说明 |
| :--- | :--- | :--- |
| **服务器地址 (URL)** | `https://dav.jianguoyun.com/dav/` | 可点击页面示例一键复制 |
| **账号 (Username)** | 您的坚果云注册邮箱 | 可点击页面示例一键复制 |
| **密码 (Password)** | 本脚本生成的独立应用密码 | **请勿使用坚果云登录密码** |

---

## 📄 License

[MIT License](../../LICENSE)
