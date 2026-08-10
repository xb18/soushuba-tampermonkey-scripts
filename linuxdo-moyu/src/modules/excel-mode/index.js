/** ExcelMode 门面：组合 themes / chrome / grid / horizon / lifecycle */
import chromeCss from './styles/chrome.css';
import themeTencentCss from './styles/theme-tencent.css';
import themeOfficeCss from './styles/theme-office.css';
import gridListTopicCss from './styles/grid-list-topic.css';
import gridSearchCss from './styles/grid-search.css';
import nestedCss from './styles/nested.css';
import horizonCss from './styles/horizon.css';
import sidebarCss from './styles/sidebar.css';
import titlebarCss from './styles/titlebar.css';
import darkCss from './styles/dark.css';
import { excelThemes } from './themes.js';
import { excelChrome } from './chrome.js';
import { excelGridSync } from './grid-sync.js';
import { excelHorizon } from './horizon.js';
import { excelLifecycle } from './lifecycle.js';

export const ExcelMode = {
	name: 'ExcelMode',
	style: [
		chromeCss,
		themeTencentCss,
		themeOfficeCss,
		gridListTopicCss,
		gridSearchCss,
		nestedCss,
		horizonCss,
		sidebarCss,
		titlebarCss,
		darkCss,
	],
	styleOrder: 200,
	settings: [
		{ type: 'normal', key: 'excelMode', default: true, label: 'Excel 摸鱼外观', group: 'display' },
		{ type: 'advanced', key: 'excelTheme', default: 'tencent', label: 'Excel 皮肤', group: 'excel' },
		{ type: 'advanced', key: 'excelTitle', default: '工作簿1', label: '工作簿标题', group: 'excel' },
		{ type: 'advanced', key: 'excelShowRowIndex', default: true, label: '显示行号', group: 'excel' },
		{ type: 'advanced', key: 'excelHideNav', default: true, label: '隐藏导航/侧栏', group: 'excel' },
		{ type: 'advanced', key: 'excelMetaCol', default: false, label: '分类列', group: 'excel' },
		{ type: 'advanced', key: 'excelMetaLeading', default: true, label: '元数据前置', group: 'excel' },
		{ type: 'advanced', key: 'boostAsAnnotation', default: false, label: 'Boost 批注', group: 'excel' },
	],
	_origTitle: null,
	_builtTheme: null,
	_root: null,
	...excelThemes,
	...excelChrome,
	...excelGridSync,
	...excelHorizon,
	...excelLifecycle,
};
