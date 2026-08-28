/** 脚本常量与默认配置 */
export const SCRIPT_NAME = 'LINUX DO 优化摸鱼体验';
export const SCRIPT_VERSION = '1.2.2';
export const PREFIX = 'ldmy';
export const PROJECT_URL = 'https://github.com/urzeye/tampermonkey-scripts';
export const STORAGE = {
	SETTINGS: `${PREFIX}_settings`,
	SETTINGS_REV: `${PREFIX}_settings_rev`,
	BAN_LIST: `${PREFIX}_ban_list`,
	MARK_LIST: `${PREFIX}_mark_list`,
	KEYWORDS: `${PREFIX}_keywords`,
	SHORTCUTS: `${PREFIX}_shortcuts`,
};
// 设置结构修订号：升版本时把「仍等于旧默认」的项迁到新默认，不覆盖用户显式改过的值
export const SETTINGS_REV = 2;

export const DEFAULT_NORMAL = {
	// 摸鱼向默认：装完即伪装 + 少露论坛特征；伤阅读的（藏图/藏表情）保持关
	hideAvatar: true,
	hideEmoji: false,
	hideImage: false,
	hideUserTitle: true,
	hideSidebar: false, // Excel 开时会自行隐藏侧栏；关 Excel 时保留导航
	hideTopicMap: true,
	excelMode: true, // 核心卖点，默认开；快捷键 X 可关
	compactMode: true,
	wideMode: true,
	highlightOP: true,
	onlyOP: false, // 模式型，不默认
	banAndMark: true,
	keywordsBlock: true,
	openInNewTab: false, // 捕获点击绕过 Discourse SPA 劫持
	imageEnhance: true,
	floorJump: true,
	backToTop: true,
};

export const DEFAULT_ADVANCED = {
	dynamicEnable: true,
	fontSize: -1, // 相对偏移 px；0=不调整（滑块步进 0.5，范围 -4~+4）
	imageMaxWidth: 0, // 0=不限制（最大不超过正文列宽）；>0 时强制封顶
	authorMarkColor: '#e74c3c',
	banMode: 'hide', // hide | remove
	keywordsMatchTitle: true,
	keywordsMatchContent: true,
	keywordsUseRegex: false,
	fabPosition: 'right', // left | right
	excelTheme: 'tencent', // tencent | office
	excelTitle: '工作簿1',
	excelShowRowIndex: true,
	excelHideNav: true, // 隐藏顶栏导航 + 左侧侧栏（分类/tag/板块）
	excelMetaCol: false, // Default/Moyu 经典列表：分类/标签单独一列（false=留在标题下方）
	excelMetaLeading: true, // 经典列表：把活动/浏览/回复挪到标题前
	boostAsAnnotation: false, // 帖内 boost 收成批注样式（默认关）
};

export const DEFAULT_SHORTCUTS = {
	hideAvatar: 'KeyQ',
	hideEmoji: 'KeyW',
	hideImage: 'KeyE',
	onlyOP: 'KeyR',
	settingPanel: 'KeyS',
	excelMode: 'KeyX',
	hideSidebar: 'KeyH', // Excel 开启时等价于「导航/侧栏」开关
};
