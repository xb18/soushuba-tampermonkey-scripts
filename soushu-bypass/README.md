# ⚡ 搜书吧免积分下载 (Soushu Bypass)

> **搜书吧附件免积分一键下载，省去积分消耗。**
>
> 专为搜书吧（Discuz! 论坛）打造的轻量脚本，自动为付费附件生成免积分直链。

![Version](https://img.shields.io/greasyfork/v/584799?style=flat-square&color=orange&label=V&logo=greasyfork) ![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ 主要功能

- **⚡ 一键下载**：在附件付费链接旁自动生成红色「⚡下载」按钮，点击直达附件。
- **🔗 直链跳转**：在附件弹窗页面自动跳转至真实下载地址，无需手动点击。
- **🧩 安全可靠**：仅依赖 Discuz! 引擎识别，不修改任何页面逻辑。

## 📦 安装指南

1. 安装油猴管理器：[Tampermonkey](https://www.tampermonkey.net/)
2. 安装脚本：[点击安装](https://greasyfork.org/zh-CN/scripts/584799-%E6%90%9C%E4%B9%A6%E5%90%A7%E5%85%8D%E7%A7%AF%E5%88%86%E4%B8%8B%E8%BD%BD)
3. 访问搜书吧任意帖子页面即可生效。

> ⚠️ 需要登录搜书吧账号才能使用。

## 🔧 原理说明

通过 base64 编码附件参数（`aid|1|1|1|tid`）构造 `mod=attachment` 直链，绕过前台积分校验，直接请求附件下载。

## 📄 许可

MIT License