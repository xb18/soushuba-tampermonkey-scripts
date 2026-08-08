# LINUX DO 摸鱼脚本 TODO（按优先级）

依据：`linuxdo-moyu.user.js` 现状 + `shouye.html` / `topic-detail.html` DOM 结构。  
原则：**先修阻断使用的 bug → 再补核心摸鱼体验 → 再做增强与皮肤**。

---

## P0 · 阻断使用（先修）

### 1. [Bug] 回复发送按钮被 Excel 底栏遮挡 ✅ DONE
- **现象**：Excel 开启时，Discourse 底部 composer（`#reply-control` / `.save-or-cancel`）被固定底栏盖住，发帖/回复点不到。
- **根因线索**：
  - Excel footer 固定：`#ldmy-excel-root .ldmy-excel-footer`，`z-index: 99981`，高约 `36px`（腾讯）/`50px`（Office）。
  - 页面只给了 `#main-outlet-wrapper { padding-bottom: footer-h + 4px }`，**没有抬升 docked composer**。
  - Excel 还 `display:none` 了 `footer.topic-footer-main-buttons`，底部「回复」入口被藏掉，更依赖 composer。
- **样例 DOM**（`topic-detail.html`）：`#reply-control`、`#topic-footer-buttons .btn-primary.create`、楼层 `post-action-menu__reply`。
- **建议改法**：
  1. composer 打开时给 `#reply-control` / `.docked-composer` 加 `bottom: var(--ldmy-excel-footer-h)`（或等价 padding）。
  2. 提高 composer 层级（至少 > footer 99981），保存/取消按钮始终可点。
  3. 可选：composer 打开时临时隐藏/压扁 Excel footer，或把底栏 sheet 区让位。
- **验收**：打开回复 → 输入 → 能点「回复/发送」；收起 composer 后布局恢复。

---

## P1 · 高感知体验（紧随其后）

### 2. [Bug] 暗色模式适配不全 ✅ DONE
- **现象**：Excel + 暗色时局部仍浅色/刺眼，伪装与可读性一起崩。  
  截图：![暗色适配不全](https://cdn3.ldstatic.com/original/4X/c/b/7/cb72144226f83931ce7137eaa28fbc13007619bf.jpeg)
- **现状**：`ldmy-excel-dark` 已覆盖 chrome、列表格、侧栏、搜索、基础帖文；**未覆盖**：
  - `discourse-boosts*` 气泡
  - `post-menu-area` / 操作按钮
  - `#reply-control` composer / 弹层
  - onebox、代码块/`hljs`、引用、徽章、分类色块、时间线残留等
- **建议改法**：
  1. 按「帖内阅读路径」补齐：meta → cooked 子元素 → boost → post-menu → composer。
  2. 尽量吃站点 CSS 变量（`--primary/--secondary`），Excel 强制色只打在伪装层。
  3. 对照截图逐项打勾，避免只修背景不修文字/边框。
- **验收**：暗色下首页列表 + 帖内楼层 + 打开回复，无明显大块浅色残留。

---

## P2 · 日常好用（半成品补全 / 中等功能）

### 3. [Feature/完善] 字体大小可调（现在偏小） ✅ DONE
- **现状**：高级设置已有 `fontSize` 偏移（-4~12px），但只作用：
  `.cooked` / `.topic-list .title` / `.fancy-title`
- **缺口**：Excel 多处写死 `font-size: 13px !important`（列表标题、单元格、侧栏、搜索行等），偏移盖不全；作者列、meta、boost、表头仍偏小。
- **建议改法**：
  1. 用统一 CSS 变量 `--ldmy-font-offset` 贯穿 Excel 表格字号：`calc(13px + var(...))`。
  2. 覆盖列表、帖内、搜索、设置面板预览；默认偏移可调到 `+1/+2` 更易读。
  3. 设置里保留滑杆/数字，改完即时预览。
- **验收**：改偏移后列表+正文+Excel 表头同步变大变小，无部分区域不动。

### 4. [Feature] 支持快速回复 ✅ DONE
- **诉求**：少步骤回帖，贴近摸鱼流，不必每次拉起完整 composer 流程感。
- **样例入口**（`topic-detail.html`）：时间线 `create.reply-to-post`、楼层 `post-action-menu__reply`、底栏 `btn-primary.create`。
- **建议改法**（由简到繁）：
  1. **MVP**：浮动「快速回复」→ 触发原生回复按钮 + 自动 focus `#reply-control textarea`（先解决 P0 遮挡）。
  2. **进阶**：帖底/侧缘迷你输入框，提交走 Discourse 同一套 composer/API，避免自造发帖协议。
  3. 快捷键（如 `F`/`Ctrl+Enter`）可后续再挂。
- **验收**：帖内一键进入可输入状态；发送成功后列表/楼层正常刷新。

### 5. [UX] 标题栏「主页」图标点击回首页 ✅ DONE
- **现象**：工作簿标题点击回首页**已稳定可用**；缺的是标题栏左侧「主页/房子」图标也可点回首页。  
  参考：![主页图标](https://cdn3.ldstatic.com/original/4X/c/b/7/cb72144226f83931ce7137eaa28fbc13007619bf.jpeg)（用户截图：红色箭头指向 titlebar 最左侧 home 图标）
- **现状**（腾讯文档皮）：
  - titlebar 起始为装饰图标：`icon_1`（房子）+ `icon_2`（下拉三角）+ 分隔线 + 工作簿标题。
  - 仅 `.ldmy-excel-titlebar-title` / `.ldmy-excel-h1-title` / sheet 名绑定了 `homeUrl()`。
  - `icon_1` 只是纯装饰 `<img class="ldmy-excel-ico">`，无 click handler。
- **建议改法**：
  1. 给 titlebar 最左侧 home 图标（及可选旁边下拉三角整块热区）加 `role="link"`、`title="返回首页"`、`cursor:pointer`。
  2. 点击复用现有 `homeUrl()` + `location.assign`（与工作簿标题同一路径即可）。
  3. Office 主题若有对应 logo/切片，一并绑定；避免误绑真正功能按钮。
- **验收**：点 home 图标与点「工作簿1」标题效果一致，均回站点首页。

---

## P3 · 可选增强（设置项，默认关）

### 6. [UX·可选] 列表元数据前置：活动 / 浏览 / 回复放话题前 ✅ DONE
- **现象**：标题在左、回复/浏览/活动在右，扫一眼要左右跑。  
  参考：![元数据位置](https://cdn3.ldstatic.com/optimized/4X/8/6/e/86e6e6079d59a2d758502ca503643b30e06cb4ea_2_690x359.png)
- **产品决策**：**可选设置项，默认关闭**（不改变现有列表习惯）。
- **现状 DOM**（`shouye.html` 经典列表）：
  `话题(main-link) | 发帖人(posters) | 回复(posts) | 浏览(views) | 活动(activity)`  
  Excel 目前主要是压窄右侧列 + 藏 posters，**没有把元数据挪到标题前**。
- **建议改法**（二选一，优先 DOM 重排更稳）：
  1. 设置项如 `excelMetaLeading` / `listMetaBeforeTitle`，**默认 `false`**。
  2. 开启后 JS 重排 thead/tbody 为  
     `# | 活动 | 浏览 | 回复 | 标题 | (分类可选)`  
     或 `# | 回复 | 浏览 | 活动 | 标题`（与截图偏好对齐后定稿）。
  3. 备选：`display:grid` + `order`（Horizon 更敏感，易和现有 horizon 重排打架）。
- **注意**：Horizon 路径已有 `compactHorizonCols` 列重排，经典列表要走独立逻辑，别互相覆盖；关闭设置须幂等还原列序。
- **验收**：默认布局不变；开启后活动/热度先入眼，标题可点、表头排序仍可用；关闭后恢复原列序。

### 7. [Feature·可选] 把 boost 渲染为批注 ✅ DONE
- **产品决策**：**可选设置项，默认关闭**。
- **现状 DOM**：
  `.discourse-boosts__post-menu > .discourse-boosts > .discourse-boosts__list > .discourse-boosts__bubble > .discourse-boosts__cooked`
- **问题**：气泡挤在楼层操作区，Excel 表格风被打散；暗色也未适配。
- **建议改法**：
  1. 设置项如 `boostAsAnnotation`，**默认 `false`**；仅 Excel 模式下生效（或按开关全局生效，实现时定）。
  2. 开启后将 boost 收成「批注」样式：侧注/折叠条/角标+hover 展开。
  3. 保留原 bubble 点击/互动（可 action 的 `--actionable` 不要弄丢）。
  4. 与「隐藏表情/图片」、暗色模式策略兼容。
- **验收**：默认仍是原生 boost 气泡；开启后能看全文案且行高不被撑爆；关闭后还原。

---

## P4 · 大件皮肤（最后做）

### 8. [Feature] IDE 风格（IDEA）皮肤
- **定位**：第三套伪装主题（现有：腾讯文档 / Microsoft Excel）。
- **建议范围**：
  - 顶栏 Tab、编辑区、状态栏、行号沟、Darcula/Light 配色。
  - 复用现有 `excelTheme` 切换骨架，新增 `idea`/`ide` 资源与 CSS 变量。
  - **不要**阻塞 P0–P2；可等暗色体系稳定后抽公共 token 再做。
- **验收**：`X` 开启摸鱼外观后可选 IDEA 皮；列表/帖内/设置不回归。

---

## 推荐落地顺序（执行清单）

1. **P0-1** 修复 composer 被底栏遮挡
2. **P1-2** 暗色模式补全（对照截图）
3. **P2-3** 字体偏移真正全局生效
4. **P2-4** 快速回复 MVP
5. **P2-5** 标题栏 home 图标点击回首页
6. **P3-6** 列表元数据前置（设置项，默认关）
7. **P3-7** boost → 批注（设置项，默认关）
8. **P4-8** IDEA 皮肤

## 实现时注意

- linux.do 有 CF，开发以本地 `shouye.html` / `topic-detail.html` 结构为准，真机再验 SPA 路由与 composer 动画。
- Horizon 主题与 Default/Moyu 经典列表是两套列模型，改列表列序要分支处理。
- 凡 `position: fixed` 的脚本 UI（Excel 头尾、FAB、设置、看图）都要给原生 composer/弹层让路。
- 可选功能一律：**设置项 + 默认关闭 + 开关幂等还原**，避免改变现有默认摸鱼布局。
