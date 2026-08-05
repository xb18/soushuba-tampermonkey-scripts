# LINUX DO 摸鱼增强

> Discourse / [LINUX DO](https://linux.do) 论坛显示优化与功能增强，优雅摸鱼。

**最新版本**: v1.2.5

灵感来自 [NGA优化摸鱼体验](https://github.com/kisshang1993/NGA-BBS-Script)，针对 Discourse 架构重写，优先适配 `linux.do`，并兼容同架构站点（如 `idcflare.com`）。


### v1.2.5

- 设置：Excel 提示贴在开关旁；皮肤/行号下拉加宽避免截断；「导航/侧栏」同时控制顶栏与左侧分类/板块
- 显示导航时恢复 Discourse 左侧边栏双栏布局，并 Excel 化顶栏导航样式
- 帖内排版改为「行号 | 作者信息 | 正文」表格感，弱化论坛 chrome

### Excel 摸鱼外观说明

参考 [NGA-BBS-Script](https://github.com/kisshang1993/NGA-BBS-Script) 的 Excel 模式实现：

| 主题 | 实现方式 | 说明 |
|------|----------|------|
| **腾讯文档**（默认） | 矢量图标拼接 | 各分辨率清晰，不模糊，推荐 |
| **Microsoft Excel** | UI 截图左右拼接 | 观感最接近真 Excel；超宽屏可能略拉伸 |

## 安装

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)
2. 打开 [`linuxdo-moyu.user.js`](./linuxdo-moyu.user.js) 进行安装  
   或在油猴中新建脚本，粘贴源码

## 功能列表

### 显示优化

| 功能 | 默认 | 快捷键 | 说明 |
| --- | --- | --- | --- |
| 隐藏头像 | ✅ | `Q` | 隐藏帖内/列表头像 |
| 隐藏表情 | ❌ | `W` | 隐藏 emoji，并以 `[alt]` 文本替代 |
| 隐藏楼内图片 | ❌ | `E` | 隐藏正文图片与灯箱 |
| 隐藏用户标题 | ✅ | - | 隐藏 user-title / 状态 |
| 隐藏侧边栏 | ❌ | - | 隐藏 Discourse 左侧边栏 |
| 隐藏话题地图 | ✅ | - | 隐藏 topic map |
| 护眼模式 | ❌ | `T` | 豆沙绿背景，颜色可配 |
| 暗黑增强 | ❌ | - | 强化暗色阅读 |
| **Excel 摸鱼外观（高仿）** | ✅ | `X` | 整页横向铺满伪装成在线表格（核心摸鱼特性） |
| 　└ 皮肤 / 标题 / 行号 / 导航侧栏 | 腾讯文档 · 工作簿1 · 显示行号 · 隐藏导航侧栏 | - | 选项紧凑同行；提示贴在开关旁；A1 显示板块›标题可跳转；点工作簿标题回首页；「显示」时恢复顶栏导航 + 左侧分类/tag/板块侧栏 |
| 紧凑列表 | ❌ | - | 进一步压缩列表行高 |
| 宽屏模式 | ✅ | - | 提升内容最大宽度 |

### 功能增强

| 功能 | 默认 | 快捷键 | 说明 |
| --- | --- | --- | --- |
| 高亮楼主 | ✅ | - | 楼主标签 + 左边线高亮 |
| 只看楼主 | ❌ | `R` | 仅显示楼主楼层 |
| 黑名单 / 备注 | ✅ | - | 屏蔽用户、彩色备注标签 |
| 关键字屏蔽 | ✅ | - | 支持标题/正文，可选正则 |
| 新标签打开帖子 | ✅ | - | 列表点击新标签打开 |
| 外链直接跳转 | ✅ | - | 尽量绕过跳转包装页 |
| 触底自动加载 | ✅ | - | 自动点击「加载更多」 |
| 折叠引用 | ✅ | - | 过长引用折叠/展开 |
| 图片增强预览 | ✅ | ←/→ | 缩放、拖拽、旋转、切图 |
| 楼层跳转 | ✅ | - | 浮动按钮跳转指定楼层 |
| 返回顶部 | ✅ | - | 右下角快捷按钮 |

### 其它

- 设置面板（快捷键 `S` / 油猴菜单 / 浮动按钮）
- Excel 子选项在「显示优化」里紧凑排列（皮肤/标题/行号/导航侧栏），提示贴在开关旁；「显示」时同时恢复左侧侧栏与顶栏导航，帖内为「行号 | 作者 | 正文」表格布局
- 高级设置：字体偏移、图片宽度、引用高度、楼主颜色、护眼色、拉黑模式、浮动按钮位置等
- 快捷键：`X` 开关 Excel 外观；设置面板工具栏 ⚙ 可直接打开
- 配置导入 / 导出（JSON）
- 动态快捷键：关闭的功能也可临时热键切换
- Discourse SPA 路由自适应（`MutationObserver` + History 监听）

## 使用说明

1. 安装后访问 [linux.do](https://linux.do)
2. 点击右下角 ⚙️ 按钮，或按 `S` 打开设置
3. 按需勾选功能后点「保存并应用」
4. 在帖子页用户名旁可「备注 / 拉黑」（鼠标悬停显示）

> **默认策略**：偏摸鱼（Excel 开、藏头像/标题/话题地图），不默认藏正文图片/表情以免影响阅读。快捷键在输入框 / 编辑器中不会触发。

## 设计说明

脚本采用与 NGA 摸鱼脚本类似的**模块化架构**：

- `LinuxDoMoyu` 核心：配置、样式、面板、观察者、快捷键
- 功能模块：`OpenInNewTab` / `BanAndMark` / `KeywordsBlock` / `ImageEnhance` ...
- 显示类功能优先走 **body class + CSS**，性能更好
- DOM 选择器基于 Discourse 常见结构（`.topic-list-item`、`.topic-post`、`.cooked`、`data-user-card` 等），理论上可扩展到其它 Discourse 站点

### 匹配站点

```
https://linux.do/*
https://*.linux.do/*
https://idcflare.com/*
https://*.idcflare.com/*
```

若要用于其它 Discourse 论坛，可在油猴中追加 `@match`。

## 与现有扩展的关系

若你同时安装了 [LinuxDo Scripts](https://github.com/anghunk/linuxdo-scripts) 等扩展：

- 本脚本前缀为 `ldmy`，样式/存储相互隔离
- 部分功能可能重叠（如楼层号、免打扰），可按需关闭一边

## 调试

浏览器控制台：

```js
window.__LDMY__          // 脚本实例
window.__LDMY__.normal   // 基础开关
window.__LDMY__.banList  // 黑名单
```

## 参考

- [kisshang1993/NGA-BBS-Script](https://github.com/kisshang1993/NGA-BBS-Script)
- [Discourse](https://github.com/discourse/discourse)

## License

MIT
