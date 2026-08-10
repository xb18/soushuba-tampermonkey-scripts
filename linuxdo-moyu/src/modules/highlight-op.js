/** HighlightOP */
import { qsa } from '../shared/dom.js';
import { getTopicOwnerUsername } from '../shared/utils.js';

export const HighlightOP = {
	name: 'HighlightOP',
	settings: [
		{ type: 'normal', key: 'highlightOP', default: true, label: '高亮楼主', group: 'enhance' },
		{ type: 'normal', key: 'onlyOP', default: false, label: '只看楼主', group: 'enhance' },
	],
	styleOrder: 100,
	render(script) {
		if (!script.normal.highlightOP && !script.normal.onlyOP) return;
		const op = getTopicOwnerUsername();
		if (!op) return;
		qsa('.topic-post').forEach((post) => {
			const u = post.querySelector('[data-user-card]')?.getAttribute('data-user-card');
			if (u === op) {
				post.classList.add('topic-owner', 'post--topic-owner');
			}
		});
	},
};

/** FAB 显隐随页面 */
