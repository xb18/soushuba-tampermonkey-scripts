/** HideImagePlaceholder */
import { PREFIX } from '../shared/constants.js';
import { qs, qsa } from '../shared/dom.js';

export const HideImagePlaceholder = {
	name: 'HideImagePlaceholder',
	settings: [
		{ type: 'normal', key: 'hideImage', default: false, label: '隐藏楼内图片', group: 'display' },
	],
	styleOrder: 100,
	init(script) {
		document.addEventListener(
			'click',
			(e) => {
				const ph = e.target?.closest?.(`.${PREFIX}-img-ph`);
				if (!ph) return;
				if (!script.normal.hideImage) return;
				e.preventDefault();
				e.stopPropagation();
				const target = ph.__ldmyTarget;
				if (!target || !target.isConnected) return;
				const open = !target.classList.contains(`${PREFIX}-img-revealed`);
				this.setRevealed(ph, target, open);
			},
			true
		);
	},
	labelFor(count) {
		const n = Math.max(1, count | 0);
		return n > 1 ? `[图×${n}]` : '[图]';
	},
	setRevealed(ph, target, open) {
		target.classList.toggle(`${PREFIX}-img-revealed`, open);
		if (!target.matches?.('img')) {
			qsa('img:not(.emoji)', target).forEach((img) => {
				img.classList.toggle(`${PREFIX}-img-revealed`, open);
			});
		}
		const count = Number(ph.dataset.count || 1) || 1;
		ph.classList.toggle('is-open', open);
		ph.textContent = open ? '[收起]' : this.labelFor(count);
		ph.title = open ? '点击收起图片' : '点击显示图片';
		ph.setAttribute('aria-expanded', open ? 'true' : 'false');
	},
	makePh(count, target) {
		const ph = document.createElement('span');
		ph.className = `${PREFIX}-img-ph`;
		ph.dataset.count = String(Math.max(1, count | 0));
		ph.textContent = this.labelFor(count);
		ph.title = '点击显示图片';
		ph.setAttribute('role', 'button');
		ph.setAttribute('tabindex', '0');
		ph.setAttribute('aria-expanded', 'false');
		ph.__ldmyTarget = target;
		ph.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			e.preventDefault();
			ph.click();
		});
		return ph;
	},
	attach(target, count) {
		if (!target) return;
		// 已有占位则复用（含 SPA 局部重绘后重新挂 target）
		const prev = target.previousElementSibling;
		if (prev && prev.classList?.contains(`${PREFIX}-img-ph`)) {
			prev.__ldmyTarget = target;
			const open = target.classList.contains(`${PREFIX}-img-revealed`);
			this.setRevealed(prev, target, open);
			return;
		}
		// 已处理过且仍在 hide 流程中，但占位被 Discouse 清掉时重建
		const n =
			count != null
				? count
				: target.matches?.('img')
					? 1
					: Math.max(1, qsa('img:not(.emoji)', target).length || 1);
		const ph = this.makePh(n, target);
		target.insertAdjacentElement('beforebegin', ph);
	},
	render(script) {
		if (!script.normal.hideImage) return;
		qsa('.cooked').forEach((cooked) => {
			qsa('.lightbox-wrapper', cooked).forEach((wrap) => {
				this.attach(wrap);
			});
			qsa('.image-wrapper', cooked).forEach((wrap) => {
				if (wrap.closest('.lightbox-wrapper')) return;
				this.attach(wrap);
			});
			qsa('img:not(.emoji)', cooked).forEach((img) => {
				if (img.closest('.lightbox-wrapper, .image-wrapper')) return;
				// 跳过站外 onebox 图标等极小图可选；保持与 hide CSS 一致全部占位
				this.attach(img, 1);
			});
		});
		qsa('img.signature-img, .signature-img, .user-signature img').forEach((img) => {
			if (img.tagName === 'IMG') {
				this.attach(img, 1);
			}
		});
	},
};

