/** OpenInNewTab */
import { PREFIX } from '../shared/constants.js';

export const OpenInNewTab = {
	name: 'OpenInNewTab',
	settings: [
		{ type: 'normal', key: 'openInNewTab', default: false, label: '新标签打开帖子', group: 'enhance' },
	],
	styleOrder: 100,
	init(script) {
		document.addEventListener(
			'click',
			(e) => {
				if (!script.normal.openInNewTab) return;
				if (e.defaultPrevented) return;
				if (e.button !== 0) return;
				if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
				const a = e.target.closest && e.target.closest('a[href]');
				if (!a) return;
				// 只处理话题列表里的帖子链接，避免误伤站内其它导航
				const inList = a.closest(
					'.topic-list, .topic-list-body, .latest-topic-list, table.topic-list, .search-results'
				);
				if (!inList) return;
				if (a.closest('.posters, .topic-statuses, .badge-category, .discourse-tags')) return;
				let url;
				try {
					url = new URL(a.href, location.origin);
				} catch {
					return;
				}
				if (url.origin !== location.origin) return;
				// /t/slug/id 或 /t/id
				if (!/^\/t\//.test(url.pathname)) return;
				e.preventDefault();
				e.stopPropagation();
				if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
				window.open(url.href, '_blank', 'noopener,noreferrer');
			},
			true
		);
	},
};

/** 图片增强 */
