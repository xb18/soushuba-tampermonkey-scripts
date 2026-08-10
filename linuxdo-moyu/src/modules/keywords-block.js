/** KeywordsBlock */
import { PREFIX } from '../shared/constants.js';
import { qs, qsa } from '../shared/dom.js';
import { notify } from '../shared/utils.js';

export const KeywordsBlock = {
	name: 'KeywordsBlock',
	settings: [
		{ type: 'normal', key: 'keywordsBlock', default: true, label: '关键字屏蔽', group: 'enhance' },
	],
	styleOrder: 100,
	onApply(script) {
		if (!script.normal.keywordsBlock) this.clearBlocked();
	},
	compile(script) {
		const list = script.keywords || [];
		if (!list.length) return null;
		if (script.advanced.keywordsUseRegex) {
			try {
				return list.map((k) => new RegExp(k, 'i'));
			} catch (e) {
				console.warn('关键字正则无效', e);
				notify('关键字正则无效，已忽略');
				return null;
			}
		}
		return list.map((k) => k.toLowerCase());
	},
	match(compiled, text, useRegex) {
		if (!compiled || !text) return false;
		if (useRegex) return compiled.some((r) => r.test(text));
		const lower = text.toLowerCase();
		return compiled.some((k) => lower.includes(k));
	},
	clearBlocked() {
		qsa(`.${PREFIX}-kw-blocked`).forEach((el) => el.classList.remove(`${PREFIX}-kw-blocked`));
	},
	render(script) {
		// 先清理，保证关闭功能 / 清空关键字后可恢复
		this.clearBlocked();
		if (!script.normal.keywordsBlock) return;
		const compiled = this.compile(script);
		if (!compiled) return;
		const useRegex = !!script.advanced.keywordsUseRegex;

		if (script.advanced.keywordsMatchTitle) {
			qsa('.topic-list-item').forEach((row) => {
				const title =
					row.querySelector('a.raw-topic-link, a.title, .main-link')?.textContent || '';
				if (this.match(compiled, title, useRegex)) {
					row.classList.add(`${PREFIX}-kw-blocked`);
				}
			});
			qsa('.fps-result').forEach((row) => {
				const title =
					row.querySelector('a.search-link .topic-title, a.search-link, .topic-title')?.textContent ||
					'';
				if (this.match(compiled, title, useRegex)) {
					row.classList.add(`${PREFIX}-kw-blocked`);
				}
			});
		}

		// 正文关键字只匹配各楼层内容；标题匹配仅作用于列表页，避免进帖后误伤全部回复
		if (script.advanced.keywordsMatchContent) {
			qsa(`.fps-result:not(.${PREFIX}-kw-blocked)`).forEach((row) => {
				const blurb = row.querySelector('.blurb')?.textContent || '';
				if (this.match(compiled, blurb, useRegex)) {
					row.classList.add(`${PREFIX}-kw-blocked`);
				}
			});
			qsa('.topic-post').forEach((post) => {
				const content = post.querySelector('.cooked')?.innerText || '';
				if (!this.match(compiled, content, useRegex)) return;
				// 不隐藏主楼，避免整个帖子空白
				if (post.getAttribute('data-post-number') === '1') return;
				post.classList.add(`${PREFIX}-kw-blocked`);
			});
		}
	},
};

/** 表情隐藏时用 alt 文本替代 */

/** 隐藏楼内图片时插入 [图] 占位，点击临时显示 */
