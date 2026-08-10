/** ImageEnhance */
import { PREFIX } from '../shared/constants.js';
import { qs, qsa } from '../shared/dom.js';

export const ImageEnhance = {
	name: 'ImageEnhance',
	settings: [
		{ type: 'normal', key: 'imageEnhance', default: true, label: '图片增强预览', group: 'enhance' },
	],
	styleOrder: 100,
	init(script) {
		this.scale = 1;
		this.rotate = 0;
		this.list = [];
		this.index = 0;
		document.addEventListener('click', (e) => {
			if (!script.normal.imageEnhance) return;
			if (e.defaultPrevented) return;
			// 仅在直接点图片 / lightbox 时接管，避免干扰其它点击
			const img = e.target.matches?.('img') ? e.target : null;
			if (!img || img.classList.contains('emoji')) return;
			if (!img.closest('.cooked')) return;
			// 隐藏图片模式下，仅对已展开的图打开预览
			if (script.normal.hideImage) {
				const revealed =
					img.classList.contains(`${PREFIX}-img-revealed`) ||
					!!img.closest(`.${PREFIX}-img-revealed`);
				if (!revealed) return;
			}
			e.preventDefault();
			e.stopPropagation();
			this.open(script, img);
		}, true);
		document.addEventListener('keydown', (e) => {
			const viewer = qs(`.${PREFIX}-img-viewer`);
			if (!viewer) return;
			if (e.code === 'Escape') this.close();
			if (e.code === 'ArrowLeft') this.show(this.index - 1);
			if (e.code === 'ArrowRight') this.show(this.index + 1);
		});
	},
	open(script, img) {
		const post = img.closest('.cooked') || document;
		this.list = qsa('.cooked img:not(.emoji)', post.closest('.topic-post') || post).map((i) => {
			const a = i.closest('a.lightbox');
			return a?.href || i.currentSrc || i.src;
		});
		this.index = Math.max(
			0,
			this.list.indexOf(img.closest('a.lightbox')?.href || img.currentSrc || img.src)
		);
		this.scale = 1;
		this.rotate = 0;
		this.mount();
		this.show(this.index);
	},
	mount() {
		this.close();
		const viewer = document.createElement('div');
		viewer.className = `${PREFIX}-img-viewer`;
		viewer.innerHTML = `
        <div class="toolbar">
          <button type="button" data-act="prev">上一张</button>
          <button type="button" data-act="next">下一张</button>
          <button type="button" data-act="zoom-in">放大</button>
          <button type="button" data-act="zoom-out">缩小</button>
          <button type="button" data-act="rotate">旋转</button>
          <button type="button" data-act="reset">重置</button>
          <button type="button" data-act="close">关闭</button>
        </div>
        <div class="counter"></div>
        <img alt="preview" draggable="false" />
      `;
		viewer.addEventListener('click', (e) => {
			if (e.target === viewer) this.close();
			const btn = e.target.closest('button[data-act]');
			if (!btn) return;
			const act = btn.getAttribute('data-act');
			if (act === 'close') this.close();
			if (act === 'prev') this.show(this.index - 1);
			if (act === 'next') this.show(this.index + 1);
			if (act === 'zoom-in') {
				this.scale = Math.min(5, this.scale + 0.2);
				this.applyTransform();
			}
			if (act === 'zoom-out') {
				this.scale = Math.max(0.2, this.scale - 0.2);
				this.applyTransform();
			}
			if (act === 'rotate') {
				this.rotate = (this.rotate + 90) % 360;
				this.applyTransform();
			}
			if (act === 'reset') {
				this.scale = 1;
				this.rotate = 0;
				this.applyTransform();
			}
		});
		// drag
		const img = () => viewer.querySelector('img');
		let dragging = false;
		let ox = 0,
			oy = 0,
			tx = 0,
			ty = 0;
		viewer.addEventListener('mousedown', (e) => {
			if (e.target.tagName !== 'IMG') return;
			dragging = true;
			ox = e.clientX - tx;
			oy = e.clientY - ty;
			e.target.style.cursor = 'grabbing';
		});
		window.addEventListener(
			'mousemove',
			(e) => {
				if (!dragging) return;
				tx = e.clientX - ox;
				ty = e.clientY - oy;
				const el = img();
				if (el) el.style.transform = `translate(${tx}px,${ty}px) scale(${this.scale}) rotate(${this.rotate}deg)`;
			},
			true
		);
		window.addEventListener(
			'mouseup',
			() => {
				dragging = false;
				const el = img();
				if (el) el.style.cursor = 'grab';
			},
			true
		);
		this._tx = () => tx;
		this._ty = () => ty;
		this._setT = (x, y) => {
			tx = x;
			ty = y;
		};
		document.body.appendChild(viewer);
		this._viewer = viewer;
	},
	applyTransform() {
		const img = this._viewer && this._viewer.querySelector('img');
		if (!img) return;
		img.style.transform = `translate(${this._tx?.() || 0}px,${this._ty?.() || 0}px) scale(${this.scale}) rotate(${this.rotate}deg)`;
	},
	show(i) {
		if (!this.list.length) return;
		this.index = (i + this.list.length) % this.list.length;
		this.scale = 1;
		this.rotate = 0;
		this._setT?.(0, 0);
		const img = this._viewer.querySelector('img');
		img.src = this.list[this.index];
		this._viewer.querySelector('.counter').textContent = `${this.index + 1} / ${this.list.length}`;
		this.applyTransform();
	},
	close() {
		qsa(`.${PREFIX}-img-viewer`).forEach((el) => el.remove());
		this._viewer = null;
	},
};

/** 黑名单与备注 */
