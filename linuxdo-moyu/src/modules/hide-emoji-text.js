/** HideEmojiText */
import { PREFIX } from '../shared/constants.js';
import { qsa } from '../shared/dom.js';

export const HideEmojiText = {
	name: 'HideEmojiText',
	settings: [
		{ type: 'normal', key: 'hideEmoji', default: false, label: '隐藏表情', group: 'display' },
	],
	styleOrder: 100,
	render(script) {
		if (!script.normal.hideEmoji) return;
		qsa('.cooked img.emoji, img.emoji').forEach((img) => {
			if (img.dataset.ldmyEmoji) return;
			img.dataset.ldmyEmoji = '1';
			if (img.nextSibling && img.nextSibling.classList && img.nextSibling.classList.contains(`${PREFIX}-emoji-alt`))
				return;
			const alt = document.createElement('span');
			alt.className = `${PREFIX}-emoji-alt`;
			alt.textContent = `[${img.alt || img.title || '表情'}]`;
			alt.style.cssText = 'color:var(--primary-medium,#888);font-size:12px;margin:0 2px';
			img.insertAdjacentElement('afterend', alt);
		});
	},
};

/** 高亮楼主补充（DOM class 可能延迟） */
