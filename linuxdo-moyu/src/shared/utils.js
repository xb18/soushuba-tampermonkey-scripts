/** 存储、页面判断、通知、弹窗等工具 */
import { PREFIX, SCRIPT_NAME } from './constants.js';
import { qs, qsa } from './dom.js';

export function storageGet(key, fallback) {
	try {
		const v = GM_getValue(key, undefined);
		return v === undefined ? fallback : v;
	} catch {
		return fallback;
	}
}

export function storageSet(key, value) {
	try {
		GM_setValue(key, value);
	} catch (e) {
		console.warn(`[${SCRIPT_NAME}] 存储失败`, e);
	}
}

export function isTypingTarget(el) {
	if (!el) return false;
	const tag = (el.tagName || '').toLowerCase();
	if (['input', 'textarea', 'select'].includes(tag)) return true;
	if (el.isContentEditable) return true;
	if (el.closest && el.closest('.d-editor, .composer, [contenteditable="true"]')) return true;
	return false;
}

export function isTopicListPage() {
	return !!qs('.topic-list, .latest-topic-list, .category-list');
}

export function isTopicPage() {
	return !!qs('.topic-post, #topic, .post-stream');
}

export function isSearchPage() {
	return (
		document.body.classList.contains('search-page') ||
		!!qs('.search-container, .fps-result-entries, .full-page-search') ||
		/^\/search(?:\/|$|\?)/.test(location.pathname)
	);
}

export function getTopicOwnerUsername() {
	const op = qs('.topic-post.topic-owner [data-user-card], .topic-post.post--topic-owner [data-user-card]');
	return op ? op.getAttribute('data-user-card') : null;
}

export function notify(msg, ms = 1800) {
	let box = qs(`#${PREFIX}-toast-box`);
	if (!box) {
		box = document.createElement('div');
		box.id = `${PREFIX}-toast-box`;
		document.body.appendChild(box);
	}
	const item = document.createElement('div');
	item.className = `${PREFIX}-toast`;
	item.textContent = msg;
	box.appendChild(item);
	requestAnimationFrame(() => item.classList.add('show'));
	setTimeout(() => {
		item.classList.remove('show');
		setTimeout(() => item.remove(), 250);
	}, ms);
}

export function escHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
	);
}

/** 备注标签国风色板：{bg 背景色, fg 建议文字色} */
export const MARK_COLORS = [
	{ bg: '#9E3E4F', fg: '#FFFFFF' }, // 胭脂
	{ bg: '#C45A4C', fg: '#FFFFFF' }, // 朱砂
	{ bg: '#D87A7A', fg: '#333333' }, // 海棠
	{ bg: '#F2D0D0', fg: '#333333' }, // 桃夭
	{ bg: '#6E9BB8', fg: '#FFFFFF' }, // 天青
	{ bg: '#3E5266', fg: '#FFFFFF' }, // 黛蓝
	{ bg: '#DCE4EC', fg: '#333333' }, // 月白
	{ bg: '#A8B5C0', fg: '#333333' }, // 苍色
	{ bg: '#4A8C7C', fg: '#FFFFFF' }, // 石绿
	{ bg: '#B8CCB8', fg: '#333333' }, // 竹青
	{ bg: '#D4D4A8', fg: '#333333' }, // 松花
	{ bg: '#C87A3E', fg: '#FFFFFF' }, // 琥珀
	{ bg: '#8C5C4A', fg: '#FFFFFF' }, // 檀棕
	{ bg: '#D9B382', fg: '#333333' }, // 黄栌
	{ bg: '#F2DC9E', fg: '#333333' }, // 缃色
	{ bg: '#C9B37E', fg: '#333333' }, // 秋香
	{ bg: '#D1B8D1', fg: '#333333' }, // 藕荷
	{ bg: '#D0C0D8', fg: '#333333' }, // 丁香
	{ bg: '#38464F', fg: '#FFFFFF' }, // 鸦青
	{ bg: '#F5EDE0', fg: '#333333' }, // 瓷白
];
export function randomMarkColor() {
	const c = MARK_COLORS[Math.floor(Math.random() * MARK_COLORS.length)];
	return c ? c.bg : '#6E9BB8';
}
/** 根据背景色取可读文字色（浅底深字/深底白字） */
export function contrastFg(bg) {
	const hex = String(bg || '').replace('#', '');
	if (hex.length < 6) return '#333333';
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return lum > 0.6 ? '#333333' : '#FFFFFF';
}
/** 色板内颜色返回建议文字色，自定义颜色按亮度推算 */
export function markFgFor(bg) {
	const hit = MARK_COLORS.find((c) => c.bg.toUpperCase() === String(bg || '').toUpperCase());
	return hit ? hit.fg : contrastFg(bg);
}

/** 自定义输入对话框（替代原生 prompt/alert） */
export function promptDialog({ title = '', fields = [], okText = '确定' } = {}) {
	return new Promise((resolve) => {
		qs(`#${PREFIX}-dialog`)?.remove();
		const dlg = document.createElement('div');
		dlg.id = `${PREFIX}-dialog`;
		dlg.innerHTML = `
        <div class="${PREFIX}-dialog-card">
          <h4 class="${PREFIX}-dialog-title">${escHtml(title)}</h4>
          ${fields
				.map(
					(f) => `
            <label>${escHtml(f.label || '')}
              <input type="${f.type === 'color' ? 'color' : 'text'}" data-k="${escHtml(f.key)}"
                value="${escHtml(f.value ?? '')}" placeholder="${escHtml(f.placeholder || '')}" ${f.type === 'color' ? 'title="选择颜色"' : ''} />
            </label>`
				)
				.join('')}
          <div class="${PREFIX}-dialog-actions">
            <button type="button" class="${PREFIX}-btn" data-act="cancel">取消</button>
            <button type="button" class="${PREFIX}-btn primary" data-act="ok">${escHtml(okText)}</button>
          </div>
        </div>`;
		dlg.addEventListener('pointerdown', (e) => {
			if (e.target === dlg) {
				resolve(null);
				dlg.remove();
			}
		});
		dlg.addEventListener('click', (e) => {
			const act = e.target.closest?.('[data-act]')?.getAttribute('data-act');
			if (!act) return;
			if (act === 'cancel') {
				resolve(null);
				dlg.remove();
				return;
			}
			const out = {};
			dlg.querySelectorAll('[data-k]').forEach((el) => {
				out[el.getAttribute('data-k')] = el.value;
			});
			resolve(out);
			dlg.remove();
		});
		dlg.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				dlg.querySelector('[data-act="ok"]')?.click();
			}
			if (e.key === 'Escape') {
				resolve(null);
				dlg.remove();
			}
		});
		document.body.appendChild(dlg);
		const first = dlg.querySelector('input[type="text"]');
		if (first) first.focus();
	});
}

export function downloadText(filename, text) {
	const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

