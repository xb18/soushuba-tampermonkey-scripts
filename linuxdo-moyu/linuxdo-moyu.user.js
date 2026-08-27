// ==UserScript==
// @name          LINUX DO 优化摸鱼体验
// @namespace     https://github.com/urzeye/tampermonkey-scripts
// @version       1.2.1
// @description   LINUX DO (linux.do) / Discourse论坛显示优化与功能增强，优雅摸鱼。支持高仿 Excel 摸鱼外观（腾讯文档矢量 / Microsoft Excel 切图主题）、隐藏头像/表情/图片（[图]占位）、高亮楼主、黑名单、关键字屏蔽、图片预览
// @author        urzeye
// @license       MIT
// @match         https://linux.do/*
// @match         https://idcflare.com/*
// @icon          https://www.google.com/s2/favicons?domain=linux.do
// @grant         GM_registerMenuCommand
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_deleteValue
// @grant         GM_addStyle
// @grant         GM_setClipboard
// @grant         window.onurlchange
// @run-at        document-idle
// ==/UserScript==

(function () {

	/** 脚本常量与默认配置 */
	const SCRIPT_NAME = 'LINUX DO 优化摸鱼体验';
	const SCRIPT_VERSION = '1.2.1';
	const PREFIX = 'ldmy';
	const PROJECT_URL = 'https://github.com/urzeye/tampermonkey-scripts';
	const STORAGE = {
		SETTINGS: `${PREFIX}_settings`,
		SETTINGS_REV: `${PREFIX}_settings_rev`,
		BAN_LIST: `${PREFIX}_ban_list`,
		MARK_LIST: `${PREFIX}_mark_list`,
		KEYWORDS: `${PREFIX}_keywords`,
		SHORTCUTS: `${PREFIX}_shortcuts`,
	};
	// 设置结构修订号：升版本时把「仍等于旧默认」的项迁到新默认，不覆盖用户显式改过的值
	const SETTINGS_REV = 2;

	const DEFAULT_NORMAL = {
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

	const DEFAULT_ADVANCED = {
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

	const DEFAULT_SHORTCUTS = {
		hideAvatar: 'KeyQ',
		hideEmoji: 'KeyW',
		hideImage: 'KeyE',
		onlyOP: 'KeyR',
		settingPanel: 'KeyS',
		excelMode: 'KeyX',
		hideSidebar: 'KeyH', // Excel 开启时等价于「导航/侧栏」开关
	};

	/** DOM 与节流工具 */
	const qs = (sel, root = document) => root.querySelector(sel);
	const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

	function debounce(fn, wait = 120) {
		let t;
		return function (...args) {
			clearTimeout(t);
			t = setTimeout(() => fn.apply(this, args), wait);
		};
	}

	/** 存储、页面判断、通知、弹窗等工具 */

	function storageGet(key, fallback) {
		try {
			const v = GM_getValue(key, undefined);
			return v === undefined ? fallback : v;
		} catch {
			return fallback;
		}
	}

	function storageSet(key, value) {
		try {
			GM_setValue(key, value);
		} catch (e) {
			console.warn(`[${SCRIPT_NAME}] 存储失败`, e);
		}
	}

	function isTypingTarget(el) {
		if (!el) return false;
		const tag = (el.tagName || '').toLowerCase();
		if (['input', 'textarea', 'select'].includes(tag)) return true;
		if (el.isContentEditable) return true;
		if (el.closest && el.closest('.d-editor, .composer, [contenteditable="true"]')) return true;
		return false;
	}

	function isTopicListPage() {
		return !!qs('.topic-list, .latest-topic-list, .category-list');
	}

	function isTopicPage() {
		return !!qs('.topic-post, #topic, .post-stream');
	}

	function isSearchPage() {
		return (
			document.body.classList.contains('search-page') ||
			!!qs('.search-container, .fps-result-entries, .full-page-search') ||
			/^\/search(?:\/|$|\?)/.test(location.pathname)
		);
	}

	function getTopicOwnerUsername() {
		const op = qs('.topic-post.topic-owner [data-user-card], .topic-post.post--topic-owner [data-user-card]');
		return op ? op.getAttribute('data-user-card') : null;
	}

	function notify(msg, ms = 1800) {
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

	function escHtml(s) {
		return String(s ?? '').replace(/[&<>"']/g, (c) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
		);
	}

	/** 备注标签国风色板：{bg 背景色, fg 建议文字色} */
	const MARK_COLORS = [
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
	function randomMarkColor() {
		const c = MARK_COLORS[Math.floor(Math.random() * MARK_COLORS.length)];
		return c ? c.bg : '#6E9BB8';
	}
	/** 根据背景色取可读文字色（浅底深字/深底白字） */
	function contrastFg(bg) {
		const hex = String(bg || '').replace('#', '');
		if (hex.length < 6) return '#333333';
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return lum > 0.6 ? '#333333' : '#FFFFFF';
	}
	/** 色板内颜色返回建议文字色，自定义颜色按亮度推算 */
	function markFgFor(bg) {
		const hit = MARK_COLORS.find((c) => c.bg.toUpperCase() === String(bg || '').toUpperCase());
		return hit ? hit.fg : contrastFg(bg);
	}

	/** 自定义输入对话框（替代原生 prompt/alert） */
	function promptDialog({ title = '', fields = [], okText = '确定' } = {}) {
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

	function downloadText(filename, text) {
		const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	/** 赞赏二维码 */
	const SUPPORT_WECHAT_IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAFAAUADASIAAhEBAxEB/8QAHAABAAIDAQEBAAAAAAAAAAAAAAYHAQQFAwII/8QAShAAAQMDAgMFBgIHBQUHBQEAAQIDBAAFEQYSByExE0FRYXEUIoGRobEVMiM0QlJywdEWM1NicwgXQ4KyJFSDkpOi4SY1VWPw8f/EABoBAQADAQEBAAAAAAAAAAAAAAABAgMEBQb/xAAmEQEAAgICAgIBBAMAAAAAAAAAAQIDERIhBDEFEyIyQVFhUnGR/9oADAMBAAIRAxEAPwC5qUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKxXlLeMaG8+lBWWm1LCB+1gZxVf8M+JEzWVwnQbjHjsutIDzPY5GU5wQQSemRzoLGrzeeajsrefcQ02gblLWoBKR4knpXpUS4osOSOHV4S3u3JaSs7T3JUCfhgGgk0SbFnx0yIchqQyv8rjSwpJ+Ir3qreArzi9LXBlWdjc3KT3c0JyB8vrVpUHjKlR4UdciU+2wygZU44oJSn1JrMeQxLYQ/GeQ804MocbUFJUPIiuRq/TDGrrA7aX5DkdK1JWlxABwUnIyD1HlXppXTzOltPxrOw84+hjce0XyKiSSeXd16UHYpSq94n8Q5mjHIMa3R2HZEkKcWXgSEoBA6Ajqc/KgsKlalrlrn2qJMW12SpDCHFI/dKkg4+tbdApSlApSlApSlApSlApSlApSlApSlApSlApSlApSlApSlApStS5XOFZ4Dk64yURozQG9xZ5DJwPrQbdYPStS13aBeoKJ1tlNyYzmdrjZ5ZHUeRrcoIH/AGw1F/vQ/s7+Cj8L6e0dmrdt2Z37vy4zyx/Op2K5epb6xpqwSrxIaW63GSCUI6qJIAHzNa2j9Ux9YWJN1jx3I4Lim1NuEEhQ8COo5ig7p5jnVd6Q4Xu6X1pKvQuDbkVaXEsspQQoBRzhXdy8qsWlAr5WhLiChaQpKhgpIyCK+qUHhEhRYLPYw4zUdrOdjSAhOfQV70pQKVAuIXEr+xNwhQ2remWt9Bdc3ObdqM45cupwflU5jvJkR23kghLiAoAjmMjNB6VXeuuGL2sNTw7mLihmO22lp5paCTtCifd9c99WJSg+W0pQhKEgJSkYAHcKzWajPEK/O6c0ZPuEcHt9oaaUP2VLO0K+Gc0EWZ4pTZ/E1vT1uhsP24vlhTgBKzge8sHOMAg93QVZw6VTfAvTRPtepZKCSrLEYnv/AH1fYfOrloFK1bjcoVoguTrhJbjRmhlbjhwBXzartAvcBE62ykSYzhIS4jpkciPKg3KUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUrFBmuLq3TzWqdNy7Q6vsy8kFtf7qwcpPpkV5X/W2ndMq7O6XNpp7GexSCtz/AMo5j41zbbxU0dc5Ijt3ZLK1HCfaG1NAn1IxQQzg9D1NYdR3Gzz4EhmDsK3C4ghCXQQAUq6HIz064HhVyV8pKVAKSQQRkEGvP2yN7V7L7Q17Rt3dlvG/Hjjrig+pEdmUwtiQ0h5pwbVocSFJUPAg9ajT+rtLaavUXTG9EN5zbsaaZ2toKjyBI5DP86lFUzx004UOw9SxkkZxHkFPcRkoV9x8qC5qVGuH2pBqjSMSatQMlsdjJGejieRPxGD8akMlLq4zqGVht1SCELIztVjkfnQemazUG4c2DVtkVcTqW5GUl5SSykvl3BGdygT0B5cqnBoM0qCQdbX2TxMkabds2y3tlQEjYrcAE5CyemCeXxqdCgrPiPw3uur9TQJ8OSwmMhpLLwdUQUAKJJAA58jVlNoDbaUJ6JAA+FfVZoOFrHUzektOvXdyMuT2akoDaVbclRwMnuFfektRN6q07GvDcdccP7gW1nO0gkHB7xy611n2GZLKmX2kOtLGFIWkKSoeYNGWWo7SWmW0NNoGEoQkAJHkBQfdRkaw0xetQSNJrcRKkjclbTjO5tZTzKcnkSP5V7631EjS+lJlzyO2SjYwkn8ziuSfl19BVY8D9Orm3SZqeXlfYktMqV1U4rmtXwBx/wA1BdMaLHhx0R4rDbDLYwhttISlI8gK9aVGte6huOmdNLuNrgiY+HEoKVJKkoSc5UQOeO740EG40RtR3e5Wy0W2BJfgrTvyyglK3ckYURyGB4+Jqf6K00jSmmItrDnaOpBW8vuU4rmrHl3D0r30tdZd601CuU+J7HIkN7nGcEbeZGcHnggZ5+Nci6cUdH2iQY712S66k4UI6FOhJ8ykYoJfSo9Yddab1I4GbZdGlvn/AILgLbh9Eq6/CpBQZpSlApSlApSlApSlApSlApSlApStWfcoVrimVPlsxWAQC48sJTk9Bk0G1US4kasXpHSrkuMU+2PrDMfdzAUeqsd+ACfXFSlh9qSyh9hxDrTiQpC0KylQPQg1V3HqK85py3SUJJbZlFKyO7cnl9qDn6C4WMX2EnUWqlvSnJv6VtguEbkn9pZ6knrjwqRX3g3pe4wFptjCrdKCT2brbilJz/mSScj0513bM43qTh3HRb5ZY9pt4ZS6g82l7Np6d4NanDvSFw0dapMW4XFMxT729KUFW1Axjlu7z30ES4T6judvvcrQ97UouRt3s+45KCn8yAe9OOYrh8UrVddKa6b1XBeVslOBxp3/AA3EgAoPkQPiMjurcsjzd7/2g5E6AQ5HZU4VLT0IS3sJ9Cqra1DYYepLJItU5OWn04CgOaFdyh5g0GvpDU8XVtgYucbCVq919rOS04Oqf5jyIrZ1FZWNQ2GZapA9yS2U5/dV1SfgQDUa4c6AkaITP7e5Jl+1qRtShBSlITnnz7zmpxQUXwbl3Cya2n6bktLCXEr7VHc243+16EZHxFXnXwmOyh5TyWkBxYwpYSAo+pr7oK21NxOmaf4iR7CuGx+HktB11Wd5C8e8DnGBnw7jVk91V/r/AIYnWV4h3GPPRDW0gNPbmyrckHIIx3jJqfNI7NpKMlW0AZPU0Efn65sVu1OxpyTIWmc+UhIDZKElX5QVdxNSLurgz9L6ck6ijXudEZNyQQGXFuFO4j8vu5wSPSu93UEdY13YZOq16ZbkrM9slJBbIQVAZKQrxA+1SOqS0npe9DjRKuE23PtMMSZDxeW2digrcE7VHkc7hVtaiuabNp2fclHHs0dbg/iA5fXFB0UuIUpSUqBKTggHpX1VI8CG5sq+3i5OvOLb7FKXCok73FKzk+J5H51a2qr4nTmmZ12UNxjtEoT+8s8kj5kUGrrTR8XWloRb5Uh2P2TodQ42AcEAjmD1GDW/p2xRNNWSNaYW4ssJxuVjcsk5Kj5k1V3BA3i43W7XeZMfdjqSG19oskLdJ3Z5+A/6quSg4+qNRw9K2J+6zDlLYwhsHBcWeiR6/bNcThzrl/W8Ga/IgJiKiupQChZUlYIz394x9RTiNoaRreFCZj3BMRUVxSiFoKkrBAHd3jH1NdzTGnIelrExaoXNDQytwjBcWeqj6/bFBX3F7VFxVOiaOsqlCROCe3KDhStxwlGe7PU+WK6WnuDOm7db0fi7JuMsp/SrU4pLaT4JAI5eZqMayeRZeO1tuU79HFX2Kw4egTgoJ+BqwOIOlZusLC1Ct9xTEWh4OHcTscGCMHHPvyKCGa74TRLdbnL5pYuxJEIdsuOHCQUjmSg9QodetS3hhq53VmmO0mKCp0RfYvqAxv5ZSr4j6g10FBGlNAlFzme0CBBKHXl/8QhOO/xOAKgvAGM6i2XeUpJDTrzaEHxKQSf+oUFu0r4dcQy0p11aUIQCpSlHASB1JNa9vukC7R/aLdMYlshRSVsuBYB8Mig26UpQKUpQKUpQKUpQKUpQKj2s9HxNZ2hFvlSHY/Zuh1DjeCQQCOYPUYJqQVmg59jtDFhssS1RlrW1FbDaVLOVHzNZvVnhX60yLZcGu0jyE7VDvHgQe4g8xW/XI1VPuNr01Om2mJ7XNZb3NNbSrJyMnA5nAyceVBUabDxB4ZTnzYW1XO2OKztQ32iVeakDmlXmK+peoOKesGVWxizu29p0bXVtsKZyD1ytZ5D0qy9A3m9X3TSJt9heySi6pIHZlvegYwraeY7x8KkvKghGiNG27h1ZH5dwls+0uJBlSlq2oQB0Sknuz8zUwhTYtxiolwpDchhwZQ60oKSr0Irn6o07G1VYX7RLccbae2ne3jKSDkHn6VjSum42lLEzaYjrjrbZUorcxlRJyenSg7FQ7THEe36o1JNssaHIZcihakuOYwsJVtPIdOtTGtSNabdClvS4sCOxIkHLrrbQSpz1I60Gy7v7JXZ4K8HbnpnuqoOHPEO9ydYyLDqaSXFvqUloKQE9k6knKOQ6EA/ECrhqi+LmnJln1hE1FaGXMy1heWUElL6SOfLx5H1zQW1rG5TbTpG53C3Ae1R2CtslOceJx5DJqL8JNaT9V2yazdXkvTIbiSHAkJKkKBxkDlyIP0qaNtrutiS1PY7JcuNtfa/cKk+8n4ZNU1wet90tGv7jDXGdDDbLjL61IISClQ2nPmRy9aD548KeZ1Ta3UuLCREy34JUFnJHn0+lXVAlpetEeY4sbVsJdUryKQSaqbj1bpD79mlMR3HRtdaUUIKsHKSAcfGrBiomN8Nm23I7olptO0sn8+8NYx65oPHSfEGzaxmy4luTIQ5GG79MkAOJzjcME/Xxrg8cLt7FoxuAlWF3CQlJH+RPvH67ajvAe1ymbjdZz8Z1tsMoZStaCAVbskDPoK8OM7NzvWtLbaosKQ4hLAS0Q2SlS1q5kHywM+lBMeC9p/DtCNylJw5PeU8T37R7qfsT8am9wt8S6wXYM5hEiM8na42sclCtSJFGn9NNRYzCn/YIoShtv8zhSnoPMkfWo5w61rdtXfiAulqEL2VSQhSEqAOc5Sd3eMfWglNos1usUBMG2RURo6SSEI8T1JJ5k1HNX8RoGj7vCt0qHIfVKSFlbRACE7sd/U9eVdbVeqYOkLR+JT0OuNlwNpQ0kFSlHPiQOgNYtyrJrC2W++ewNSEqHaR1SWUlbZzg9c4ORQdsHIzWaxUEvF/1lG4jwrZBtZdsrhbDjvYEgpP51Ff7JHh5edB0NfaGi61tSWisMTY+TGfIyAT1Sr/KfpVcw7zxS0QyLWu0uXCO17rSlMKfSB3bVoOceRq8e6sKUlCSpRCUgZJJwBQUc9auIvE2Sy1d2VWy2IVuIW2WkDzCD7yz4Z5elWgEWrh3otammnPYre3uUEgFbiiep8yTUN1txmi2txcDTYamyUnC5S+bSPJOPzHz6etTLSkuZqfRkZ/UNvbQ7LbUHmFt+6tOSAdp6AjBxQeNnvFt4k6Ql9m3IYjyQ5FdQrAWk454I5dCK9NFaKiaJtz8OLJdkF93tFrdAHdgAAV2rdbINohpiW6I1FYSSQ20kJGT1NbdApWKzQKUpQKUpQKUpQKwelZpQVDq3ilqTSus5EN61MqtrasNJWhSVOpwPeC+n0qVaZ4p6a1Hsa9p9glq/wCBKITk/wCVXQ/fyqU3C1wbtFVFuERmUyrq28gKH16VWGpuBkKTvkadlmI5zPs0glTZ8grqn45oLZByKYqAcLbBqvT8abG1C8TGygRWi+HSnGdxB7h05V1V8S9Ks352zP3IMyGVltS3EFLe4dRv6UHbvsKXcLFNhwZRiyn2FIaeBI2KI5HI6VRFr1fq/hneVW68tPSIxVlUeQsqCh+82v8A/h41+hG3W3m0uNrStChlKknII8jXPvunbXqS3qg3WKh9o/lJ5KbPik9QaDX0zq20asgCVa5IUR/eMr5ONHwUP59K7dUW/wAKtW6Y1MxL0tJL7O8bH+0DamxnmFg9R6Zz4VdrspiKhBlPtNbjtBWsJCj4DNB7Ur5WsJQpX7oJqoJeorjMkrfVNfVvOQhDpQhI8ABWd78UxG1w0qlFXy4kYE6UkeAdV/WsC7XLr+JyR/46v61T7v6TxXZTFUiq8zcjNxl+vbqx96+F3q5oxtuMo56fplH+dT9v9I0vGmKor8Zup63CUjP70hQ/nX2i83EHKrpLwDj+9Vg/Wp+2P4NLywKVRyrpdj/dTpR81Pr5fWsKvNyZBU7en0EjoX1cvrT7DS8qVQa9TugJT+JT3VD9x5Yz9a+VaqvqvdYfkJA5BS3lZ+9W5IXnc7VAvMJUO5RG5UdRBLbicjI6H1r1hxI0CI3EiMIYYZTtQ2hOEpHgBVBru9+fSO0vEtB79jyuf1r3t1+vFrmNymrrMdUg5KHXlLSod4IJxU8oF+VjFfLS+0aQvGNyQcetfRqwZqhtb6q1TrLUsnStpivtR2nlMmO0CFO4ONzh7k9+OnrU90XD12xqi5uakkFduWFdiC4lQKt3u7AOYG3PWp0lltLinAhIWr8ygBk+poK50NwhgWDs7heuzn3AYUlGMtMnyB/MfM/AVZFKhmtuJtq0a77Gtl2ZPUgLDCPdSkHoVKPTp3ZoJnUR1RxM07pZa470ky5iMgxo2FKSfBR6J+/lWrw315N1s3OVLtqIqYqk7HGiShWc8ufeMfWtE8FbC/f5NymS5chl91Tvs2QkAqOSCocyOflQcTTnFjUmp9ZRIcO0si3uOBLraEqWptB6rK+gx6Yq4RWpbbRb7PFEW2w2YjI/YaQEg+Z8T5mtygUpSgUpSgUpSgVjNKp3W+g9cv6ol3qyz3H23VbmkNSy240MflAJAwPI0FxVmojw5b1S1p5aNVqWZXbHse1UFOdngfmI88+deWmeJELU2qZtiZgPsLihZS6tQIWEqCTkfs9aCZVXesOD9q1FJfuMB9VvnvKK1nG5pxR6kp6gny+VWJTNB+d1M8QeFrxU2XfYQrmU/poy/Ufs/Q1OtMcbbPciiPfGTbHzy7UErZUfXqn459as1aErQULSFJUMEEZBFQi+8ItLXuSJKI7lvczlfsZCEr9UkED4YoJuhaXEBaFBSVDIIOQR41Dtf8Pk649hJuS4ZiKVkdnvCgrGeWRg8utS2LGahxGozI2tMoS2gZzhIGB9qjk3iDZoOsWdLOIkqmOqQjelALaVKGQCc58O6gkAZEa3dgFKUG2tgUo8zhOOdUL2qWzgdfM1f0j9Xc/gP2qg2mhIALzre7uUKxyxvS1X00+FHDjqEj/Nn7gV6KiKWC6w4h5I6lpQJFbjEJlABKC4fpXquIlQKmmkNL7ynlWWoW045BVyDZUfFfIV9FxpofpHkJH7ueledxZfB/SOq8iOVc8R2s7ikqPnTUQrPTZXMitKOAt7w5cvnWHLnJUUhiOhIPQq615gbR7qQBWQMjeoZ29MGp3CBwyn+bslSR+6msCIhWNwLhHernXs2HHCkNNFRP7qcmt1qyXR8KJZLaT3uK2iq8pTFWiloIHRKBX1tQFbSsk+QrpfgsVlCfbbqwjH7LQ3mvdP4DHWNseTLX4rVsT9KcluLjJWk5wjJA5ZOa+1tyUxS6ppaEk4CinANdtu8hpRTDt0WNgcjt3H61zpdyuFwkLZkyFOISApKMYA+FWr2TGl7Rf1Rn/TT9q9q8Y36q1/An7VF4vEmxzNYK0w2mUJaXFNBxTYDZWnORnOe488V1M0tqKcQdbDRNnalIie0yJDhbZSThAOM5UfDy765+tdK6pveprXOs149khxwkON9spG0hWSrA5KyOWD4VM5tuhXJjsJ8RmU1ndsebC058cGgqzhrqzW+qdTKkzvfs5QrtCGQhtBx7oQepOfM8qnd60LpzUNzauV0tqZEltISFFagFAdAoA4Nd5ppthpLTTaW20DCUIGAB4AVlbiG0Fa1BKU8yScAUHlEhxoMdEeIw2wygYS22kJSPQCveufDvtouMpcWFc4kl9sZU208lSgPHANRzWHEaHpC9wbY/AfkKlJC1LbUAEJKtvIH8x5HlQTKmai/EBGpXdMqTpZShNLqd3ZkJX2fPO0nvzj61X+kNBa9/tNCvN5nux0Muhx0PSy44tPenAJHPpzNBdFZrFZoFKUoFKUoFYrwmzYtuiuSpshqOw2MrcdUEpT6k1mJMjT4rcqI+2+w6NyHG1BSVDyIoPbFazFtgxZT0qPDYZff/vXW2wlTnqRzNbVYzQechtbsZxttwtrWgpSsdUkjkfhUL4daNvmlF3FV3uwmiSpJbQlalAEZyo7uhOR8qnFMg0FUa24q37SurHrei0MGE1t2LeCwXgQCSFDl1yPhUw0HrVvW1ndmphriOMO9k4gq3JzgHIPxqRSIkeW0WpLDb7Z6odQFA/A18w4ES3RxHhRWYzQOQ2ygITn0FB4m9Wr21UE3KJ7Uk4Ux26d4/5c5rzXp+0OXpF6Xb2FXBCdqZJT7wHT7d/Wqv1XwTmXC7S7naLo0TJdU8WZIIIUTkgKGe/xFeWitKcR7HqeIxJffatbbgU/mUHGlIHUAZPM+lBcUjHs7gPIbD9qoSNHQ0pPZPtvIPRSTtVV9yOcZwf5D9qoq3xYrSE75PaH/wDUncPrWWSV6w7LAGwDmM92Mf8AxXoUdcd9YZUwlOGkKI8Cr+Ve7UosuBQbRyPQisdtNOXLiOPIKUtqUfSuai0rAJefYZGf2l5PyFdq7XBUjeSgJz+7yAqLPP7XlYFRM6VnX7uiItqZ/vJbrx8GkYHzNZTMgMA+zW1KiP2nlFX0rjF9Z78VuRYriexmTW3UQC8lCnMYCsnoDVd76REw3V32ftCWltx0+DSAmtJyW664ovyFLz+8smrKgS7E/H9jXCjBsjbsU2MGobdtKpj3d5uI6BGJCmx1KQe74VW81pG9tIra06iHE7VsICck8+4V9CR0UlsnHeTXSY0+e2wtSloHckYzXVn2zbpySttpO5GFBCB+VINZRk5TqF5xWrXcoz7W7kkbU+grX7RxUw5Wcqb7uVfHak/lR8zXmpxaZCVbQDtIFdePHfbjvaNP0hF/VGf9NP2rnp0zZEX031FtYFxIwZAT73TGfDOOWetdCL+qM/6aftVN6w0pxJvep5jDMh9y2rcK2CJQbZSgnkCMjmPTurqSugqCUkk4A5nPdXC0/rSxaokSo9pmF9yL+cFspyM4yM9RmsaKsc+w6Vi2y6SxMkNhW9WSoAEkhIJ5kAHFfWn9GWLTEiVItMPsHJR/SErUrlnOBk8hmg4MjWl/a4nN6bRZQq2qKQZGxW4gpyV7vy4B5fCvviZo276yt8OPbJzbCWXFKdadUpKHMgYPIHmOfzqcYpyoK50DwoGkbqLtLuXtMoNqQltpG1Cc9Tk8z9Kn0m2wZjzT0qGw+6wctLcbCig+IJ6VsUoGBTFfD8hmM2XH3UNIHVS1BI+ZrlStYabh/rF+t7Z8DJST9DQdmla0C4Q7pERLgSmpMdf5XGlhST8RWzQKUpQKUpQcXVemo2rLC7aZTrjKHFJUHG8ZSpJyOvWvvS+nY2lbDHtERxx1tncd7nVRJyTy6czXXpQYqquIukNc3fUZnWOc4qGG0hpluWWi0QMHlkA5PPNWtSg/P34Jxfge6hy7EDkNkwLGB/zVINDy+J41TFYvDU5VvUT7QZbaQlKcHmFY65xyFXBgUoHdVR6r4x3TT+p5lqas0ctRl7EqeWoKX/m5csGrcrwkQokvBkRmXsf4jYV96CnmP9oB0H/tGnkEeLcoj7pqQad4z2y+3mJa1WqVGcluBtC96VpCj0z0PWpdI0dpmV/fWC3K8/Zkj7CteBozSdrujUyDaYbExvPZqT1T44Gevnig70j9Wd/gP2qg7e3ySQpB80nBq/JP6q7/AAK+1fnm1STvSCT8MVnkja9J1KVMD3c5Kvka9SMivNhW9sEjPnsr1Khjlyrn029udPTtQa17Dpd+/SFvOrLERBwV45qPlXrcnwls5NTO0y2kWWKlAISWhjdgE8qW1EKRG5aMfS1ktRDwYVJWDyW+dyU+eOled9VGuNtVGfG5Cx0xjHgfKui++pxBTlIHpnHnUSu0hbLo5kAq2oJPNRPVRH2rlm076b1rCO+03G2SkQMJloP925uwoDzqXWtankHmorHJWajzDbKXvaHXQpfMEDqK7cS8tMvglhwLW2EobbTuUfPFYZZm/p0Y4isOoXlR1j9GlR+1fNyD0y0utxSAsJO5B6kd+K15D65a2246Cgp/NuGcfGujAiuBG9X5uhrLHa1LRML5K1tXUq4ICDg8iK8XlDe2R4kV19TQ/Yru6kDCV+8PjXEePuA+Br6XH+VYs+cvk1eaafpSL+qM/wCmn7VXd941WmzXeXbU2uXIXFdLSlhSUpJHI4zz61YcX9UZ/wBNP2rgXDRekLndXZk61Q3pjnNxSlYJ5dSAevniqOtpaF4jRdbvy47VvehuxkhZC1hYUknHUdDXA4h8UbtpTUBtMC2MKAbSsPPhR3k8/dAxyHSrBtVitNjaU3a7dHhpXgr7FsJKseJ763VtNOKSXG0qKehUkHFBQX+9rX8z9VitDPTsYKlffNfP9puLVzP6Fu6AH/CghA5+e2v0EEgDAGAPClB+fza+MFwGFKu4B/ekhvy6ZFSbQGjte2vU7NwvM9xENKVB5pyYXS6MEAYyR1wc+VW1gUoIRxI0FK1uxBEa4piqiqUShxJKF7sc+XeMfWodG4AOk5k6hQnyaik/dVXTSg4Oj9KxdH2MWuK+4+O0U4txzAKlHHcOg5Cu9SlApSlApSlBo3i82+w21243OSmPGaxuWQTzPQADmTULf42aQaB7Nya+R+5Hx9yKl+oNPwNTWh22XJC1MOEK9xW1SSDkEHxqIscFNHtY3szH8f4kgjPyAoOW9x7sqSewtE9zzWpCf5mrD0/eo+orHFu0VC0MykbkpcGFJ5kEH4iuIxwu0XHA22FhZHe4ta/ualEaMxDjtx4zKGWWkhKG204SkeAFB6Gqi17xC1jZtUP2y129LUZsJ7Jwxi4p0YBKgemMkj4Vb1YxQfn4ar4tXE/oG7lg/wCHbwkf9NZ9g4w3H3VKvCQf3nw0PHxFfoDl41pXS8WyyRvabnNYiNE4CnVhOT4Dx+FBRh4bcS54HtUh3B/x7jn6Amu5o7hFqC16mg3e6XCOhEVztSlpxS1qPhkgDB76kF242aWgbkwhJuKwcfom9iPmrH2rj6d4xXXUer4FsYszLcWQ7scAUpbiU/vZ5AAdTyoLXlfqrv8AAr7V+Y2XiysKr9OyecV0f5D9q/NSbVKUPygVEzEe2OW/CY7SG1XFtSQlSsE95B+4rsdsjbntf/dUMZt86MrtGni2R4VttTLk4NinUE+JRzrCdLV8mkx7bN7kpQ2QFBWa6ejr2iQym2LSoOtJKkrKshQz0+FR923PylZddUryAr7Zsa0LCkLWhQ7wcGotak11Klc88t1hP33wEEd1RC6Puy5pZQVpAPVGMk+HOt+At6PDTHVl4oPIk5JHnWGFJQ8VuJQtWc7Ejl8TXBbcT09XHMWrt4WltqLKdTcpDTakpxlzBzn7mukmzyXVJnsq91wBOArk4kdD6VzroE3ApW4yhbgwE4HQCujGuUtSUodSClIwMd1UtSJ7bxafTbbKop99KUKzzycmulCkqdG7GBjuBwa47inJjiUFOQkcjn+ddBEpMdnsW0+8OoqIrxjcomZnpw9bsl2S06kBRUnHLrUQkNqSwslJ5VYkyELizscwpQ5gnuqNToH/AGV9vPvBB7udd/i+TNqcXjebj+vLFpj2vGJzhs/6aftVP6t4OX656jnXW3XKK4iW6XQl5akLTnntyARgdBVwQ/1Jj/TT9qqa/cZLvp/Vs+2yLMwuLHeKG0qUpDhSP2s8wc9eldrVHhww4jwv1WQr/wAG4FPX1IrsaUsvFSBqWF7a/MEIOpMj2iWlxst594YyeePCrQ0rqSNquwMXeM04yh0qSW3OqVA4Iz3+tbrF1tsp9TEefFeeQcKbbeSpQPmAaDb7qgknWGo2uKDWnUWcKtatoL/ZqJKSnJXu6AA8sVO8imKB3VC4/EiPI4huaRFueCkKUgSd4wVBO4+7jkPPNTSvAQYiZZmCKyJKk7S8GxvI8N3XFBwdYa7tWi24xuCJDrkkns22EgnAxknJAHUVwmONukHR+kVOY/jj5/6Salt+0xZtTMNs3iAiUloktkkhSM9cEHNRV/gro57OxiWx/pyTy+eaCYWS+W7UVuRcLXJEiOolO4AggjqCDzBroVydN6bt2lbSm22xC0shZWS4rcpSj1JPwFdagUpSgUpSgUrB6VVmsuM34BeZVot1qD70Vexbz7hCd2OeEjmR8RQWnWaoCJrzidqac2q0od27hhEeIOyH8SlA8vU1fbPadijtgA5tG/b0zjnig9KiHEfVlw0hYG5tuhJkuuvBoqWCUNDBOSB6YqX1hSQoEEAg9xoKc0JqbiLqHVMV+Wh02lRPb7owbaCcH8pxknOMYJqZa84esa4MJblxchribgClsLCgrGeWRg8qmIGKzQV5aeCulIACpiZNxcHM9s5tT/5U4+pNTG3Wuz2XbEt8SJDKhkNtJSlSgOp8TXL18/qKPpd5emGlOTy4kfo0hS0oPUpB6npVd6H4d6tf1PE1LqCS5GLLodIfcK33fIj9kHz7u6guZ/8AuHP4T9qpIMqUOQV9qu17+4X/AAn7VSqi2B77m4+Gd325Vhl31pz5/r6m7yWw2BhSgPLOTWnHCESdoBPP0rdVISBhDfzP8hXKceUJ4BO3J7uVZa/ljXLXU8KuuTt5q2o9a+e3RnAyvxJPIV4Y8adBUahz2zXs2w6oskpASnwHU1pOy0pISUqAzj18a2BkMcq1y2FAZArlvbVpfQ+PG8UPj25ZOW+Q8xXrHkSHV7SvPoKMwytXJvl5VutlqOCtTfZY7z3+lZzd0xVuNLSkBGFBR55PKtxkIT+YFCifUD41yVSu0GWyVDPgc1sMSlqCkhWcfvHpXPaZltERDupICfeIPLrXLVE9okvuPq7KKjm4vx8h51lmSoqKVc0g91a1zdKsJyQk89oPLNdHjdW08/z67x8v4W6xjsGwnptGPlWjcLdZbytUO4RYcxaUglp1KVqSO446it2P+rN/wD7VTOteGWqWtRS9R2GYuUt51T21twtvt57hz94DyPwr23KuKNAiwoSYcNhuPHQkpS20kJCR5AVSt44GXiO+uRZLmxISFFSEO5acH/MMgnz5VY/DuTqV7TJXqptbctDqghTyQlamwBgqHrmupa9WWC9SFxrbdosl5BwW0Oe98Aeo8xQUh+IcUtEgB78Q9nb/AMVPtDWP4ueB8RVp8NNYXLWFnkSLlCQw5HdDYcbSUod5Z5A947/WpnyNYSkJGEgAeAFB8vPNR2VvPOIbbQMqWtQASPEk9K+Y0qPNYTIivtvtL/K40sKSfQiufqawtam0/Ls7zy2ESUgdogZKSCCOXfzHStbRulWtH2BFqalLk4cU4pxaduScdB3DlQd+lKh9y4jW6263j6WciSFPPKQgvpxtSpf5Rjqeo50EwpWKzQKUpQKUpQYrmv6cssm4G4P2mG7LPV5bCVKPxIrp0oPlKUpSEpAAHQAcq+qxkCoXqfippvTm9kSfxCWnl2EUhWD/AJldB9T5UE0zXM1DqCDpmzu3S4qWGGiAQ2ncpRJwABVKPcRte6zuYjaeZXGAOQ1DRuI81rV/8CrrXaUXnTrVv1Aw1KU4ygSUfsqWACSMdOfhQZ09f4OprO1dLcpZYdJADidqkkHBBFdOtO12qDZbe1At0ZEaM1nY2joMnJ9a28igUqC694gTdIXa2wo1p9sTLGVKKiM+9janA6/1FTlJ3JBwRnuPdQfL/wDcOZ6bT9qpQexH9l9PxBq7HUlbSkjqUkVSUhlyI+uPIQW3WyUqSrkRWOX9nF5W+tQ3rZa49xkbEOuBKeaipIGB861r2m3ru0RmJ2TaWnMqWE5KsdxrbtTiURnAVDas4Vz7q2n7FGmsdqj3HGxuRlWc/CvMy2ty6d+HFEePuvuWw5arfPAU3+hUofsjkDXOk6ZlskltSHEjoc1ssTexjNBRSgbuSj3HzrvMvNrSCXUqUe4GqY8l4qvGDFmpFpjtBX2lskNr5EdedeKFgrxyPnUm1HAQ5EcUn3V491Q7jUFizsqIcUMg+NR3bt3ViKxEQkLbxaZVzAxyHLJrRlym21jtDl3GQCMkDyHdXsy63jm4Bnw5187GwnLYbBz7yt3P500vD0gOk7VdmraeY3da67be73iU+WQBn5VwkoS8CtTylFPLAWBmupBfa7MJ38x0yQfrWVqr7bqkgYJASQcdK0piSpoYGdpPLwrZccydu4cvE1lppclxLLKe0cWdoA5k1pj3Fo0zy1i9JrK1I/6u1/APtXpyr5aSUNISeoSBUC4sWHUl3tkR/T8h7MRSlPR2HChbmcYUMdSMHl58q955SeOtIfaW0tO5C0lKh4g8jVMX3gXMYlCRpu5oKd2UtSVFCm/RaRz+Qrs8Jdb32+SpNkvLS3lRGt4lLSUrGCBtX4nn168jVo0HDcuCdI6OalXyWt8wY6EvvJG5Ti+Q5eJJr303qOBqq0IudtLnYqUUFLidqkqHUEVuXG3Q7tAdgz46JEZ5O1xtfRQrztFnt9igIgWyKiNGQSQhGep6nJ5k0G9SsVxLbrKw3e9ybNBuCXZsbPaNhJHQ4VgkYOD4UHcrSds9teuLdydgR1zGhhEhTQK0jyPWtys0GKzSlApSlApSlArB6VmlBTGvIfEXUeqZNnhR5KLUFDsez/RsrRge8pff6H5VvaY4GwYuyRqKUZjg5mMwSlsHzV1V9Ktis0GrAtsG1xUxYEVqMwgYDbSAkVs1mlBrrnRG5SIi5TKZDgyhlTgC1DxA6moVq2266laxtkiwTeytTYR2yQ6EpB3HduSfzAjHjWxduHEe668i6pVcnm1MKbUqOEZ3FHTCs8h4jFTSg+ShKiCpIJByMjpX1WaUGK8nIzDqtzjLaz4qQCa9q5uoLY7ebBOtrMlUVySyptLyR+Qmg2kxIhT7sdnB8ECvoRmEnIZbB8kCo1w90lL0fYnIEyeJi3Hi4NudrYIAwM8+7PxrR4msawdh286SU+FpeUXwwsJUeQ25z1T1zUagTJUOMoYVHaPPPNArKY0dP5WGx6IFeEJ2SzaGHboW0yUMBUko/KFAZVjy61U3DLWV/wBQ8QZrT011+3OodeLThyGU7vc2+HUCmoFwmOwoYLLZHgUivL8NgZz7FH9eyT/Sqz41amu9iXaWLVcH4Zd7RbhZOCrG0DJ+J5VNYtwuD/DxFyW6kT12vtu0AGO07POcetNQbdgQIf8A3Rj/ANNP9Keww8YMVjH+mP6VVvBfVd5vky5wrrPemBttDrZeO4pJODz8OnKtTipqnUumNbwnIdxdahFlDiGE8kKwohYUP2un1pqE7W7+HwsY9kYx/pJ/pWE2+Cn8sOOPRpP9K8lyHp9jVJtjiUvSI2+MtYykKUnKSfLJFRDhlH1owLl/axb6klaew9ocClZ57sY/Z6U1BuU39ji/93a/9MV9IjstHLbSEHxSkCvWsU1CNyUNK15s1mBHU++rakfMnwFRa0VjcpiJmdQ9ghCVFSUgFXUgda8XZ8Rg4dktIPgpYzUNuN/mT1FKVllnuQg8z6muYElagACpRPIDqTXl5Pke9Y427K+JOt2lYbdyguq2olsqPgFitrNV+/ZbjHY7d2KoIAyeYJHqKQLxNt6h2TpU33trOUn+lTHn2rOstdInxomN0nawKj9q0NYbNf5N7gxFImSd25RcJSnccqwO7JrpWu6MXNje37q0/nQeqT/St+vTraLxyr6ckxNZ1KB3W6a3a4kw4MGCV2FeztHOxBSUke+SvuI7h6eNTulZqyClKUClKUClKUClKUCuTqTUlt0raV3K5uqQ0FBKEpGVOKPRIHjyrrVx9S6XtmrLamBdG1qaS4HElte1SVAEZB9CaCD6M4q3HVushbE2htqCtK1BaVFTjQAyCo9OfIdO+rLkyWYcZyTIdS0y0krWtZwEgdSa59g03adMwhEtMNEdB5qV1Ws+KlHmag/HS6Pw9KRoLKilM2Rh0g9UpGcfPHyoOTdOLt8vd0XbtFWlT4SeTymi4tY/e29Ej1+lazvETiPppaJOoLIFxCcKK4/Zj4LTyB9anmkLZbNE6AallsDbEEuY8lOVOHbuPrjoBXvpbVlo1/aZZZiOBpCuyfYkoB3AjI6ZBBFBu6U1ZbdXWlM+3rIKTteZX+dpXgf5HvruVSGjmTpHjbM0/DWr2ORvb2E5wnZ2iPiOnzq633240dx91W1ttBWo+AAyaDh621INKaWlXVLfaOoAQyg9CtRwM+Q6/Cq94LN6gud2uN/nzZDsN1JbParJDrpIOQD+6Pviptp/VunuIkWdDZireaZ2h5mW0MLSc4OMkd1SWHDjW+K3Fhx247DYwhtpISlI8gKD1WtLaCpaglKRkknAFErS4kKSQpKhkEHINVDxz1QWmI2m4rmFPYflbT+z+yk+pyfgKnPDuzSbFoi3QpjilPbC4pJP5Nx3bfhmg2NcmYNE3f8AD21uSVRVJQlsZUc8jgeOCag3A3Tsm3wrjdpkZxlUlSWWe0SUkpTzJwe7JHyqY6r19ZtHy4ka5CQpyUCodijdsSDjceY7/CpKhSVoC0nIUMg+VBRXHt7fqW2sDnshlWMeKz/SrkhRCNMx4ZByIaWvP8mK1L3p/TV8ucRV3jRn5jHNhK3MLIzn8ufeGfWu73UFBcDXDH1xMjnluhrScjvStNSvjvaPadOQrqlI3Q39ij/kWP6gfOpratPaas18lSLbFjMXGQCp4IcyvBOT7ufdBPgK+tZ2kXzR90t+3cp2Ootj/On3k/UCg4vCO7finD+ElRy5DKoy/wDlOU/+0iprVKcBLv2c652ZasdqhMhsHxT7qvoR8qus0GaqPjYxfYb1uvlvmSGokcdmvsnCnsnM5Cjjx6Z8vOpRpjidZ9T6gkWZhl+O83uLSncYeCTzxjoe/HhUulRY82M5GlMtvsuJ2rbcSFJUPAg0Ef0DqhWrNKsXJ1GyQklp8AcitOMkeRyD8a5N+uSrhPUEq/QtEpQPHxNSlcWJZLE8zb4zUVlltRQ20gJSD6CoHXkfJZJ6pDu8SkTM2krfsaN96ijGcLz8ga3WLFDTBZkTp/YF4bkjA6V7NybPZUqciOKlySMJUeia5MeH67Ra8xGv+t75ecTWsNuHNed1NKircK2VBQCCeQxjp9aiz6A3IdbHRKyPka9o0yS1cEymiVPlROMZ3E9Riu/HkM372iJKhttPtoKgtHUGrdeRXW++1e8U7/bpH7fOct8xEhs9OSk/vJ7xVhNOJdaQ4g5SsAg+VVqRg48Km+mXi9ZWgrn2ZKPgDyro+OyTuaSz8ukaizr0pSvYcBSlKBSlKBSlKBSlKBSlKBUC4v6bkX/SPaw21OyYDnbpbTzK0YwoAeOOfwqe1jFBW/DniBaL5p5iy3aQyxOYZDCm5BATIQBgEZ5HlyIrvSLto/QVodUyuFDaJKwxGKSt1XkBzJ7vAVytT8HtP3+WuZGW5bZLityyykKbUe8lB6H0xXKt3Aazx5KXJ91ky2x/wkNhrPqck/LFByuGcWbq3iHP1rLZLTDal9n4FahtCQe/anr8KsVOu9OydTq0wmUXJpJbKezJbKgMlG7pnGftXE4ganhcPtKt2yztNx5b6C3EabGA0nvX8O7xJ9ai/BjRbjr/APa25JUeahDCuqichTh+oHxNBalm05Z9PpeTabezDD6gpzsx+Y93/wDlbk+axboD82S4G2Y7anHFHuAGTXvVVccdTCHZ2NPsOAPTT2j4B5hpJ5D4q/6aCH6Ohv8AEbig7dpqMx2nfanknmAkHDaPoB6A1+he6oPwl0z/AGf0e088jbLuOJDuRzCSPcT8Bz9SanBoI/Pg6T1PdExZqIFwnW857IrCltcxnIBzjOORqQYwMCodYeG9usOr5eomJchxyR2hSyvG1BWcq59T5VMaCgtQuyJ3H5lCVrBbnx20EcilICSceXX51fvdWgqw2lV4F4Vb45uCU7RJLY3gYx19OVb9BQTDr8L/AGg1EqXuXclIPiUrTyHpgir97q0FWG0rvCbwq3xzcEp2iSWxvAxjr6cq6FB+d7af7FcbewJ2RxNU1z5Ds3eny3D5V+h+6oZqXhna9S6ljXx+S+w61sDjbYGHQk5HM9PCpmKCorrwvvMbiTHvdg7JuEuSmQtRcCSwc5WMd4PPGPHFW6K1rm9Jj2uU9CZD8ltlamWj+2sAkD4motw4vmpr5bZbupIBiuNvBLKiwWisY5+6fA9/nQSe7Nl21SkJHMtKx8qrzuqzSAeRqv7vAVbrg4zj3CdzZ8UmvI+RxzuLu7xLR3V0b7/9ntf8H8hXLgpiLe7OYVoQsYS4k/kPiR3iu2r8Ou1rhtuz0x1sJ2lJxnOMd9eH4Jav/wA0j5D+tYZMc3yc6zEx/tpS8VrxnbVlvRbclUa3q7R0jDkk9fRPhW1pZOx6XIVyQ2zgn6/yp+C2lPNV5QR5AV8zrlCjW9Vute4pWf0jp/aqIj67fZeY69RB+qOFYnv3LiKO5RV4nNTXS7ZRZUE/trUoemcfyqHRo7kuSiO0MrcOB5edWJGYRGjNsI/K2kJFbfHY53N5U8u0air1rNKV7LgKUpQKUpQKUpQKUpQKUpQKUpQK0b1d4litEm5znNkeOgrUe8+AHmTgD1rerk6l09E1TY37TNW4hp7adzRwpJByCM+dBRFogXHi1r92VN3NxQQt8pPJlkflbT5np8zX6HixmYcZuNHaS0y0kIQhIwEpHIAVydKaTt2kLV+H24KUFK3uuuYK3FeJx9BXcoMVBNScLoepdYMX6VPcDSAgPRezyHNvQBWeQPfyqR6sts+8aZnW+1y/ZJb7eG3dxTjmCRkcxkZGfOtTQdkuun9MNQLzNEuSlxStwWVhCT0SCeZx/OgkYASAAAAOgFZpVa8ReJs3SV/h2u2xWJClIDr/AGoJJBOAkYPI8uvPqKCyqwa+W1FbaVFJSSAcHurzmvCPBfePINtqV8gTQRDTPE2BqbVMqxMQnWSyFlp5SwQ6EnB5d3jU1qhOBbPtGs50pXVENR+Klpq+6CFaw4mQdIX2Ja5EJ18voDjjiFhIaSVEA4PXoamqVBSQoHIPMGqL4+M7dQ2x/wDfiKT/AOVZ/rVz2V/2qxwJH+LGbX80g0Eb4rP3GLoGdItr7rDjamytbSilWzcAcEdOorS4O6gk3zSCm5shyRJhPlorcOVFJAKcnv6kfCptcIEa6QH4MxoOx5CC24g94Nc7TOk7TpKE5EtTK0IdXvcU4sqUo4x1oO1WOlZqK8So1yk6EuItbzjT7aA4ezJClIScqAI8s0EprRutrZucbs1+6tPNC8c0n+lV9wV1a7d7VIss6Qp2VCO9pTisqW0e7J67T9CKs/FVvWLxxt6TEzE7hXc63Sbc7skNkDuWPyq9DWrVmLbQ6kocQlST1ChkGua9pu1vHPs/Zn/IoivJyfGzv8Jd1PL/AMoQWvaNFfmOhqO0pxZ7h3evhUyb0xa0KyWVL8lLJFdJmO1HRsZaQ2nwSMVGP42d/nKbeXGvxhzbJZEWxvtHCFyFjClDokeArrUxWa9alK0rxr6cFrTadyUpSroKUpQKUpQKUpQKUpQKUpQKUpQKUpQKxWaUED9r15/vQ9n9n/8ApzP5uzTs2bOu7ru3d38qnY6UxWaDFV/f+GH47r+PqN24gRkFtTkcoJUSjoAc4wcD61PJHbCM4Y4SXdh2BXQqxyz8ahnDmVreSbj/AGuZUhCVp9nK0JSrPPcBt6p6UE3FfD7KJDC2XUhTbiSlST3gjBFelal0ucOzW1+4z3gzGYTucWRnA9B1oOJpPQVm0a7KdtnbqXKwFKeXu2pByEjkOXOpNXMsOoLbqW2i4WqR28cqKCSkpKVDqCD0rp0Eb1doa0azRGFz7dKoqiULZWEnBxkHIPLkK70SK1CiMxGEbGWG0toT4JAwBWre75b9O2xy43OQGI7ZAKtpUST0AA5k19We8Qb9bGblbXw/GeBKFgEdDggg9CDQb1YzWahfEeTrKPDhHSLS1qLp9oLaErUBgbeSu7rmgmlYUkKSUkAg8iD314QDJVb45mpSmUWkl4J6BeBux5ZzWxQUvZtCag0vxaaftcNw2lTyj2/LYGVDmk+Y6Y8hVz0wKzQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKUpQKxWaUCtO7WqHe7Y/bZ7XaxpCdq05I8+RHQ5rcpQcvT2nbbpi2C3WtpTbAWVncoqUpR6kk+grqUpQc2/WG36ktTltubJdjuEKwFFJBHQgjoa+7LZYOn7UzbLcz2UZkHakkk5JySSepJrfpQKxWaUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUClKUH/2Q==';

	const baseCss = "/* ========== LINUX DO 优化摸鱼体验 base ========== */\n#ldmy-fab {\n  position: fixed;\n  right: 20px;\n  bottom: 88px;\n  z-index: 99990;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  align-items: flex-end;\n}\nbody.ldmy-fab-left #ldmy-fab {\n  right: auto;\n  left: 20px;\n  align-items: flex-start;\n}\n#ldmy-fab .ldmy-fab-btn {\n  width: 44px;\n  height: 44px;\n  border-radius: 50%;\n  border: none;\n  cursor: pointer;\n  background: var(--tertiary, #08c);\n  color: #fff;\n  box-shadow: 0 4px 14px rgba(0,0,0,.22);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  transition: box-shadow .15s ease, opacity .15s ease;\n  opacity: .92;\n  transform: none;\n}\n#ldmy-fab .ldmy-fab-btn:hover {\n  transform: none;\n  box-shadow: 0 6px 18px rgba(0,0,0,.28);\n  opacity: 1;\n}\n#ldmy-fab .ldmy-fab-btn svg { width: 20px; height: 20px; }\n\n#ldmy-toast-box {\n  position: fixed;\n  top: 72px;\n  left: 50%;\n  transform: translateX(-50%);\n  z-index: 100000;\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  pointer-events: none;\n}\n.ldmy-toast {\n  background: rgba(20,20,20,.88);\n  color: #fff;\n  padding: 8px 16px;\n  border-radius: 8px;\n  font-size: 13px;\n  opacity: 0;\n  transform: translateY(-6px);\n  transition: all .2s ease;\n  box-shadow: 0 4px 12px rgba(0,0,0,.2);\n}\n.ldmy-toast.show { opacity: 1; transform: translateY(0); }\n\n/* 自定义输入对话框（替代 prompt/confirm） */\n#ldmy-dialog {\n  position: fixed;\n  inset: 0;\n  z-index: 100010;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: rgba(0,0,0,.35);\n}\n#ldmy-dialog .ldmy-dialog-card {\n  background: var(--secondary, #fff);\n  border-radius: 10px;\n  padding: 18px 20px;\n  min-width: 320px;\n  max-width: 440px;\n  box-shadow: 0 10px 36px rgba(0,0,0,.25);\n  animation: ldmy-zoom .15s ease;\n}\n#ldmy-dialog .ldmy-dialog-title {\n  margin: 0 0 12px;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--primary, #222);\n}\n#ldmy-dialog label {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin: 10px 0;\n  font-size: 13px;\n  color: var(--primary, #333);\n  white-space: nowrap;\n}\n#ldmy-dialog input[type=\"text\"] {\n  flex: 1;\n  min-width: 0;\n  padding: 6px 10px;\n  border: 1px solid var(--primary-low, #ddd);\n  border-radius: 6px;\n  font-size: 13px;\n  color: var(--primary, #222);\n  background: var(--secondary, #fff);\n  outline: none;\n}\n#ldmy-dialog input[type=\"text\"]:focus {\n  border-color: var(--tertiary, #08c);\n  box-shadow: 0 0 0 2px rgba(8, 140, 204, .15);\n}\n#ldmy-dialog input[type=\"color\"] {\n  width: 48px;\n  height: 30px;\n  padding: 2px;\n  border: 1px solid var(--primary-low, #ddd);\n  border-radius: 6px;\n  background: none;\n  cursor: pointer;\n}\n#ldmy-dialog .ldmy-dialog-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 10px;\n  margin-top: 16px;\n}\n#ldmy-dialog .ldmy-dialog-actions .ldmy-btn {\n  min-width: 76px;\n  padding: 7px 18px;\n  font-size: 13px;\n  line-height: 1.4;\n  border-radius: 6px;\n  cursor: pointer;\n  border: 1px solid var(--primary-low-mid, #d0d0d0);\n  background: var(--secondary, #fff);\n  color: var(--primary, #555);\n  box-shadow: none;\n  transition: background .15s ease, border-color .15s ease, filter .15s ease;\n}\n#ldmy-dialog .ldmy-dialog-actions .ldmy-btn:hover {\n  border-color: var(--primary-mid, #aaa);\n  background: var(--primary-low, #f2f2f2);\n}\n#ldmy-dialog .ldmy-dialog-actions .ldmy-btn:active {\n  transform: translateY(1px);\n}\n#ldmy-dialog .ldmy-dialog-actions .ldmy-btn.primary {\n  background: var(--tertiary, #08c);\n  border-color: var(--tertiary, #08c);\n  color: #fff;\n  font-weight: 600;\n}\n#ldmy-dialog .ldmy-dialog-actions .ldmy-btn.primary:hover {\n  background: var(--tertiary-hover, #0a7ec8);\n  border-color: var(--tertiary-hover, #0a7ec8);\n  filter: brightness(1.05);\n}\n\n/* settings modal */\n#ldmy-overlay {\n  position: fixed;\n  inset: 0;\n  background: rgba(0,0,0,.45);\n  z-index: 99998;\n  display: none;\n  align-items: flex-start;\n  justify-content: center;\n  padding: 6vh 16px 24px;\n  box-sizing: border-box;\n  overflow: auto;\n}\n#ldmy-overlay.open { display: flex; }\n#ldmy-panel {\n  width: min(800px, 98vw);\n  background: var(--secondary, #fff);\n  color: var(--primary, #222);\n  border-radius: 14px;\n  box-shadow: 0 12px 40px rgba(0,0,0,.28);\n  border: 1px solid var(--primary-low, #e5e5e5);\n  position: relative;\n  animation: ldmy-zoom .18s ease;\n}\n@keyframes ldmy-zoom {\n  from { transform: scale(.96); opacity: .5; }\n  to { transform: scale(1); opacity: 1; }\n}\n#ldmy-panel .ldmy-panel-hd {\n  padding: 16px 20px 10px;\n  border-bottom: 1px solid var(--primary-low, #eee);\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n#ldmy-panel .ldmy-panel-hd h2 {\n  margin: 0;\n  font-size: 16px;\n  font-weight: 700;\n}\n#ldmy-panel .ldmy-panel-hd .ver {\n  font-size: 12px;\n  color: var(--primary-medium, #888);\n  margin-left: 8px;\n  font-weight: 500;\n}\n#ldmy-panel .ldmy-close {\n  border: none;\n  background: var(--primary-low, #f0f0f0);\n  color: var(--primary, #333);\n  width: 32px;\n  height: 32px;\n  border-radius: 8px;\n  cursor: pointer;\n  font-size: 18px;\n  line-height: 1;\n}\n#ldmy-panel .ldmy-close:hover {\n  background: var(--tertiary, #08c);\n  color: #fff;\n}\n#ldmy-panel .ldmy-panel-bd {\n  padding: 12px 20px 8px;\n  max-height: min(70vh, 640px);\n  overflow: auto;\n  scrollbar-width: thin;\n  scrollbar-color: rgba(0,0,0,.28) transparent;\n}\n#ldmy-panel .ldmy-panel-bd::-webkit-scrollbar {\n  width: 8px;\n  height: 8px;\n}\n#ldmy-panel .ldmy-panel-bd::-webkit-scrollbar-track {\n  background: transparent;\n  margin: 4px 0;\n}\n#ldmy-panel .ldmy-panel-bd::-webkit-scrollbar-thumb {\n  background: rgba(0,0,0,.22);\n  border-radius: 8px;\n  border: 2px solid transparent;\n  background-clip: content-box;\n}\n#ldmy-panel .ldmy-panel-bd::-webkit-scrollbar-thumb:hover {\n  background: rgba(0,0,0,.38);\n  background-clip: content-box;\n}\n#ldmy-overlay {\n  scrollbar-width: thin;\n  scrollbar-color: rgba(255,255,255,.35) transparent;\n}\n#ldmy-overlay::-webkit-scrollbar { width: 8px; }\n#ldmy-overlay::-webkit-scrollbar-thumb {\n  background: rgba(255,255,255,.35);\n  border-radius: 8px;\n}\n#ldmy-panel .ldmy-cols {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 8px 24px;\n}\n@media (max-width: 640px) {\n  #ldmy-panel .ldmy-cols { grid-template-columns: 1fr; }\n}\n#ldmy-panel .ldmy-sec {\n  grid-column: 1 / -1;\n  margin: 10px 0 4px;\n  font-weight: 700;\n  font-size: 13px;\n  color: var(--tertiary, #08c);\n  border-left: 3px solid var(--tertiary, #08c);\n  padding-left: 8px;\n}\n#ldmy-panel .ldmy-item {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 7px 0;\n  border-bottom: 1px dashed var(--primary-low, #eee);\n  font-size: 13px;\n}\n#ldmy-panel .ldmy-item label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  cursor: pointer;\n  flex: 1;\n  margin: 0;\n}\n#ldmy-panel .ldmy-item .extra {\n  display: flex;\n  gap: 6px;\n  flex-shrink: 0;\n}\n#ldmy-panel .ldmy-item input[type=checkbox] {\n  width: 16px;\n  height: 16px;\n  accent-color: var(--tertiary, #08c);\n}\n#ldmy-panel .ldmy-adv-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 10px 16px;\n  margin-top: 4px;\n  margin-bottom: 4px;\n}\n@media (max-width: 640px) {\n  #ldmy-panel .ldmy-adv-grid { grid-template-columns: 1fr; }\n}\n#ldmy-panel .ldmy-field {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  font-size: 12px;\n}\n#ldmy-panel .ldmy-field > span { color: var(--primary-medium, #666); }\n#ldmy-panel .ldmy-field input,\n#ldmy-panel .ldmy-field select {\n  padding: 6px 8px;\n  border: 1px solid var(--primary-low, #ddd);\n  border-radius: 6px;\n  background: var(--secondary, #fff);\n  color: var(--primary, #222);\n  font-size: 13px;\n}\n/* 滑块字段：高级设置两列并排；窄屏 adv-grid 会折成单列 */\n#ldmy-panel .ldmy-field.ldmy-slider-field {\n  gap: 6px;\n  padding: 2px 0;\n  min-width: 0;\n}\n#ldmy-panel .ldmy-slider-head {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 6px;\n  min-width: 0;\n}\n#ldmy-panel .ldmy-slider-head > span:first-child {\n  color: var(--primary-medium, #666);\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n#ldmy-panel .ldmy-slider-val {\n  font-variant-numeric: tabular-nums;\n  font-weight: 600;\n  font-size: 11px;\n  color: var(--tertiary, #08c);\n  background: color-mix(in srgb, var(--tertiary, #08c) 12%, transparent);\n  border-radius: 999px;\n  padding: 1px 7px;\n  min-width: 3.6em;\n  text-align: center;\n  white-space: nowrap;\n  flex-shrink: 0;\n}\n#ldmy-panel .ldmy-slider-row {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  min-width: 0;\n}\n/* 并排时两端刻度略挤，收窄；单列时仍可读 */\n#ldmy-panel .ldmy-slider-row .ldmy-slider-min,\n#ldmy-panel .ldmy-slider-row .ldmy-slider-max {\n  font-size: 10px;\n  color: var(--primary-medium, #888);\n  font-variant-numeric: tabular-nums;\n  flex-shrink: 0;\n  min-width: 0;\n  line-height: 1;\n}\n#ldmy-panel .ldmy-field input[type=\"range\"] {\n  -webkit-appearance: none;\n  appearance: none;\n  flex: 1;\n  width: 100%;\n  height: 28px;\n  padding: 0;\n  margin: 0;\n  border: none;\n  border-radius: 0;\n  background: transparent;\n  cursor: pointer;\n}\n#ldmy-panel .ldmy-field input[type=\"range\"]:focus {\n  outline: none;\n}\n#ldmy-panel .ldmy-field input[type=\"range\"]:focus-visible {\n  outline: 2px solid color-mix(in srgb, var(--tertiary, #08c) 55%, transparent);\n  outline-offset: 2px;\n  border-radius: 8px;\n}\n#ldmy-panel .ldmy-field input[type=\"range\"]::-webkit-slider-runnable-track {\n  height: 6px;\n  border-radius: 999px;\n  background: linear-gradient(\n    90deg,\n    var(--tertiary, #08c) 0% var(--ldmy-slider-pct, 0%),\n    var(--primary-low, #ddd) var(--ldmy-slider-pct, 0%) 100%\n  );\n}\n#ldmy-panel .ldmy-field input[type=\"range\"]::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  appearance: none;\n  width: 16px;\n  height: 16px;\n  margin-top: -5px;\n  border-radius: 50%;\n  background: var(--secondary, #fff);\n  border: 2px solid var(--tertiary, #08c);\n  box-shadow: 0 1px 4px rgba(0,0,0,.18);\n  transition: transform .12s ease, box-shadow .12s ease;\n}\n#ldmy-panel .ldmy-field input[type=\"range\"]:hover::-webkit-slider-thumb,\n#ldmy-panel .ldmy-field input[type=\"range\"]:active::-webkit-slider-thumb {\n  transform: scale(1.12);\n  box-shadow: 0 2px 8px rgba(0,0,0,.22);\n}\n#ldmy-panel .ldmy-field input[type=\"range\"]::-moz-range-track {\n  height: 6px;\n  border-radius: 999px;\n  background: var(--primary-low, #ddd);\n}\n#ldmy-panel .ldmy-field input[type=\"range\"]::-moz-range-progress {\n  height: 6px;\n  border-radius: 999px;\n  background: var(--tertiary, #08c);\n}\n#ldmy-panel .ldmy-field input[type=\"range\"]::-moz-range-thumb {\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  background: var(--secondary, #fff);\n  border: 2px solid var(--tertiary, #08c);\n  box-shadow: 0 1px 4px rgba(0,0,0,.18);\n}\n#ldmy-panel .ldmy-panel-ft {\n  padding: 12px 20px 16px;\n  border-top: 1px solid var(--primary-low, #eee);\n  display: flex;\n  justify-content: space-between;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n#ldmy-panel .ldmy-btn {\n  padding: 6px 12px;\n  border-radius: 8px;\n  border: 1px solid var(--primary-low, #ddd);\n  background: var(--secondary, #fff);\n  color: var(--primary, #333);\n  cursor: pointer;\n  font-size: 13px;\n}\n#ldmy-panel .ldmy-btn:hover {\n  border-color: var(--tertiary, #08c);\n  color: var(--tertiary, #08c);\n}\n#ldmy-panel .ldmy-btn.primary {\n  background: var(--tertiary, #08c);\n  border-color: var(--tertiary, #08c);\n  color: #fff;\n}\n#ldmy-panel .ldmy-btn.primary:hover { filter: brightness(1.05); color: #fff; }\n#ldmy-panel .ldmy-btn.danger { color: #c0392b; border-color: #e0b4b0; }\n#ldmy-panel .ldmy-panel-ft-links {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin: 0 4px;\n}\n#ldmy-panel .ldmy-ft-link {\n  position: relative;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 32px;\n  height: 32px;\n  border-radius: 8px;\n  border: 1px solid var(--primary-low, #ddd);\n  background: var(--secondary, #fff);\n  color: var(--primary-medium, #666);\n  text-decoration: none;\n  cursor: pointer;\n  box-sizing: border-box;\n  transition: border-color .15s, color .15s, background .15s;\n  padding: 0;\n  font: inherit;\n}\n#ldmy-panel .ldmy-ft-link:hover,\n#ldmy-panel .ldmy-ft-link.is-open {\n  border-color: var(--tertiary, #08c);\n  color: var(--tertiary, #08c);\n  background: color-mix(in srgb, var(--tertiary, #08c) 8%, #fff);\n}\n#ldmy-panel .ldmy-ft-link svg {\n  width: 18px;\n  height: 18px;\n  display: block;\n  fill: currentColor;\n}\n/* GitHub 入口：默认近黑，避免次要灰发虚 */\n#ldmy-panel a.ldmy-ft-link {\n  color: #1f2328;\n  border-color: #c9cdd3;\n  background: #f6f8fa;\n}\n#ldmy-panel a.ldmy-ft-link:hover {\n  color: #fff;\n  border-color: #1f2328;\n  background: #1f2328;\n}\n#ldmy-panel .ldmy-ft-link.ldmy-support-tip {\n  font-size: 15px;\n  font-weight: 700;\n  line-height: 1;\n  color: #c0392b;\n}\n#ldmy-panel .ldmy-ft-link.ldmy-support-tip:hover,\n#ldmy-panel .ldmy-ft-link.ldmy-support-tip.is-open {\n  border-color: #e0b4b0;\n  color: #a93226;\n  background: #fff5f4;\n}\n#ldmy-panel .ldmy-support-pop {\n  position: absolute;\n  left: 50%;\n  bottom: calc(100% + 10px);\n  transform: translateX(-50%) translateY(4px);\n  width: 196px;\n  padding: 10px 10px 8px;\n  border-radius: 10px;\n  border: 1px solid var(--primary-low, #ddd);\n  background: var(--secondary, #fff);\n  box-shadow: 0 10px 28px rgba(0,0,0,.16);\n  color: var(--primary, #333);\n  opacity: 0;\n  visibility: hidden;\n  pointer-events: none;\n  transition: opacity .15s ease, transform .15s ease, visibility .15s;\n  z-index: 20;\n  text-align: center;\n}\n#ldmy-panel .ldmy-support-pop::after {\n  content: \"\";\n  position: absolute;\n  left: 50%;\n  top: 100%;\n  margin-left: -6px;\n  border: 6px solid transparent;\n  border-top-color: var(--secondary, #fff);\n  filter: drop-shadow(0 1px 0 var(--primary-low, #ddd));\n}\n#ldmy-panel .ldmy-ft-link.ldmy-support-tip:hover .ldmy-support-pop,\n#ldmy-panel .ldmy-ft-link.ldmy-support-tip.is-open .ldmy-support-pop {\n  opacity: 1;\n  visibility: visible;\n  pointer-events: auto;\n  transform: translateX(-50%) translateY(0);\n}\n#ldmy-panel .ldmy-support-pop img {\n  display: block;\n  width: 176px;\n  height: 176px;\n  object-fit: contain;\n  border-radius: 6px;\n  background: #fff;\n}\n#ldmy-panel .ldmy-support-pop .tip {\n  display: block;\n  margin-top: 6px;\n  font-size: 12px;\n  font-weight: 500;\n  color: var(--primary-medium, #666);\n  line-height: 1.3;\n}\n\n/* sub panels */\n.ldmy-subpanel {\n  position: absolute;\n  inset: 12px;\n  background: var(--secondary, #fff);\n  border-radius: 12px;\n  border: 1px solid var(--primary-low, #ddd);\n  box-shadow: 0 8px 24px rgba(0,0,0,.12);\n  z-index: 2;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}\n.ldmy-subpanel .hd {\n  padding: 12px 14px;\n  border-bottom: 1px solid var(--primary-low, #eee);\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  font-weight: 700;\n}\n.ldmy-subpanel .bd {\n  padding: 12px 14px;\n  overflow: auto;\n  flex: 1;\n  scrollbar-width: thin;\n  scrollbar-color: rgba(0,0,0,.28) transparent;\n}\n.ldmy-subpanel .bd::-webkit-scrollbar { width: 8px; }\n.ldmy-subpanel .bd::-webkit-scrollbar-thumb {\n  background: rgba(0,0,0,.22);\n  border-radius: 8px;\n  border: 2px solid transparent;\n  background-clip: content-box;\n}\n.ldmy-subpanel .ft {\n  padding: 10px 14px;\n  border-top: 1px solid var(--primary-low, #eee);\n  display: flex;\n  gap: 8px;\n  justify-content: flex-end;\n}\n.ldmy-tag {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 2px 8px;\n  border-radius: 999px;\n  font-size: 12px;\n  margin: 2px;\n  background: var(--primary-low, #eee);\n}\n.ldmy-tag button {\n  border: none;\n  background: transparent;\n  cursor: pointer;\n  color: inherit;\n  padding: 0 2px;\n  font-size: 14px;\n}\n.ldmy-list-row {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 0;\n  border-bottom: 1px dashed var(--primary-low, #eee);\n  font-size: 13px;\n}\n.ldmy-list-row .meta { color: var(--primary-medium, #888); font-size: 12px; }\n\n";

	const featuresCss = "/* ===== feature styles ===== */\n/* hide avatar */\nbody.ldmy-hide-avatar img.avatar,\nbody.ldmy-hide-avatar .post-avatar img,\nbody.ldmy-hide-avatar .topic-avatar img,\nbody.ldmy-hide-avatar .topic-list .posters img,\nbody.ldmy-hide-avatar .avatar-flair {\n  display: none !important;\n}\nbody.ldmy-hide-avatar .topic-avatar,\nbody.ldmy-hide-avatar .post-avatar {\n  min-width: 0 !important;\n  width: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  overflow: hidden;\n}\n\n/* hide emoji */\nbody.ldmy-hide-emoji img.emoji,\nbody.ldmy-hide-emoji img.emojis,\nbody.ldmy-hide-emoji .emoji-images {\n  display: none !important;\n}\nbody:not(.ldmy-hide-emoji) .ldmy-emoji-alt {\n  display: none !important;\n}\n\n/* hide images in posts (keep emoji controlled separately) */\nbody.ldmy-hide-image .cooked img:not(.emoji),\nbody.ldmy-hide-image .cooked .lightbox-wrapper,\nbody.ldmy-hide-image .cooked .image-wrapper {\n  display: none !important;\n}\nbody.ldmy-hide-image .cooked img:not(.emoji).ldmy-img-revealed {\n  display: inline-block !important;\n}\nbody.ldmy-hide-image .cooked .lightbox-wrapper.ldmy-img-revealed {\n  display: block !important;\n}\nbody.ldmy-hide-image .cooked .image-wrapper.ldmy-img-revealed {\n  display: inline-block !important;\n}\n/* 隐藏图片时的 [图] 占位：可点击临时显示 */\n.ldmy-img-ph {\n  display: none;\n  box-sizing: border-box;\n  margin: 0 2px;\n  padding: 0 4px;\n  border: 1px solid transparent;\n  border-radius: 0;\n  background: transparent;\n  color: #6b7280;\n  font-size: 12px;\n  font-family: Consolas, \"SF Mono\", Menlo, \"Courier New\", monospace;\n  font-variant-numeric: tabular-nums;\n  line-height: 1.4;\n  vertical-align: baseline;\n  cursor: pointer;\n  user-select: none;\n  white-space: nowrap;\n}\nbody.ldmy-hide-image .ldmy-img-ph {\n  display: inline;\n  color: #6b7280;\n  background: #f3f4f6;\n  border-color: #e5e7eb;\n}\nbody.ldmy-hide-image .ldmy-img-ph:hover {\n  color: #1a3959;\n  background: #eee;\n  border-color: #bbb;\n}\nbody.ldmy-hide-image .ldmy-img-ph.is-open {\n  color: #217346;\n  background: #eef6ff;\n  border-color: #8eb6e8;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-hide-image .ldmy-img-ph {\n  color: #a0a0a0;\n  background: #2a2a2a;\n  border-color: #3f3f46;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-hide-image .ldmy-img-ph:hover {\n  color: #8ec7ff;\n  background: #333;\n  border-color: #555;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-hide-image .ldmy-img-ph.is-open {\n  color: #7dcea0;\n  background: #1e2a24;\n  border-color: #3d6b4f;\n}\nbody:not(.ldmy-hide-image) .ldmy-img-ph {\n  display: none !important;\n}\n\n/* user title */\nbody.ldmy-hide-user-title .user-title,\nbody.ldmy-hide-user-title .user-status,\nbody.ldmy-hide-user-title .poster-avatar-extra {\n  display: none !important;\n}\n\n/* sidebar */\nbody.ldmy-hide-sidebar .sidebar-wrapper,\nbody.ldmy-hide-sidebar #d-sidebar,\nbody.ldmy-hide-sidebar .d-header-sidebar-toggle {\n  display: none !important;\n}\n/*\n * Discourse 默认 grid-template-areas: \"sidebar content\"。\n * 仅改 columns 为 1fr 时，named area 仍会隐式生成两列：\n * 空的 sidebar 列吃掉 1fr，content 贴右 → 左侧大片空白。\n */\nbody.ldmy-hide-sidebar.has-sidebar-page #main-outlet-wrapper,\nbody.ldmy-hide-sidebar #main-outlet-wrapper {\n  grid-template-columns: minmax(0, 1fr) !important;\n  grid-template-areas:\n    \"content\"\n    \"below-content\" !important;\n  gap: 0 !important;\n}\n/* has-sidebar-page 的 .wrap 默认 max-width 含侧栏宽度，隐藏后去掉 */\nbody.ldmy-hide-sidebar.has-sidebar-page .wrap,\nbody.ldmy-hide-sidebar.has-sidebar-page #main-outlet-wrapper.wrap {\n  max-width: var(--d-max-width, 1110px) !important;\n}\nbody.ldmy-hide-sidebar.ldmy-wide.has-sidebar-page .wrap,\nbody.ldmy-hide-sidebar.ldmy-wide.has-sidebar-page #main-outlet-wrapper,\nbody.ldmy-hide-sidebar.ldmy-wide.has-sidebar-page #main-outlet-wrapper.wrap {\n  max-width: none !important;\n  width: 100% !important;\n}\n\n/* topic map */\nbody.ldmy-hide-topic-map .topic-map,\nbody.ldmy-hide-topic-map .topic-map.--op,\nbody.ldmy-hide-topic-map .toggle-summary {\n  display: none !important;\n}\n\n/* compact topic list（Excel 下同样生效，压缩行高更像表格） */\nbody.ldmy-compact .topic-list .topic-list-item {\n  border-bottom: 1px solid var(--primary-low, #eee) !important;\n}\nbody.ldmy-compact .topic-list td,\nbody.ldmy-compact .topic-list .topic-list-data {\n  padding-top: 2px !important;\n  padding-bottom: 2px !important;\n  line-height: 1.25 !important;\n}\nbody.ldmy-compact .topic-list .link-bottom-line,\nbody.ldmy-compact .topic-list .topic-excerpt,\nbody.ldmy-compact .topic-list .posters,\nbody.ldmy-compact .topic-list .topic-list-data.posters {\n  display: none !important;\n}\nbody.ldmy-compact .topic-list .main-link .title,\nbody.ldmy-compact .topic-list a.title,\nbody.ldmy-compact .topic-list a.raw-topic-link {\n  /* 紧凑只压行高/间距，不改基础字号 */\n  line-height: 1.3 !important;\n}\nbody.ldmy-compact.ldmy-excel .topic-list td,\nbody.ldmy-compact.ldmy-excel .topic-list .topic-list-data {\n  /* 字号解耦后略放宽，避免标题被裁切 */\n  height: 28px !important;\n  min-height: 28px !important;\n  max-height: 34px !important;\n}\n\n/* wide mode（非 Excel；Excel 已强制全宽） */\nbody.ldmy-wide {\n  --d-max-width: 1400px !important;\n  --topic-body-width: 980px !important;\n}\nbody.ldmy-wide #main-outlet,\nbody.ldmy-wide .wrap,\nbody.ldmy-wide #main-outlet-wrapper,\nbody.ldmy-wide .topic-body,\nbody.ldmy-wide .container.posts {\n  max-width: none !important;\n  width: 100% !important;\n}\nbody.ldmy-wide .topic-area,\nbody.ldmy-wide .posts-wrapper,\nbody.ldmy-wide .topic-body {\n  max-width: none !important;\n}\n\n/* font resize：统一偏移。\n   注意：不要父子同时选中（会 1em+offset 叠两次）。\n   侧栏用容器一次放大；列表元数据/标签用叶子节点。 */\nbody.ldmy-font-resize .cooked,\nbody.ldmy-font-resize .topic-list .main-link .title,\nbody.ldmy-font-resize .topic-list a.title,\nbody.ldmy-font-resize .topic-list a.raw-topic-link,\nbody.ldmy-font-resize .fancy-title,\nbody.ldmy-font-resize #topic-title h1,\nbody.ldmy-font-resize .fps-result .topic-title,\nbody.ldmy-font-resize .fps-result .topic-title span,\nbody.ldmy-font-resize .fps-result .search-link,\nbody.ldmy-font-resize .fps-result .blurb,\nbody.ldmy-font-resize .names,\nbody.ldmy-font-resize .post-date,\nbody.ldmy-font-resize .post-info,\nbody.ldmy-font-resize .discourse-boosts__cooked,\n/* 列表：分类/标签/回复/浏览/活动等 */\nbody.ldmy-font-resize .topic-list .badge-category,\nbody.ldmy-font-resize .topic-list .badge-category__wrapper,\nbody.ldmy-font-resize .topic-list .badge-category__name,\nbody.ldmy-font-resize .topic-list .discourse-tag,\nbody.ldmy-font-resize .topic-list .discourse-tags,\nbody.ldmy-font-resize .topic-list .link-bottom-line,\nbody.ldmy-font-resize .topic-list .topic-excerpt,\nbody.ldmy-font-resize .topic-list .num,\nbody.ldmy-font-resize .topic-list .num .number,\nbody.ldmy-font-resize .topic-list .posts-map,\nbody.ldmy-font-resize .topic-list .views .number,\nbody.ldmy-font-resize .topic-list .replies .number,\nbody.ldmy-font-resize .topic-list .activity,\nbody.ldmy-font-resize .topic-list .activity .relative-date,\nbody.ldmy-font-resize .topic-list .posters,\nbody.ldmy-font-resize .topic-category-data,\nbody.ldmy-font-resize .topic-likes-replies-data,\nbody.ldmy-font-resize .topic-activity-data,\nbody.ldmy-font-resize .topic-status-data,\nbody.ldmy-font-resize .topic-list .topic-category,\nbody.ldmy-font-resize .topic-list .badge-notification,\n/* 侧栏：只改容器，避免子项再 +offset */\nbody.ldmy-font-resize #d-sidebar,\nbody.ldmy-font-resize .sidebar-wrapper,\nbody.ldmy-font-resize .sidebar-container,\nbody.ldmy-font-resize aside.sidebar,\n/* 导航/面包屑 */\nbody.ldmy-font-resize .navigation-container,\nbody.ldmy-font-resize .category-breadcrumb,\nbody.ldmy-font-resize .nav-pills > li > a,\nbody.ldmy-font-resize .post-menu-area .btn,\nbody.ldmy-font-resize .post__menu-area .btn,\nbody.ldmy-font-resize .post-controls .btn {\n  font-size: calc(1em + var(--ldmy-font-offset, 0px)) !important;\n}\n\n/* Excel 不再强制缩小列表数值/标签等原站元素字号；\n   表格感只靠边框/间距；字号跟站点，偏移由 font-resize 统一加 */\n\n/* highlight OP：只打在主帖 names 上，避免嵌套/引用展开误标楼主 */\nbody.ldmy-highlight-op .topic-post.topic-owner > article > .row > .topic-body > .topic-meta-data > .names::after,\nbody.ldmy-highlight-op .topic-post.topic-owner > article > .post__row > .topic-body > .topic-meta-data > .names::after,\nbody.ldmy-highlight-op .topic-post.topic-owner > article > .row > .post__body > .topic-meta-data > .names::after,\nbody.ldmy-highlight-op .topic-post.topic-owner > article > .post__row > .post__body > .topic-meta-data > .names::after,\nbody.ldmy-highlight-op .topic-post.post--topic-owner > article > .row > .topic-body > .topic-meta-data > .names::after,\nbody.ldmy-highlight-op .topic-post.post--topic-owner > article > .post__row > .topic-body > .topic-meta-data > .names::after,\nbody.ldmy-highlight-op .topic-post.post--topic-owner > article > .row > .post__body > .topic-meta-data > .names::after,\nbody.ldmy-highlight-op .topic-post.post--topic-owner > article > .post__row > .post__body > .topic-meta-data > .names::after {\n  content: '楼主';\n  display: inline-block;\n  margin-left: 6px;\n  padding: 0 6px;\n  border-radius: 4px;\n  font-size: 12px;\n  line-height: 18px;\n  color: #fff;\n  background: var(--ldmy-author-color, #e74c3c);\n  vertical-align: middle;\n}\n/* 兜底：非 Excel 时若结构略有差异，仍给主楼层 names 标楼主（排除 embedded） */\nbody.ldmy-highlight-op:not(.ldmy-excel) .topic-post.topic-owner .topic-meta-data:not(.embedded-reply) > .names::after,\nbody.ldmy-highlight-op:not(.ldmy-excel) .topic-post.post--topic-owner .topic-meta-data:not(.embedded-reply) > .names::after {\n  content: '楼主';\n  display: inline-block;\n  margin-left: 6px;\n  padding: 0 6px;\n  border-radius: 4px;\n  font-size: 12px;\n  line-height: 18px;\n  color: #fff;\n  background: var(--ldmy-author-color, #e74c3c);\n  vertical-align: middle;\n}\nbody.ldmy-highlight-op .topic-post.topic-owner,\nbody.ldmy-highlight-op .topic-post.post--topic-owner {\n  border-left: 3px solid var(--ldmy-author-color, #e74c3c);\n  padding-left: 6px;\n}\n/* 引用/嵌套里的 names 绝不能继承楼主 */\nbody.ldmy-highlight-op .topic-post .embedded-posts .names::after,\nbody.ldmy-highlight-op .topic-post .post__embedded-posts .names::after,\nbody.ldmy-highlight-op .topic-post .topic-meta-data.embedded-reply .names::after {\n  content: none !important;\n  display: none !important;\n  margin: 0 !important;\n  padding: 0 !important;\n}\n/* Excel：楼主放第 2 行末尾（称号/表情之后） */\nbody.ldmy-excel.ldmy-highlight-op .topic-post.topic-owner > article > .row > .topic-body > .topic-meta-data > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.topic-owner > article > .post__row > .topic-body > .topic-meta-data > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.topic-owner > article > .row > .post__body > .topic-meta-data > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.topic-owner > article > .post__row > .post__body > .topic-meta-data > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.post--topic-owner > article > .row > .topic-body > .topic-meta-data > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.post--topic-owner > article > .post__row > .topic-body > .topic-meta-data > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.post--topic-owner > article > .row > .post__body > .topic-meta-data > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.post--topic-owner > article > .post__row > .post__body > .topic-meta-data > .names::after {\n  order: 7 !important; /* 第 2 行末：称号 → 表情/徽章 → 楼主 */\n  margin-left: 0;\n  margin-top: 0;\n  align-self: center;\n  flex: 0 0 auto;\n  font-size: 11px;\n  line-height: 16px;\n  padding: 0 5px;\n  border-radius: 2px;\n  vertical-align: middle;\n}\nbody.ldmy-excel.ldmy-highlight-op .topic-post.topic-owner,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.post--topic-owner {\n  border-left: none !important;\n  padding-left: 0 !important;\n}\nbody.ldmy-excel .topic-owner .cooked::after,\nbody.ldmy-excel .topic-post.topic-owner .contents > .cooked::after,\nbody.ldmy-excel .topic-post.post--topic-owner .contents > .cooked::after,\nbody.ldmy-excel div.topic-owner .topic-body .contents > .cooked::after,\nbody.ldmy-excel div.topic-owner .post__body .contents > .cooked::after,\nbody.ldmy-excel div.topic-owner .topic-body .post__contents > .cooked::after,\nbody.ldmy-excel div.topic-owner .post__body .post__contents > .cooked::after {\n  content: none !important;\n  display: none !important;\n}\n\n/* only OP */\nbody.ldmy-only-op .topic-post:not(.topic-owner):not(.post--topic-owner) {\n  display: none !important;\n}\n\n/* image max size：默认不额外限制（随正文列宽）；开启封顶时再套 --img-max */\nbody:not(.ldmy-hide-image) .cooked img:not(.emoji) {\n  max-width: 100% !important;\n  height: auto !important;\n  cursor: zoom-in;\n}\nbody.ldmy-img-cap:not(.ldmy-hide-image) .cooked img:not(.emoji),\nbody.ldmy-img-cap:not(.ldmy-hide-image) .cooked .lightbox-wrapper,\nbody.ldmy-img-cap:not(.ldmy-hide-image) .cooked .image-wrapper,\nbody.ldmy-img-cap:not(.ldmy-hide-image) .cooked a.lightbox {\n  max-width: min(100%, var(--ldmy-img-max)) !important;\n}\nbody.ldmy-img-cap:not(.ldmy-hide-image) .cooked .lightbox-wrapper img,\nbody.ldmy-img-cap:not(.ldmy-hide-image) .cooked .image-wrapper img,\nbody.ldmy-img-cap:not(.ldmy-hide-image) .cooked a.lightbox img {\n  max-width: 100% !important;\n  height: auto !important;\n}\n.ldmy-img-viewer {\n  position: fixed;\n  inset: 0;\n  z-index: 100001;\n  background: rgba(0,0,0,.82);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-direction: column;\n  gap: 10px;\n}\n.ldmy-img-viewer img {\n  max-width: 92vw;\n  max-height: 82vh;\n  object-fit: contain;\n  transition: transform .15s ease;\n  cursor: grab;\n  user-select: none;\n}\n.ldmy-img-viewer .toolbar {\n  display: flex;\n  gap: 8px;\n  flex-wrap: wrap;\n  justify-content: center;\n}\n.ldmy-img-viewer .toolbar button {\n  border: none;\n  background: rgba(255,255,255,.15);\n  color: #fff;\n  padding: 6px 12px;\n  border-radius: 6px;\n  cursor: pointer;\n}\n.ldmy-img-viewer .toolbar button:hover { background: rgba(255,255,255,.28); }\n.ldmy-img-viewer .counter { color: #ddd; font-size: 13px; }\n\n/* ban / mark */\n.ldmy-banned-post {\n  opacity: .35;\n  filter: grayscale(1);\n}\n.ldmy-banned-post.ldmy-ban-collapsed .cooked,\n.ldmy-banned-post.ldmy-ban-collapsed .post-menu-area {\n  display: none !important;\n}\n.ldmy-ban-placeholder {\n  padding: 8px 12px;\n  color: var(--primary-medium, #888);\n  font-size: 13px;\n  font-style: italic;\n}\n.ldmy-mark-tags {\n  display: inline-flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  margin-left: 6px;\n  vertical-align: middle;\n}\n.ldmy-mark-tag {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 0 6px;\n  border-radius: 4px;\n  font-size: 12px;\n  line-height: 18px;\n  color: #fff;\n  background: #8e44ad;\n  cursor: pointer;\n  user-select: none;\n}\n.ldmy-mark-tag:hover { filter: brightness(0.92); }\n.ldmy-mark-tag .ldmy-mark-x {\n  font-size: 11px;\n  opacity: 0.75;\n  line-height: 1;\n}\n.ldmy-mark-tag:hover .ldmy-mark-x { opacity: 1; }\n/* Excel 设置块：整行占满两列；提示贴在开关旁 */\n#ldmy-panel .ldmy-excel-block {\n  grid-column: 1 / -1;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding: 4px 0 8px;\n  border-bottom: 1px dashed var(--primary-low, #eee);\n}\n#ldmy-panel .ldmy-excel-block > .ldmy-item {\n  border-bottom: none;\n  padding: 4px 0 0;\n}\n#ldmy-panel .ldmy-excel-block > .ldmy-item label {\n  display: inline-flex;\n  align-items: baseline;\n  flex-wrap: wrap;\n  gap: 2px 8px;\n  max-width: 100%;\n}\n#ldmy-panel .ldmy-excel-tip {\n  font-size: 11px;\n  opacity: 0.55;\n  font-weight: 400;\n  line-height: 1.35;\n  white-space: normal;\n}\n#ldmy-panel .ldmy-excel-inline-opts {\n  margin: 4px 0 0 0;\n  padding: 10px 12px;\n  border: 1px solid var(--primary-low, #e5e5e5);\n  border-radius: 8px;\n  background: var(--secondary, #fafafa);\n  overflow: visible;\n}\n#ldmy-panel .ldmy-excel-inline-row {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 8px 14px;\n  align-items: center;\n  width: 100%;\n  min-width: 0;\n}\n@media (max-width: 640px) {\n  #ldmy-panel .ldmy-excel-inline-row {\n    grid-template-columns: 1fr;\n  }\n}\n/* 标签+控件同一行，省高度；选择器带 #panel 盖过通用 .field */\n#ldmy-panel .ldmy-excel-inline-opts .ldmy-field {\n  display: grid !important;\n  grid-template-columns: 6.5em 1fr;\n  align-items: center !important;\n  gap: 8px;\n  font-size: 12px;\n  margin: 0;\n  min-width: 0;\n  min-height: 32px;\n  white-space: nowrap;\n}\n#ldmy-panel .ldmy-excel-inline-opts .ldmy-field > span {\n  opacity: 0.85;\n  line-height: 1.3;\n  color: var(--primary-medium, #666);\n  white-space: nowrap;\n  text-align: right;\n  box-sizing: border-box;\n}\n#ldmy-panel .ldmy-excel-inline-opts select,\n#ldmy-panel .ldmy-excel-inline-opts input[type=\"text\"] {\n  box-sizing: border-box !important;\n  width: 100% !important;\n  min-width: 0 !important;\n  max-width: none !important;\n  font-size: 12px !important;\n  font-family: inherit !important;\n  height: auto !important;\n  min-height: 32px !important;\n  max-height: none !important;\n  line-height: 20px !important;\n  padding: 5px 8px !important;\n  border-radius: 6px !important;\n  border: 1px solid var(--primary-low, #ddd) !important;\n  background: var(--secondary, #fff) !important;\n  color: var(--primary, #222) !important;\n  overflow: visible !important;\n  text-overflow: clip !important;\n  -webkit-appearance: menulist !important;\n  appearance: menulist !important;\n}\n#ldmy-panel .ldmy-excel-inline-opts input[type=\"text\"] {\n  -webkit-appearance: textfield !important;\n  appearance: textfield !important;\n}\n/* 分组小标题：外观 / 显示 */\n#ldmy-panel .ldmy-excel-opt-group {\n  grid-column: 1 / -1;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin: 2px 0 0;\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  color: var(--primary-medium, #888);\n  line-height: 1.2;\n}\n#ldmy-panel .ldmy-excel-opt-group::after {\n  content: \"\";\n  flex: 1;\n  height: 1px;\n  background: var(--primary-low, #e5e5e5);\n}\n#ldmy-panel .ldmy-excel-opt-group:first-child {\n  margin-top: 0;\n}\n\n.ldmy-user-actions {\n  display: inline-flex;\n  gap: 4px;\n  margin-left: 8px;\n  opacity: 0;\n  transition: opacity .15s ease;\n  vertical-align: middle;\n}\n.topic-meta-data:hover .ldmy-user-actions,\n.names:hover .ldmy-user-actions {\n  opacity: 1;\n}\n/* Excel 用户列：备注/拉黑在身份行/时间下方，不夹进 names 横排 */\nbody.ldmy-excel .ldmy-user-actions {\n  display: flex;\n  flex-wrap: wrap;\n  margin-left: 0;\n  margin-top: 0;\n  max-width: 100%;\n}\nbody.ldmy-excel .ldmy-mark-tags {\n  display: flex;\n  flex-wrap: wrap;\n  margin-left: 0;\n  margin-top: 0;\n  max-width: 100%;\n}\nbody.ldmy-excel .topic-meta-data > .ldmy-user-actions,\nbody.ldmy-excel .topic-meta-data > .ldmy-mark-tags {\n  order: 20; /* 落在 names / 时间之后 */\n}\n/* 若残留在 names 内，也排到横排末尾，避免插到徽章中间 */\nbody.ldmy-excel .names > .ldmy-user-actions,\nbody.ldmy-excel .names > .ldmy-mark-tags {\n  order: 20 !important;\n  flex: 1 0 100% !important;\n  margin-top: 2px;\n}\n.ldmy-user-actions button {\n  border: 1px solid var(--primary-low, #ddd);\n  background: var(--secondary, #fff);\n  color: var(--primary-medium, #666);\n  border-radius: 4px;\n  font-size: 11px;\n  padding: 0 5px;\n  line-height: 18px;\n  cursor: pointer;\n}\n.ldmy-user-actions button:hover {\n  color: var(--tertiary, #08c);\n  border-color: var(--tertiary, #08c);\n}\n.ldmy-user-actions button.ban:hover { color: #c0392b; border-color: #c0392b; }\n\n/* keyword blocked row */\n.ldmy-kw-blocked {\n  display: none !important;\n}\n\n/* floor jump */\n.ldmy-floor-bar {\n  position: fixed;\n  /* 水平避开 FAB 按钮组（顶部/楼层/设置），显示在按钮左侧 */\n  right: 76px;\n  bottom: 150px;\n  z-index: 99982; /* 盖过 Excel 固定头/尾（99981），避免被遮住 */\n  display: none;\n  flex-direction: column;\n  gap: 6px;\n  background: var(--secondary, #fff);\n  border: 1px solid var(--primary-low, #ddd);\n  border-radius: 10px;\n  padding: 8px;\n  box-shadow: 0 4px 14px rgba(0,0,0,.12);\n}\nbody.ldmy-fab-left .ldmy-floor-bar {\n  right: auto;\n  left: 76px;\n}\n.ldmy-floor-bar.open { display: flex; }\n.ldmy-floor-bar input {\n  width: 72px;\n  padding: 4px 6px;\n  border-radius: 6px;\n  border: 1px solid var(--primary-low, #ddd);\n  font-size: 13px;\n}\n.ldmy-floor-bar button {\n  border: none;\n  background: var(--tertiary, #08c);\n  color: #fff;\n  border-radius: 6px;\n  padding: 4px 8px;\n  cursor: pointer;\n  font-size: 12px;\n}\n\n/* blocked topic list item residual */\n.topic-list-item.ldmy-kw-blocked { display: none !important; }\n\n/* only-op tip */\n#ldmy-only-op-tip {\n  position: sticky;\n  top: 60px;\n  z-index: 80;\n  margin: 8px auto;\n  width: fit-content;\n  background: var(--tertiary, #08c);\n  color: #fff;\n  padding: 6px 12px;\n  border-radius: 999px;\n  font-size: 12px;\n  box-shadow: 0 2px 8px rgba(0,0,0,.15);\n  display: none;\n  cursor: pointer;\n}\nbody.ldmy-only-op #ldmy-only-op-tip { display: inline-flex; gap: 6px; align-items: center; }\n\n";

	/** 按 order 收集并注入样式 */

	/**
	 * @param {Array<{name?: string, style?: string|string[], styleOrder?: number, asyncStyle?: Function}>} modules
	 * @param {object} script
	 */
	function collectStyles(modules, script) {
		const chunks = [
			{ order: 0, name: 'base', css: baseCss },
			{ order: 50, name: 'features', css: featuresCss },
		];
		for (const m of modules) {
			const order = m.styleOrder ?? 100;
			if (m.style) {
				const list = Array.isArray(m.style) ? m.style : [m.style];
				const css = list.filter(Boolean).join('\n');
				if (css.trim()) chunks.push({ order, name: m.name || 'module', css });
			}
			if (typeof m.asyncStyle === 'function') {
				try {
					const css = m.asyncStyle(script);
					if (css && String(css).trim()) {
						chunks.push({ order: order + 1, name: `${m.name || 'module'}:async`, css: String(css) });
					}
				} catch (e) {
					console.error('[ldmy] asyncStyle', m.name, e);
				}
			}
		}
		chunks.sort((a, b) => a.order - b.order || 0);
		return chunks.map((c) => `/* ==== ${c.name} ==== */\n${c.css}`).join('\n');
	}

	function injectCss(css) {
		if (typeof GM_addStyle === 'function') {
			return GM_addStyle(css);
		}
		const el = document.createElement('style');
		el.textContent = css;
		document.documentElement.appendChild(el);
		return el;
	}

	/** 快捷键总线：收集模块 shortcuts 声明 */

	/**
	 * @param {object[]} modules
	 * @returns {Map<string, {action: string, handler: Function, defaultKey?: string, dynamic?: boolean, module?: string}>}
	 */
	function collectShortcutHandlers(modules) {
		const map = new Map();
		for (const mod of modules) {
			const list = mod.shortcuts;
			if (!Array.isArray(list)) continue;
			for (const item of list) {
				if (!item || !item.action || typeof item.handler !== 'function') continue;
				if (map.has(item.action)) {
					console.warn(`[ldmy] shortcut action conflict: ${item.action} (${mod.name})`);
					continue;
				}
				map.set(item.action, { ...item, module: mod.name });
			}
		}
		return map;
	}

	/** 从模块声明收集 settings */

	/**
	 * @param {object[]} modules
	 * @returns {{ normal: object, advanced: object, registry: object[] }}
	 */
	function collectSettingsFromModules(modules) {
		const normal = { ...DEFAULT_NORMAL };
		const advanced = { ...DEFAULT_ADVANCED };
		const registry = [];
		const seen = new Set();

		const addOne = (mod, setting) => {
			if (!setting || !setting.key) return;
			const type = setting.type || 'normal';
			const id = `${type}:${setting.key}`;
			if (seen.has(id)) {
				// builtin defaults win; later duplicate skipped
				return;
			}
			seen.add(id);
			registry.push({ ...setting, type, module: mod.name });
			const bucket = type === 'advanced' ? advanced : normal;
			if (!(setting.key in bucket)) {
				bucket[setting.key] = setting.default;
			} else if (Object.prototype.hasOwnProperty.call(setting, 'default')) ;
		};

		for (const mod of modules) {
			if (mod.setting) addOne(mod, mod.setting);
			if (Array.isArray(mod.settings)) {
				for (const s of mod.settings) addOne(mod, s);
			}
		}
		return { normal, advanced, registry };
	}

	/** LinuxDoMoyu 核心总线 */

	class LinuxDoMoyu {
		constructor() {
			this.normal = { ...DEFAULT_NORMAL };
			this.advanced = { ...DEFAULT_ADVANCED };
			this.shortcuts = { ...DEFAULT_SHORTCUTS };
			this.banList = []; // [{username, reason, time}]
			this.markList = []; // [{username, tags:[{text, color}], time}]
			this.keywords = []; // string[]
			this.modules = [];
			this._styleEl = null;
			this._observer = null;
			this._lastUrl = location.href;
			this._panelOpen = false;
			this._panelSnapshot = null;
		}

		getModule(name) {
			return this.modules.find((m) => m.name === name) || null;
		}

		addModule(mod) {
			if (!mod || !mod.name) {
				console.warn(`[${SCRIPT_NAME}] addModule: invalid module`);
				return;
			}
			if (typeof mod.preProc === 'function') {
				try {
					mod.preProc(this);
				} catch (e) {
					console.error(`[${SCRIPT_NAME}] module ${mod.name} preProc`, e);
				}
			}
			this.modules.push(mod);
		}

		load() {
			const saved = storageGet(STORAGE.SETTINGS, null);
			if (saved && typeof saved === 'object') {
				this.normal = { ...DEFAULT_NORMAL, ...(saved.normal || {}) };
				this.advanced = { ...DEFAULT_ADVANCED, ...(saved.advanced || {}) };
			}
			this.shortcuts = { ...DEFAULT_SHORTCUTS, ...(storageGet(STORAGE.SHORTCUTS, {}) || {}) };
			this.banList = storageGet(STORAGE.BAN_LIST, []) || [];
			this.markList = storageGet(STORAGE.MARK_LIST, []) || [];
			this.keywords = storageGet(STORAGE.KEYWORDS, []) || [];
			this.migrateSettingsRev();
		}

		/** 仅当某项仍等于「上一版默认」时才迁到新默认，避免覆盖用户自定义 */
		migrateSettingsRev() {
			const rev = Number(storageGet(STORAGE.SETTINGS_REV, 1)) || 1;
			if (rev >= SETTINGS_REV) return;
			let changed = false;
			if (rev < 2) {
				// 1.1.11：紧凑/元数据前置默认开；图片宽度 0=不限制（旧默认 280 太小）
				if (this.normal.compactMode === false) {
					this.normal.compactMode = true;
					changed = true;
				}
				if (this.advanced.excelMetaLeading === false) {
					this.advanced.excelMetaLeading = true;
					changed = true;
				}
				if (this.advanced.imageMaxWidth === 280) {
					this.advanced.imageMaxWidth = 0;
					changed = true;
				}
			}
			storageSet(STORAGE.SETTINGS_REV, SETTINGS_REV);
			if (changed) this.saveSettings();
		}

		saveSettings() {
			storageSet(STORAGE.SETTINGS, {
				normal: this.normal,
				advanced: this.advanced,
			});
			storageSet(STORAGE.SHORTCUTS, this.shortcuts);
		}

		saveLists() {
			storageSet(STORAGE.BAN_LIST, this.banList);
			storageSet(STORAGE.MARK_LIST, this.markList);
			storageSet(STORAGE.KEYWORDS, this.keywords);
		}

		exportAll() {
			return {
				version: SCRIPT_VERSION,
				exportedAt: new Date().toISOString(),
				normal: this.normal,
				advanced: this.advanced,
				shortcuts: this.shortcuts,
				banList: this.banList,
				markList: this.markList,
				keywords: this.keywords,
			};
		}

		importAll(data) {
			if (!data || typeof data !== 'object') throw new Error('无效配置');
			if (data.normal) this.normal = { ...DEFAULT_NORMAL, ...data.normal };
			if (data.advanced) this.advanced = { ...DEFAULT_ADVANCED, ...data.advanced };
			if (data.shortcuts) this.shortcuts = { ...DEFAULT_SHORTCUTS, ...data.shortcuts };
			if (Array.isArray(data.banList)) this.banList = data.banList;
			if (Array.isArray(data.markList)) this.markList = data.markList;
			if (Array.isArray(data.keywords)) this.keywords = data.keywords;
			this.saveSettings();
			this.saveLists();
			this.applyAll();
		}

		// ---- body class flags for CSS-driven features ----
		applyBodyFlags() {
			const excelOn = !!this.normal.excelMode;
			// Excel 开启时侧栏由 excelHideNav 统一控制，避免与 hideSidebar 冲突
			const map = {
				[`${PREFIX}-hide-avatar`]: this.normal.hideAvatar,
				[`${PREFIX}-hide-emoji`]: this.normal.hideEmoji,
				[`${PREFIX}-hide-image`]: this.normal.hideImage,
				[`${PREFIX}-hide-user-title`]: this.normal.hideUserTitle,
				[`${PREFIX}-hide-sidebar`]: excelOn ? false : this.normal.hideSidebar,
				[`${PREFIX}-hide-topic-map`]: this.normal.hideTopicMap,
				[`${PREFIX}-compact`]: this.normal.compactMode,
				[`${PREFIX}-excel`]: excelOn,
				// Excel 已强制全宽，宽屏 class 仅非 Excel 时生效，避免互相覆盖
				[`${PREFIX}-wide`]: !excelOn && this.normal.wideMode,
				[`${PREFIX}-highlight-op`]: this.normal.highlightOP,
				[`${PREFIX}-only-op`]: this.normal.onlyOP,
				[`${PREFIX}-fab-left`]: this.advanced.fabPosition === 'left',
			};
			Object.entries(map).forEach(([cls, on]) => {
				document.body.classList.toggle(cls, !!on);
			});
			// Excel 主题 / 行号 / 导航 class
			const excelTheme = this.advanced.excelTheme === 'office' ? 'office' : 'tencent';
			['tencent', 'office'].forEach((t) => {
				document.body.classList.toggle(`${PREFIX}-excel-${t}`, excelOn && excelTheme === t);
			});
			document.body.classList.toggle(
				`${PREFIX}-excel-rows`,
				excelOn && !!this.advanced.excelShowRowIndex
			);
			document.body.classList.toggle(
				`${PREFIX}-excel-hide-nav`,
				excelOn && this.advanced.excelHideNav !== false
			);
			document.body.classList.toggle(
				`${PREFIX}-excel-meta-col`,
				excelOn && !!this.advanced.excelMetaCol
			);
			document.body.classList.toggle(
				`${PREFIX}-excel-meta-leading`,
				excelOn && !!this.advanced.excelMetaLeading
			);
			document.body.classList.toggle(
				`${PREFIX}-boost-annotation`,
				excelOn && !!this.advanced.boostAsAnnotation
			);
			document.documentElement.style.setProperty(
				`--${PREFIX}-author-color`,
				this.advanced.authorMarkColor || '#e74c3c'
			);
			const imgMax = Number(this.advanced.imageMaxWidth);
			if (Number.isFinite(imgMax) && imgMax > 0) {
				document.documentElement.style.setProperty(
					`--${PREFIX}-img-max`,
					`${imgMax}px`
				);
				document.body.classList.add(`${PREFIX}-img-cap`);
			} else {
				document.documentElement.style.removeProperty(`--${PREFIX}-img-max`);
				document.body.classList.remove(`${PREFIX}-img-cap`);
			}
			const fontRaw = Number(this.advanced.fontSize);
			const fontOffset = Number.isFinite(fontRaw)
				? Math.max(-4, Math.min(4, Math.round(fontRaw * 10) / 10))
				: 0;
			document.documentElement.style.setProperty(
				`--${PREFIX}-font-offset`,
				`${fontOffset}px`
			);
			document.body.classList.toggle(`${PREFIX}-font-resize`, fontOffset !== 0);
			// 运行时环境 class（SPA 后可能变化）
			this.syncExcelEnvFlags();
		}

		/** 仅同步 Horizon/深色等环境 class，不重置字号等设置（供 Excel render 高频调用） */
		syncExcelEnvFlags() {
			const excelOn = !!this.normal.excelMode;
			const isHorizon =
				document.body.classList.contains('horizon-new-topic-button-enabled') ||
				!!document.querySelector(
					'.topic-status-card, .topic-activity-data, .topic-likes-replies-data, .sidebar-new-topic-button'
				);
			document.body.classList.toggle(`${PREFIX}-excel-horizon`, excelOn && isHorizon);
			const isDark = this.detectDarkMode();
			document.body.classList.toggle(`${PREFIX}-excel-dark`, excelOn && isDark);
			document.documentElement.classList.toggle(`${PREFIX}-excel-dark`, excelOn && isDark);
		}

		detectDarkMode() {
			try {
				const root = getComputedStyle(document.documentElement);
				const schemeType = (root.getPropertyValue('--scheme-type') || '').trim().toLowerCase();
				if (schemeType === 'dark') return true;
				const cs = (root.colorScheme || root.getPropertyValue('color-scheme') || '').toLowerCase();
				if (cs.includes('dark')) return true;
				const sec = (root.getPropertyValue('--secondary') || '').trim();
				let r, g, b;
				const mRgb = sec.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
				const mHex = sec.match(/#([0-9a-f]{3,8})/i);
				if (mRgb) {
					r = +mRgb[1]; g = +mRgb[2]; b = +mRgb[3];
				} else if (mHex) {
					let h = mHex[1];
					if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
					r = parseInt(h.slice(0, 2), 16);
					g = parseInt(h.slice(2, 4), 16);
					b = parseInt(h.slice(4, 6), 16);
				}
				if (r != null) {
					const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
					if (lum < 0.35) return true;
				}
			} catch (_) { }
			const b = document.body;
			if (
				b.classList.contains('dark-scheme') ||
				b.classList.contains('dark-mode') ||
				document.documentElement.classList.contains('dark') ||
				document.documentElement.dataset.colorScheme === 'dark'
			) return true;
			return false;
		}


		injectBaseStyle() {
			if (this._styleEl) return;
			const css = collectStyles(this.modules, this);
			this._styleEl = injectCss(css);
		}

		// ---- render pipeline ----
		applyAll() {
			this.applyBodyFlags();
			this.modules.forEach((m) => {
				try {
					m.onApply && m.onApply(this);
				} catch (e) {
					console.error(`[${SCRIPT_NAME}] module ${m.name} onApply`, e);
				}
			});
			this.renderPage('settings');
		}

		renderPage(reason = 'manual') {
			const ctx = {
				page: isSearchPage() ? 'search' : isTopicPage() ? 'topic' : isTopicListPage() ? 'list' : 'other',
				reason,
			};
			this.modules.forEach((m) => {
				try {
					m.render && m.render(this, ctx);
				} catch (e) {
					console.error(`[${SCRIPT_NAME}] module ${m.name} render`, e);
				}
			});
		}

		initModules() {
			this.modules.forEach((m) => {
				try {
					m.init && m.init(this);
				} catch (e) {
					console.error(`[${SCRIPT_NAME}] module ${m.name} init`, e);
				}
			});
			this.modules.forEach((m) => {
				try {
					m.postProc && m.postProc(this);
				} catch (e) {
					console.error(`[${SCRIPT_NAME}] module ${m.name} postProc`, e);
				}
			});
		}

		observe() {
			const run = debounce(() => this.renderPage(), 150);
			this._observer = new MutationObserver((mutations) => {
				for (const mu of mutations) {
					if (!mu.addedNodes || !mu.addedNodes.length) continue;
					// ignore our own UI
					let relevant = false;
					mu.addedNodes.forEach((n) => {
						if (n.nodeType !== 1) return;
						if (n.id && String(n.id).startsWith(PREFIX)) return;
						if (n.closest && n.closest(`#${PREFIX}-overlay, #${PREFIX}-fab, #${PREFIX}-toast-box, #${PREFIX}-excel-root`)) return;
						if (n.classList && (n.classList.contains(`${PREFIX}-excel-rownum`) || n.classList.contains(`${PREFIX}-excel-meta-cell`) || n.classList.contains(`${PREFIX}-excel-meta-head`))) return;
						relevant = true;
					});
					if (relevant) {
						run();
						break;
					}
				}
			});
			this._observer.observe(document.body, { childList: true, subtree: true });

			// SPA url change
			const onUrl = () => {
				if (location.href === this._lastUrl) return;
				this._lastUrl = location.href;
				setTimeout(() => this.applyAll(), 300);
			};
			if (typeof window.onurlchange !== 'undefined') {
				window.addEventListener('urlchange', onUrl);
			}
			window.addEventListener('popstate', onUrl);
			const wrap = (type) => {
				const raw = history[type];
				history[type] = function (...args) {
					const ret = raw.apply(this, args);
					window.dispatchEvent(new Event('ldmy-urlchange'));
					return ret;
				};
			};
			wrap('pushState');
			wrap('replaceState');
			window.addEventListener('ldmy-urlchange', onUrl);
		}

		// ---- UI ----
		ensureFab() {
			if (qs(`#${PREFIX}-fab`)) return;
			const fab = document.createElement('div');
			fab.id = `${PREFIX}-fab`;
			fab.innerHTML = `
        <button class="${PREFIX}-fab-btn" data-action="top" title="返回顶部">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <button class="${PREFIX}-fab-btn" data-action="reply" title="快速回复">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
          </svg>
        </button>
        <button class="${PREFIX}-fab-btn" data-action="floor" title="跳转楼层">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h7"/></svg>
        </button>
        <button class="${PREFIX}-fab-btn" data-action="settings" title="摸鱼设置 (S)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.998 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      `;
			fab.addEventListener('click', (e) => {
				const btn = e.target.closest('button[data-action]');
				if (!btn) return;
				const action = btn.getAttribute('data-action');
				if (action === 'settings') this.openPanel();
				if (action === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
				if (action === 'reply') this.openQuickReply();
				if (action === 'floor') {
					const bar = qs(`.${PREFIX}-floor-bar`);
					if (!bar) return;
					const willOpen = !bar.classList.contains('open');
					bar.classList.toggle('open', willOpen);
					if (willOpen) {
						// 展开即聚焦，方便直接输入楼层号
						const input = bar.querySelector('input');
						input?.focus();
						input?.select();
					}
				}
			});
			document.body.appendChild(fab);

			// floor bar
			if (!qs(`.${PREFIX}-floor-bar`)) {
				const bar = document.createElement('div');
				bar.className = `${PREFIX}-floor-bar`;
				bar.innerHTML = `
          <input type="number" min="1" placeholder="楼层" />
          <button type="button">跳转</button>
        `;
				bar.querySelector('button').addEventListener('click', () => {
					const n = parseInt(bar.querySelector('input').value, 10);
					if (!n) return;
					const el =
						qs(`.topic-post[data-post-number="${n}"]`) ||
						qs(`#post_${n}`) ||
						qs(`a[href$="/${n}"]`);
					if (el) {
						el.scrollIntoView({ behavior: 'smooth', block: 'start' });
						bar.classList.remove('open');
					} else {
						// try navigate
						const m = location.pathname.match(/\/t\/[^/]+\/(\d+)/);
						if (m) {
							location.href = `/t/topic/${m[1]}/${n}`;
						} else {
							notify('未找到该楼层');
						}
					}
				});
				// 输入框：回车跳转 / Esc 收起
				bar.querySelector('input').addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						bar.querySelector('button').click();
					} else if (e.key === 'Escape') {
						bar.classList.remove('open');
						bar.querySelector('input').blur();
					}
				});
				document.body.appendChild(bar);
			}

			// only OP tip
			if (!qs(`#${PREFIX}-only-op-tip`)) {
				const tip = document.createElement('div');
				tip.id = `${PREFIX}-only-op-tip`;
				tip.innerHTML = `<span>只看楼主中</span><strong>点击关闭</strong>`;
				tip.addEventListener('click', () => {
					this.normal.onlyOP = false;
					this.saveSettings();
					this.applyAll();
					notify('已关闭只看楼主');
				});
				document.body.appendChild(tip);
			}
		}

		openPanel() {
			this.ensurePanel();
			const overlay = qs(`#${PREFIX}-overlay`);
			overlay.classList.add('open');
			this._panelOpen = true;
			// 滑块会写内存做即时预览；关闭未保存时用快照还原
			this._panelSnapshot = {
				fontSize: this.advanced.fontSize,
				imageMaxWidth: this.advanced.imageMaxWidth,
			};
			this.refreshPanelValues();
		}

		closePanel() {
			const overlay = qs(`#${PREFIX}-overlay`);
			if (overlay) overlay.classList.remove('open');
			this._panelOpen = false;
			// 取消：还原滑块预览（未点保存的改动不保留）
			if (this._panelSnapshot) {
				this.advanced.fontSize = this._panelSnapshot.fontSize;
				this.advanced.imageMaxWidth = this._panelSnapshot.imageMaxWidth;
				this._panelSnapshot = null;
			}
			this.applyBodyFlags();
			// remove subpanels
			qsa(`.${PREFIX}-subpanel`).forEach((el) => el.remove());
		}

		refreshPanelValues() {
			qsa(`#${PREFIX}-panel [data-key]`).forEach((el) => {
				const key = el.getAttribute('data-key');
				const type = el.getAttribute('data-type') || 'normal';
				const source = type === 'advanced' ? this.advanced : this.normal;
				if (el.type === 'checkbox') {
					el.checked = !!source[key];
				} else if (typeof source[key] === 'boolean') {
					el.value = source[key] ? 'true' : 'false';
				} else {
					el.value = source[key] ?? '';
				}
				if (el.type === 'range') this.syncSliderUI(el);
			});
		}

		formatSliderValue(key, raw) {
			const n = Number(raw);
			if (!Number.isFinite(n)) return String(raw ?? '');
			if (key === 'fontSize') {
				// 0.5px 步进：统一一位小数，避免 2 → 2.5 显示跳变
				const v = Math.round(n * 10) / 10;
				if (v === 0) return '默认';
				const s = v.toFixed(1);
				return v > 0 ? `+${s} px` : `${s} px`;
			}
			if (key === 'imageMaxWidth') {
				if (n <= 0) return '不限制';
				return `${n} px`;
			}
			return String(n);
		}

		syncSliderUI(el) {
			if (!el || el.type !== 'range') return;
			const key = el.getAttribute('data-key');
			const min = Number(el.min);
			const max = Number(el.max);
			const val = Number(el.value);
			const pct =
				Number.isFinite(min) && Number.isFinite(max) && max > min
					? ((val - min) / (max - min)) * 100
					: 0;
			el.style.setProperty(`--${PREFIX}-slider-pct`, `${Math.max(0, Math.min(100, pct))}%`);
			const label = document.querySelector(`#${PREFIX}-panel [data-slider-val="${key}"]`);
			if (label) label.textContent = this.formatSliderValue(key, val);
		}

		/** 拖动即时预览：写内存 + CSS，不写存储；取消关闭用快照还原 */
		previewSlider(el) {
			if (!el || el.type !== 'range') return;
			const key = el.getAttribute('data-key');
			const val = Number(el.value);
			this.syncSliderUI(el);
			if (key === 'fontSize') {
				const offset = Number.isFinite(val)
					? Math.max(-4, Math.min(4, Math.round(val * 10) / 10))
					: 0;
				// 写入内存，避免 Excel render/applyBodyFlags 用旧值把预览冲掉
				this.advanced.fontSize = offset;
				document.documentElement.style.setProperty(`--${PREFIX}-font-offset`, `${offset}px`);
				document.body.classList.toggle(`${PREFIX}-font-resize`, offset !== 0);
				return;
			}
			if (key === 'imageMaxWidth') {
				const width = Number.isFinite(val) ? val : 0;
				this.advanced.imageMaxWidth = width;
				if (width > 0) {
					document.documentElement.style.setProperty(`--${PREFIX}-img-max`, `${width}px`);
					document.body.classList.add(`${PREFIX}-img-cap`);
				} else {
					document.documentElement.style.removeProperty(`--${PREFIX}-img-max`);
					document.body.classList.remove(`${PREFIX}-img-cap`);
				}
			}
		}

		ensurePanel() {
			if (qs(`#${PREFIX}-overlay`)) return;

			const normalLeft = [
				{ key: 'hideAvatar', label: '隐藏头像', tip: '快捷键 Q' },
				{ key: 'hideEmoji', label: '隐藏表情', tip: '快捷键 W' },
				{ key: 'hideImage', label: '隐藏楼内图片', tip: '快捷键 E；以 [图] 占位，点击可临时显示' },
				{ key: 'hideUserTitle', label: '隐藏用户标题' },
				{ key: 'hideSidebar', label: '隐藏侧边栏', tip: '快捷键 H；Excel 开启时由「导航/侧栏」接管' },
				{ key: 'hideTopicMap', label: '隐藏话题地图' },
				{ key: 'excelMode', label: 'Excel 摸鱼外观' },
				{ key: 'compactMode', label: '紧凑模式', tip: '压缩话题行高与详情楼层间距；Excel 下同样生效' },
				{ key: 'wideMode', label: '宽屏模式', tip: '仅关闭 Excel 时生效；Excel 已强制全宽' },
			];
			const normalRight = [
				{ key: 'highlightOP', label: '高亮楼主' },
				{ key: 'onlyOP', label: '只看楼主', tip: '快捷键 R' },
				{ key: 'banAndMark', label: '黑名单 / 备注', extra: 'ban' },
				{ key: 'keywordsBlock', label: '关键字屏蔽', extra: 'kw' },
				{ key: 'openInNewTab', label: '新标签打开帖子' },
				{ key: 'imageEnhance', label: '图片增强预览' },
				{ key: 'floorJump', label: '楼层跳转按钮' },
				{ key: 'backToTop', label: '返回顶部按钮' },
			];

			const overlay = document.createElement('div');
			overlay.id = `${PREFIX}-overlay`;
			overlay.innerHTML = `
        <div id="${PREFIX}-panel" role="dialog" aria-modal="true">
          <div class="${PREFIX}-panel-hd">
            <h2>${SCRIPT_NAME}<span class="ver">v${SCRIPT_VERSION}</span></h2>
            <button class="${PREFIX}-close" type="button" title="关闭">×</button>
          </div>
          <div class="${PREFIX}-panel-bd">
            <div class="${PREFIX}-cols">
              <div class="${PREFIX}-sec">显示优化</div>
              ${normalLeft
				.map((it) => {
					const row = `
                <div class="${PREFIX}-item">
                  <label title="${it.tip || ''}">
                    <input type="checkbox" data-type="normal" data-key="${it.key}" />
                    <span>${it.label}${it.tip ? ` <small style="opacity:.6">(${it.tip})</small>` : ''}</span>
                  </label>
                </div>`;
					if (it.key !== 'excelMode') return row;
					// 整块占满两列：说明在开关下；子项分「外观/显示」两组网格排列
					return `
                <div class="${PREFIX}-excel-block">
                  
                <div class="${PREFIX}-item">
                  <label title="快捷键 X">
                    <input type="checkbox" data-type="normal" data-key="excelMode" />
                    <span>Excel 摸鱼外观 <small class="${PREFIX}-excel-tip">快捷键 X 开关 · 皮肤/标题/行号/论坛导航仅开启后生效</small></span>
                  </label>
                </div>
                  <div class="${PREFIX}-excel-inline-opts">
                    <div class="${PREFIX}-excel-inline-row">
                      <div class="${PREFIX}-excel-opt-group">外观</div>
                      <label class="${PREFIX}-field">
                        <span>皮肤</span>
                        <select data-type="advanced" data-key="excelTheme">
                          <option value="tencent">腾讯文档</option>
                          <option value="office">Microsoft Excel</option>
                        </select>
                      </label>
                      <label class="${PREFIX}-field">
                        <span>标题</span>
                        <input type="text" data-type="advanced" data-key="excelTitle" placeholder="工作簿1" />
                      </label>
                      <div class="${PREFIX}-excel-opt-group">显示</div>
                      <label class="${PREFIX}-field">
                        <span>行号</span>
                        <select data-type="advanced" data-key="excelShowRowIndex">
                          <option value="true">显示</option>
                          <option value="false">隐藏</option>
                        </select>
                      </label>
                      <label class="${PREFIX}-field" title="Excel 专用：控制顶栏导航与左侧分类/tag/板块侧栏。开启 Excel 时优先于此项（快捷键 H）">
                        <span>导航/侧栏</span>
                        <select data-type="advanced" data-key="excelHideNav">
                          <option value="true">隐藏</option>
                          <option value="false">显示</option>
                        </select>
                      </label>
                      <label class="${PREFIX}-field" title="Default/Moyu 主题：把标题下方的分类/标签拆成独立一列，标题列更干净更像表格；Horizon 主题自动忽略">
                        <span>分类列</span>
                        <select data-type="advanced" data-key="excelMetaCol">
                          <option value="false">标题下方</option>
                          <option value="true">单独一列</option>
                        </select>
                      </label>
                      <label class="${PREFIX}-field" title="Default/Moyu 主题：把活动/浏览/回复挪到标题列前，扫一眼先看热度；关闭后恢复原列序；Horizon 主题自动忽略">
                        <span>元数据前置</span>
                        <select data-type="advanced" data-key="excelMetaLeading">
                          <option value="false">关闭</option>
                          <option value="true">开启</option>
                        </select>
                      </label>
                      <label class="${PREFIX}-field" title="Excel 模式下将 boost 气泡收成批注样式，减少对表格阅读的干扰；默认关闭">
                        <span>Boost 批注</span>
                        <select data-type="advanced" data-key="boostAsAnnotation">
                          <option value="false">关闭</option>
                          <option value="true">开启</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>`;
				})
				.join('')}
              <div class="${PREFIX}-sec">功能增强</div>
              ${normalRight
				.map(
					(it) => `
                <div class="${PREFIX}-item">
                  <label title="${it.tip || ''}">
                    <input type="checkbox" data-type="normal" data-key="${it.key}" />
                    <span>${it.label}${it.tip ? ` <small style="opacity:.6">(${it.tip})</small>` : ''}</span>
                  </label>
                  <div class="extra">
                    ${it.extra === 'ban'
							? `<button type="button" class="${PREFIX}-btn" data-open="ban">名单管理</button>`
							: ''
						}
                    ${it.extra === 'kw'
							? `<button type="button" class="${PREFIX}-btn" data-open="kw">关键字</button>`
							: ''
						}
                  </div>
                </div>`
				)
				.join('')}
            </div>

            <div class="${PREFIX}-sec">高级设置</div>
              <div class="${PREFIX}-adv-grid">
                <label class="${PREFIX}-field">
                  <span>动态快捷键（关闭项仍可热键切换）</span>
                  <select data-type="advanced" data-key="dynamicEnable">
                    <option value="true">启用</option>
                    <option value="false">关闭</option>
                  </select>
                </label>
                <label class="${PREFIX}-field">
                  <span>拉黑模式</span>
                  <select data-type="advanced" data-key="banMode">
                    <option value="hide">折叠隐藏内容</option>
                    <option value="remove">直接移除</option>
                  </select>
                </label>
                <label class="${PREFIX}-field ${PREFIX}-slider-field" data-slider="fontSize">
                  <div class="${PREFIX}-slider-head">
                    <span>字体大小偏移</span>
                    <span class="${PREFIX}-slider-val" data-slider-val="fontSize">-1.0 px</span>
                  </div>
                  <div class="${PREFIX}-slider-row">
                    <span class="${PREFIX}-slider-min">-4</span>
                    <input type="range" data-type="advanced" data-key="fontSize" min="-4" max="4" step="0.5" />
                    <span class="${PREFIX}-slider-max">+4</span>
                  </div>
                </label>
                <label class="${PREFIX}-field ${PREFIX}-slider-field" data-slider="imageMaxWidth" title="限制楼内图片显示宽度。0=不限制（最大随正文列宽）；设得再大也不会超过当前列宽。">
                  <div class="${PREFIX}-slider-head">
                    <span>楼内图片最大宽度</span>
                    <span class="${PREFIX}-slider-val" data-slider-val="imageMaxWidth">不限制</span>
                  </div>
                  <div class="${PREFIX}-slider-row">
                    <span class="${PREFIX}-slider-min">0</span>
                    <input type="range" data-type="advanced" data-key="imageMaxWidth" min="0" max="2000" step="20" />
                    <span class="${PREFIX}-slider-max">2000</span>
                  </div>
                </label>
                <label class="${PREFIX}-field">
                  <span>楼主高亮颜色</span>
                  <input type="color" data-type="advanced" data-key="authorMarkColor" />
                </label>
                <label class="${PREFIX}-field">
                  <span>浮动按钮位置</span>
                  <select data-type="advanced" data-key="fabPosition">
                    <option value="right">右下角</option>
                    <option value="left">左下角</option>
                  </select>
                </label>
                <label class="${PREFIX}-field">
                  <span>关键字匹配标题</span>
                  <select data-type="advanced" data-key="keywordsMatchTitle">
                    <option value="true">是</option>
                    <option value="false">否</option>
                  </select>
                </label>
                <label class="${PREFIX}-field">
                  <span>关键字匹配正文</span>
                  <select data-type="advanced" data-key="keywordsMatchContent">
                    <option value="true">是</option>
                    <option value="false">否</option>
                  </select>
                </label>
                <label class="${PREFIX}-field">
                  <span>关键字使用正则</span>
                  <select data-type="advanced" data-key="keywordsUseRegex">
                    <option value="false">否</option>
                    <option value="true">是</option>
                  </select>
                </label>

              </div>
          </div>
          <div class="${PREFIX}-panel-ft">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <button type="button" class="${PREFIX}-btn" data-act="export">导出配置</button>
              <button type="button" class="${PREFIX}-btn" data-act="import">导入配置</button>
              <button type="button" class="${PREFIX}-btn danger" data-act="reset">恢复默认</button>
              <div class="${PREFIX}-panel-ft-links">
                <a class="${PREFIX}-ft-link" href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer" title="点个 star 鼓励一下" aria-label="点个 star 鼓励一下">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
                </a>
                <button type="button" class="${PREFIX}-ft-link ${PREFIX}-support-tip" title="微信赞赏" aria-label="微信赞赏" aria-expanded="false">
                  赏
                  <span class="${PREFIX}-support-pop" role="tooltip">
                    <img class="${PREFIX}-support-img" alt="微信赞赏码" width="176" height="176" referrerpolicy="no-referrer" />
                    <span class="tip">微信扫码赞赏</span>
                  </span>
                </button>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button type="button" class="${PREFIX}-btn" data-act="close">取消</button>
              <button type="button" class="${PREFIX}-btn primary" data-act="save">保存并应用</button>
            </div>
          </div>
          <input type="file" id="${PREFIX}-import-file" accept="application/json,.json" style="display:none" />
        </div>
      `;

			overlay.addEventListener('click', (e) => {
				if (e.target === overlay) this.closePanel();
			});

			overlay.querySelector(`.${PREFIX}-close`).addEventListener('click', () => this.closePanel());

			const supportTip = overlay.querySelector(`.${PREFIX}-support-tip`);
			if (supportTip) {
				const supportImg = supportTip.querySelector(`.${PREFIX}-support-img`);
				let supportImgLoaded = false;
				const ensureSupportImg = () => {
					if (!supportImg || supportImgLoaded) return;
					supportImgLoaded = true;
					// 本地 base64，无需网络请求
					supportImg.src = SUPPORT_WECHAT_IMG;
				};
				const setOpen = (open) => {
					supportTip.classList.toggle('is-open', open);
					supportTip.setAttribute('aria-expanded', open ? 'true' : 'false');
					if (open) ensureSupportImg();
				};
				supportTip.addEventListener('mouseenter', ensureSupportImg);
				supportTip.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					setOpen(!supportTip.classList.contains('is-open'));
				});
				supportTip.addEventListener('keydown', (e) => {
					if (e.key === 'Escape') setOpen(false);
				});
				overlay.addEventListener('click', (e) => {
					if (!supportTip.contains(e.target)) setOpen(false);
				});
			}

			// 字体/图片宽度滑块：拖动即时预览 + 更新数值标签
			overlay.querySelectorAll('input[type="range"][data-key]').forEach((el) => {
				const onInput = () => this.previewSlider(el);
				el.addEventListener('input', onInput);
				el.addEventListener('change', onInput);
			});

			overlay.querySelectorAll('[data-act]').forEach((btn) => {
				btn.addEventListener('click', () => {
					const act = btn.getAttribute('data-act');
					if (act === 'close') this.closePanel();
					if (act === 'save') this.saveFromPanel();
					if (act === 'export') {
						const data = JSON.stringify(this.exportAll(), null, 2);
						downloadText(`LINUXDO-config-${Date.now()}.json`, data);
						if (typeof GM_setClipboard === 'function') {
							try {
								GM_setClipboard(data);
								notify('已导出并复制到剪贴板');
							} catch {
								notify('已导出配置文件');
							}
						} else {
							notify('已导出配置文件');
						}
					}
					if (act === 'import') {
						qs(`#${PREFIX}-import-file`).click();
					}
					if (act === 'reset') {
						if (confirm('确定恢复默认设置？（黑名单/关键字不会清空）')) {
							this.normal = { ...DEFAULT_NORMAL };
							this.advanced = { ...DEFAULT_ADVANCED };
							this.shortcuts = { ...DEFAULT_SHORTCUTS };
							this.saveSettings();
							this.applyAll();
							this.refreshPanelValues();
							notify('已恢复默认设置');
						}
					}
				});
			});

			overlay.querySelector(`#${PREFIX}-import-file`).addEventListener('change', async (e) => {
				const file = e.target.files && e.target.files[0];
				if (!file) return;
				try {
					const text = await file.text();
					const data = JSON.parse(text);
					this.importAll(data);
					this.refreshPanelValues();
					notify('配置导入成功');
				} catch (err) {
					notify('导入失败：' + err.message, 3000);
				} finally {
					e.target.value = '';
				}
			});

			overlay.querySelectorAll('[data-open]').forEach((btn) => {
				btn.addEventListener('click', () => {
					const which = btn.getAttribute('data-open');
					if (which === 'ban') this.openBanPanel();
					if (which === 'kw') this.openKeywordPanel();
				});
			});

			document.body.appendChild(overlay);

			// 被接管项：Excel 开启时勾选给出 toast 提示（不挡交互，面板不加小字）
			[
				{
					key: 'hideSidebar',
					msg: 'Excel 开启时暂不生效：由「导航/侧栏」接管（快捷键 H）',
				},
				{
					key: 'wideMode',
					msg: 'Excel 开启时暂不生效：已强制全宽，关闭 Excel 后生效',
				},
			].forEach(({ key, msg }) => {
				overlay.querySelector(`[data-key="${key}"]`)?.addEventListener('change', (e) => {
					if (!this.normal.excelMode) return;
					if (e.target.checked) notify(msg);
				});
			});
		}

		readPanelToMemory() {
			qsa(`#${PREFIX}-panel [data-key]`).forEach((el) => {
				const key = el.getAttribute('data-key');
				const type = el.getAttribute('data-type') || 'normal';
				const target = type === 'advanced' ? this.advanced : this.normal;
				if (el.type === 'checkbox') {
					target[key] = el.checked;
				} else if (el.tagName === 'SELECT') {
					const v = el.value;
					if (v === 'true' || v === 'false') target[key] = v === 'true';
					else if (!Number.isNaN(Number(v)) && ['fontSize', 'imageMaxWidth'].includes(key)) {
						target[key] = Number(v);
					} else target[key] = v;
				} else if (el.type === 'number' || el.type === 'range') {
					target[key] = Number(el.value);
				} else {
					target[key] = el.value;
				}
			});
		}

		saveFromPanel() {
			this.readPanelToMemory();
			this._panelSnapshot = null; // 已保存，关闭时不要还原快照
			this.saveSettings();
			this.applyAll();
			this.updateFabVisibility();
			this.closePanel();
			notify('设置已保存');
		}

		updateFabVisibility() {
			const fab = qs(`#${PREFIX}-fab`);
			if (!fab) return;
			const topBtn = fab.querySelector('[data-action="top"]');
			const replyBtn = fab.querySelector('[data-action="reply"]');
			const floorBtn = fab.querySelector('[data-action="floor"]');
			if (topBtn) topBtn.style.display = this.normal.backToTop ? '' : 'none';
			if (replyBtn) replyBtn.style.display = isTopicPage() ? '' : 'none';
			if (floorBtn) floorBtn.style.display = this.normal.floorJump && isTopicPage() ? '' : 'none';
		}

		findNativeReplyButton() {
			const selectors = [
				'#topic-footer-buttons .btn-primary.create',
				'#topic-footer-buttons .topic-footer-button.create',
				'.topic-footer-main-buttons .btn-primary.create',
				'.timeline-container .create.reply-to-post',
				'button.create.reply-to-post',
				'.post-action-menu__reply',
				'button.reply.create',
			];
			for (const sel of selectors) {
				const btn = qs(sel);
				if (btn && !btn.disabled && btn.offsetParent !== null) return btn;
			}
			// 兜底：有些按钮被 Excel CSS 藏了，仍可程序点击
			for (const sel of selectors) {
				const btn = qs(sel);
				if (btn && !btn.disabled) return btn;
			}
			return null;
		}

		focusComposerInput(attempt = 0) {
			const input =
				qs('#reply-control textarea.d-editor-input') ||
				qs('#reply-control .d-editor-input') ||
				qs('#reply-control textarea') ||
				qs('.d-editor-input');
			if (input) {
				try {
					input.focus({ preventScroll: false });
					const len = input.value?.length ?? 0;
					if (typeof input.setSelectionRange === 'function') input.setSelectionRange(len, len);
				} catch (_) {
					try { input.focus(); } catch (__) {}
				}
				return true;
			}
			if (attempt >= 12) return false;
			setTimeout(() => this.focusComposerInput(attempt + 1), 80 + attempt * 20);
			return false;
		}

		openQuickReply() {
			if (!isTopicPage()) {
				notify('仅帖内页可快速回复');
				return;
			}
			const composer = qs('#reply-control');
			const alreadyOpen =
				composer &&
				!composer.classList.contains('closed') &&
				(composer.classList.contains('open') ||
					composer.classList.contains('edit-title') ||
					composer.classList.contains('draft') ||
					composer.classList.contains('private-message') ||
					!!qs('#reply-control .d-editor-input, #reply-control textarea'));
			if (alreadyOpen && this.focusComposerInput()) return;

			const nativeBtn = this.findNativeReplyButton();
			if (!nativeBtn) {
				notify('未找到回复入口');
				return;
			}
			try {
				nativeBtn.click();
			} catch (_) {
				nativeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			}
			this.focusComposerInput(0);
		}

		openBanPanel() {
			const panel = qs(`#${PREFIX}-panel`);
			if (!panel) return;
			qsa(`.${PREFIX}-subpanel`).forEach((el) => el.remove());
			const sub = document.createElement('div');
			sub.className = `${PREFIX}-subpanel`;
			const renderList = () => {
				const bans = this.banList
					.map(
						(b, i) => `
          <div class="${PREFIX}-list-row" data-i="${i}">
            <div>
              <strong>@${b.username}</strong>
              <div class="meta">${b.reason || '无备注'} · ${b.time ? new Date(b.time).toLocaleString() : ''}</div>
            </div>
            <button type="button" class="${PREFIX}-btn danger" data-del-ban="${i}">解除</button>
          </div>`
					)
					.join('') || `<div class="meta">暂无黑名单</div>`;
				const marks = this.markList
					.map(
						(m, i) => `
          <div class="${PREFIX}-list-row">
            <div>
              <strong>@${m.username}</strong>
              <div>${(m.tags || [])
							.map((t) => `<span class="${PREFIX}-mark-tag" style="background:${t.color || '#8e44ad'}">${t.text}</span>`)
							.join('')}</div>
            </div>
            <button type="button" class="${PREFIX}-btn danger" data-del-mark="${i}">删除</button>
          </div>`
					)
					.join('') || `<div class="meta">暂无备注</div>`;
				sub.querySelector('.bd').innerHTML = `
          <h4 style="margin:0 0 8px">黑名单 <small style="font-weight:400;opacity:.65">（帖内也可点「解除」）</small></h4>
          ${bans}
          <h4 style="margin:16px 0 8px">用户备注 <small style="font-weight:400;opacity:.65">（帖内点标签×可删）</small></h4>
          ${marks}
          <h4 style="margin:16px 0 8px">添加黑名单</h4>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="${PREFIX}-ban-user" placeholder="用户名" style="flex:1;min-width:120px;padding:6px 8px;border:1px solid #ddd;border-radius:6px" />
            <input id="${PREFIX}-ban-reason" placeholder="原因（可选）" style="flex:1;min-width:120px;padding:6px 8px;border:1px solid #ddd;border-radius:6px" />
            <button type="button" class="${PREFIX}-btn primary" id="${PREFIX}-ban-add">添加</button>
          </div>
        `;
				sub.querySelectorAll('[data-del-ban]').forEach((b) =>
					b.addEventListener('click', () => {
						const i = Number(b.getAttribute('data-del-ban'));
						this.banList.splice(i, 1);
						this.saveLists();
						this.renderPage();
						renderList();
					})
				);
				sub.querySelectorAll('[data-del-mark]').forEach((b) =>
					b.addEventListener('click', () => {
						const i = Number(b.getAttribute('data-del-mark'));
						this.markList.splice(i, 1);
						this.saveLists();
						this.renderPage();
						renderList();
					})
				);
				const addBtn = sub.querySelector(`#${PREFIX}-ban-add`);
				if (addBtn) {
					addBtn.addEventListener('click', () => {
						const u = (sub.querySelector(`#${PREFIX}-ban-user`).value || '').trim();
						const reason = (sub.querySelector(`#${PREFIX}-ban-reason`).value || '').trim();
						if (!u) return;
						if (this.banList.some((x) => x.username === u)) {
							notify('已在黑名单中');
							return;
						}
						this.banList.push({ username: u, reason, time: Date.now() });
						this.saveLists();
						this.renderPage();
						renderList();
						notify(`已拉黑 @${u}`);
					});
				}
			};
			sub.innerHTML = `
        <div class="hd"><span>名单管理</span><button type="button" class="${PREFIX}-close">×</button></div>
        <div class="bd"></div>
        <div class="ft"><button type="button" class="${PREFIX}-btn primary" data-done>完成</button></div>
      `;
			sub.querySelector('.hd button').addEventListener('click', () => sub.remove());
			sub.querySelector('[data-done]').addEventListener('click', () => sub.remove());
			panel.appendChild(sub);
			renderList();
		}

		openKeywordPanel() {
			const panel = qs(`#${PREFIX}-panel`);
			if (!panel) return;
			qsa(`.${PREFIX}-subpanel`).forEach((el) => el.remove());
			const sub = document.createElement('div');
			sub.className = `${PREFIX}-subpanel`;
			const render = () => {
				sub.querySelector('.bd').innerHTML = `
          <div style="margin-bottom:10px;color:var(--primary-medium,#888);font-size:12px">
            每行一个关键字。启用正则后将按正则匹配。
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">
            ${this.keywords
					.map(
						(k, i) =>
							`<span class="${PREFIX}-tag">${k}<button type="button" data-del="${i}">×</button></span>`
					)
					.join('') || '<span class="meta">暂无关键字</span>'
				}
          </div>
          <textarea id="${PREFIX}-kw-input" rows="6" placeholder="输入关键字，一行一个" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ddd;border-radius:8px;resize:vertical">${this.keywords.join(
					'\n'
				)}</textarea>
        `;
				sub.querySelectorAll('[data-del]').forEach((b) =>
					b.addEventListener('click', () => {
						this.keywords.splice(Number(b.getAttribute('data-del')), 1);
						this.saveLists();
						this.renderPage();
						render();
					})
				);
			};
			sub.innerHTML = `
        <div class="hd"><span>关键字管理</span><button type="button" class="${PREFIX}-close">×</button></div>
        <div class="bd"></div>
        <div class="ft">
          <button type="button" class="${PREFIX}-btn" data-cancel>取消</button>
          <button type="button" class="${PREFIX}-btn primary" data-save>保存</button>
        </div>
      `;
			sub.querySelector('.hd button').addEventListener('click', () => sub.remove());
			sub.querySelector('[data-cancel]').addEventListener('click', () => sub.remove());
			sub.querySelector('[data-save]').addEventListener('click', () => {
				const raw = sub.querySelector(`#${PREFIX}-kw-input`).value || '';
				this.keywords = raw
					.split(/\n+/)
					.map((s) => s.trim())
					.filter(Boolean);
				this.saveLists();
				this.renderPage();
				notify(`已保存 ${this.keywords.length} 个关键字`);
				sub.remove();
			});
			panel.appendChild(sub);
			render();
		}

		bindShortcuts() {
			document.addEventListener(
				'keydown',
				(e) => {
					if (e.ctrlKey || e.altKey || e.metaKey) return;
					if (isTypingTarget(e.target)) return;
					if (this._panelOpen && e.code !== 'Escape') return;

					if (e.code === 'Escape' && this._panelOpen) {
						this.closePanel();
						return;
					}

					const entries = Object.entries(this.shortcuts);
					for (const [action, code] of entries) {
						if (e.code !== code) continue;
						e.preventDefault();
						this.triggerShortcut(action);
						break;
					}
				},
				true
			);
		}

		canToggle(key) {
			return this.normal[key] || this.advanced.dynamicEnable;
		}

		triggerShortcut(action) {
			const modHandler = this._shortcutHandlers && this._shortcutHandlers.get(action);
			if (modHandler && typeof modHandler.handler === 'function') {
				try {
					modHandler.handler(this, action);
					return;
				} catch (e) {
					console.error(`[${SCRIPT_NAME}] shortcut ${action}`, e);
					return;
				}
			}
			const toggle = (key, label) => {
				if (!this.canToggle(key) && action !== 'settingPanel') {
					notify(`请先在设置中启用「${label}」或打开动态快捷键`);
					return;
				}
				this.normal[key] = !this.normal[key];
				this.saveSettings();
				this.applyAll();
				notify(`${this.normal[key] ? '开启' : '关闭'}${label}`);
			};
			switch (action) {
				case 'hideAvatar':
					toggle('hideAvatar', '隐藏头像');
					break;
				case 'hideEmoji':
					toggle('hideEmoji', '隐藏表情');
					break;
				case 'hideImage':
					toggle('hideImage', '隐藏图片');
					break;
				case 'onlyOP':
					toggle('onlyOP', '只看楼主');
					break;
				case 'excelMode':
					toggle('excelMode', 'Excel 摸鱼外观');
					break;
				case 'hideSidebar':
					// Excel 开启时接管「导航/侧栏」，否则切常规隐藏侧边栏
					if (this.normal.excelMode) {
						this.advanced.excelHideNav = !this.advanced.excelHideNav;
						this.saveSettings();
						this.applyAll();
						notify(`${this.advanced.excelHideNav ? '已隐藏' : '已显示'}导航/侧栏（快捷键 H）`);
					} else {
						toggle('hideSidebar', '隐藏侧边栏');
					}
					break;
				case 'settingPanel':
					if (this._panelOpen) this.closePanel();
					else this.openPanel();
					break;
			}
		}

		start() {
			this.load();
			// 模块 settings / shortcuts 注册表（面板仍以 data-key 绑定；注册表供扩展与插件）
			const collected = collectSettingsFromModules(this.modules);
			this.settingRegistry = collected.registry;
			this._shortcutHandlers = collectShortcutHandlers(this.modules);
			this.injectBaseStyle();
			this.initModules();
			this.ensureFab();
			this.updateFabVisibility();
			this.applyAll();
			this.observe();
			this.bindShortcuts();
			try {
				GM_registerMenuCommand('打开摸鱼设置', () => this.openPanel());
				GM_registerMenuCommand('导出配置', () => {
					const data = JSON.stringify(this.exportAll(), null, 2);
					downloadText(`LINUXDO-config-${Date.now()}.json`, data);
					notify('已导出配置');
				});
			} catch {
				/* ignore */
			}
			console.info(`[${SCRIPT_NAME}] v${SCRIPT_VERSION} ready`);
		}
	}

	/** 插件加载口子（无管理 UI） */

	const PLUGIN_GLOBAL_KEY = '__LINUXDO_MOYU_PLUGINS__';

	/**
	 * 读取页面上第三方注册的插件模块并 addModule。
	 * @param {import('./script.js').LinuxDoMoyu} script
	 */
	function loadPluginsFromGlobal(script) {
		let list = [];
		try {
			const g = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
			list = (g && g[PLUGIN_GLOBAL_KEY]) || [];
			if (!Array.isArray(list)) list = [];
		} catch {
			list = [];
		}
		if (!list.length) return 0;

		const existing = new Set(script.modules.map((m) => m.name));
		let added = 0;
		for (const raw of list) {
			try {
				if (!raw || typeof raw !== 'object' || !raw.name || typeof raw.name !== 'string') {
					console.warn(`[${SCRIPT_NAME}] skip invalid plugin entry`);
					continue;
				}
				if (existing.has(raw.name)) {
					console.warn(`[${SCRIPT_NAME}] plugin name conflict: ${raw.name}`);
					continue;
				}
				const mod = { ...raw, type: raw.type || 'plugin' };
				script.addModule(mod);
				existing.add(mod.name);
				added += 1;
			} catch (e) {
				console.error(`[${SCRIPT_NAME}] plugin load failed`, e);
			}
		}
		if (added) {
			console.info(`[${SCRIPT_NAME}] loaded ${added} plugin(s)`);
		}
		return added;
	}

	/** OpenInNewTab */

	const OpenInNewTab = {
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

	/** ImageEnhance */

	const ImageEnhance = {
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

	/** HideImagePlaceholder */

	const HideImagePlaceholder = {
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
		},
	};

	/** BanAndMark */

	const BanAndMark = {
		name: 'BanAndMark',
		settings: [
			{ type: 'normal', key: 'banAndMark', default: true, label: '黑名单 / 备注', group: 'enhance' },
		],
		styleOrder: 100,
		clearResiduals() {
			qsa('.topic-list-item').forEach((row) => {
				if (row.dataset.ldmyBanHide !== '1' && !row.classList.contains(`${PREFIX}-banned-post`)) return;
				row.classList.remove(`${PREFIX}-banned-post`);
				delete row.dataset.ldmyBanHide;
				row.style.display = '';
			});
			qsa('.topic-post').forEach((post) => {
				post.classList.remove(`${PREFIX}-banned-post`, `${PREFIX}-ban-collapsed`);
				post.querySelector(`.${PREFIX}-ban-placeholder`)?.remove();
			});
			qsa(`.${PREFIX}-user-actions, .${PREFIX}-mark-tags`).forEach((el) => el.remove());
		},
		/** 备注标签删除：document 级事件委托（capture 抢在页面 handler 前），renderPage 重建 DOM 也不丢监听 */
		init(script) {
			let lastHit = 0;
			const deleteMark = (e) => {
				const tag = e.target && e.target.closest ? e.target.closest(`.${PREFIX}-mark-tag`) : null;
				if (!tag) return;
				e.preventDefault();
				e.stopPropagation();
				const username = tag.dataset.ldmyMarkUser;
				const text = tag.dataset.ldmyMarkText;
				const color = tag.dataset.ldmyMarkColor;
				if (!username) return;
				const item = script.markList.find((m) => m.username === username);
				if (!item || !Array.isArray(item.tags)) return;
				const i = item.tags.findIndex(
					(x) => x.text === text && (x.color || '#8e44ad') === (color || '#8e44ad')
				);
				if (i >= 0) item.tags.splice(i, 1);
				if (!item.tags.length) {
					script.markList = script.markList.filter((m) => m.username !== username);
				}
				script.saveLists();
				notify(`已删除 @${username} 备注`);
				script.renderPage();
			};
			// pointerdown 优先：抢在页面任何 click/选择逻辑之前，点击必触发
			document.addEventListener(
				'pointerdown',
				(e) => {
					if (!e.target || !e.target.closest || !e.target.closest(`.${PREFIX}-mark-tag`)) return;
					lastHit = Date.now();
					deleteMark(e);
				},
				true
			);
			// click 兜底（键盘激活等）；删除后 DOM 重建，防同一次点击连删
			document.addEventListener(
				'click',
				(e) => {
					if (Date.now() - lastHit < 400) return;
					deleteMark(e);
				},
				true
			);
		},
		isBanned(script, username) {
			return script.banList.some((b) => b.username === username);
		},
		render(script) {
			if (!script.normal.banAndMark) {
				this.clearResiduals();
				return;
			}
			const banSet = new Set(script.banList.map((b) => b.username));
			const markMap = new Map(script.markList.map((m) => [m.username, m]));

			// topic list: hide topics whose first poster is banned
			qsa('.topic-list-item').forEach((row) => {
				const first = row.querySelector('.posters a[data-user-card], a[data-user-card]');
				const user = first?.getAttribute('data-user-card');
				const blocked = !!(user && banSet.has(user));
				if (blocked) {
					if (script.advanced.banMode === 'remove') {
						row.remove();
						return;
					}
					row.classList.add(`${PREFIX}-banned-post`);
					row.dataset.ldmyBanHide = '1';
					row.style.display = 'none';
				} else if (row.dataset.ldmyBanHide === '1') {
					// 解除拉黑后恢复
					row.classList.remove(`${PREFIX}-banned-post`);
					delete row.dataset.ldmyBanHide;
					row.style.display = '';
				}
			});

			qsa('.topic-post').forEach((post) => {
				const userEl = post.querySelector('[data-user-card]');
				const username = userEl?.getAttribute('data-user-card');
				if (!username) return;

				// 挂到主楼 topic-meta-data，避免插入 names 里夹在表情/徽章中间
				// 不取 embedded-reply 的 meta
				const meta =
					post.querySelector(
						':scope > article > .post__row > .topic-body > .topic-meta-data, :scope > article > .row > .topic-body > .topic-meta-data, :scope > article > .post__row > .post__body > .topic-meta-data, :scope > article > .row > .post__body > .topic-meta-data, :scope > article > .topic-body > .topic-meta-data, :scope > article > .post__body > .topic-meta-data'
					) ||
					post.querySelector('.topic-meta-data:not(.embedded-reply)') ||
					post.querySelector('.topic-meta-data') ||
					post.querySelector('.names');
				const actionHost = meta;
				if (actionHost && !actionHost.querySelector(`.${PREFIX}-user-actions`)) {
					const actions = document.createElement('span');
					actions.className = `${PREFIX}-user-actions`;
					actions.innerHTML = `
            <button type="button" class="mark" title="添加备注（点标签可删除）">备注</button>
            <button type="button" class="ban" title="拉黑 / 解除">拉黑</button>
          `;
					actions.querySelector('.mark').addEventListener('click', (e) => {
						e.preventDefault();
						e.stopPropagation();
						promptDialog({
							title: `为 @${username} 添加备注`,
							fields: [
								{ key: 'text', label: '标签文字', value: '关注' },
								{ key: 'color', label: '颜色', type: 'color', value: randomMarkColor() },
							],
							okText: '添加',
						}).then((res) => {
							if (!res || !res.text || !res.text.trim()) return;
							const text = res.text.trim();
							const color = res.color || '#6E9BB8';
							const fg = markFgFor(color);
							let item = script.markList.find((m) => m.username === username);
							if (!item) {
								item = { username, tags: [], time: Date.now() };
								script.markList.push(item);
							}
							item.tags.push({ text, color, fg });
							script.saveLists();
							// force re-render marks
							actionHost.querySelector(`.${PREFIX}-mark-tags`)?.remove();
							post.dataset.ldmyMarked = '';
							script.renderPage();
							notify(`已备注 @${username}`);
						});
					});
					actions.querySelector('.ban').addEventListener('click', (e) => {
						e.preventDefault();
						e.stopPropagation();
						// 必须读最新 banList，不能依赖 render 闭包里的 banSet
						if (BanAndMark.isBanned(script, username)) {
							script.banList = script.banList.filter((b) => b.username !== username);
							script.saveLists();
							notify(`已解除 @${username}`);
							script.renderPage();
							return;
						}
						promptDialog({
							title: `拉黑 @${username}`,
							fields: [{ key: 'reason', label: '原因（可选）' }],
							okText: '拉黑',
						}).then((res) => {
							if (res === null) return;
							const reason = (res.reason || '').trim();
							if (BanAndMark.isBanned(script, username)) {
								notify(`@${username} 已在黑名单中`);
								return;
							}
							script.banList.push({ username, reason, time: Date.now() });
							script.saveLists();
							notify(`已拉黑 @${username}`);
							script.renderPage();
						});
					});
					actionHost.appendChild(actions);
				}

				// 同步拉黑/备注按钮文案（页内可直接解除，无需只靠名单管理）
				const banBtn = actionHost?.querySelector(`.${PREFIX}-user-actions .ban`);
				if (banBtn) {
					const bannedNow = banSet.has(username);
					banBtn.textContent = bannedNow ? '解除' : '拉黑';
					banBtn.title = bannedNow ? '点击解除拉黑' : '拉黑该用户';
				}
				const markBtn = actionHost?.querySelector(`.${PREFIX}-user-actions .mark`);
				if (markBtn) {
					const hasMark = markMap.has(username);
					markBtn.textContent = hasMark ? '加备注' : '备注';
					markBtn.title = hasMark ? '继续添加备注；点击已有彩色标签可删除' : '添加备注标签';
				}

				// marks（标签可直接点删，不必只去名单管理）
				const mark = markMap.get(username);
				if (mark && actionHost) {
					actionHost.querySelector(`.${PREFIX}-mark-tags`)?.remove();
					const wrap = document.createElement('span');
					wrap.className = `${PREFIX}-mark-tags`;
					(mark.tags || []).forEach((tagItem) => {
						const tag = document.createElement('span');
						tag.className = `${PREFIX}-mark-tag`;
						tag.title = '点击删除此备注';
						tag.style.background = tagItem.color || '#6E9BB8';
						tag.style.color = tagItem.fg || markFgFor(tagItem.color);
						tag.dataset.ldmyMarkUser = username;
						tag.dataset.ldmyMarkText = tagItem.text || '';
						tag.dataset.ldmyMarkColor = tagItem.color || '#8e44ad';
						tag.innerHTML = `<span>${tagItem.text || ''}</span><span class="${PREFIX}-mark-x" aria-hidden="true">×</span>`;
						// 删除逻辑在 init() 的 document 事件委托里，点击即删 + toast
						wrap.appendChild(tag);
					});
					actionHost.appendChild(wrap);
				} else if (actionHost) {
					actionHost.querySelector(`.${PREFIX}-mark-tags`)?.remove();
				}

				// ban apply / restore
				if (banSet.has(username)) {
					if (script.advanced.banMode === 'remove') {
						post.remove();
						return;
					}
					post.classList.add(`${PREFIX}-banned-post`, `${PREFIX}-ban-collapsed`);
					if (!post.querySelector(`.${PREFIX}-ban-placeholder`)) {
						const ph = document.createElement('div');
						ph.className = `${PREFIX}-ban-placeholder`;
						const info = script.banList.find((b) => b.username === username);
						const collapsedText = `已屏蔽 @${username}${info?.reason ? '：' + info.reason : ''}（点击查看）`;
						const openText = `已屏蔽 @${username}（点击重新折叠）`;
						ph.textContent = collapsedText;
						ph.style.cursor = 'pointer';
						ph.addEventListener('click', () => {
							const collapsed = post.classList.toggle(`${PREFIX}-ban-collapsed`);
							ph.textContent = collapsed ? collapsedText : openText;
						});
						const body = post.querySelector('.post__body, .topic-body') || post;
						body.insertBefore(ph, body.firstChild);
					}
				} else {
					post.classList.remove(`${PREFIX}-banned-post`, `${PREFIX}-ban-collapsed`);
					post.querySelector(`.${PREFIX}-ban-placeholder`)?.remove();
				}
			});
		},
	};

	/** 关键字屏蔽 */

	/** KeywordsBlock */

	const KeywordsBlock = {
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

	/** HideEmojiText */

	const HideEmojiText = {
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

	/** HighlightOP */

	const HighlightOP = {
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

	const chromeCss = "/* ========== Excel 摸鱼外观 ========== */\n#ldmy-excel-root {\n  display: none;\n  position: fixed;\n  inset: 0;\n  z-index: 99980;\n  pointer-events: none;\n  /* 独立合成层，避免帖内 emoji/boost 上滚时与固定头抢绘制顺序 */\n  isolation: isolate;\n  transform: translateZ(0);\n}\nbody.ldmy-excel #ldmy-excel-root { display: block; }\n#ldmy-excel-root .ldmy-excel-header,\n#ldmy-excel-root .ldmy-excel-footer {\n  position: fixed;\n  left: 0;\n  right: 0;\n  pointer-events: auto;\n  box-sizing: border-box;\n  z-index: 99981;\n  isolation: isolate;\n  transform: translateZ(0);\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  /* 强制自成不透明合成层，避免滚动时被帖内 emoji/boost 穿透 */\n  will-change: transform;\n}\n#ldmy-excel-root .ldmy-excel-header {\n  top: 0;\n  background: #fff;\n  background-clip: padding-box;\n  border-bottom: 1px solid #bbb;\n  overflow: hidden;\n  /* 额外遮罩：即使子层有透明缝，也不让下层像素透上来 */\n  box-shadow: 0 0 0 1px rgba(255,255,255,0.01), 0 1px 0 #bbb;\n}\n#ldmy-excel-root .ldmy-excel-footer {\n  bottom: 0;\n  background: #f4f4f4;\n  border-top: 1px solid #c8c8c8;\n  display: flex;\n  align-items: stretch;\n  height: var(--ldmy-excel-footer-h, 50px);\n}\n\n/* ---- 通用图标/切图 ---- */\n#ldmy-excel-root .ldmy-excel-ico {\n  display: inline-block;\n  background-repeat: no-repeat;\n  background-position: center;\n  background-size: contain;\n  flex-shrink: 0;\n  vertical-align: middle;\n}\n#ldmy-excel-root .ldmy-excel-ico12 { width: 12px; height: 12px; }\n#ldmy-excel-root .ldmy-excel-ico16 { width: 16px; height: 16px; }\n#ldmy-excel-root .ldmy-excel-ico20 { width: 20px; height: 20px; }\n#ldmy-excel-root .ldmy-excel-ico24 { width: 24px; height: 24px; }\n#ldmy-excel-root .ldmy-excel-home {\n  display: inline-flex;\n  align-items: center;\n  cursor: pointer;\n  border-radius: 4px;\n  flex-shrink: 0;\n}\n#ldmy-excel-root .ldmy-excel-home:hover {\n  background: rgba(0, 0, 0, 0.06);\n}\nbody.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-home:hover {\n  background: rgba(255, 255, 255, 0.08);\n}\n#ldmy-excel-root .ldmy-excel-vsep {\n  height: 16px;\n  border-right: 1px solid #000;\n  opacity: 0.06;\n  margin: 0 8px;\n  flex-shrink: 0;\n}\n#ldmy-excel-root .ldmy-excel-grow { flex-grow: 1; }\n#ldmy-excel-root img.ldmy-excel-slice {\n  position: absolute;\n  top: 0;\n  max-height: 100%;\n  pointer-events: none;\n  user-select: none;\n}\n#ldmy-excel-root img.ldmy-excel-slice-l { left: 0; }\n#ldmy-excel-root img.ldmy-excel-slice-r { right: 0; }\n\n/* 列字母 */\n#ldmy-excel-root .ldmy-excel-h4 {\n  height: 21px;\n  display: flex;\n  overflow: hidden;\n  background: #eee;\n  border-top: 1px solid #d0d0d0;\n  box-sizing: border-box;\n}\n#ldmy-excel-root .ldmy-excel-h4 > div {\n  height: 21px;\n  border-right: 1px solid #c8c8c8;\n  box-sizing: border-box;\n  flex-shrink: 0;\n}\n#ldmy-excel-root .ldmy-excel-sub {\n  width: 34px;\n  position: relative;\n  background: #e8e8e8;\n}\n#ldmy-excel-root .ldmy-excel-sub > div {\n  position: absolute;\n  right: 4px;\n  bottom: 4px;\n  width: 0;\n  height: 0;\n  border-top: 6px solid transparent;\n  border-left: 6px solid transparent;\n  border-right: 6px solid #b8b8b8;\n  border-bottom: 6px solid #b8b8b8;\n}\n#ldmy-excel-root .ldmy-excel-column {\n  width: 72px;\n  line-height: 21px;\n  text-align: center;\n  color: #444;\n  font-family: sans-serif;\n  font-weight: 400;\n  font-size: calc(13px + var(--ldmy-font-offset, 0px));\n  background: #f3f3f3;\n}\n\n";

	const themeTencentCss = "/* ===================== 腾讯文档（矢量图标） ===================== */\nbody.ldmy-excel-tencent {\n  --ldmy-excel-header-h: 146px;\n  --ldmy-excel-footer-h: 36px;\n  --ldmy-excel-accent: #1e6fff;\n  font-family: -apple-system, \"Helvetica Neue\", Helvetica, \"PingFang SC\", \"Microsoft YaHei\",\n    \"Source Han Sans SC\", \"Noto Sans CJK SC\", \"WenQuanYi Micro Hei\", sans-serif !important;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-header {\n  height: var(--ldmy-excel-header-h);\n  background: #fff;\n  border-bottom: 1px solid #ebebeb;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-titlebar {\n  height: 56px;\n  display: flex;\n  align-items: center;\n  padding: 0 4px 0 0;\n  border-bottom: 1px solid #ebebeb;\n  box-sizing: border-box;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-titlebar-title {\n  height: 36px;\n  line-height: 36px;\n  font-size: 18px;\n  font-weight: 500;\n  color: #000;\n  opacity: 0.88;\n  margin: 0 9px;\n  max-width: 36%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  cursor: pointer;\n  pointer-events: auto;\n  border-radius: 4px;\n  padding: 0 4px;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-titlebar-title:hover {\n  background: rgba(0,0,0,.04);\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-muted {\n  margin-left: 5px;\n  font-size: 12px;\n  line-height: 20px;\n  height: 18px;\n  color: #000;\n  opacity: 0.48;\n  font-weight: 400;\n  white-space: nowrap;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-fish {\n  width: 28px;\n  height: 28px;\n  border-radius: 4px;\n  background: transparent;\n  text-align: center;\n  line-height: 28px;\n  margin-right: 12px;\n  cursor: pointer;\n  font-size: 14px;\n  pointer-events: auto;\n  transition: background .15s ease;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-fish:hover { background: #e8eef8; }\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-toolbar {\n  height: 44px;\n  display: flex;\n  align-items: center;\n  padding: 0 12px;\n  border-bottom: 1px solid #ebebeb;\n  line-height: 24px;\n  font-size: 12px;\n  color: rgba(0,0,0,.88);\n  font-weight: 400;\n  box-sizing: border-box;\n  overflow: hidden;\n  white-space: nowrap;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-toolbar-label {\n  padding: 0 2px;\n  flex-shrink: 0;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-formulabar {\n  height: 25px;\n  display: flex;\n  align-items: center;\n  border-bottom: 1px solid #e0e2e4;\n  background: #fff;\n  box-sizing: border-box;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-fx-cell {\n  border-right: 1px solid #e0e2e4;\n  color: #777;\n  text-align: center;\n  width: 50px;\n  font-size: 12px;\n  height: 25px;\n  line-height: 25px;\n  font-weight: 400;\n  flex-shrink: 0;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-fx-value {\n  flex: 1;\n  height: 25px;\n  line-height: 25px;\n  padding: 0 8px;\n  font-size: 12px;\n  color: #333;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  border: none;\n  outline: none;\n  background: transparent;\n  pointer-events: auto;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-fx-value a,\n#ldmy-excel-root .ldmy-excel-fx a,\n#ldmy-excel-root .ldmy-excel-nav-link {\n  color: #1a3959;\n  text-decoration: none;\n  pointer-events: auto;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-fx-value a:hover,\n#ldmy-excel-root .ldmy-excel-fx a:hover,\n#ldmy-excel-root .ldmy-excel-nav-link:hover {\n  text-decoration: underline;\n  color: #1e6fff;\n}\n#ldmy-excel-root .ldmy-excel-nav-sep {\n  margin: 0 6px;\n  opacity: 0.35;\n  pointer-events: none;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-sub { width: 51px; }\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-footer {\n  height: 36px;\n  background: #fff;\n  border-top: 1px solid #e8e8e8;\n  align-items: center;\n  padding: 0 4px;\n  gap: 0;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-sheet-tab {\n  position: relative;\n  display: flex;\n  align-items: center;\n  height: 28px;\n  margin-left: 8px;\n  padding: 0 14px 0 10px;\n  font-size: 12px;\n  color: #1e6fff;\n  font-weight: 500;\n  cursor: default;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-sheet-tab::after {\n  content: '';\n  position: absolute;\n  left: 0; right: 0; bottom: -4px;\n  height: 2px;\n  background: #1e6fff;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-footer-meta {\n  margin-left: auto;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding-right: 12px;\n  font-size: 12px;\n  color: #666;\n  font-weight: 400;\n}\nbody.ldmy-excel-tencent #ldmy-excel-root .ldmy-excel-zoom {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  color: #666;\n}\n\n";

	const themeOfficeCss = "/* ===================== Microsoft Excel ===================== */\nbody.ldmy-excel-office {\n  --ldmy-excel-header-h: 221px;\n  --ldmy-excel-footer-h: 50px;\n  --ldmy-excel-accent: #217346;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-header {\n  height: 221px;\n  background: #e8e8e8;\n  border-bottom: 1px solid #bbb;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-h1 {\n  height: 59px;\n  background: #227447;\n  position: relative;\n  display: flex;\n  justify-content: center;\n  align-items: flex-start;\n  overflow: hidden;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-h1-title {\n  display: block;\n  color: #fff;\n  font-size: 12px;\n  font-weight: 400;\n  font-family: sans-serif;\n  line-height: 30px;\n  position: relative;\n  z-index: 2;\n  max-width: 50%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  pointer-events: auto;\n  cursor: pointer;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-h2 {\n  height: 95px;\n  background: #f1f1f1;\n  border-bottom: 1px solid #d5d5d5;\n  position: relative;\n  overflow: hidden;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-h3 {\n  height: 48px;\n  background: #e6e6e6;\n  position: relative;\n  overflow: hidden;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-fx {\n  position: absolute;\n  top: 10px;\n  left: 250px;\n  right: 5px;\n  height: 28px;\n  box-sizing: border-box;\n  border: 1px solid #c6c6c6;\n  border-radius: 0;\n  background: #fff;\n  z-index: 2;\n  display: flex;\n  align-items: center;\n  padding: 0 8px;\n  font-size: 12px;\n  color: #333;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  pointer-events: auto;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-h4 { height: 20px; }\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-h4 .ldmy-excel-column {\n  line-height: 20px;\n  height: 20px;\n  background: #eee;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-footer {\n  height: 50px;\n  flex-direction: column;\n  padding: 0;\n  background: #f4f4f4;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-f1 {\n  height: 29px;\n  position: relative;\n  background: #e8e8e8;\n  border-top: 1px solid #999;\n  border-bottom: 1px solid #bfbfbf;\n  overflow: hidden;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-f2 {\n  height: 21px;\n  position: relative;\n  background: #f4f4f4;\n  overflow: hidden;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-f1 img.ldmy-excel-slice { top: -1px; }\n\n";

	const gridListTopicCss = "/* ===================== 页面内容网格化（Discourse） ===================== */\nbody.ldmy-excel {\n  background: #fff !important;\n  /* sticky 导航/表头贴在 Excel 固定头下方，归零会导致上滚穿模进工具栏 */\n  --header-offset: var(--ldmy-excel-header-h) !important;\n  --d-max-width: 100% !important;\n  --topic-body-width: 100% !important;\n  --topic-body-width-padding: 12px !important;\n  --d-sidebar-width: 240px;\n  /* 细滚动条，贴近文档/表格观感 */\n  scrollbar-width: thin !important;\n  scrollbar-color: #c4c4c4 transparent !important;\n}\nbody.ldmy-excel::-webkit-scrollbar,\nhtml:has(body.ldmy-excel)::-webkit-scrollbar {\n  width: 10px !important;\n  height: 10px !important;\n  display: block !important;\n  background: transparent !important;\n}\nbody.ldmy-excel::-webkit-scrollbar-track,\nhtml:has(body.ldmy-excel)::-webkit-scrollbar-track {\n  background: #f3f3f3 !important;\n}\nbody.ldmy-excel::-webkit-scrollbar-thumb,\nhtml:has(body.ldmy-excel)::-webkit-scrollbar-thumb {\n  background: #c4c4c4 !important;\n  border-radius: 8px !important;\n  border: 2px solid #f3f3f3 !important;\n  background-clip: padding-box !important;\n}\nbody.ldmy-excel::-webkit-scrollbar-thumb:hover,\nhtml:has(body.ldmy-excel)::-webkit-scrollbar-thumb:hover {\n  background: #a8a8a8 !important;\n  border: 2px solid #f3f3f3 !important;\n  background-clip: padding-box !important;\n}\nhtml:has(body.ldmy-excel),\nhtml:has(body.ldmy-excel) body {\n  scrollbar-width: thin !important;\n  scrollbar-color: #c4c4c4 transparent !important;\n}\n/* 深色模式滚动条：避免浅灰滑块在暗底上过亮 */\nbody.ldmy-excel.ldmy-excel-dark {\n  scrollbar-color: #555 #2a2a2a !important;\n}\nhtml:has(body.ldmy-excel.ldmy-excel-dark),\nhtml:has(body.ldmy-excel.ldmy-excel-dark) body {\n  scrollbar-color: #555 #2a2a2a !important;\n}\nbody.ldmy-excel.ldmy-excel-dark::-webkit-scrollbar-track,\nhtml:has(body.ldmy-excel.ldmy-excel-dark)::-webkit-scrollbar-track {\n  background: #2a2a2a !important;\n}\nbody.ldmy-excel.ldmy-excel-dark::-webkit-scrollbar-thumb,\nhtml:has(body.ldmy-excel.ldmy-excel-dark)::-webkit-scrollbar-thumb {\n  background: #555 !important;\n  border: 2px solid #2a2a2a !important;\n  background-clip: padding-box !important;\n}\nbody.ldmy-excel.ldmy-excel-dark::-webkit-scrollbar-thumb:hover,\nhtml:has(body.ldmy-excel.ldmy-excel-dark)::-webkit-scrollbar-thumb:hover {\n  background: #6a6a6a !important;\n  border: 2px solid #2a2a2a !important;\n  background-clip: padding-box !important;\n}\n/* 列表正文恢复站点字体，避免腾讯文档字体栈/缩小字号导致发糊 */\nbody.ldmy-excel #main-outlet,\nbody.ldmy-excel .list-container,\nbody.ldmy-excel .topic-list,\nbody.ldmy-excel .topic-list .title,\nbody.ldmy-excel .topic-list a,\nbody.ldmy-excel .search-container,\nbody.ldmy-excel .fps-result,\nbody.ldmy-excel .topic-body,\nbody.ldmy-excel .cooked {\n  font-family: inherit !important;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  text-rendering: optimizeLegibility;\n}\n\n/* 始终隐藏：站点顶栏/时间线等论坛 chrome（侧栏由 excelHideNav 控制） */\nbody.ldmy-excel .d-header,\nbody.ldmy-excel .d-header-wrap,\nbody.ldmy-excel .btn-sidebar-toggle,\nbody.ldmy-excel .discourse-offline-indicator,\nbody.ldmy-excel .progress-bar-container,\nbody.ldmy-excel .skip-link,\nbody.ldmy-excel .welcome-banner,\nbody.ldmy-excel .welcome-banner--visible,\nbody.ldmy-excel .container.posts .topic-navigation,\nbody.ldmy-excel .topic-map,\nbody.ldmy-excel .topic-status-info,\nbody.ldmy-excel footer.topic-footer-main-buttons,\nbody.ldmy-excel #discourse-modal,\nbody.ldmy-excel .header-sidebar-toggle,\nbody.ldmy-excel .dar-container,\nbody.ldmy-excel .dar-panel,\nbody.ldmy-excel .bulk-select-topics,\nbody.ldmy-excel .alert-info,\nbody.ldmy-excel .discourse-browser-update-alert,\nbody.ldmy-excel .list-container > .show-more,\nbody.ldmy-excel .topic-list-bottom,\nbody.ldmy-excel .footer-message {\n  display: none !important;\n}\n/* 隐藏导航/侧栏：顶栏控件 + 左侧分类/tag/板块 */\nbody.ldmy-excel.ldmy-excel-hide-nav .list-controls,\nbody.ldmy-excel.ldmy-excel-hide-nav .navigation-container,\nbody.ldmy-excel.ldmy-excel-hide-nav .navigation-topics,\nbody.ldmy-excel.ldmy-excel-hide-nav .topic-above-content,\nbody.ldmy-excel.ldmy-excel-hide-nav .discourse-tags-header,\nbody.ldmy-excel.ldmy-excel-hide-nav .category-breadcrumb,\nbody.ldmy-excel.ldmy-excel-hide-nav .breadcrumbs,\nbody.ldmy-excel.ldmy-excel-hide-nav #navigation-bar,\nbody.ldmy-excel.ldmy-excel-hide-nav .nav-pills,\nbody.ldmy-excel.ldmy-excel-hide-nav .topic-category,\nbody.ldmy-excel.ldmy-excel-hide-nav .sidebar-wrapper,\nbody.ldmy-excel.ldmy-excel-hide-nav #d-sidebar,\nbody.ldmy-excel.ldmy-excel-hide-nav .sidebar-container,\nbody.ldmy-excel.ldmy-excel-hide-nav #main-outlet-wrapper > .sidebar-wrapper,\nbody.ldmy-excel.ldmy-excel-hide-nav #main-outlet-wrapper > aside {\n  display: none !important;\n}\nbody.ldmy-excel.ldmy-excel-hide-nav .sidebar-wrapper,\nbody.ldmy-excel.ldmy-excel-hide-nav #d-sidebar {\n  width: 0 !important;\n  min-width: 0 !important;\n  max-width: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  overflow: hidden !important;\n  position: absolute !important;\n  left: -9999px !important;\n  pointer-events: none !important;\n}\n/* 某些主题用 ::before 做顶栏占位 */\nbody.ldmy-excel #main::before,\nbody.ldmy-excel .discourse-root::before {\n  display: none !important;\n  height: 0 !important;\n  content: none !important;\n}\n/* 默认全宽（隐藏侧栏时） */\nbody.ldmy-excel.ldmy-excel-hide-nav #main-outlet-wrapper,\nbody.ldmy-excel.ldmy-excel-hide-nav.has-sidebar-page #main-outlet-wrapper,\nbody.ldmy-excel.ldmy-excel-hide-nav #main-outlet-wrapper.wrap {\n  display: block !important;\n  grid-template-columns: none !important;\n  grid-template-rows: none !important;\n  gap: 0 !important;\n}\n/* 显示导航/侧栏：恢复双栏布局 */\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #main-outlet-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav).has-sidebar-page #main-outlet-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #main-outlet-wrapper.wrap {\n  display: grid !important;\n  grid-template-columns: var(--d-sidebar-width, 240px) minmax(0, 1fr) !important;\n  grid-template-rows: none !important;\n  gap: 0 !important;\n  align-items: stretch !important;\n}\nbody.ldmy-excel #main-outlet-wrapper,\nbody.ldmy-excel.has-sidebar-page #main-outlet-wrapper,\nbody.ldmy-excel #main-outlet-wrapper.wrap {\n  margin: 0 !important;\n  margin-top: 0 !important;\n  padding-top: var(--ldmy-excel-header-h) !important;\n  padding-bottom: calc(var(--ldmy-excel-footer-h) + 4px) !important;\n  padding-left: 0 !important;\n  padding-right: 0 !important;\n  max-width: none !important;\n  width: 100% !important;\n  min-width: 0 !important;\n  box-sizing: border-box !important;\n}\n\n/* 防穿模（收窄版）：不要给 #main / .discourse-root / #ember-container 等大祖先\n   加 isolation + z-index:0，否则 d-header 搜索/用户/语言弹层会被锁在内容层，\n   永远盖不过 Excel 固定头（1.1.27 回归）。只压帖内状态/boost 与 sticky 相关节点。 */\nbody.ldmy-excel .topic-post,\nbody.ldmy-excel .topic-list-item,\nbody.ldmy-excel .topic-post .names,\nbody.ldmy-excel .post-menu-area,\nbody.ldmy-excel .post__menu-area,\nbody.ldmy-excel .post-controls,\nbody.ldmy-excel .post-actions,\nbody.ldmy-excel .post__actions {\n  z-index: auto !important;\n}\n/* 状态表情 / boost 火箭：清掉可能制造穿模的定位与合成属性 */\nbody.ldmy-excel .topic-post .user-status,\nbody.ldmy-excel .topic-post .user-status-message-wrap,\nbody.ldmy-excel .topic-post .poster-icon-container,\nbody.ldmy-excel .topic-post img.emoji,\nbody.ldmy-excel .topic-post .emoji,\nbody.ldmy-excel .topic-post .emoji-images,\nbody.ldmy-excel .discourse-boosts,\nbody.ldmy-excel .discourse-boosts__list,\nbody.ldmy-excel .discourse-boosts__bubble,\nbody.ldmy-excel .discourse-boosts__add-btn,\nbody.ldmy-excel .discourse-boosts__post-menu,\nbody.ldmy-excel .reactions-actions-summary,\nbody.ldmy-excel .discourse-reactions-actions,\nbody.ldmy-excel .discourse-reactions-reaction-button,\nbody.ldmy-excel .discourse-reactions-counter {\n  position: relative !important;\n  top: auto !important;\n  bottom: auto !important;\n  z-index: 0 !important;\n  transform: none !important;\n  filter: none !important;\n  will-change: auto !important;\n  isolation: auto !important;\n}\n/* sticky 导航/侧栏：压在内容内，仍远低于 Excel chrome(99981) */\nbody.ldmy-excel .navigation-container,\nbody.ldmy-excel .list-controls,\nbody.ldmy-excel .topic-list-header,\nbody.ldmy-excel thead.topic-list-header,\nbody.ldmy-excel .sidebar-wrapper,\nbody.ldmy-excel #d-sidebar {\n  z-index: 5 !important;\n}\n/* sticky-avatar 帖子本身不要形成额外抬高层 */\nbody.ldmy-excel .post-stream .topic-post.sticky-avatar,\nbody.ldmy-excel .post-stream .topic-post.post--sticky-avatar {\n  z-index: 0 !important;\n  transform: none !important;\n}\n\n\n/* Excel 底栏会盖住 docked composer：抬升 #reply-control 并提高层级 */\nbody.ldmy-excel #reply-control,\nbody.ldmy-excel .docked-composer,\nbody.ldmy-excel #reply-control.docked,\nbody.ldmy-excel #reply-control.open,\nbody.ldmy-excel #reply-control.edit-title {\n  bottom: var(--ldmy-excel-footer-h, 36px) !important;\n  z-index: 100050 !important;\n  margin-bottom: 0 !important;\n}\nbody.ldmy-excel #reply-control .save-or-cancel,\nbody.ldmy-excel #reply-control .composer-controls,\nbody.ldmy-excel #reply-control .d-editor-button-bar,\nbody.ldmy-excel #reply-control .composer-bottom {\n  position: relative;\n  z-index: 1;\n}\n/* 打开回复时 FAB 也避让 composer + footer */\nbody.ldmy-excel:has(#reply-control.open) #ldmy-fab,\nbody.ldmy-excel:has(#reply-control.edit-title) #ldmy-fab,\nbody.ldmy-excel:has(#reply-control.draft) #ldmy-fab,\nbody.ldmy-excel:has(.composer-popup) #ldmy-fab {\n  bottom: calc(var(--ldmy-excel-footer-h, 36px) + 72px) !important;\n}\n\n/* 显示时的侧栏：仅最外层滚动，避免多层 overflow 出现双滚动条 */\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #main-outlet-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav).has-sidebar-page #main-outlet-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #main-outlet-wrapper.wrap {\n  align-items: stretch !important;\n}\n/* 唯一滚动容器：sidebar-wrapper */\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-wrapper {\n  display: block !important;\n  position: sticky !important;\n  top: var(--ldmy-excel-header-h) !important;\n  left: auto !important;\n  align-self: start !important;\n  width: var(--d-sidebar-width, 240px) !important;\n  min-width: var(--d-sidebar-width, 240px) !important;\n  max-width: var(--d-sidebar-width, 240px) !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  overflow-x: hidden !important;\n  overflow-y: auto !important;\n  overscroll-behavior: contain !important;\n  pointer-events: auto !important;\n  height: calc(100vh - var(--ldmy-excel-header-h) - var(--ldmy-excel-footer-h)) !important;\n  max-height: calc(100vh - var(--ldmy-excel-header-h) - var(--ldmy-excel-footer-h)) !important;\n  background: #f8f9fb !important;\n  border-right: 1px solid #d0d0d0 !important;\n  box-shadow: none !important;\n  border-radius: 0 !important;\n  z-index: 2 !important;\n  /* 可滚动但不显示滚动条，更像表格侧栏 */\n  scrollbar-width: none !important;\n  -ms-overflow-style: none !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-wrapper::-webkit-scrollbar {\n  width: 0 !important;\n  height: 0 !important;\n  display: none !important;\n  background: transparent !important;\n}\n/* 内层全部取消独立滚动，高度随内容，由 wrapper 统一滚动 */\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #d-sidebar,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-wrapper .sidebar-container,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-container,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-sections,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-scroll-wrap {\n  display: block !important;\n  position: static !important;\n  width: 100% !important;\n  min-width: 0 !important;\n  max-width: none !important;\n  height: auto !important;\n  max-height: none !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  overflow: visible !important;\n  background: #f8f9fb !important;\n  color: #333 !important;\n  /* 不强制 12px：跟站点侧栏字号；偏移由 font-resize 容器统一加 */\n  border: none !important;\n  box-shadow: none !important;\n  scrollbar-width: none !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #d-sidebar::-webkit-scrollbar,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-container::-webkit-scrollbar,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-sections::-webkit-scrollbar,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-scroll-wrap::-webkit-scrollbar {\n  width: 0 !important;\n  height: 0 !important;\n  display: none !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-header,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-header-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-header-text {\n  color: #666 !important;\n  border-radius: 0 !important;\n  font-weight: 600 !important;\n  letter-spacing: 0.02em !important;\n  text-transform: none !important;\n  box-shadow: none !important;\n  background: transparent !important;\n  padding: 6px 10px 2px !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link-wrapper {\n  color: #333 !important;\n  border-radius: 0 !important;\n  line-height: 1.45 !important;\n  min-height: 28px !important;\n  box-shadow: none !important;\n  border: none !important;\n  margin: 0 !important;\n  padding: 0 10px !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link:hover,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link.active,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link[aria-current=\"page\"] {\n  background: #e8eef8 !important;\n  color: #1a3959 !important;\n  box-shadow: inset 2px 0 0 var(--ldmy-excel-accent, #1e6fff) !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section {\n  border-bottom: 1px solid #e6e6e6 !important;\n  margin: 0 !important;\n  padding: 2px 0 4px !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link .sidebar-section-link-prefix,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link .sidebar-section-link-suffix,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link .sidebar-section-link-content-badge {\n  opacity: 0.7 !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-footer-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-custom-sections,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-message {\n  border-color: #e6e6e6 !important;\n  background: transparent !important;\n  color: #888 !important;\n}\nbody.ldmy-excel #main-outlet,\nbody.ldmy-excel .main-outlet {\n  display: block !important;\n  margin: 0 !important;\n  margin-top: 0 !important;\n  padding: 0 !important;\n  padding-top: 0 !important;\n  padding-bottom: 0 !important;\n  max-width: none !important;\n  width: 100% !important;\n  min-width: 0 !important;\n  float: none !important;\n  box-sizing: border-box !important;\n  grid-column: auto !important;\n}\n/* 顶栏导航 Excel 化（仅显示导航时） */\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .list-controls,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-container,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-topics {\n  display: flex !important;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px 8px;\n  margin: 0 !important;\n  padding: 4px 8px !important;\n  background: #f3f3f3 !important;\n  border-bottom: 1px solid #bbb !important;\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  min-height: 0 !important;\n}\n/* 只让最外层导航条 sticky，避免父子同时 sticky 叠层穿模 */\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .list-controls {\n  position: sticky !important;\n  top: var(--ldmy-excel-header-h) !important;\n  z-index: 40 !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-container,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-topics {\n  position: static !important;\n  top: auto !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .list-controls .navigation-container,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-container .nav-pills,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #navigation-bar {\n  display: flex !important;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px;\n  margin: 0 !important;\n  padding: 0 !important;\n  background: transparent !important;\n  border: none !important;\n  box-shadow: none !important;\n}\n/* 类别/标签下拉：保留边框；导航 pill 跟随原站下划线样式，不再硬套白底方框 */\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .category-breadcrumb .btn,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .category-breadcrumb .combo-box,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .category-breadcrumb .select-kit.combo-box .select-kit-header,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .list-controls .category-breadcrumb .select-kit-header {\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  min-height: 28px !important;\n  height: auto !important;\n  font-weight: 400 !important;\n  padding: 0 8px !important;\n  margin: 0 !important;\n  border: 1px solid #c6c6c6 !important;\n  background: #fff !important;\n  color: #333 !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .nav-pills > li,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .nav-pills > li a,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-container .nav-item,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #navigation-bar > li,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #navigation-bar > li a {\n  border: none !important;\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  outline: none !important;\n  min-height: 28px !important;\n  height: auto !important;\n  font-weight: 400 !important;\n  padding: 0 8px !important;\n  margin: 0 !important;\n  background: transparent !important;\n  color: inherit !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .nav-pills > li a.active,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .nav-pills > li a:hover,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #navigation-bar > li a.active,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) #navigation-bar > li a:hover {\n  background: transparent !important;\n  border: none !important;\n  box-shadow: none !important;\n  color: inherit !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-container .btn,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .list-controls .btn,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-controls .btn {\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  min-height: 28px !important;\n  height: auto !important;\n  font-weight: 400 !important;\n  padding: 0 8px !important;\n  margin: 0 !important;\n  border: 1px solid #c6c6c6 !important;\n  background: #fff !important;\n  color: #333 !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-container .btn:hover,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .list-controls .btn:hover,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-controls .btn:hover {\n  background: #e8eef8 !important;\n  border-color: #8eb6e8 !important;\n  color: #1a3959 !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .list-controls .btn-primary,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-container .btn-primary,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .navigation-controls .btn-primary,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .list-controls .btn.btn-icon-text.btn-primary {\n  background: #fff !important;\n  color: #1a3959 !important;\n  border: 1px solid #8eb6e8 !important;\n  border-radius: 0 !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .category-breadcrumb,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .breadcrumbs {\n  display: flex !important;\n  align-items: center;\n  gap: 4px;\n  margin: 0 !important;\n  padding: 0 !important;\n  background: transparent !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .select-kit-body,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .select-kit-collection {\n  border-radius: 0 !important;\n  box-shadow: 0 1px 4px rgba(0,0,0,.12) !important;\n  border: 1px solid #c6c6c6 !important;\n}\n/* 帖内右侧 timeline 占列清掉 */\nbody.ldmy-excel .container.posts {\n  display: block !important;\n  grid-template-columns: none !important;\n  grid-template-rows: none !important;\n  width: 100% !important;\n  max-width: none !important;\n  gap: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n}\nbody.ldmy-excel .container.posts > .topic-navigation,\nbody.ldmy-excel .timeline-container,\nbody.ldmy-excel .topic-navigation {\n  display: none !important;\n  width: 0 !important;\n}\nbody.ldmy-excel .post-stream,\nbody.ldmy-excel .topic-area,\nbody.ldmy-excel .posts-wrapper,\nbody.ldmy-excel .list-container,\nbody.ldmy-excel section.topic-area,\nbody.ldmy-excel #topic-title,\nbody.ldmy-excel .title-wrapper {\n  width: 100% !important;\n  max-width: none !important;\n  margin: 0 !important;\n  box-sizing: border-box !important;\n}\n/* 帖子标题单元格化 */\nbody.ldmy-excel #topic-title,\nbody.ldmy-excel .title-wrapper {\n  border-bottom: 1px solid #bbb !important;\n  background: #f7f7f7 !important;\n  padding: 6px 10px !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel #topic-title h1,\nbody.ldmy-excel .fancy-title,\nbody.ldmy-excel .title-wrapper h1 {\n  font-weight: 600 !important;\n  line-height: 1.4 !important;\n  margin: 0 !important;\n  color: #1a3959 !important;\n}\nbody.ldmy-excel #topic-title .topic-category,\nbody.ldmy-excel #topic-title .discourse-tags {\n  margin-top: 2px !important;\n}\n/* 列表表格化 */\nbody.ldmy-excel .topic-list,\nbody.ldmy-excel table.topic-list {\n  border-collapse: collapse !important;\n  border-spacing: 0 !important;\n  width: 100% !important;\n  max-width: none !important;\n  margin: 0 !important;\n  background: #fff !important;\n  box-shadow: none !important;\n  border: none !important;\n}\nbody.ldmy-excel .topic-list th,\nbody.ldmy-excel .topic-list td,\nbody.ldmy-excel .topic-list .topic-list-data,\nbody.ldmy-excel .topic-list .main-link,\nbody.ldmy-excel .topic-list .posts-map,\nbody.ldmy-excel .topic-list .num {\n  border-right: 1px solid #bbb !important;\n  border-bottom: 1px solid #bbb !important;\n  background: #fff !important;\n  box-shadow: none !important;\n  vertical-align: middle !important;\n}\nbody.ldmy-excel .topic-list th {\n  background: #e8e8e8 !important;\n  color: #555 !important;\n  font-family: inherit !important;\n  font-weight: 500 !important;\n  /* 表头字号跟站点，不强制 12px */\n  height: auto !important;\n  min-height: 28px !important;\n  padding: 4px 8px !important;\n  -webkit-font-smoothing: antialiased;\n}\nbody.ldmy-excel .topic-list tr:hover td,\nbody.ldmy-excel .topic-list .topic-list-item:hover .topic-list-data {\n  background: #eef5ff !important;\n}\nbody.ldmy-excel .topic-list .topic-excerpt,\nbody.ldmy-excel .topic-list .topic-statuses,\nbody.ldmy-excel .topic-list .posters,\nbody.ldmy-excel .topic-list .donottopic-btn {\n  display: none !important;\n}\n/* Default / Moyu：标题下分类与标签弱化，避免喧宾夺主 */\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .link-bottom-line {\n  display: flex !important;\n  flex-wrap: nowrap !important;\n  align-items: center !important;\n  gap: 4px !important;\n  margin-top: 1px !important;\n  max-width: 100% !important;\n  overflow: hidden !important;\n  opacity: 0.66 !important;\n  line-height: 1.2 !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .badge-category__wrapper,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .badge-category {\n  border-radius: 2px !important;\n  max-width: 9em !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n  opacity: 0.85 !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .discourse-tag,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .discourse-tags .discourse-tag {\n  margin: 0 2px 0 0 !important;\n  border-radius: 2px !important;\n  background: #f0f0f0 !important;\n  color: #888 !important;\n  border: 1px solid #e4e4e4 !important;\n  box-shadow: none !important;\n  max-width: 7em !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n  opacity: 0.8 !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .discourse-tags {\n  display: inline-flex !important;\n  flex-wrap: nowrap !important;\n  gap: 2px !important;\n  max-width: 50% !important;\n  overflow: hidden !important;\n}\nbody.ldmy-excel .topic-list .main-link .title {\n  font-family: inherit !important;\n  font-weight: 400 !important;\n  color: #1a3959 !important;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\nbody.ldmy-excel .topic-list .badge-notification { transform: scale(.85); }\nbody.ldmy-excel .ldmy-excel-rownum,\nbody.ldmy-excel th.ldmy-excel-rownum {\n  width: 48px !important;\n  min-width: 48px !important;\n  max-width: 56px !important;\n  text-align: center !important;\n  color: #777 !important;\n  font-size: calc(13px + var(--ldmy-font-offset, 0px)) !important;\n  background: #e8e8e8 !important;\n  font-variant-numeric: tabular-nums;\n  padding-left: 2px !important;\n  padding-right: 2px !important;\n}\nbody.ldmy-excel .topic-list-item.ldmy-excel-row-active .topic-list-data {\n  background: #dcecfc !important;\n  outline: 1px solid var(--ldmy-excel-accent, #1e6fff);\n  outline-offset: -1px;\n}\n/* Default/Moyu 经典列表：标题撑满，右侧回复/浏览/活动贴右且窄 */\nbody.ldmy-excel:not(.ldmy-excel-horizon) table.topic-list {\n  table-layout: fixed !important;\n  width: 100% !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .main-link,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.default,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th[data-sort-order=\"default\"] {\n  width: auto !important;\n  min-width: 0 !important;\n  padding-right: 8px !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.posts,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list td.posts,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .posts-map,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.num.posts,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list td.num.posts {\n  width: 64px !important;\n  min-width: 56px !important;\n  max-width: 72px !important;\n  text-align: right !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.views,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list td.views,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.num.views,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list td.num.views {\n  width: 72px !important;\n  min-width: 64px !important;\n  max-width: 84px !important;\n  text-align: right !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.activity,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list td.activity,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.num.activity,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list td.num.activity,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.age,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list td.age {\n  width: 72px !important;\n  min-width: 64px !important;\n  max-width: 88px !important;\n  text-align: right !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .posters,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .topic-posters,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .topic-creator-data,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .topic-status-data,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .topic-category-data,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .topic-likes-replies-data,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list .topic-activity-data,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.posters,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.topic-posters,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.topic-creator-data,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.topic-status-data,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.topic-category-data,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.topic-likes-replies-data,\nbody.ldmy-excel:not(.ldmy-excel-horizon) .topic-list th.topic-activity-data {\n  display: none !important;\n  width: 0 !important;\n  max-width: 0 !important;\n  padding: 0 !important;\n  border: none !important;\n}\n/* Default/Moyu：分类/标签独立列（设置 excelMetaCol 开启） */\nbody.ldmy-excel.ldmy-excel-meta-col:not(.ldmy-excel-horizon) table.topic-list {\n  table-layout: fixed !important;\n  width: 100% !important;\n}\nbody.ldmy-excel.ldmy-excel-meta-col:not(.ldmy-excel-horizon) .topic-list th.ldmy-excel-meta-head,\nbody.ldmy-excel.ldmy-excel-meta-col:not(.ldmy-excel-horizon) .topic-list td.ldmy-excel-meta-cell {\n  /* 略加宽分类列，标题列自动让出一点点（table-layout: fixed） */\n  width: 236px !important;\n  min-width: 200px !important;\n  max-width: 280px !important;\n  padding: 2px 8px !important;\n  overflow: hidden !important;\n  vertical-align: middle !important;\n}\nbody.ldmy-excel.ldmy-excel-meta-col:not(.ldmy-excel-horizon) .topic-list td.ldmy-excel-meta-cell .link-bottom-line {\n  display: flex !important;\n  flex-wrap: nowrap !important;\n  align-items: center !important;\n  gap: 4px !important;\n  margin: 0 !important;\n  max-width: 100% !important;\n  overflow: hidden !important;\n  opacity: 0.8 !important;\n  line-height: 1.2 !important;\n}\nbody.ldmy-excel.ldmy-excel-meta-col:not(.ldmy-excel-horizon) .topic-list td.ldmy-excel-meta-cell .badge-category__wrapper,\nbody.ldmy-excel.ldmy-excel-meta-col:not(.ldmy-excel-horizon) .topic-list td.ldmy-excel-meta-cell .badge-category {\n  max-width: 11em !important;\n}\nbody.ldmy-excel.ldmy-excel-meta-col:not(.ldmy-excel-horizon) .topic-list td.ldmy-excel-meta-cell .discourse-tags {\n  display: inline-flex !important;\n  flex-wrap: nowrap !important;\n  gap: 2px !important;\n  max-width: 55% !important;\n  overflow: hidden !important;\n}\n\n/* 经典列表：元数据前置时，数字列靠左更紧凑，标题仍吃剩余宽度 */\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list th.posts,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list td.posts,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list .posts-map,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list th.num.posts,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list td.num.posts,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list th.views,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list td.views,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list th.num.views,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list td.num.views,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list th.activity,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list td.activity,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list th.num.activity,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list td.num.activity,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list th.age,\nbody.ldmy-excel.ldmy-excel-meta-leading:not(.ldmy-excel-horizon) .topic-list td.age {\n  text-align: center !important;\n}\n\n/* boost 批注：Word 风格（仅 Excel + 设置开启）\n * 约束：\n * 1) 只作用在 .discourse-boosts*，不给正文/父容器刷白底\n * 2) 不做整列虚线轨（避免左侧长红线）\n * 3) 头像跟随 hideAvatar：显示原头像 / 隐藏时用多色人物标\n */\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__post-menu {\n  position: relative !important;\n  margin: 6px 0 4px !important;\n  padding: 0 !important;\n  background: transparent !important;\n  border: none !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts,\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__list {\n  position: relative !important;\n  background: transparent !important;\n  border: none !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__list {\n  display: flex !important;\n  flex-direction: column !important;\n  align-items: stretch !important;\n  gap: 8px !important;\n  max-width: min(380px, 100%) !important;\n  margin-left: auto !important;\n  padding: 0 !important;\n}\n/* 单条批注：左红竖条 + 头像/人物标 + 文本 + 回复角标 */\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble {\n  position: relative !important;\n  display: flex !important;\n  align-items: flex-start !important;\n  gap: 8px !important;\n  width: 100% !important;\n  max-width: 100% !important;\n  margin: 0 !important;\n  padding: 1px 2px 1px 10px !important;\n  border: none !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n  line-height: 1.35 !important;\n  color: #222 !important;\n}\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble::before {\n  content: \"\" !important;\n  position: absolute !important;\n  left: 0 !important;\n  top: 0 !important;\n  bottom: 0 !important;\n  width: 2px !important;\n  background: #c00000 !important;\n  border-radius: 1px !important;\n  pointer-events: none !important;\n}\n/* 右侧回复角标（仅装饰，不挡点击） */\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble::after {\n  content: \"\" !important;\n  flex: 0 0 auto !important;\n  width: 12px !important;\n  height: 12px !important;\n  margin-top: 3px !important;\n  margin-left: auto !important;\n  background-color: #6b6b6b !important;\n  -webkit-mask: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='black' d='M6.5 2.5v2.2C4.1 5 2.4 6.7 2 9.4c.9-1.1 2.1-1.7 3.6-1.7h.9V10L10.8 6 6.5 2.5z'/></svg>\") center / contain no-repeat !important;\n  mask: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='black' d='M6.5 2.5v2.2C4.1 5 2.4 6.7 2 9.4c.9-1.1 2.1-1.7 3.6-1.7h.9V10L10.8 6 6.5 2.5z'/></svg>\") center / contain no-repeat !important;\n  opacity: 0.72 !important;\n  pointer-events: none !important;\n}\n/* 头像锚点：固定尺寸，避免隐藏 img 后塌陷 */\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble > a[data-user-card],\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble > a.avatar,\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble a:has(> img.avatar) {\n  position: relative !important;\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  flex: 0 0 auto !important;\n  width: 16px !important;\n  height: 16px !important;\n  min-width: 16px !important;\n  min-height: 16px !important;\n  margin: 2px 0 0 !important;\n  padding: 0 !important;\n  border-radius: 2px !important;\n  overflow: hidden !important;\n  background: transparent !important;\n  box-shadow: none !important;\n}\n/* 显示头像：用原图 */\nbody.ldmy-excel.ldmy-boost-annotation:not(.ldmy-hide-avatar) .discourse-boosts__bubble img.avatar {\n  display: block !important;\n  width: 16px !important;\n  height: 16px !important;\n  margin: 0 !important;\n  border-radius: 2px !important;\n  object-fit: cover !important;\n  opacity: 1 !important;\n  visibility: visible !important;\n}\n/* 隐藏头像：多色人物标（Word 多作者批注色） */\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__bubble > a[data-user-card],\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__bubble > a.avatar,\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__bubble a:has(> img.avatar) {\n  background: #c00000 !important;\n}\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 1) > a[data-user-card],\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 1) > a.avatar,\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 1) a:has(> img.avatar) {\n  background: #c00000 !important;\n}\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 2) > a[data-user-card],\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 2) > a.avatar,\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 2) a:has(> img.avatar) {\n  background: #5b2c6f !important;\n}\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 3) > a[data-user-card],\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 3) > a.avatar,\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 3) a:has(> img.avatar) {\n  background: #1f4e79 !important;\n}\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 4) > a[data-user-card],\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 4) > a.avatar,\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 4) a:has(> img.avatar) {\n  background: #1e7a46 !important;\n}\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 5) > a[data-user-card],\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 5) > a.avatar,\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 5) a:has(> img.avatar) {\n  background: #b85c00 !important;\n}\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 6) > a[data-user-card],\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 6) > a.avatar,\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__list > .discourse-boosts__bubble:nth-child(6n + 6) a:has(> img.avatar) {\n  background: #0e7c7b !important;\n}\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__bubble > a[data-user-card]::after,\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__bubble > a.avatar::after,\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__bubble a:has(> img.avatar)::after {\n  content: \"\" !important;\n  position: absolute !important;\n  inset: 0 !important;\n  background-color: #fff !important;\n  -webkit-mask: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='5.2' r='2.4' fill='black'/><path fill='black' d='M3.2 13.2c.4-2.6 2.2-3.8 4.8-3.8s4.4 1.2 4.8 3.8H3.2z'/></svg>\") center / 11px 11px no-repeat !important;\n  mask: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='5.2' r='2.4' fill='black'/><path fill='black' d='M3.2 13.2c.4-2.6 2.2-3.8 4.8-3.8s4.4 1.2 4.8 3.8H3.2z'/></svg>\") center / 11px 11px no-repeat !important;\n  pointer-events: none !important;\n}\nbody.ldmy-excel.ldmy-hide-avatar.ldmy-boost-annotation .discourse-boosts__bubble img.avatar {\n  display: none !important;\n}\n/* 文本：透明底，避免盖住 Excel 深色阅读面 */\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__cooked {\n  flex: 1 1 auto !important;\n  min-width: 0 !important;\n  display: block !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: none !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n  text-align: left !important;\n  color: #222 !important;\n  font-weight: 400 !important;\n  font-size: inherit !important;\n  line-height: 1.35 !important;\n  cursor: pointer !important;\n}\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__cooked p {\n  display: inline !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  color: inherit !important;\n  white-space: normal !important;\n  word-break: break-word !important;\n  background: transparent !important;\n}\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__cooked img.emoji {\n  width: 14px !important;\n  height: 14px !important;\n  vertical-align: -2px !important;\n}\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble.--actionable:hover,\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble.--actionable:hover .discourse-boosts__cooked,\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble.--actionable:hover .discourse-boosts__cooked p {\n  background: transparent !important;\n  color: #000 !important;\n}\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__bubble.--actionable:hover::before {\n  background: #a00000 !important;\n}\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__add-btn {\n  align-self: flex-end !important;\n  margin-top: 2px !important;\n  padding: 0 2px !important;\n  border: none !important;\n  background: transparent !important;\n  color: #666 !important;\n}\nbody.ldmy-excel.ldmy-boost-annotation .discourse-boosts__add-btn:hover {\n  color: #c00000 !important;\n  background: transparent !important;\n}\n\n/* 暗色：批注容器跟楼层底栏同色，避免透出白底；气泡本身仍无底 */\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__post-menu,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__list {\n  background: #1e1e1e !important;\n  border-color: transparent !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__bubble,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__cooked {\n  background: transparent !important;\n  border-color: transparent !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__bubble {\n  color: #e8e8e8 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__bubble::before {\n  background: #e06666 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__bubble::after {\n  background-color: #bdbdbd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__cooked,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__cooked p {\n  color: #e8e8e8 !important;\n  background: transparent !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__bubble.--actionable:hover,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__bubble.--actionable:hover .discourse-boosts__cooked,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__bubble.--actionable:hover .discourse-boosts__cooked p {\n  color: #fff !important;\n  background: transparent !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__add-btn {\n  color: #bbb !important;\n  background: transparent !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-boost-annotation .discourse-boosts__add-btn:hover {\n  color: #e06666 !important;\n}\n\n";

	const gridSearchCss = "/* ===================== 全页搜索（search-container / fps-result）表格化 ===================== */\nbody.ldmy-excel .search-container,\nbody.ldmy-excel .search-advanced,\nbody.ldmy-excel .search-results,\nbody.ldmy-excel .fps-result-entries {\n  width: 100% !important;\n  max-width: none !important;\n  margin: 0 !important;\n  box-sizing: border-box !important;\n  background: #fff !important;\n  box-shadow: none !important;\n  border-radius: 0 !important;\n}\nbody.ldmy-excel .search-container {\n  padding: 0 !important;\n  border: none !important;\n}\n/* 顶部筛选条：贴近 Excel 筛选行 */\nbody.ldmy-excel .search-header,\nbody.ldmy-excel .search-advanced .search-info {\n  margin: 0 !important;\n  padding: 6px 10px !important;\n  background: #f3f3f3 !important;\n  border-bottom: 1px solid #bbb !important;\n  border-radius: 0 !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel .search-page-heading,\nbody.ldmy-excel .search-page-heading h1,\nbody.ldmy-excel .result-count {\n  margin: 0 0 6px !important;\n  padding: 0 !important;\n  font-size: calc(13px + var(--ldmy-font-offset, 0px)) !important;\n  font-weight: 600 !important;\n  line-height: 1.35 !important;\n  color: #1a3959 !important;\n}\nbody.ldmy-excel .search-page-heading .term {\n  color: var(--ldmy-excel-accent, #1e6fff) !important;\n  font-weight: 600 !important;\n}\nbody.ldmy-excel .search-bar {\n  display: flex !important;\n  flex-wrap: wrap !important;\n  align-items: center !important;\n  gap: 6px !important;\n  margin: 0 !important;\n  padding: 0 !important;\n}\nbody.ldmy-excel .search-bar .full-page-search,\nbody.ldmy-excel .search-bar input.search-query,\nbody.ldmy-excel .search-bar input[type=\"search\"] {\n  flex: 1 1 220px !important;\n  min-width: 160px !important;\n  height: 28px !important;\n  min-height: 28px !important;\n  margin: 0 !important;\n  padding: 2px 8px !important;\n  border: 1px solid #c6c6c6 !important;\n  border-radius: 0 !important;\n  background: #fff !important;\n  box-shadow: none !important;\n  color: #222 !important;\n}\nbody.ldmy-excel .search-bar .select-kit .select-kit-header,\nbody.ldmy-excel .search-bar .combo-box .select-kit-header,\nbody.ldmy-excel .search-info .select-kit .select-kit-header {\n  min-height: 28px !important;\n  height: auto !important;\n  border-radius: 0 !important;\n  border: 1px solid #c6c6c6 !important;\n  background: #fff !important;\n  box-shadow: none !important;\n  padding: 0 8px !important;\n}\nbody.ldmy-excel .search-bar .search-cta,\nbody.ldmy-excel .search-bar .btn-primary.search-cta,\nbody.ldmy-excel .search-filters .btn,\nbody.ldmy-excel .advanced-filters__toggle {\n  min-height: 28px !important;\n  height: auto !important;\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  border: 1px solid #8eb6e8 !important;\n  background: #fff !important;\n  color: #1a3959 !important;\n  font-weight: 400 !important;\n  padding: 0 10px !important;\n}\nbody.ldmy-excel .search-bar .search-cta:hover,\nbody.ldmy-excel .search-filters .btn:hover,\nbody.ldmy-excel .advanced-filters__toggle:hover {\n  background: #e8eef8 !important;\n  border-color: #8eb6e8 !important;\n}\nbody.ldmy-excel .search-filters,\nbody.ldmy-excel .advanced-filters {\n  margin: 6px 0 0 !important;\n  padding: 0 !important;\n  gap: 8px !important;\n  align-items: center !important;\n}\nbody.ldmy-excel .semantic-search__container,\nbody.ldmy-excel .semantic-search__results,\nbody.ldmy-excel .semantic-search__searching {\n  color: #666 !important;\n}\nbody.ldmy-excel .search-info {\n  display: flex !important;\n  align-items: center !important;\n  justify-content: flex-end !important;\n  gap: 8px !important;\n}\nbody.ldmy-excel .search-info label {\n  margin: 0 !important;\n  color: #555 !important;\n}\nbody.ldmy-excel .search-advanced {\n  border-top: none !important;\n}\n/* 结果行：像表格行 */\nbody.ldmy-excel .fps-result-entries {\n  display: block !important;\n  counter-reset: ldmy-search-row;\n  border-top: 1px solid #bbb !important;\n}\nbody.ldmy-excel .fps-result {\n  display: grid !important;\n  grid-template-columns: minmax(0, 1fr) !important;\n  align-items: stretch !important;\n  gap: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: none !important;\n  border-bottom: 1px solid #bbb !important;\n  border-radius: 0 !important;\n  background: #fff !important;\n  box-shadow: none !important;\n  position: relative !important;\n}\nbody.ldmy-excel.ldmy-excel-rows .fps-result {\n  grid-template-columns: 48px minmax(0, 1fr) !important;\n}\nbody.ldmy-excel.ldmy-excel-rows .fps-result::before {\n  content: counter(ldmy-search-row);\n  counter-increment: ldmy-search-row;\n  display: flex;\n  align-items: flex-start;\n  justify-content: center;\n  padding-top: 8px;\n  width: 48px;\n  min-width: 48px;\n  max-width: 56px;\n  color: #777;\n  font-size: calc(13px + var(--ldmy-font-offset, 0px));\n  font-variant-numeric: tabular-nums;\n  background: #e8e8e8;\n  border-right: 1px solid #bbb;\n  box-sizing: border-box;\n  grid-row: 1 / span 20;\n}\nbody.ldmy-excel .fps-result:hover {\n  background: #eef5ff !important;\n}\nbody.ldmy-excel .fps-result.ldmy-excel-row-active {\n  background: #dcecfc !important;\n  outline: 1px solid var(--ldmy-excel-accent, #1e6fff);\n  outline-offset: -1px;\n}\nbody.ldmy-excel .fps-result > .author {\n  display: none !important;\n}\nbody.ldmy-excel .fps-result .fps-topic,\nbody.ldmy-excel .fps-result .topic {\n  min-width: 0 !important;\n  margin: 0 !important;\n  padding: 6px 10px 4px !important;\n  border: none !important;\n  background: transparent !important;\n}\nbody.ldmy-excel .fps-result .search-link,\nbody.ldmy-excel .fps-result .topic-title,\nbody.ldmy-excel .fps-result .topic-title span {\n  font-family: inherit !important;\n  font-weight: 400 !important;\n  line-height: 1.35 !important;\n  color: #1a3959 !important;\n  -webkit-font-smoothing: antialiased;\n}\nbody.ldmy-excel .fps-result .search-link:hover .topic-title,\nbody.ldmy-excel .fps-result .search-link:hover {\n  color: var(--ldmy-excel-accent, #1e6fff) !important;\n  text-decoration: none !important;\n}\nbody.ldmy-excel .fps-result .topic-statuses {\n  display: none !important;\n}\nbody.ldmy-excel .fps-result .search-category {\n  display: flex !important;\n  flex-wrap: nowrap !important;\n  align-items: center !important;\n  gap: 4px !important;\n  margin-top: 2px !important;\n  max-width: 100% !important;\n  overflow: hidden !important;\n  opacity: 0.72 !important;\n  line-height: 1.2 !important;\n}\nbody.ldmy-excel .fps-result .badge-category__wrapper,\nbody.ldmy-excel .fps-result .badge-category {\n  border-radius: 2px !important;\n  max-width: 9em !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel .fps-result .discourse-tags {\n  display: inline-flex !important;\n  flex-wrap: nowrap !important;\n  gap: 2px !important;\n  max-width: 60% !important;\n  overflow: hidden !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  list-style: none !important;\n}\nbody.ldmy-excel .fps-result .discourse-tag,\nbody.ldmy-excel .fps-result .discourse-tags .discourse-tag {\n  margin: 0 2px 0 0 !important;\n  border-radius: 2px !important;\n  background: #f0f0f0 !important;\n  color: #888 !important;\n  border: 1px solid #e4e4e4 !important;\n  box-shadow: none !important;\n  max-width: 7em !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n}\nbody.ldmy-excel .fps-result .blurb {\n  margin: 0 !important;\n  padding: 0 10px 6px !important;\n  line-height: 1.35 !important;\n  color: #666 !important;\n  max-height: 2.8em !important;\n  overflow: hidden !important;\n  display: -webkit-box !important;\n  -webkit-line-clamp: 2 !important;\n  -webkit-box-orient: vertical !important;\n}\nbody.ldmy-excel .fps-result .blurb .date,\nbody.ldmy-excel .fps-result .blurb .relative-date {\n  color: #888 !important;\n  font-variant-numeric: tabular-nums;\n}\nbody.ldmy-excel .fps-result .ai-result__icon,\nbody.ldmy-excel .fps-result .bulk-select {\n  display: none !important;\n}\n/* compact 搜索行再压一档 */\nbody.ldmy-compact.ldmy-excel .fps-result .fps-topic,\nbody.ldmy-compact.ldmy-excel .fps-result .topic {\n  padding-top: 4px !important;\n  padding-bottom: 2px !important;\n}\nbody.ldmy-compact.ldmy-excel .fps-result .blurb {\n  max-height: 1.35em !important;\n  -webkit-line-clamp: 1 !important;\n  padding-bottom: 4px !important;\n}\n/* 腾讯主题边框更浅 */\nbody.ldmy-excel-tencent .fps-result,\nbody.ldmy-excel-tencent .search-header,\nbody.ldmy-excel-tencent .search-advanced .search-info,\nbody.ldmy-excel-tencent .fps-result-entries {\n  border-color: #ebebeb !important;\n}\nbody.ldmy-excel-tencent.ldmy-excel-rows .fps-result::before {\n  background: #f9fafb !important;\n  border-color: #ebebeb !important;\n}\n/* Office 选中/悬停色 */\nbody.ldmy-excel-office .fps-result:hover {\n  background: #e7f4ea !important;\n}\nbody.ldmy-excel-office .fps-result.ldmy-excel-row-active {\n  background: #dceaf0 !important;\n  outline-color: #217346;\n}\n.fps-result.ldmy-kw-blocked { display: none !important; }\n\n/* 帖内楼层：行号 | 作者信息 | 正文（扁平表格）\n   注意：选择器避免命中 .embedded-posts 内的 .row/.topic-body，否则嵌套回复会乱 */\nbody.ldmy-excel {\n  --ldmy-floor-col: 42px;\n  --ldmy-user-col: 240px; /* 两行身份后可收窄 */\n  --ldmy-avatar-size: 32px;\n  --ldmy-avatar-left: 10px;\n  --ldmy-avatar-gap: 8px;\n  /* 帖内表格表面色：深色模式只改 token，避免再被高特异性浅色规则盖住 */\n  --ldmy-surface: #fff;\n  --ldmy-surface-muted: #fafafa;\n  --ldmy-surface-soft: #f5f5f5;\n  --ldmy-surface-row: #e8e8e8;\n  --ldmy-surface-chip: #f7f9fc;\n  --ldmy-border-soft: #bbb;\n  --ldmy-border-faint: #eee;\n  --ldmy-text-body: #222;\n  --ldmy-text-dim: #777;\n  --ldmy-text-link: #1a3959;\n}\nbody.ldmy-excel.ldmy-compact {\n  --ldmy-floor-col: 36px;\n  --ldmy-user-col: 220px;\n  --ldmy-avatar-size: 28px;\n}\nbody.ldmy-excel .topic-post {\n  display: grid !important;\n  grid-template-columns: minmax(0, 1fr) !important;\n  border: none !important;\n  border-bottom: 1px solid var(--ldmy-border-soft, #bbb) !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  background: var(--ldmy-surface, #fff) !important;\n  box-shadow: none !important;\n  border-radius: 0 !important;\n}\nbody.ldmy-excel.ldmy-excel-rows .topic-post {\n  grid-template-columns: var(--ldmy-floor-col) minmax(0, 1fr) !important;\n}\nbody.ldmy-excel .topic-post::before {\n  content: none;\n  display: none;\n}\nbody.ldmy-excel.ldmy-excel-rows .topic-post::before {\n  content: counter(ldmy-floor);\n  counter-increment: ldmy-floor;\n  display: flex;\n  align-items: flex-start;\n  justify-content: center;\n  padding-top: 6px;\n  width: var(--ldmy-floor-col);\n  min-width: var(--ldmy-floor-col);\n  color: var(--ldmy-text-dim, #777);\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  background: var(--ldmy-surface-row, #e8e8e8);\n  border-right: 1px solid var(--ldmy-border-soft, #bbb);\n  grid-row: 1 / -1;\n  box-sizing: border-box;\n}\nbody.ldmy-excel.ldmy-excel-rows .container.posts,\nbody.ldmy-excel.ldmy-excel-rows .post-stream {\n  counter-reset: ldmy-floor;\n}\n\n/* 主楼层 row：不要用 .topic-post .row（会打到嵌套回复） */\nbody.ldmy-excel .topic-post > article,\nbody.ldmy-excel .topic-post > .row,\nbody.ldmy-excel .topic-post > article > .post__row,\nbody.ldmy-excel .topic-post > article > .row {\n  display: block !important;\n  width: 100% !important;\n  max-width: none !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  float: none !important;\n  min-width: 0 !important;\n  box-sizing: border-box !important;\n  position: relative !important;\n}\n\n/* 默认 Excel 藏头像；关闭「隐藏头像」时头像在昵称左侧（同一行起点） */\nbody.ldmy-excel .topic-post > article > .post__row > .topic-avatar,\nbody.ldmy-excel .topic-post > article > .row > .topic-avatar,\nbody.ldmy-excel .topic-post > article > .post__row > .post-avatar,\nbody.ldmy-excel .topic-post > article > .row > .post-avatar {\n  display: none !important;\n}\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row {\n  display: grid !important;\n  grid-template-columns: var(--ldmy-user-col) minmax(0, 1fr) !important;\n  grid-template-rows: auto;\n  position: relative !important;\n}\nbody.ldmy-excel .topic-post > article > .post__row,\nbody.ldmy-excel .topic-post > article > .row {\n  position: relative !important;\n}\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .topic-avatar,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .topic-avatar,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .post-avatar,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .post-avatar {\n  display: flex !important;\n  grid-column: 1;\n  grid-row: 1;\n  align-items: flex-start;\n  justify-content: flex-start;\n  width: var(--ldmy-avatar-size) !important;\n  min-width: var(--ldmy-avatar-size) !important;\n  max-width: var(--ldmy-avatar-size) !important;\n  height: var(--ldmy-avatar-size) !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  overflow: visible !important;\n  background: transparent !important;\n  border: none !important;\n  z-index: 3;\n  pointer-events: auto;\n  /* 钉在用户列左侧，与昵称第一行对齐 */\n  position: absolute !important;\n  top: 10px !important;\n  left: var(--ldmy-avatar-left) !important;\n  bottom: auto !important;\n  right: auto !important;\n  transform: none !important;\n}\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .topic-avatar .post-avatar,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .topic-avatar .post-avatar {\n  display: block !important;\n  width: var(--ldmy-avatar-size) !important;\n  min-width: var(--ldmy-avatar-size) !important;\n  height: var(--ldmy-avatar-size) !important;\n  margin: 0 !important;\n  padding: 0 !important;\n}\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .topic-avatar img.avatar,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .topic-avatar img.avatar,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .post-avatar img.avatar,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .post-avatar img.avatar {\n  display: block !important;\n  width: var(--ldmy-avatar-size) !important;\n  height: var(--ldmy-avatar-size) !important;\n  max-width: var(--ldmy-avatar-size) !important;\n  border-radius: 4px !important;\n  box-shadow: none !important;\n}\n/* 关掉站点 sticky-avatar，防止头像乱跑 */\nbody.ldmy-excel .topic-post.sticky-avatar > article > .row > .topic-avatar,\nbody.ldmy-excel .topic-post.post--sticky-avatar > article > .row > .topic-avatar,\nbody.ldmy-excel .topic-post.sticky-avatar > article > .post__row > .topic-avatar,\nbody.ldmy-excel .topic-post.post--sticky-avatar > article > .post__row > .topic-avatar {\n  position: absolute !important;\n  top: 10px !important;\n  left: var(--ldmy-avatar-left) !important;\n  bottom: auto !important;\n  margin: 0 !important;\n  transform: none !important;\n}\nbody.ldmy-excel .topic-avatar .avatar-flair,\nbody.ldmy-excel .post-avatar .avatar-flair {\n  display: none !important;\n}\n\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .topic-body,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .topic-body,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .post__body,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .post__body {\n  grid-column: 1 / -1;\n  grid-row: 1;\n}\n\n/* 主帖 topic-body 双列（不含 embedded 内的 topic-body） */\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body,\nbody.ldmy-excel .topic-post > article > .row > .topic-body,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body,\nbody.ldmy-excel .topic-post > article > .row > .post__body,\nbody.ldmy-excel .topic-post > article > .topic-body,\nbody.ldmy-excel .topic-post > article > .post__body {\n  display: grid !important;\n  grid-template-columns: var(--ldmy-user-col) minmax(0, 1fr) !important;\n  grid-template-rows: auto auto auto auto !important;\n  width: 100% !important;\n  max-width: none !important;\n  min-width: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  float: none !important;\n  border: none !important;\n  border-right: 1px solid var(--ldmy-border-soft, #bbb) !important;\n  background: var(--ldmy-surface, #fff) !important;\n  box-sizing: border-box !important;\n  box-shadow: none !important;\n  border-radius: 0 !important;\n}\n/* 作者信息列：身份信息尽量一行（贴近原站），过长才换行 */\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > .topic-meta-data,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > .topic-meta-data,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > .topic-meta-data,\nbody.ldmy-excel .topic-post > article > .row > .post__body > .topic-meta-data,\nbody.ldmy-excel .topic-post > article > .topic-body > .topic-meta-data,\nbody.ldmy-excel .topic-post > article > .post__body > .topic-meta-data {\n  grid-column: 1;\n  grid-row: 1 / -1;\n  display: flex !important;\n  flex-direction: column !important;\n  align-items: flex-start !important;\n  justify-content: flex-start !important;\n  gap: 4px !important;\n  width: var(--ldmy-user-col) !important;\n  min-width: var(--ldmy-user-col) !important;\n  max-width: var(--ldmy-user-col) !important;\n  margin: 0 !important;\n  padding: 8px 10px !important;\n  background: var(--ldmy-surface-muted, #fafafa) !important;\n  border-right: 1px solid var(--ldmy-border-soft, #bbb) !important;\n  border-bottom: none !important;\n  box-sizing: border-box !important;\n  float: none !important;\n  position: relative !important;\n  overflow: hidden !important; /* 防长昵称撑破列 */\n  color: var(--ldmy-text-dim, #777) !important;\n}\n/* 显示头像：左侧让出头像位，昵称与头像同一行起点，不再被遮挡 */\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .topic-body > .topic-meta-data,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .topic-body > .topic-meta-data,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .post__body > .topic-meta-data,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .post__body > .topic-meta-data,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .topic-body > .topic-meta-data,\nbody.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__body > .topic-meta-data {\n  padding-top: 10px !important;\n  padding-left: calc(var(--ldmy-avatar-left) + var(--ldmy-avatar-size) + var(--ldmy-avatar-gap)) !important;\n}\n/* 用户信息两行：\n   1) 昵称 + id\n   2) 称号 + 表情/徽章 + 楼主(末尾)\n   用 ::before 强制换行；未识别子节点默认 order 10 落在第 2 行 */\nbody.ldmy-excel .topic-post > article .names {\n  line-height: 1.35 !important;\n  display: flex !important;\n  flex-direction: row !important;\n  flex-wrap: wrap !important;\n  align-items: center !important;\n  align-content: flex-start !important;\n  gap: 2px 6px !important;\n  margin: 0 !important;\n  width: 100% !important;\n  min-width: 0 !important;\n  max-width: 100% !important;\n}\nbody.ldmy-excel .topic-post > article .names > * {\n  order: 10 !important;\n  flex: 0 1 auto;\n  min-width: 0;\n  max-width: 100%;\n}\n/* 第 1 行：昵称、id */\nbody.ldmy-excel .topic-post > article .names > .first,\nbody.ldmy-excel .topic-post > article .names > span.first {\n  order: 1 !important;\n}\nbody.ldmy-excel .topic-post > article .names > .second,\nbody.ldmy-excel .topic-post > article .names > span.second {\n  order: 2 !important;\n}\nbody.ldmy-excel .topic-post > article .names > .first,\nbody.ldmy-excel .topic-post > article .names > .first a,\nbody.ldmy-excel .topic-post > article .names > span.first,\nbody.ldmy-excel .topic-post > article .names > span.first a {\n  font-weight: 600 !important;\n  color: var(--ldmy-text-link, #1a3959) !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n}\nbody.ldmy-excel .topic-post > article .names > .second,\nbody.ldmy-excel .topic-post > article .names > .second a,\nbody.ldmy-excel .topic-post > article .names > span.second,\nbody.ldmy-excel .topic-post > article .names > span.second a {\n  font-weight: 400 !important;\n  color: var(--ldmy-text-dim, #777) !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n}\n/* 强制换到第 2 行 */\nbody.ldmy-excel .topic-post > article .names::before {\n  content: '' !important;\n  order: 3 !important;\n  flex: 0 0 100% !important;\n  width: 100% !important;\n  height: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n  overflow: hidden !important;\n  pointer-events: none !important;\n}\n/* 第 2 行：称号 → 表情/徽章 → 楼主(::after order 7) */\nbody.ldmy-excel .topic-post > article .names > .user-title {\n  order: 5 !important;\n  font-weight: 400 !important;\n  color: var(--ldmy-text-dim, #777) !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n}\nbody.ldmy-excel .topic-post > article .names > .user-status-message-wrap,\nbody.ldmy-excel .topic-post > article .names > .user-status,\nbody.ldmy-excel .topic-post > article .names > .poster-icon-container,\nbody.ldmy-excel .topic-post > article .names > .badge-group,\nbody.ldmy-excel .topic-post > article .names > .user-badge,\nbody.ldmy-excel .topic-post > article .names > .poster-avatar-extra {\n  order: 6 !important;\n  display: inline-flex !important;\n  flex-wrap: wrap !important;\n  align-items: center !important;\n  gap: 2px !important;\n  max-width: 100% !important;\n  margin: 0 !important;\n  vertical-align: middle !important;\n}\nbody.ldmy-excel .topic-post > article .names .poster-icon-container,\nbody.ldmy-excel .topic-post > article .names .user-status-message-wrap,\nbody.ldmy-excel .topic-post > article .names .user-status,\nbody.ldmy-excel .topic-post > article .names .badge-group,\nbody.ldmy-excel .topic-post > article .names .user-badge {\n  display: inline-flex !important;\n  flex-wrap: wrap !important;\n  align-items: center !important;\n  gap: 2px !important;\n}\nbody.ldmy-excel .topic-post > article .names .poster-icon-container img,\nbody.ldmy-excel .topic-post > article .names .user-status img,\nbody.ldmy-excel .topic-post > article .names .user-status-message-wrap img,\nbody.ldmy-excel .topic-post > article .names .user-badge img,\nbody.ldmy-excel .topic-post > article .names img.emoji {\n  width: 16px !important;\n  height: 16px !important;\n  max-width: 16px !important;\n  vertical-align: middle !important;\n}\n/* 时间 / 回复谁：身份行下方 */\nbody.ldmy-excel .topic-post > article .post-infos,\nbody.ldmy-excel .topic-post > article .post-info,\nbody.ldmy-excel .topic-post > article .post-date,\nbody.ldmy-excel .topic-post > article .topic-meta-data .post-info {\n  color: var(--ldmy-text-dim, #777) !important;\n  margin: 0 !important;\n  opacity: 1 !important;\n  font-size: 12px !important;\n  line-height: 1.3 !important;\n}\nbody.ldmy-excel .topic-post > article .topic-meta-data > .post-infos {\n  display: flex !important;\n  flex-direction: column !important;\n  align-items: flex-start !important;\n  gap: 2px !important;\n  width: 100% !important;\n  min-width: 0 !important;\n  order: 10;\n}\nbody.ldmy-excel .topic-post > article .topic-meta-data .reply-to-tab {\n  display: inline-flex !important;\n  align-items: center !important;\n  gap: 4px !important;\n  max-width: 100% !important;\n  margin: 0 !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n  color: var(--ldmy-text-dim, #777) !important;\n  font-size: 12px !important;\n}\n/* 引用回复：彻底隐藏被引用楼层作者头像，只留箭头+名字，避免错位 */\nbody.ldmy-excel .topic-post > article .topic-meta-data .reply-to-tab img,\nbody.ldmy-excel .topic-post > article .topic-meta-data .reply-to-tab img.avatar,\nbody.ldmy-excel .reply-to-tab img.avatar {\n  display: none !important;\n  width: 0 !important;\n  height: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n}\n\n/* 主帖 topic-body 的非作者列子项一律进正文列，避免 boost/embedded 等落到用户列 */\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > :not(.topic-meta-data),\nbody.ldmy-excel .topic-post > article > .row > .topic-body > :not(.topic-meta-data),\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > :not(.topic-meta-data),\nbody.ldmy-excel .topic-post > article > .row > .post__body > :not(.topic-meta-data),\nbody.ldmy-excel .topic-post > article > .topic-body > :not(.topic-meta-data),\nbody.ldmy-excel .topic-post > article > .post__body > :not(.topic-meta-data) {\n  grid-column: 2;\n  min-width: 0 !important;\n  max-width: none !important;\n  box-sizing: border-box !important;\n}\n\n/* 正文列 */\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > .regular,\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > .contents,\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > .post__regular,\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > .post__contents,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > .regular,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > .contents,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > .post__regular,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > .post__contents,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > .regular,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > .contents,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > .post__regular,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > .post__contents,\nbody.ldmy-excel .topic-post > article > .row > .post__body > .regular,\nbody.ldmy-excel .topic-post > article > .row > .post__body > .contents,\nbody.ldmy-excel .topic-post > article > .row > .post__body > .post__regular,\nbody.ldmy-excel .topic-post > article > .row > .post__body > .post__contents {\n  grid-column: 2;\n  grid-row: 1;\n  width: auto !important;\n  max-width: none !important;\n  min-width: 0 !important;\n  margin: 0 !important;\n  padding: 6px 10px 2px !important;\n  float: none !important;\n  box-sizing: border-box !important;\n  background: var(--ldmy-surface, #fff) !important;\n  color: var(--ldmy-text-body, #222) !important;\n}\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > .post-menu-area,\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > .post__menu-area,\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > section.post-menu-area,\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > section.post__menu-area,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > .post-menu-area,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > .post__menu-area,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > section.post-menu-area,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > section.post__menu-area,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > .post-menu-area,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > .post__menu-area,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > section.post-menu-area,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > section.post__menu-area,\nbody.ldmy-excel .topic-post > article > .row > .post__body > .post-menu-area,\nbody.ldmy-excel .topic-post > article > .row > .post__body > .post__menu-area,\nbody.ldmy-excel .topic-post > article > .row > .post__body > section.post-menu-area,\nbody.ldmy-excel .topic-post > article > .row > .post__body > section.post__menu-area {\n  grid-column: 2;\n  grid-row: 2;\n  width: auto !important;\n  max-width: none !important;\n  margin: 0 !important;\n  padding: 0 6px 2px !important;\n  background: var(--ldmy-surface, #fff) !important;\n  border: none !important;\n  box-sizing: border-box !important;\n  color: var(--ldmy-text-dim, #777) !important;\n}\nbody.ldmy-excel .topic-body > .topic-meta-data .post__contents .cooked,\nbody.ldmy-excel .post__body > .topic-meta-data .post__contents .cooked,\nbody.ldmy-excel .topic-body > .post__contents .cooked,\nbody.ldmy-excel .post__body > .post__contents .cooked,\nbody.ldmy-excel .topic-body > .contents .cooked,\nbody.ldmy-excel .post__body > .contents .cooked {\n  margin: 0 !important;\n}\nbody.ldmy-excel .cooked {\n  line-height: 1.35 !important;\n  color: var(--ldmy-text-body, #222) !important;\n  max-width: none !important;\n  background: transparent !important;\n}\nbody.ldmy-excel .cooked p {\n  margin: 0 0 0.28em !important;\n}\nbody.ldmy-excel .cooked p:last-child {\n  margin-bottom: 0 !important;\n}\nbody.ldmy-excel .cooked img {\n  border-radius: 0 !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel .cooked blockquote,\nbody.ldmy-excel .cooked aside.quote {\n  border: 1px solid var(--ldmy-border-soft, #bbb) !important;\n  border-left: 3px solid #8eb6e8 !important;\n  background: var(--ldmy-surface-muted, #fafafa) !important;\n  border-radius: 0 !important;\n  margin: 3px 0 !important;\n  padding: 3px 6px !important;\n}\nbody.ldmy-excel .post-controls,\nbody.ldmy-excel .post-menu-area .actions,\nbody.ldmy-excel .post__menu-area .actions {\n  gap: 1px !important;\n}\nbody.ldmy-excel .post-controls .btn,\nbody.ldmy-excel .post-menu-area .btn,\nbody.ldmy-excel .post__menu-area .btn {\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  min-height: 28px !important;\n  height: auto !important;\n  padding: 2px 6px !important;\n  background: transparent !important;\n  border: 1px solid transparent !important;\n  color: var(--ldmy-text-dim, #666) !important;\n}\nbody.ldmy-excel .post-controls .btn:hover,\nbody.ldmy-excel .post-menu-area .btn:hover,\nbody.ldmy-excel .post__menu-area .btn:hover {\n  background: var(--ldmy-surface-soft, #eee) !important;\n  border-color: var(--ldmy-border-soft, #ccc) !important;\n}\n/* 弱化楼层内其它论坛装饰 */\nbody.ldmy-excel .topic-post .gap,\nbody.ldmy-excel .time-gap,\nbody.ldmy-excel .small-action {\n  border-bottom: 1px solid var(--ldmy-border-soft, #ddd) !important;\n  background: var(--ldmy-surface-soft, #f5f5f5) !important;\n  margin: 0 !important;\n  border-radius: 0 !important;\n  padding: 4px 8px !important;\n  color: var(--ldmy-text-dim, #777) !important;\n}\nbody.ldmy-excel .topic-post .read-state {\n  display: none !important;\n}\n/* Horizon 空 post-actions */\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > section.post__actions:not(:has(*)),\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > section.post-actions:not(:has(*)),\nbody.ldmy-excel .topic-post > article > .row > .topic-body > section.post__actions:not(:has(*)),\nbody.ldmy-excel .topic-post > article > .row > .topic-body > section.post-actions:not(:has(*)),\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > section.post__actions:not(:has(*)),\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > section.post-actions:not(:has(*)),\nbody.ldmy-excel .topic-post > article > .row > .post__body > section.post__actions:not(:has(*)),\nbody.ldmy-excel .topic-post > article > .row > .post__body > section.post-actions:not(:has(*)),\nbody.ldmy-excel .topic-post > article > section.post__actions:not(:has(*)),\nbody.ldmy-excel .topic-post > article > section.post-actions:not(:has(*)) {\n  display: none !important;\n  height: 0 !important;\n  min-height: 0 !important;\n  max-height: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: none !important;\n  background: transparent !important;\n  overflow: hidden !important;\n  visibility: hidden !important;\n}\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > section.post__actions,\nbody.ldmy-excel .topic-post > article > .post__row > .topic-body > section.post-actions,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > section.post__actions,\nbody.ldmy-excel .topic-post > article > .row > .topic-body > section.post-actions,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > section.post__actions,\nbody.ldmy-excel .topic-post > article > .post__row > .post__body > section.post-actions,\nbody.ldmy-excel .topic-post > article > .row > .post__body > section.post__actions,\nbody.ldmy-excel .topic-post > article > .row > .post__body > section.post-actions {\n  grid-column: 2;\n  grid-row: 3;\n  width: auto !important;\n  max-width: none !important;\n  margin: 0 !important;\n  padding: 0 6px 2px !important;\n  min-height: 0 !important;\n  background: var(--ldmy-surface, #fff) !important;\n  border: none !important;\n  border-top: 1px solid var(--ldmy-border-faint, #eee) !important;\n  box-sizing: border-box !important;\n  color: var(--ldmy-text-dim, #777) !important;\n}\n\n";

	const nestedCss = "/* ========== 嵌套/引用展开 ==========\n   - bottom：展开「N 个回复」\n   - top：点击 reply-to 加载的父帖预览\n   统一做成正文列内的紧凑引用卡片，避免误用主帖用户列两行布局 */\nbody.ldmy-excel .topic-post > article .embedded-posts,\nbody.ldmy-excel .topic-post > article .post__embedded-posts {\n  grid-column: 2 !important;\n  grid-row: auto !important;\n  position: relative !important;\n  max-width: none !important;\n  width: auto !important;\n  margin: 6px 8px 8px !important;\n  padding: 8px 34px 8px 10px !important; /* 右侧给收起按钮留位 */\n  border: 1px solid var(--ldmy-border-soft, #d0d0d0) !important;\n  border-left: 3px solid #8eb6e8 !important;\n  border-radius: 0 !important;\n  background: var(--ldmy-surface-chip, #f7f9fc) !important;\n  box-sizing: border-box !important;\n  clear: both !important;\n  float: none !important;\n  color: var(--ldmy-text-body, #222) !important;\n}\n/* 点击「回复谁」展开的父帖：略收紧，更像引用条 */\nbody.ldmy-excel .topic-post > article .embedded-posts.top,\nbody.ldmy-excel .topic-post > article .post__embedded-posts--top,\nbody.ldmy-excel .topic-post > article .embedded-posts.post__embedded-posts--top {\n  margin: 6px 8px 4px !important;\n  padding: 6px 34px 6px 10px !important;\n  background: var(--ldmy-surface-soft, #f5f7fa) !important;\n  border-left-color: #6a9bd8 !important;\n}\n/* 若嵌在 article 下（不在 topic-body 网格内）：缩进对齐正文列，避免左侧空白断层 */\nbody.ldmy-excel .topic-post > article > .embedded-posts,\nbody.ldmy-excel .topic-post > article > .post__embedded-posts {\n  display: block !important;\n  width: auto !important;\n  margin: 6px 8px 6px calc(var(--ldmy-user-col) + 8px) !important;\n  max-width: none !important;\n  box-sizing: border-box !important;\n}\n/* Excel 兜底：主帖 names 标楼主（排除 embedded），防止 DOM 层级微调后丢失 */\nbody.ldmy-excel.ldmy-highlight-op .topic-post.topic-owner > article .topic-body > .topic-meta-data:not(.embedded-reply) > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.topic-owner > article .post__body > .topic-meta-data:not(.embedded-reply) > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.post--topic-owner > article .topic-body > .topic-meta-data:not(.embedded-reply) > .names::after,\nbody.ldmy-excel.ldmy-highlight-op .topic-post.post--topic-owner > article .post__body > .topic-meta-data:not(.embedded-reply) > .names::after {\n  content: '楼主';\n  display: inline-block;\n  order: 7 !important;\n  margin-left: 0;\n  margin-top: 0;\n  align-self: center;\n  flex: 0 0 auto;\n  font-size: 11px;\n  line-height: 16px;\n  padding: 0 5px;\n  border-radius: 2px;\n  color: #fff;\n  background: var(--ldmy-author-color, #e74c3c);\n  vertical-align: middle;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts > .reply,\nbody.ldmy-excel .topic-post > article .post__embedded-posts > .reply,\nbody.ldmy-excel .topic-post > article .embedded-posts > div.reply,\nbody.ldmy-excel .topic-post > article .embedded-posts > div[role=\"region\"] {\n  position: relative !important;\n  margin: 0 0 8px !important;\n  padding: 0 !important;\n  background: transparent !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts > .reply:last-of-type,\nbody.ldmy-excel .topic-post > article .embedded-posts > div[role=\"region\"]:last-of-type {\n  margin-bottom: 0 !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .row,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .row {\n  display: flex !important;\n  flex-direction: column !important;\n  align-items: stretch !important;\n  gap: 0 !important;\n  width: 100% !important;\n  max-width: none !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  position: relative !important;\n  float: none !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .row::before,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .row::before {\n  content: none !important;\n  display: none !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .topic-avatar,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .topic-avatar,\nbody.ldmy-excel .topic-post > article .embedded-posts .post-avatar,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .post-avatar {\n  display: none !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .topic-body,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .topic-body,\nbody.ldmy-excel .topic-post > article .embedded-posts .post__body,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .post__body {\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 4px !important;\n  width: 100% !important;\n  max-width: none !important;\n  min-width: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  float: none !important;\n  border: none !important;\n  background: transparent !important;\n  box-shadow: none !important;\n  grid-template-columns: none !important;\n  grid-template-rows: none !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .topic-meta-data,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .topic-meta-data,\nbody.ldmy-excel .topic-post > article .embedded-posts .topic-meta-data.embedded-reply {\n  display: flex !important;\n  flex-direction: row !important;\n  flex-wrap: wrap !important;\n  align-items: center !important;\n  gap: 6px 10px !important;\n  width: auto !important;\n  min-width: 0 !important;\n  max-width: none !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  background: transparent !important;\n  border: none !important;\n  float: none !important;\n  position: relative !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .names,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .names {\n  display: inline-flex !important;\n  flex-direction: row !important;\n  flex-wrap: wrap !important;\n  align-items: baseline !important;\n  gap: 4px 8px !important;\n  width: auto !important;\n  margin: 0 !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .names .first,\nbody.ldmy-excel .topic-post > article .embedded-posts .names .first a {\n  font-weight: 600 !important;\n  color: #1a3959 !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .names .second,\nbody.ldmy-excel .topic-post > article .embedded-posts .names .second a {\n  font-weight: 400 !important;\n  color: #777 !important;\n}\n/* 取消主帖 names 的两行 order/::before，引用区保持单行身份 */\nbody.ldmy-excel .topic-post > article .embedded-posts .names::before,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .names::before,\nbody.ldmy-excel .topic-post > article .embedded-posts .names::after,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .names::after {\n  content: none !important;\n  display: none !important;\n  flex: none !important;\n  order: 0 !important;\n  width: 0 !important;\n  height: 0 !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .names > *,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .names > * {\n  order: 0 !important;\n}\n/* 引用卡片里弱化称号/徽章，突出昵称与正文 */\nbody.ldmy-excel .topic-post > article .embedded-posts .names .user-title,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .names .user-title,\nbody.ldmy-excel .topic-post > article .embedded-posts .names .user-status-message-wrap,\nbody.ldmy-excel .topic-post > article .embedded-posts .names .user-status,\nbody.ldmy-excel .topic-post > article .embedded-posts .names .poster-icon-container,\nbody.ldmy-excel .topic-post > article .embedded-posts .names .badge-group,\nbody.ldmy-excel .topic-post > article .embedded-posts .names .user-badge,\nbody.ldmy-excel .topic-post > article .embedded-posts .names .poster-avatar-extra,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .names .user-status-message-wrap,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .names .poster-icon-container {\n  display: none !important;\n}\n/* 顶部引用：名字前加「引用」提示，更易读 */\nbody.ldmy-excel .topic-post > article .embedded-posts.top .names > .first::before,\nbody.ldmy-excel .topic-post > article .post__embedded-posts--top .names > .first::before {\n  content: '引用' !important;\n  display: inline-block !important;\n  margin-right: 6px !important;\n  padding: 0 5px !important;\n  border-radius: 2px !important;\n  font-size: 11px !important;\n  line-height: 16px !important;\n  font-weight: 500 !important;\n  color: var(--ldmy-text-link, #5b7fa6) !important;\n  background: var(--ldmy-surface-chip, #e8eef6) !important;\n  vertical-align: middle !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .post-link-arrow,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .post-link-arrow {\n  position: static !important;\n  bottom: auto !important;\n  margin: 0 !important;\n  margin-left: auto !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .post-link-arrow .post-info.arrow,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .post-link-arrow .post-info.arrow {\n  display: inline-flex !important;\n  align-items: center !important;\n  gap: 2px !important;\n  color: #888 !important;\n  font-size: 12px !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .cooked,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .cooked {\n  margin: 0 !important;\n  padding: 0 !important;\n  color: var(--ldmy-text-body, #222) !important;\n  background: transparent !important;\n}\n/* 收起按钮：不要绝对定位盖在用户名上 */\nbody.ldmy-excel .topic-post > article .embedded-posts .collapse-up,\nbody.ldmy-excel .topic-post > article .embedded-posts .post__collapse-button,\nbody.ldmy-excel .topic-post > article .embedded-posts .post__collapse-button-up,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .collapse-up,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .post__collapse-button,\nbody.ldmy-excel .topic-post > article .post__embedded-posts .post__collapse-button-up {\n  position: absolute !important;\n  top: 4px !important;\n  right: 4px !important;\n  left: auto !important;\n  bottom: auto !important;\n  transform: none !important;\n  z-index: 3 !important;\n  margin: 0 !important;\n  padding: 2px 6px !important;\n  min-height: 24px !important;\n  border: 1px solid var(--ldmy-border-soft, #ccc) !important;\n  border-radius: 0 !important;\n  background: var(--ldmy-surface, #fff) !important;\n  color: var(--ldmy-text-dim, #666) !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel .topic-post > article .embedded-posts .collapse-up:hover,\nbody.ldmy-excel .topic-post > article .embedded-posts .post__collapse-button:hover {\n  background: var(--ldmy-surface-soft, #eee) !important;\n  border-color: var(--ldmy-border-soft, #aaa) !important;\n  color: var(--ldmy-text-body, #333) !important;\n}\n\n/* Excel + 紧凑：只再压一点内边距，列宽走 CSS 变量 */\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .topic-body > .topic-meta-data,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .topic-body > .topic-meta-data,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .post__body > .topic-meta-data,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .post__body > .topic-meta-data {\n  padding: 6px 8px !important;\n  gap: 2px !important;\n}\nbody.ldmy-compact.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .topic-body > .topic-meta-data,\nbody.ldmy-compact.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .topic-body > .topic-meta-data,\nbody.ldmy-compact.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .post__row > .post__body > .topic-meta-data,\nbody.ldmy-compact.ldmy-excel:not(.ldmy-hide-avatar) .topic-post > article > .row > .post__body > .topic-meta-data {\n  padding-top: 8px !important;\n  padding-left: calc(var(--ldmy-avatar-left) + var(--ldmy-avatar-size) + var(--ldmy-avatar-gap)) !important;\n}\nbody.ldmy-compact.ldmy-excel .topic-post > article .names,\nbody.ldmy-compact.ldmy-excel .topic-post > article .names .first,\nbody.ldmy-compact.ldmy-excel .topic-post > article .names a {\n  line-height: 1.25 !important;\n}\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .topic-body > .regular,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .topic-body > .contents,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .topic-body > .post__regular,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .topic-body > .post__contents,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .topic-body > .regular,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .topic-body > .contents,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .topic-body > .post__regular,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .topic-body > .post__contents,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .post__body > .regular,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .post__body > .contents,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .post__body > .post__regular,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .post__body > .post__contents,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .post__body > .regular,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .post__body > .contents,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .post__body > .post__regular,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .post__body > .post__contents {\n  padding: 4px 8px 0 !important;\n}\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .topic-body > .post-menu-area,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .topic-body > .post__menu-area,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .topic-body > .post-menu-area,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .topic-body > .post__menu-area,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .post__body > .post-menu-area,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .post__row > .post__body > .post__menu-area,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .post__body > .post-menu-area,\nbody.ldmy-compact.ldmy-excel .topic-post > article > .row > .post__body > .post__menu-area {\n  padding: 0 4px 0 !important;\n}\nbody.ldmy-compact.ldmy-excel .cooked {\n  line-height: 1.3 !important;\n}\nbody.ldmy-compact.ldmy-excel .cooked p {\n  margin: 0 0 0.2em !important;\n}\nbody.ldmy-compact.ldmy-excel .post-controls .btn,\nbody.ldmy-compact.ldmy-excel .post-menu-area .btn,\nbody.ldmy-compact.ldmy-excel .post__menu-area .btn {\n  min-height: 24px !important;\n  padding: 1px 4px !important;\n}\nbody.ldmy-compact.ldmy-excel .topic-post > article .embedded-posts,\nbody.ldmy-compact.ldmy-excel .topic-post > article .post__embedded-posts {\n  margin: 2px 6px 8px !important;\n  padding: 6px 8px 4px !important;\n}\n\n/* 非 Excel 紧凑：详情也略压一点 */\nbody.ldmy-compact:not(.ldmy-excel) .topic-post {\n  margin-bottom: 0 !important;\n}\nbody.ldmy-compact:not(.ldmy-excel) .topic-body,\nbody.ldmy-compact:not(.ldmy-excel) .post__body {\n  padding-top: 6px !important;\n  padding-bottom: 6px !important;\n}\nbody.ldmy-compact:not(.ldmy-excel) .cooked {\n  line-height: 1.4 !important;\n}\nbody.ldmy-compact:not(.ldmy-excel) .cooked p {\n  margin-bottom: 0.4em !important;\n}\n\nbody.ldmy-excel-tencent .topic-list th,\nbody.ldmy-excel-tencent .topic-list td,\nbody.ldmy-excel-tencent .topic-list .topic-list-data,\nbody.ldmy-excel-tencent .topic-post,\nbody.ldmy-excel-tencent .topic-body,\nbody.ldmy-excel-tencent .topic-body > .topic-meta-data,\nbody.ldmy-excel-tencent .post__body > .topic-meta-data,\nbody.ldmy-excel-tencent #topic-title,\nbody.ldmy-excel-tencent .title-wrapper {\n  border-color: #ebebeb !important;\n}\nbody.ldmy-excel-tencent.ldmy-excel-rows .topic-post::before,\nbody.ldmy-excel-tencent .ldmy-excel-rownum,\nbody.ldmy-excel-tencent th.ldmy-excel-rownum {\n  background: #f9fafb !important;\n  border-color: #ebebeb !important;\n}\nbody.ldmy-excel-tencent:not(.ldmy-excel-hide-nav):not(.ldmy-excel-dark) .list-controls,\nbody.ldmy-excel-tencent:not(.ldmy-excel-hide-nav):not(.ldmy-excel-dark) .navigation-container,\nbody.ldmy-excel-tencent:not(.ldmy-excel-hide-nav):not(.ldmy-excel-dark) .sidebar-wrapper,\nbody.ldmy-excel-tencent:not(.ldmy-excel-hide-nav):not(.ldmy-excel-dark) #d-sidebar {\n  border-color: #e0e0e0 !important;\n  background: #f9fafb !important;\n}\n\n/* 主题色微调：选中行 */\nbody.ldmy-excel-office .topic-list .topic-list-item:hover .topic-list-data {\n  background: #e7f4ea !important;\n}\nbody.ldmy-excel-office .topic-list-item.ldmy-excel-row-active .topic-list-data {\n  background: #dceaf0 !important;\n  outline-color: #217346;\n}\n\n";

	const horizonCss = "/* ===================== Horizon：真表格（打掉原生卡片 Grid） ===================== */\n/*\n * Horizon 原生 .--d-topic-cards 给每行 display:grid + grid-area，会拆掉表格框线。\n * Excel 下强制 table/table-row/table-cell，并用 JS 把 DOM 列重排为：\n *   # | 标题 | 分类 | 回复 | 活动 | 状态\n */\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list.--d-topic-cards,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards {\n  display: table !important;\n  table-layout: fixed !important;\n  width: 100% !important;\n  border-collapse: collapse !important;\n  border-spacing: 0 !important;\n  background: #fff !important;\n  box-shadow: none !important;\n  border-radius: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  gap: 0 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-header,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards thead,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list-header {\n  display: table-header-group !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-body,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards tbody,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list tbody,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list-body {\n  display: table-row-group !important;\n  flex-direction: unset !important;\n  gap: 0 !important;\n  padding: 0 !important;\n  border: none !important;\n}\n/* 打掉每行卡片 grid */\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context),\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context).--has-replies,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context).--has-status-card,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list .topic-list-item,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list tr {\n  display: table-row !important;\n  position: static !important;\n  grid-template-columns: none !important;\n  grid-template-areas: none !important;\n  grid-template-rows: none !important;\n  gap: 0 !important;\n  padding: 0 !important;\n  margin: 0 !important;\n  border: none !important;\n  border-radius: 0 !important;\n  background: #fff !important;\n  box-shadow: none !important;\n  text-overflow: unset !important;\n  width: auto !important;\n  min-height: 0 !important;\n  height: auto !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list-header tr {\n  display: table-row !important;\n  background: #f3f3f3 !important;\n}\n/* 所有单元格：统一框线 + 清掉 grid-area */\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item > td,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context) > td,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards td,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards th,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .main-link,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-status-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-category-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-likes-replies-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-creator-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-activity-data,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list td,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list th,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list .topic-list-data {\n  display: table-cell !important;\n  grid-area: unset !important;\n  grid-column: unset !important;\n  grid-row: unset !important;\n  position: static !important;\n  float: none !important;\n  align-self: auto !important;\n  justify-self: auto !important;\n  height: 28px !important;\n  min-height: 28px !important;\n  max-height: none !important;\n  padding: 2px 8px !important;\n  margin: 0 !important;\n  vertical-align: middle !important;\n  border-top: none !important;\n  border-left: none !important;\n  border-right: 1px solid #c6c6c6 !important;\n  border-bottom: 1px solid #c6c6c6 !important;\n  border-radius: 0 !important;\n  background: #fff !important;\n  box-shadow: none !important;\n  box-sizing: border-box !important;\n  overflow: hidden !important;\n  white-space: nowrap !important;\n  text-overflow: ellipsis !important;\n  line-height: 1.25 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list-header th,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list-header .topic-list-data,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th.sf-hidden,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th.sr-only {\n  display: table-cell !important;\n  background: #f3f3f3 !important;\n  color: #555 !important;\n  font-family: inherit !important;\n  font-weight: 500 !important;\n  height: auto !important;\n  min-height: 28px !important;\n  text-align: left !important;\n  -webkit-font-smoothing: antialiased;\n  /* 禁止 sf-hidden / 无障碍隐藏把表头列从表格布局里拿掉，否则会整列错位 */\n  position: static !important;\n  width: auto !important;\n  clip: auto !important;\n  clip-path: none !important;\n  overflow: hidden !important;\n  white-space: nowrap !important;\n  opacity: 1 !important;\n  visibility: visible !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th .sr-only,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th .sf-hidden {\n  /* 只藏文字节点的辅助类，不要牵连父 th */\n  position: static !important;\n  width: auto !important;\n  height: auto !important;\n  clip: auto !important;\n  clip-path: none !important;\n  overflow: visible !important;\n  white-space: nowrap !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th[data-ldmy-col=\"topic-status-data\"],\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th[data-ldmy-col=\"topic-likes-replies-data\"] {\n  text-align: center !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th.ldmy-excel-rownum {\n  text-align: center !important;\n}\n\n/* 列宽：JS 重排后 DOM 顺序 = # 标题 分类 回复 活动 状态\n * 标题列吃剩余宽度；右侧元数据列尽量窄，避免标题被挤到右侧错位\n */\nbody.ldmy-excel.ldmy-excel-horizon .topic-list col.ldmy-excel-col-rownum { width: 44px; }\nbody.ldmy-excel.ldmy-excel-horizon .topic-list col.ldmy-excel-col-title { width: auto; }\nbody.ldmy-excel.ldmy-excel-horizon .topic-list col.ldmy-excel-col-category { width: 200px; }\nbody.ldmy-excel.ldmy-excel-horizon .topic-list col.ldmy-excel-col-replies { width: 64px; }\nbody.ldmy-excel.ldmy-excel-horizon .topic-list col.ldmy-excel-col-activity { width: 110px; }\nbody.ldmy-excel.ldmy-excel-horizon .topic-list col.ldmy-excel-col-status { width: 38px; }\n\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .ldmy-excel-rownum,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list td.ldmy-excel-rownum,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th.ldmy-excel-rownum,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th[data-ldmy-col=\"ldmy-excel-rownum\"] {\n  width: 44px !important;\n  min-width: 44px !important;\n  max-width: 48px !important;\n  text-align: center !important;\n  padding-left: 2px !important;\n  padding-right: 2px !important;\n  background: #e8e8e8 !important;\n  color: #555 !important;\n  font-size: calc(12px + var(--ldmy-font-offset, 0px)) !important;\n  font-variant-numeric: tabular-nums;\n  font-feature-settings: \"tnum\" 1;\n}\n/* 标题列：明确占主要宽度，避免 fixed 布局下被右侧列挤成空列 */\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .main-link,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list td.main-link,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th.main-link,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th[data-ldmy-col=\"main-link\"],\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th.default {\n  /* fixed 下大百分比让标题吸收几乎全部剩余宽度，右侧列贴右 */\n  width: 70% !important;\n  min-width: 0 !important;\n  max-width: none !important;\n  padding-right: 8px !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .main-link .title,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list a.raw-topic-link,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list a.title,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .link-top-line,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .main-link a.title {\n  /* 字号跟站点 base，Excel 只改表格观感 */\n  font-family: inherit !important;\n  font-weight: 400 !important;\n  color: #1a3959 !important;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  white-space: nowrap !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  display: inline !important;\n  max-width: 100% !important;\n  grid-area: unset !important;\n  line-height: 1.3 !important;\n  word-break: normal !important;\n  opacity: 1 !important;\n  visibility: visible !important;\n  position: static !important;\n  transform: none !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .link-top-line {\n  display: block !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n  max-width: 100% !important;\n  width: 100% !important;\n  grid-area: unset !important;\n  font-weight: 400 !important;\n  opacity: 1 !important;\n  visibility: visible !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .link-bottom-line,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-excerpt,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-statuses,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .posters {\n  display: none !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-category-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list td.topic-category-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th.topic-category-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th[data-ldmy-col=\"topic-category-data\"] {\n  width: 200px !important;\n  min-width: 170px !important;\n  max-width: 220px !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-likes-replies-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list td.topic-likes-replies-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th.topic-likes-replies-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th[data-ldmy-col=\"topic-likes-replies-data\"] {\n  width: 64px !important;\n  min-width: 56px !important;\n  max-width: 72px !important;\n  text-align: right !important;\n  color: #c45c26 !important;\n  font-variant-numeric: tabular-nums;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-likes-replies-data .topic-replies,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-replies {\n  display: inline-flex !important;\n  flex-direction: row !important;\n  align-items: center !important;\n  justify-content: flex-end !important;\n  gap: 0 !important;\n  height: auto !important;\n  color: #c45c26 !important;\n  white-space: nowrap !important;\n}\n/* 回复列只留数字，去掉引用/回复箭头图标 */\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-likes-replies-data .d-icon,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-likes-replies-data svg,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-replies .d-icon,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-replies svg,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-replies::before,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-likes-replies-data .badge-posts::before,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-likes-replies-data a::before {\n  display: none !important;\n  content: none !important;\n  width: 0 !important;\n  height: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-activity-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list td.topic-activity-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th.topic-activity-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th[data-ldmy-col=\"topic-activity-data\"] {\n  width: 110px !important;\n  min-width: 92px !important;\n  max-width: 124px !important;\n  color: #666 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-activity {\n  display: inline-flex !important;\n  align-items: center !important;\n  gap: 4px !important;\n  max-width: 100% !important;\n  overflow: hidden !important;\n  color: #666 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-activity__username {\n  color: #1a3959 !important;\n  overflow: hidden !important;\n  text-overflow: ellipsis !important;\n  max-width: 48px !important;\n  margin-left: 0 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-status-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list td.topic-status-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th.topic-status-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th[data-ldmy-col=\"topic-status-data\"],\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item .topic-status-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context) .topic-status-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context).--has-status-card .topic-status-data {\n  display: table-cell !important;\n  width: 38px !important;\n  min-width: 34px !important;\n  max-width: 44px !important;\n  text-align: center !important;\n  padding: 2px 2px !important;\n  vertical-align: middle !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-status-card,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-status-card {\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  width: 22px !important;\n  height: 18px !important;\n  margin: 0 auto !important;\n  margin-left: auto !important;\n  margin-right: auto !important;\n  padding: 0 !important;\n  gap: 0 !important;\n  border: 1px solid #d0d0d0 !important;\n  border-radius: 0 !important;\n  background: #f7f7f7 !important;\n  box-shadow: none !important;\n  position: static !important;\n  float: none !important;\n  font-size: 11px !important;\n  font-weight: 500 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-status-card__name { display: none !important; }\n/* 表头「话题」标签强制可见 */\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th.main-link .ldmy-excel-th-label,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th[data-ldmy-col=\"main-link\"] .ldmy-excel-th-label,\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list thead th.default .ldmy-excel-th-label {\n  display: inline !important;\n  color: #555 !important;\n  font-weight: 500 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-status-card .d-icon,\nbody.ldmy-excel.ldmy-excel-horizon .topic-status-card svg {\n  width: 12px !important; height: 12px !important; margin: 0 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-status-card.--hot {\n  color: #c0392b !important; border-color: #e0a8a0 !important; background: #fff5f4 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-status-card.--pinned {\n  color: #666 !important; border-color: #ccc !important; background: #f5f5f5 !important;\n}\n/* 空状态格：保留单元格（列数必须一致），仅隐藏内容 */\nbody.ldmy-excel.ldmy-excel-horizon .topic-list td.topic-status-data.ldmy-excel-col-empty {\n  display: table-cell !important;\n  font-size: 0 !important;\n  color: transparent !important;\n}\n/* 创建者列隐藏 */\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-creator-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list td.topic-creator-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list th.topic-creator-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-creator-data,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list .topic-creator-data.ldmy-excel-col-empty {\n  display: none !important;\n  width: 0 !important;\n  min-width: 0 !important;\n  max-width: 0 !important;\n  padding: 0 !important;\n  border: none !important;\n  margin: 0 !important;\n  visibility: collapse !important;\n}\n/* colgroup 显式声明列组，防止固定布局留出尾部空白列 */\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list colgroup.ldmy-excel-cols {\n  display: table-column-group !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon table.topic-list col {\n  display: table-column !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .badge-category,\nbody.ldmy-excel.ldmy-excel-horizon .badge-category__wrapper {\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  display: inline-flex !important;\n  align-items: center !important;\n  max-width: 100% !important;\n  overflow: hidden !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list-item:hover > td,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list-item:hover .topic-list-data {\n  background: #eef5ff !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .topic-list-item.ldmy-excel-row-active > td,\nbody.ldmy-excel.ldmy-excel-horizon .topic-list-item.ldmy-excel-row-active .topic-list-data {\n  background: #dcecfc !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .sidebar-new-topic-button,\nbody.ldmy-excel.ldmy-excel-horizon .sidebar-new-topic-button__wrapper .btn,\nbody.ldmy-excel.ldmy-excel-horizon .topic-create-button__combo,\nbody.ldmy-excel.ldmy-excel-horizon .list-controls .btn-primary {\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  min-height: 28px !important;\n  height: auto !important;\n  padding: 0 10px !important;\n  background: #fff !important;\n  color: #1a3959 !important;\n  border: 1px solid #8eb6e8 !important;\n}\nbody.ldmy-excel.ldmy-excel-horizon .sidebar-new-topic-button__wrapper {\n  padding: 6px 8px !important;\n  border-bottom: 1px solid #d0d0d0 !important;\n  background: #f3f3f3 !important;\n  margin: 0 !important;\n}\n\n";

	const sidebarCss = "/* ===================== 侧栏单元格框线 ===================== */\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section {\n  border-bottom: 1px solid #d0d0d0 !important; background: transparent !important; margin: 0 !important; padding: 0 !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-header-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-header {\n  border-bottom: 1px solid #d8d8d8 !important; background: #eef0f3 !important;\n  min-height: 26px !important; padding: 0 8px !important; display: flex !important; align-items: center !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-row {\n  border-bottom: 1px solid #e4e4e4 !important; margin: 0 !important; padding: 0 !important;\n  min-height: 26px !important; background: #fbfbfc !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link {\n  min-height: 26px !important; height: 26px !important; line-height: 26px !important;\n  padding: 0 10px !important; border-radius: 0 !important; border: none !important;\n  box-shadow: none !important; background: transparent !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link:hover,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link.active,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-section-link[aria-current=\"page\"] {\n  background: #e8eef8 !important;\n  box-shadow: inset 3px 0 0 var(--ldmy-excel-accent, #1e6fff) !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-footer-wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-footer-actions {\n  border-top: 1px solid #cfcfcf !important; background: #f0f0f0 !important;\n  border-radius: 0 !important; padding: 4px 6px !important;\n}\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-theme-toggle__wrapper,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-theme-toggle-dropdown,\nbody.ldmy-excel:not(.ldmy-excel-hide-nav) .sidebar-theme-toggle-dropdown .select-kit-header {\n  border-radius: 0 !important; border: 1px solid #c6c6c6 !important; background: #fff !important;\n  box-shadow: none !important; min-height: 28px !important;\n}\n\n/* 通用列表框线补强 */\nbody.ldmy-excel .topic-list th,\nbody.ldmy-excel .topic-list td,\nbody.ldmy-excel .topic-list .topic-list-data,\nbody.ldmy-excel .topic-list .main-link,\nbody.ldmy-excel .topic-list .posts-map,\nbody.ldmy-excel .topic-list .num {\n  border-right: 1px solid #c6c6c6 !important;\n  border-bottom: 1px solid #c6c6c6 !important;\n}\nbody.ldmy-excel .list-container,\nbody.ldmy-excel #list-area,\nbody.ldmy-excel .topic-list-container {\n  background: #fff !important; box-shadow: none !important; border: none !important;\n  border-radius: 0 !important; padding: 0 !important; margin: 0 !important;\n}\n\n";

	const titlebarCss = "/* ===================== 标题栏右侧：搜索 / 语言 / 我的 ===================== */\n#ldmy-excel-root .ldmy-excel-chrome-actions {\n  display: flex; align-items: center; gap: 6px; margin-right: 8px; pointer-events: auto; flex-shrink: 0;\n}\n#ldmy-excel-root .ldmy-excel-chrome-btn {\n  display: inline-flex; align-items: center; justify-content: center;\n  width: 28px; height: 28px; padding: 0; border: none; border-radius: 4px;\n  background: transparent; color: #555; cursor: pointer; user-select: none;\n  transition: background .15s ease, color .15s ease;\n}\n#ldmy-excel-root .ldmy-excel-chrome-btn svg {\n  width: 15px; height: 15px; display: block;\n}\n#ldmy-excel-root .ldmy-excel-chrome-btn:hover {\n  background: #e8eef8; color: #1a3959;\n}\n#ldmy-excel-root .ldmy-excel-chrome-btn[data-act=\"me\"] {\n  position: relative;\n  background: transparent; color: #555; border-radius: 4px;\n}\n#ldmy-excel-root .ldmy-excel-chrome-btn[data-act=\"me\"]:hover { background: #e8eef8; color: #1a3959; }\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-chrome-actions {\n  position: absolute; right: 12px; top: 8px; z-index: 5;\n}\nbody.ldmy-excel-office #ldmy-excel-root .ldmy-excel-chrome-btn[data-act=\"me\"]:hover {\n  background: #e8f2ea; color: #1a5c38;\n}\n\n";

	const darkCss = "/* ===================== Excel 深色模式 ===================== */\nbody.ldmy-excel.ldmy-excel-dark {\n  background: #1e1e1e !important; color: #e6e6e6 !important; color-scheme: dark;\n  --ldmy-excel-accent: #4ea1ff;\n  /* 阅读语义 token：壳用 accent，列表正文用 title/text */\n  --ldmy-excel-row: #252526;\n  --ldmy-excel-row-hover: #2a3340;\n  --ldmy-excel-border: #3f3f46;\n  --ldmy-excel-text: #e6e6e6;\n  --ldmy-excel-text-muted: #9a9a9a;\n  --ldmy-excel-title: #e8eaed;\n  --ldmy-excel-title-hover: #ffffff;\n  --ldmy-excel-title-unseen: #f3f5f7;\n  --ldmy-excel-link: #8ec7ff;\n  /* 与帖内表格表面 token 对齐，压过用户列等高特异性浅色 */\n  --ldmy-surface: #1e1e1e;\n  --ldmy-surface-muted: #252526;\n  --ldmy-surface-soft: #2a2a2a;\n  --ldmy-surface-row: #2a2a2a;\n  --ldmy-surface-chip: #2a3340;\n  --ldmy-border-soft: #3f3f46;\n  --ldmy-border-faint: #3f3f46;\n  --ldmy-text-body: #e6e6e6;\n  --ldmy-text-dim: #9a9a9a;\n  --ldmy-text-link: #8ec7ff;\n}\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-header,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-footer,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-titlebar,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-toolbar,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-formulabar,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-h4,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-column,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-sub,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-sub > div {\n  background: #2b2b2b !important; border-color: #3f3f3f !important; color: #e8e8e8 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-titlebar-title,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-h1-title,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-fx-value,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-fx,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-sheet-name,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-count,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-zoom { color: #eaeaea !important; }\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-muted { color: #9a9a9a !important; }\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-fx-cell,\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-column {\n  background: #333 !important; color: #bbb !important; border-color: #444 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-fish { background: #3a3a3a !important; color: #eee !important; }\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-chrome-btn {\n  background: transparent; color: #c9d4e0;\n}\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-chrome-btn:hover {\n  background: #2f3b4d; color: #dcecff;\n}\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-chrome-btn[data-act=\"me\"]:hover {\n  background: #2f3b4d; color: #dcecff;\n}\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-sheet-tab { color: #4ea1ff !important; }\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-sheet-tab::after { background: #4ea1ff !important; }\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root .ldmy-excel-nav-link { color: #8ec7ff !important; }\nbody.ldmy-excel.ldmy-excel-dark #main-outlet,\nbody.ldmy-excel.ldmy-excel-dark .main-outlet,\nbody.ldmy-excel.ldmy-excel-dark .list-container,\nbody.ldmy-excel.ldmy-excel-dark #list-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-list,\nbody.ldmy-excel.ldmy-excel-dark table.topic-list,\nbody.ldmy-excel.ldmy-excel-dark .topic-body,\nbody.ldmy-excel.ldmy-excel-dark .post__body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post,\nbody.ldmy-excel.ldmy-excel-dark .post-stream,\nbody.ldmy-excel.ldmy-excel-dark .posts-wrapper,\nbody.ldmy-excel.ldmy-excel-dark .container.posts,\nbody.ldmy-excel.ldmy-excel-dark .cooked {\n  background: #1e1e1e !important; color: #e6e6e6 !important; border-color: #3a3a3a !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-list th,\nbody.ldmy-excel.ldmy-excel-dark .topic-list td,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .topic-list-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .main-link,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .posts-map,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .num,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .topic-status-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .topic-category-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .topic-likes-replies-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .topic-creator-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .topic-activity-data {\n  background: #252526 !important; color: #e6e6e6 !important;\n  border-right: 1px solid #3f3f46 !important; border-bottom: 1px solid #3f3f46 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-list th,\nbody.ldmy-excel.ldmy-excel-dark .ldmy-excel-rownum,\nbody.ldmy-excel.ldmy-excel-dark th.ldmy-excel-rownum {\n  background: #2d2d30 !important; color: #aaa !important;\n}\n/* 列表标题：正文色，不是超链接蓝；禁止全局 a 染蓝 */\nbody.ldmy-excel.ldmy-excel-dark .topic-list .main-link .title,\nbody.ldmy-excel.ldmy-excel-dark .topic-list a.raw-topic-link,\nbody.ldmy-excel.ldmy-excel-dark .topic-list a.title,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .main-link a.title span {\n  color: var(--ldmy-excel-title, #e8eaed) !important;\n  text-decoration: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-list .main-link:hover .title,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .main-link:hover a.raw-topic-link,\nbody.ldmy-excel.ldmy-excel-dark .topic-list .main-link:hover a.title,\nbody.ldmy-excel.ldmy-excel-dark .topic-list a.raw-topic-link:hover,\nbody.ldmy-excel.ldmy-excel-dark .topic-list a.title:hover {\n  color: var(--ldmy-excel-title-hover, #ffffff) !important;\n}\n/* 未读/未见略提亮，便于扫列表 */\nbody.ldmy-excel.ldmy-excel-dark .topic-list-item.unseen-topic .main-link .title,\nbody.ldmy-excel.ldmy-excel-dark .topic-list-item.unseen-topic a.raw-topic-link,\nbody.ldmy-excel.ldmy-excel-dark .topic-list-item.unseen-topic a.title {\n  color: var(--ldmy-excel-title-unseen, #f3f5f7) !important;\n  font-weight: 500 !important;\n}\n/* 仅真正的导航/控件链接保留 link 蓝 */\nbody.ldmy-excel.ldmy-excel-dark #ldmy-excel-root a.ldmy-excel-nav-link,\nbody.ldmy-excel.ldmy-excel-dark .cooked a:not(.mention):not(.mention-group) {\n  color: var(--ldmy-excel-link, #8ec7ff) !important;\n}\n/* Horizon 列表标题同样正文化（盖过 horizon 亮色 #1a3959） */\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .main-link .title,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list a.raw-topic-link,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list a.title,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .main-link a.title,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .link-top-line a {\n  color: var(--ldmy-excel-title, #e8eaed) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .main-link:hover .title,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list a.raw-topic-link:hover,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list a.title:hover {\n  color: var(--ldmy-excel-title-hover, #ffffff) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-activity__username {\n  color: #c8c8c8 !important;\n}\n/* Horizon 深色：盖过 horizon 硬编码的 #fff / #f3f3f3 / 亮色边框（特异性必须带 excel-horizon） */\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list.--d-topic-cards,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .list-container,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon #list-area,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-container {\n  background: #1e1e1e !important;\n  color: #e6e6e6 !important;\n  border-color: #3f3f46 !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context),\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context).--has-replies,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context).--has-status-card,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list .topic-list-item,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list tr,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-header tr {\n  background: transparent !important;\n  box-shadow: none !important;\n  border-color: #3f3f46 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item > td,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:not(.--high-context) > td,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards td,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards th,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .main-link,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-status-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-category-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-likes-replies-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-creator-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-activity-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list td,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list th,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list .topic-list-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .ldmy-excel-rownum,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list td.ldmy-excel-rownum {\n  background: #252526 !important;\n  color: #e6e6e6 !important;\n  border-right: 1px solid #3f3f46 !important;\n  border-bottom: 1px solid #3f3f46 !important;\n  border-top: none !important;\n  border-left: none !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-header th,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-header .topic-list-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list thead th,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list thead th.sf-hidden,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list thead th.sr-only,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list th.ldmy-excel-rownum,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-header tr {\n  background: #2d2d30 !important;\n  color: #aaa !important;\n  border-right: 1px solid #3f3f46 !important;\n  border-bottom: 1px solid #3f3f46 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list thead th.main-link .ldmy-excel-th-label,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list thead th[data-ldmy-col=\"main-link\"] .ldmy-excel-th-label,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon table.topic-list thead th.default .ldmy-excel-th-label {\n  color: #aaa !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .topic-likes-replies-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list td.topic-likes-replies-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .topic-likes-replies-data .topic-replies,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .topic-replies,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .topic-likes-replies-data .number,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .topic-replies .number {\n  color: #e0a070 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .topic-activity-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list td.topic-activity-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list .topic-activity {\n  color: #9a9a9a !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-item:hover > td,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-item:hover .topic-list-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-item:hover .main-link,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-list-item:hover > td {\n  background: #2a3340 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-item.ldmy-excel-row-active > td,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list-item.ldmy-excel-row-active .topic-list-data {\n  background: #243447 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-status-card,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-list.--d-topic-cards .topic-status-card {\n  background: #2d2d30 !important;\n  border-color: #555 !important;\n  color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-status-card.--hot {\n  background: #3a2222 !important;\n  border-color: #8a4040 !important;\n  color: #ff8e8e !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-status-card.--pinned {\n  background: #2a2a2a !important;\n  border-color: #555 !important;\n  color: #bbb !important;\n}\n/* Horizon 侧栏「新建话题」组合按钮（含 drafts 下拉） */\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .sidebar-new-topic-button__wrapper,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-create-button__combo.sidebar-new-topic-button__wrapper {\n  background: #2d2d30 !important;\n  border-bottom: 1px solid #3f3f46 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .sidebar-new-topic-button,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .sidebar-new-topic-button__wrapper .btn,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-create-button__combo,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-create-button__combo .btn,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-create-button__combo .d-combo-button-button,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-create-button__combo .d-combo-button-menu,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-drafts-menu-trigger,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .list-controls .btn-primary,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon #create-topic {\n  background: #2a3340 !important;\n  color: #dcecff !important;\n  border: 1px solid #4ea1ff !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .sidebar-new-topic-button .d-icon,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-create-button__combo .d-icon,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon #create-topic .d-icon,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-drafts-menu-trigger .d-icon {\n  color: #dcecff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .sidebar-new-topic-button:hover,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .sidebar-new-topic-button__wrapper .btn:hover,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon .topic-create-button__combo .btn:hover,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-horizon #create-topic:hover {\n  background: #31465f !important;\n  border-color: #6bb0ff !important;\n  color: #ffffff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-list-item:hover > td,\nbody.ldmy-excel.ldmy-excel-dark .topic-list-item:hover .topic-list-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-list-item:hover .main-link,\nbody.ldmy-excel.ldmy-excel-dark .topic-list tr:hover td { background: #2a3340 !important; }\nbody.ldmy-excel.ldmy-excel-dark .topic-list-item.ldmy-excel-row-active > td,\nbody.ldmy-excel.ldmy-excel-dark .topic-list-item.ldmy-excel-row-active .topic-list-data {\n  background: #243447 !important; outline-color: #4ea1ff;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-status-card {\n  background: #2d2d30 !important; border-color: #555 !important; color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-status-card.--hot {\n  background: #3a2222 !important; border-color: #8a4040 !important; color: #ff8e8e !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-wrapper,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) #d-sidebar,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-container,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-sections {\n  background: #252526 !important; border-right-color: #3f3f46 !important; color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-section-header-wrapper,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-section-header {\n  background: #2d2d30 !important; border-bottom-color: #3f3f46 !important; color: #bbb !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-section-link-wrapper,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-row {\n  background: #252526 !important; border-bottom-color: #333 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-section-link { color: #ddd !important; }\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-section-link:hover,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-section-link.active {\n  background: #2a3340 !important; color: #8ec7ff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-footer-wrapper,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-footer-actions {\n  background: #2d2d30 !important; border-top-color: #3f3f46 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .list-controls,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .navigation-container,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .navigation-topics {\n  background: #2d2d30 !important; border-bottom-color: #3f3f46 !important; color: #e6e6e6 !important;\n}\n/* 类别/标签 + 操作按钮：暗色填充，避免白边 */\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .category-breadcrumb .btn,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .category-breadcrumb .combo-box,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .category-breadcrumb .select-kit.combo-box .select-kit-header,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .list-controls .category-breadcrumb .select-kit-header,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .navigation-container .btn,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .list-controls .btn,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .navigation-controls .btn {\n  background: #3a3a3a !important;\n  border-color: #555 !important;\n  color: #e6e6e6 !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .navigation-container .btn:hover,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .list-controls .btn:hover,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .navigation-controls .btn:hover,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .category-breadcrumb .select-kit-header:hover {\n  background: #2a3340 !important;\n  border-color: #4ea1ff !important;\n  color: #dcecff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .list-controls .btn-primary,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .navigation-container .btn-primary,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .navigation-controls .btn-primary,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .list-controls .btn.btn-icon-text.btn-primary {\n  background: #2a3340 !important;\n  border-color: #4ea1ff !important;\n  color: #dcecff !important;\n}\n/* 导航 pill：无边框，贴近原站暗色下划线 */\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .nav-pills > li,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .nav-pills > li a,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .navigation-container .nav-item,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) #navigation-bar > li,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) #navigation-bar > li a {\n  background: transparent !important;\n  border: none !important;\n  box-shadow: none !important;\n  color: #cfcfcf !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .nav-pills > li a.active,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .nav-pills > li a:hover,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) #navigation-bar > li a.active,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) #navigation-bar > li a:hover {\n  background: transparent !important;\n  border: none !important;\n  color: #8ec7ff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .select-kit-body,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .select-kit-collection {\n  background: #2d2d30 !important;\n  border-color: #555 !important;\n  color: #e6e6e6 !important;\n  box-shadow: 0 1px 4px rgba(0,0,0,.45) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-theme-toggle__wrapper,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-theme-toggle-dropdown,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-hide-nav) .sidebar-theme-toggle-dropdown .select-kit-header {\n  background: #3a3a3a !important;\n  border-color: #555 !important;\n  color: #e6e6e6 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .post__body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .topic-body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-rows .topic-post::before {\n  background: var(--ldmy-surface-muted, #252526) !important;\n  border-color: var(--ldmy-border-soft, #3f3f46) !important;\n  color: var(--ldmy-text-dim, #bbb) !important;\n}\n/* 正文列包装层 / 底栏：对齐 surface，去掉白缝 */\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .topic-body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > section.post-actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > section.post-actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > section.post-actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > section.post-actions {\n  background: var(--ldmy-surface, #1e1e1e) !important;\n  border-color: var(--ldmy-border-soft, #3f3f46) !important;\n  color: var(--ldmy-text-body, #e6e6e6) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .first,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .first a,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > span.first,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > span.first a {\n  color: var(--ldmy-excel-link, #8ec7ff) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .second,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .second a,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > span.second,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > span.second a,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .user-title,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post-infos,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post-info,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post-date,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .topic-meta-data .post-info,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .topic-meta-data .reply-to-tab {\n  color: var(--ldmy-text-dim, #9a9a9a) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post__embedded-posts {\n  background: #252526 !important;\n  border-color: #3f3f46 !important;\n  border-left-color: #4a7ab0 !important;\n  color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts .cooked,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post__embedded-posts .cooked {\n  color: #e6e6e6 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts .names .first,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts .names .first a {\n  color: #d5d5d5 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts.top .names > .first::before,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post__embedded-posts--top .names > .first::before {\n  color: #9db7d4 !important;\n  background: #2a3340 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts .collapse-up,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts .post__collapse-button,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post__embedded-posts .collapse-up,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post__embedded-posts .post__collapse-button {\n  background: #2d2d30 !important;\n  border-color: #555 !important;\n  color: #bbb !important;\n}\nbody.ldmy-excel.ldmy-excel-dark #topic-title,\nbody.ldmy-excel.ldmy-excel-dark .title-wrapper {\n  background: #2d2d30 !important; border-bottom-color: #3f3f46 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .fancy-title {\n  color: var(--ldmy-excel-title, #e8eaed) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .names a,\nbody.ldmy-excel.ldmy-excel-dark .names .first {\n  color: #d5d5d5 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .names a:hover {\n  color: var(--ldmy-excel-title-hover, #ffffff) !important;\n}\n\n/* 全页搜索 · 深色 */\nbody.ldmy-excel.ldmy-excel-dark .search-container,\nbody.ldmy-excel.ldmy-excel-dark .search-advanced,\nbody.ldmy-excel.ldmy-excel-dark .search-results,\nbody.ldmy-excel.ldmy-excel-dark .fps-result-entries,\nbody.ldmy-excel.ldmy-excel-dark .fps-result {\n  background: #1e1e1e !important;\n  border-color: #3f3f46 !important;\n  color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .search-header,\nbody.ldmy-excel.ldmy-excel-dark .search-advanced .search-info {\n  background: #2d2d30 !important;\n  border-bottom-color: #3f3f46 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .search-page-heading,\nbody.ldmy-excel.ldmy-excel-dark .result-count {\n  color: #8ec7ff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .search-bar .full-page-search,\nbody.ldmy-excel.ldmy-excel-dark .search-bar input.search-query,\nbody.ldmy-excel.ldmy-excel-dark .search-bar input[type=\"search\"],\nbody.ldmy-excel.ldmy-excel-dark .search-bar .select-kit .select-kit-header,\nbody.ldmy-excel.ldmy-excel-dark .search-info .select-kit .select-kit-header,\nbody.ldmy-excel.ldmy-excel-dark .search-bar .search-cta,\nbody.ldmy-excel.ldmy-excel-dark .advanced-filters__toggle,\nbody.ldmy-excel.ldmy-excel-dark .search-filters .btn {\n  background: #3a3a3a !important;\n  border-color: #555 !important;\n  color: #e6e6e6 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .fps-result:hover {\n  background: #2a3340 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .fps-result.ldmy-excel-row-active {\n  background: #243246 !important;\n  outline-color: #4a9eff;\n}\nbody.ldmy-excel.ldmy-excel-dark.ldmy-excel-rows .fps-result::before {\n  background: #2a2a2a !important;\n  border-color: #3f3f46 !important;\n  color: #bbb !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .fps-result .search-link,\nbody.ldmy-excel.ldmy-excel-dark .fps-result .topic-title,\nbody.ldmy-excel.ldmy-excel-dark .fps-result .topic-title span {\n  color: var(--ldmy-excel-title, #e8eaed) !important;\n  text-decoration: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .fps-result .search-link:hover,\nbody.ldmy-excel.ldmy-excel-dark .fps-result .search-link:hover .topic-title,\nbody.ldmy-excel.ldmy-excel-dark .fps-result .search-link:hover .topic-title span {\n  color: var(--ldmy-excel-title-hover, #ffffff) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .fps-result .blurb {\n  color: #aaa !important;\n}\n/* 搜索分类：透明底，保留色相图标 */\nbody.ldmy-excel.ldmy-excel-dark .fps-result .badge-category,\nbody.ldmy-excel.ldmy-excel-dark .fps-result .badge-category__wrapper,\nbody.ldmy-excel.ldmy-excel-dark .fps-result .badge-category__name {\n  background: transparent !important;\n  border: none !important;\n  box-shadow: none !important;\n  color: #b0b0b0 !important;\n}\n/* 搜索标签：行底 tint，无硬边 */\nbody.ldmy-excel.ldmy-excel-dark .fps-result .discourse-tag,\nbody.ldmy-excel.ldmy-excel-dark .fps-result .discourse-tags .discourse-tag {\n  background: color-mix(in srgb, var(--color1, #888) 18%, var(--ldmy-excel-row, #252526)) !important;\n  color: color-mix(in srgb, var(--color1, #ccc) 45%, #ddd) !important;\n  border: none !important;\n  box-shadow: none !important;\n  opacity: 0.88 !important;\n}\n\n/* ---- Excel 深色：帖内阅读路径补齐 ---- */\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__post-menu,\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts,\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__list {\n  background: transparent !important;\n  color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__bubble {\n  background: #333 !important;\n  color: #e6e6e6 !important;\n  border: 1px solid #4a4a4a !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__bubble.--actionable:hover {\n  background: #3a4555 !important;\n  border-color: #5a6a80 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__cooked,\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__cooked p,\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__add-btn {\n  color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__add-btn:hover {\n  color: #8ec7ff !important;\n}\n\nbody.ldmy-excel.ldmy-excel-dark .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post-controls,\nbody.ldmy-excel.ldmy-excel-dark .post-menu-area .actions,\nbody.ldmy-excel.ldmy-excel-dark .post__menu-area .actions {\n  background: transparent !important;\n  border-top-color: #3f3f46 !important;\n  color: #bbb !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .post-controls .btn,\nbody.ldmy-excel.ldmy-excel-dark .post-menu-area .btn,\nbody.ldmy-excel.ldmy-excel-dark .post__menu-area .btn,\nbody.ldmy-excel.ldmy-excel-dark .post-action-menu__reply,\nbody.ldmy-excel.ldmy-excel-dark .post-action-menu__like,\nbody.ldmy-excel.ldmy-excel-dark .post-action-menu__edit,\nbody.ldmy-excel.ldmy-excel-dark .post-action-menu__show-more,\nbody.ldmy-excel.ldmy-excel-dark .post-action-menu__boost,\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts-trigger {\n  background: transparent !important;\n  border-color: transparent !important;\n  color: #bbb !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .post-controls .btn:hover,\nbody.ldmy-excel.ldmy-excel-dark .post-menu-area .btn:hover,\nbody.ldmy-excel.ldmy-excel-dark .post__menu-area .btn:hover {\n  background: #333 !important;\n  border-color: #555 !important;\n  color: #eee !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .post-controls .btn .d-icon,\nbody.ldmy-excel.ldmy-excel-dark .post-menu-area .btn .d-icon {\n  color: #aaa !important;\n}\n\n/* 正文包装层：亮色 Excel 强制了 #fff，暗色必须等权/更高覆盖，否则楼层底会透白 */\nbody.ldmy-excel.ldmy-excel-dark .topic-body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .post__body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .post__body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .post__body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .post__body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .regular.contents,\nbody.ldmy-excel.ldmy-excel-dark article.boxed,\nbody.ldmy-excel.ldmy-excel-dark article.onscreen-post,\nbody.ldmy-excel.ldmy-excel-dark .onscreen-post,\nbody.ldmy-excel.ldmy-excel-dark .post__row,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article {\n  background: #1e1e1e !important;\n  color: #e6e6e6 !important;\n  border-color: #3f3f46 !important;\n  box-shadow: none !important;\n}\n\n/* 楼层底栏 / 反应区：禁止透出白底（含 Horizon reactions-actions-summary） */\nbody.ldmy-excel.ldmy-excel-dark .topic-body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post__body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post__body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-body > section.post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post__body > section.post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark section.post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark section.post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post-controls,\nbody.ldmy-excel.ldmy-excel-dark .reactions-actions-summary,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-actions,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-counter,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-list,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-list .reactions,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-list-emoji,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-actions-button-shim,\nbody.ldmy-excel.ldmy-excel-dark .actions-summary,\nbody.ldmy-excel.ldmy-excel-dark .post-actions,\nbody.ldmy-excel.ldmy-excel-dark .post__actions,\nbody.ldmy-excel.ldmy-excel-dark section.post-actions,\nbody.ldmy-excel.ldmy-excel-dark section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .post-action,\nbody.ldmy-excel.ldmy-excel-dark .extra-info-wrapper,\nbody.ldmy-excel.ldmy-excel-dark .who-liked,\nbody.ldmy-excel.ldmy-excel-dark .small-user-list,\nbody.ldmy-excel.ldmy-excel-dark .small-user-list-content,\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__post-menu,\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts,\nbody.ldmy-excel.ldmy-excel-dark .discourse-boosts__list {\n  background: #1e1e1e !important;\n  border-color: #3f3f46 !important;\n  color: #bbb !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .post-controls {\n  border-top-color: #3f3f46 !important;\n}\n/* 楼层分隔线 / 空 actions 残留：禁止 #bbb/#eee 白边 */\nbody.ldmy-excel.ldmy-excel-dark .topic-post {\n  border: none !important;\n  border-bottom: 1px solid #3f3f46 !important;\n  background: #1e1e1e !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-body,\nbody.ldmy-excel.ldmy-excel-dark .post__body,\nbody.ldmy-excel.ldmy-excel-dark .topic-body.clearfix {\n  border-right-color: #3f3f46 !important;\n  border-color: #3f3f46 !important;\n  background: #1e1e1e !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-body > section.post-actions,\nbody.ldmy-excel.ldmy-excel-dark .post__body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .post__body > section.post-actions,\nbody.ldmy-excel.ldmy-excel-dark section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark section.post-actions {\n  background: #1e1e1e !important;\n  border: none !important;\n  border-top-color: #3f3f46 !important;\n  color: #bbb !important;\n  box-shadow: none !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post .gap,\nbody.ldmy-excel.ldmy-excel-dark .time-gap,\nbody.ldmy-excel.ldmy-excel-dark .small-action {\n  border-bottom: 1px solid #3f3f46 !important;\n  background: #252526 !important;\n  color: #bbb !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-counter .reactions-counter,\nbody.ldmy-excel.ldmy-excel-dark .reactions-counter,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-reaction-button,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-reaction-button .btn,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-actions .btn {\n  background: transparent !important;\n  color: #bbb !important;\n  border-color: transparent !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-list-emoji,\nbody.ldmy-excel.ldmy-excel-dark .discourse-reactions-list .emoji {\n  background-color: transparent !important;\n  filter: none !important;\n}\n/* Horizon 帖内：article/post-controls 常残留站点浅色 surface */\nbody.ldmy-excel.ldmy-excel-dark nav.post-controls,\nbody.ldmy-excel.ldmy-excel-dark .post-controls.collapsed,\nbody.ldmy-excel.ldmy-excel-dark .post-controls .actions,\nbody.ldmy-excel.ldmy-excel-dark .post-controls .extra-buttons,\nbody.ldmy-excel.ldmy-excel-dark .post-action-menu,\nbody.ldmy-excel.ldmy-excel-dark .post-action-menu__button,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article.boxed,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article.onscreen-post,\nbody.ldmy-excel.ldmy-excel-dark .topic-post .post__regular.contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post .regular.contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post .post-menu-area {\n  background: #1e1e1e !important;\n  border-color: #3f3f46 !important;\n  box-shadow: none !important;\n}\n\n/* composer / reply-control */\nbody.ldmy-excel.ldmy-excel-dark #reply-control,\nbody.ldmy-excel.ldmy-excel-dark .docked-composer,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .reply-area,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .composer-fields,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .d-editor,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .d-editor-container,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .d-editor-textarea-wrapper,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .d-editor-preview-wrapper,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .composer-popup {\n  background: #252526 !important;\n  color: #e6e6e6 !important;\n  border-color: #3f3f46 !important;\n  box-shadow: 0 -2px 16px rgba(0,0,0,.45) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark #reply-control .grippie,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .composer-controls,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .save-or-cancel,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .d-editor-button-bar,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .composer-bottom {\n  background: #2d2d30 !important;\n  border-color: #3f3f46 !important;\n  color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark #reply-control textarea,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .d-editor-input,\nbody.ldmy-excel.ldmy-excel-dark #reply-control input,\nbody.ldmy-excel.ldmy-excel-dark #reply-control #reply-title,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .d-editor-preview {\n  background: #1e1e1e !important;\n  color: #e6e6e6 !important;\n  border-color: #444 !important;\n  caret-color: #8ec7ff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark #reply-control .btn,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .btn-primary,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .save-or-cancel .btn {\n  background: #3a3a3a !important;\n  border: 1px solid #555 !important;\n  color: #eee !important;\n}\nbody.ldmy-excel.ldmy-excel-dark #reply-control .btn-primary {\n  background: #1e4f8a !important;\n  border-color: #2b6cb0 !important;\n  color: #fff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark #reply-control .btn:hover {\n  background: #454545 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark #reply-control .d-editor-button-bar .btn .d-icon,\nbody.ldmy-excel.ldmy-excel-dark #reply-control .composer-controls .d-icon {\n  color: #ccc !important;\n}\n\n/* cooked: onebox / quote / code / badges */\nbody.ldmy-excel.ldmy-excel-dark .cooked a,\nbody.ldmy-excel.ldmy-excel-dark .cooked a.mention,\nbody.ldmy-excel.ldmy-excel-dark .cooked a.mention-group {\n  color: #8ec7ff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .cooked blockquote,\nbody.ldmy-excel.ldmy-excel-dark .cooked aside.quote,\nbody.ldmy-excel.ldmy-excel-dark .cooked .quote,\nbody.ldmy-excel.ldmy-excel-dark .cooked .quote .title {\n  background: #2a2a2a !important;\n  border-color: #4a4a4a !important;\n  color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .cooked aside.quote {\n  border-left-color: #4ea1ff !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .cooked .onebox,\nbody.ldmy-excel.ldmy-excel-dark .cooked aside.onebox,\nbody.ldmy-excel.ldmy-excel-dark .cooked .onebox-body,\nbody.ldmy-excel.ldmy-excel-dark .cooked .onebox header {\n  background: #2a2a2a !important;\n  border-color: #4a4a4a !important;\n  color: #ddd !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .cooked pre,\nbody.ldmy-excel.ldmy-excel-dark .cooked code,\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs,\nbody.ldmy-excel.ldmy-excel-dark .cooked pre code {\n  background: #1a1a1a !important;\n  color: #d4d4d4 !important;\n  border-color: #3f3f46 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-keyword,\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-selector-tag,\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-literal { color: #569cd6 !important; }\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-string,\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-attr { color: #ce9178 !important; }\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-comment { color: #6a9955 !important; }\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-number,\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-built_in { color: #b5cea8 !important; }\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-title,\nbody.ldmy-excel.ldmy-excel-dark .cooked .hljs-section { color: #dcdcaa !important; }\n/* 分类：透明底 + 弱化字色，保留原站色标/图标 */\nbody.ldmy-excel.ldmy-excel-dark .badge-category,\nbody.ldmy-excel.ldmy-excel-dark .badge-category__wrapper {\n  background: transparent !important;\n  border: none !important;\n  box-shadow: none !important;\n  color: #b0b0b0 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .badge-category__name {\n  color: #b0b0b0 !important;\n}\n/* 标签：吃 --color1 tint，贴近行底；盖过亮色 #f0f0f0 chip */\nbody.ldmy-excel.ldmy-excel-dark .discourse-tag,\nbody.ldmy-excel.ldmy-excel-dark .discourse-tags .discourse-tag,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-horizon) .topic-list .discourse-tag,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-horizon) .topic-list .discourse-tags .discourse-tag {\n  background: color-mix(in srgb, var(--color1, #888) 18%, var(--ldmy-excel-row, #252526)) !important;\n  color: color-mix(in srgb, var(--color1, #ccc) 45%, #ddd) !important;\n  border: none !important;\n  border-color: transparent !important;\n  box-shadow: none !important;\n  opacity: 0.88 !important;\n}\n/* 图标保留标签色相，文字仍弱化 */\nbody.ldmy-excel.ldmy-excel-dark .discourse-tag .tag-icon,\nbody.ldmy-excel.ldmy-excel-dark .discourse-tag .d-icon,\nbody.ldmy-excel.ldmy-excel-dark .discourse-tag svg {\n  color: var(--color1, currentColor) !important;\n  fill: currentColor !important;\n  opacity: 0.95 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .badge-category .d-icon,\nbody.ldmy-excel.ldmy-excel-dark .badge-category svg {\n  color: var(--category-badge-color, currentColor) !important;\n  opacity: 0.95 !important;\n}\n/* 无色变量时的兜底 chip */\nbody.ldmy-excel.ldmy-excel-dark .discourse-tag:not([style]),\nbody.ldmy-excel.ldmy-excel-dark .discourse-tags .discourse-tag:not([style]) {\n  background: color-mix(in srgb, #fff 7%, var(--ldmy-excel-row, #252526)) !important;\n  color: #b8b8b8 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .badge-notification {\n  background: #333 !important;\n  border-color: #4a4a4a !important;\n  color: #ccc !important;\n}\n/* 列表 meta 行：再压一档，避免抢标题 */\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-horizon) .topic-list .link-bottom-line,\nbody.ldmy-excel.ldmy-excel-dark .fps-result .search-category {\n  opacity: 0.78 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-horizon) .topic-list .badge-category__wrapper,\nbody.ldmy-excel.ldmy-excel-dark:not(.ldmy-excel-horizon) .topic-list .badge-category {\n  background: transparent !important;\n  border: none !important;\n  box-shadow: none !important;\n  color: #b0b0b0 !important;\n  opacity: 0.9 !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .names,\nbody.ldmy-excel.ldmy-excel-dark .post-infos,\nbody.ldmy-excel.ldmy-excel-dark .post-date,\nbody.ldmy-excel.ldmy-excel-dark .post-info {\n  color: #bbb !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .small-action,\nbody.ldmy-excel.ldmy-excel-dark .time-gap,\nbody.ldmy-excel.ldmy-excel-dark .topic-post .gap {\n  background: #2a2a2a !important;\n  border-color: #3f3f46 !important;\n  color: #aaa !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .timeline-container,\nbody.ldmy-excel.ldmy-excel-dark .topic-timeline,\nbody.ldmy-excel.ldmy-excel-dark .topic-navigation {\n  background: #252526 !important;\n  border-color: #3f3f46 !important;\n  color: #ccc !important;\n}\n\n/* Excel 模式下的 Discourse 弹层：只抬真正的浮层，避免 [class*=tooltip] 等宽选择器\n * 把帖内状态/boost 节点抬到 Excel 头之上造成穿模。 */\nbody.ldmy-excel .d-header [class*=\"search-menu\"],\nbody.ldmy-excel .d-header [class*=\"user-menu\"],\nbody.ldmy-excel .d-header [class*=\"menu-panel\"],\nbody.ldmy-excel .d-header .fk-d-menu,\nbody.ldmy-excel .d-header-wrap [class*=\"search-menu\"],\nbody.ldmy-excel .d-header-wrap [class*=\"user-menu\"],\nbody.ldmy-excel > .fk-d-menu,\nbody.ldmy-excel > [data-content],\nbody.ldmy-excel > .menu-panel,\nbody.ldmy-excel > .lang-dropdown,\nbody.ldmy-excel > .d-modal,\nbody.ldmy-excel > .modal,\nbody.ldmy-excel .d-modal,\nbody.ldmy-excel .modal-inner-container,\nbody.ldmy-excel .d-modal-container,\nbody.ldmy-excel .fk-d-menu[data-expanded=\"true\"],\nbody.ldmy-excel .tippy-box,\nbody.ldmy-excel .tippy-popover,\nbody.ldmy-excel [data-tippy-root],\nbody.ldmy-excel .select-kit-body,\nbody.ldmy-excel .select-kit-collection,\nbody.ldmy-excel .d-menu-panel {\n  z-index: 100020 !important;\n}\n/* 仅在 JS 显式标记弹层打开时处理（禁止 :has(fk-d-menu) 之类宽规则：\n   侧栏主题切换等也会命中，导致原生 logo/标题整块冒出来） */\nbody.ldmy-excel.ldmy-excel-popup-open #ldmy-excel-root,\nbody.ldmy-excel.ldmy-excel-popup-open #ldmy-excel-root .ldmy-excel-header {\n  z-index: 1 !important;\n}\nbody.ldmy-excel.ldmy-excel-popup-open .search-menu,\nbody.ldmy-excel.ldmy-excel-popup-open .search-menu-container,\nbody.ldmy-excel.ldmy-excel-popup-open .menu-panel,\nbody.ldmy-excel.ldmy-excel-popup-open .user-menu,\nbody.ldmy-excel.ldmy-excel-popup-open .user-menu-panel,\nbody.ldmy-excel.ldmy-excel-popup-open [class*=\"search-menu\"],\nbody.ldmy-excel.ldmy-excel-popup-open [class*=\"user-menu\"],\nbody.ldmy-excel.ldmy-excel-popup-open .fk-d-menu {\n  z-index: 100020 !important;\n}\n/* d-header 只作挂载点：外壳透明，不给祖先设 opacity（子面板逃不出父级 opacity）。\n   用 visibility 隐藏 chrome：子面板可再 visibility:visible 露出来。 */\nbody.ldmy-excel.ldmy-excel-popup-open .d-header,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header-wrap {\n  display: block !important;\n  visibility: visible !important;\n  z-index: 100010 !important;\n  background: transparent !important;\n  background-color: transparent !important;\n  box-shadow: none !important;\n  border: none !important;\n  border-bottom: none !important;\n  pointer-events: none !important;\n  overflow: visible !important;\n}\n/* 只藏原生 chrome 节点，不动 .panel/.contents 祖先（面板常挂在它们下面） */\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .title,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .home-logo-wrapper,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .home-logo,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .extra-info-wrapper,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .auth-buttons,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .d-header-icons,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .header-buttons,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .header-dropdown-toggle,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .search-dropdown,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .current-user,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .language-switcher,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .language-switcher-trigger,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header #search-button,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header #toggle-current-user,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .panel > ul,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .panel > .d-header-icons,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header::before,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header::after,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header-wrap::before,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header-wrap::after {\n  visibility: hidden !important;\n  pointer-events: none !important;\n  opacity: 0 !important;\n}\n/* 真正的下拉面板：visibility 可覆盖祖先 hidden；抬到 Excel 头之上。\n   选择器尽量收窄，避免把页面其它 [data-content]/fk-d-menu 全强制显示。 */\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .menu-panel,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .search-menu,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .search-menu-container,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header [class*=\"search-menu\"],\nbody.ldmy-excel.ldmy-excel-popup-open .d-header [class*=\"user-menu\"],\nbody.ldmy-excel.ldmy-excel-popup-open .d-header [class*=\"menu-panel\"],\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .fk-d-menu,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .fk-d-menu__inner-content,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .d-menu-panel,\nbody.ldmy-excel.ldmy-excel-popup-open > .menu-panel,\nbody.ldmy-excel.ldmy-excel-popup-open > .fk-d-menu,\nbody.ldmy-excel.ldmy-excel-popup-open > [data-content],\nbody.ldmy-excel.ldmy-excel-popup-open .search-menu,\nbody.ldmy-excel.ldmy-excel-popup-open .search-menu-container,\nbody.ldmy-excel.ldmy-excel-popup-open .user-menu,\nbody.ldmy-excel.ldmy-excel-popup-open .user-menu-panel,\nbody.ldmy-excel.ldmy-excel-popup-open .menu-panel.user-menu,\nbody.ldmy-excel.ldmy-excel-popup-open .fk-d-menu[data-expanded=\"true\"] {\n  visibility: visible !important;\n  opacity: 1 !important;\n  pointer-events: auto !important;\n  z-index: 100020 !important;\n}\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .menu-panel *,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .search-menu *,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .search-menu-container *,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header [class*=\"search-menu\"] *,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header [class*=\"user-menu\"] *,\nbody.ldmy-excel.ldmy-excel-popup-open .d-header .fk-d-menu *,\nbody.ldmy-excel.ldmy-excel-popup-open > .menu-panel *,\nbody.ldmy-excel.ldmy-excel-popup-open > .fk-d-menu *,\nbody.ldmy-excel.ldmy-excel-popup-open > [data-content] *,\nbody.ldmy-excel.ldmy-excel-popup-open .search-menu *,\nbody.ldmy-excel.ldmy-excel-popup-open .search-menu-container *,\nbody.ldmy-excel.ldmy-excel-popup-open .user-menu *,\nbody.ldmy-excel.ldmy-excel-popup-open .user-menu-panel *,\nbody.ldmy-excel.ldmy-excel-popup-open .fk-d-menu[data-expanded=\"true\"] * {\n  visibility: visible !important;\n  opacity: 1 !important;\n  pointer-events: auto !important;\n}\n\n/* Excel 开启时弱化 FAB，避免破坏伪装；仍可点设置（无放大动效） */\nbody.ldmy-excel #ldmy-fab {\n  bottom: 56px;\n  opacity: 0.35;\n  transform: none;\n}\nbody.ldmy-excel #ldmy-fab:hover { opacity: 1; transform: none; }\nbody.ldmy-excel #ldmy-panel,\nbody.ldmy-excel #ldmy-overlay { z-index: 100000; }\n\n/* 深色模式兜底：用户列/内容列/横向空白条（改用户列布局后被浅色高特异性规则盖住） */\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .topic-body,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__body {\n  background: var(--ldmy-surface, #1e1e1e) !important;\n  border-color: var(--ldmy-border-soft, #3f3f46) !important;\n  color: var(--ldmy-text-body, #e6e6e6) !important;\n}\n/* 用户列单独用 muted，避免跟正文同色糊成一片 */\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .topic-body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .topic-body > .topic-meta-data,\nbody.ldmy-excel.ldmy-excel-dark .post__body > .topic-meta-data {\n  background: var(--ldmy-surface-muted, #252526) !important;\n  border-right-color: var(--ldmy-border-soft, #3f3f46) !important;\n  color: var(--ldmy-text-dim, #bbb) !important;\n}\n/* 正文列内包装层 / 菜单 / 动作区：去掉白缝 */\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .post__regular,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .post__contents,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .post-menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > .post__menu-area,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .topic-body > section.post-actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .topic-body > section.post-actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .post__row > .post__body > section.post-actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > section.post__actions,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article > .row > .post__body > section.post-actions {\n  background: var(--ldmy-surface, #1e1e1e) !important;\n  border-color: var(--ldmy-border-soft, #3f3f46) !important;\n  color: var(--ldmy-text-body, #e6e6e6) !important;\n}\n/* 引用/展开卡片、楼层间隙 */\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post__embedded-posts {\n  background: var(--ldmy-surface-muted, #252526) !important;\n  border-color: var(--ldmy-border-soft, #3f3f46) !important;\n  border-left-color: #4a7ab0 !important;\n  color: var(--ldmy-text-body, #e6e6e6) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts.top,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post__embedded-posts--top,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .embedded-posts.post__embedded-posts--top {\n  background: var(--ldmy-surface-soft, #2a2a2a) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post .gap,\nbody.ldmy-excel.ldmy-excel-dark .time-gap,\nbody.ldmy-excel.ldmy-excel-dark .small-action {\n  background: var(--ldmy-surface-soft, #2a2a2a) !important;\n  border-color: var(--ldmy-border-soft, #3f3f46) !important;\n  color: var(--ldmy-text-dim, #aaa) !important;\n}\n/* 用户列文字色 */\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .first,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .first a,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > span.first,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > span.first a {\n  color: var(--ldmy-excel-link, #8ec7ff) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .second,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .second a,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > span.second,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > span.second a,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .names > .user-title,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post-infos,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post-info,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .post-date,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .topic-meta-data .post-info,\nbody.ldmy-excel.ldmy-excel-dark .topic-post > article .topic-meta-data .reply-to-tab {\n  color: var(--ldmy-text-dim, #9a9a9a) !important;\n}\n/* 备注/拉黑按钮：深色下别亮边 */\nbody.ldmy-excel.ldmy-excel-dark .ldmy-user-actions button,\nbody.ldmy-excel.ldmy-excel-dark .ldmy-mark-tags .ldmy-mark-tag {\n  background: var(--ldmy-surface-soft, #2a2a2a) !important;\n  border-color: var(--ldmy-border-soft, #555) !important;\n  color: var(--ldmy-text-dim, #bbb) !important;\n}\n/* 引用块/菜单按钮 hover */\nbody.ldmy-excel.ldmy-excel-dark .cooked aside.quote,\nbody.ldmy-excel.ldmy-excel-dark .cooked blockquote {\n  background: var(--ldmy-surface-muted, #252526) !important;\n  border-color: var(--ldmy-border-soft, #3f3f46) !important;\n  border-left-color: #4a7ab0 !important;\n  color: var(--ldmy-text-body, #e6e6e6) !important;\n}\nbody.ldmy-excel.ldmy-excel-dark .post-menu-area .btn:hover,\nbody.ldmy-excel.ldmy-excel-dark .post__menu-area .btn:hover,\nbody.ldmy-excel.ldmy-excel-dark .post-controls .btn:hover {\n  background: var(--ldmy-surface-soft, #2a2a2a) !important;\n  border-color: var(--ldmy-border-soft, #555) !important;\n  color: var(--ldmy-text-body, #e6e6e6) !important;\n}\n\n";

	/** Excel 主题资源（移植自 NGA-BBS-Script，MIT） */
	const EXCEL_FAVICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAt1BMVEUAAABNw4BOxH9NxH9DtHFNxH9PxoJIv3tNxH5QxoFOxX9Nw4BQxoFAr21HuXdOxYBJvHlOxH////9SxYI8qGhOxX86pGZQx4FGwnpCwHdLw304vW/i9upRyYM1u20yu2vR795CsG8vumlIunc2vG7P79w/v3Tb8+Xu+fKm4r5XyIY7vnI5omTW8eEpuGXF7Na86c+E1qZdyotKwXtHuXZBrm4ftF3w+vTm9+6+6dC358ud3rhnzJFRjt3CAAAAEXRSTlMAcPyPS+QQVfiiYSshS/OlZtHVkl8AAAFjSURBVEjHzdbXcoMwEAVQ2wnGNQm7BoNccAhgintL/f/vigRhNGEgq7dwH4CXM6C7w0itxqc7uKvKo14rhppRFXP6PK4Ro55ZQ67WffVX9StB9pbNpNLoWj2xJpWm3fmTSKNOpFEn0qgTaWhyFUQamhgLXrI0SmR6nmysLBtrTJHCsMtLnsvDE0UKsygybZcInc7/EtNwHcwf0XENkyYm8484ywy/HX1mkoQ5MWyX3HCx3ELsMJLY9hpgxQ0XK4C1bdNrCdlcmDT1A4C5ERo0QdcRZieub7aLFJHmgBFEZw/pkqX5SIKTFNQok91tC7C/7RLV6eOMxbgHCHhvaiRrd50EedcEkQKAefPc0ATDNACIDN8XHQRpiGrTj5iHoje16dvOO7xy8dP1waEJ2n78JYQwp0/fRoXlMy/EYl0ew8b8yI0iuqZCNL20vdLpd39v4rTojaijQjnakDqQlDPotpqebx2kcbLxIJSIAAAAAElFTkSuQmCC';
	const EXCEL_ASSETS = {
		office: {
			'H_L_1': 'data:image/png;base64,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',
			'H_R_1': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKoAAAA7CAMAAADckuFWAAAAM1BMVEUidEcOXC/+/v5DiGHY5t7y8vKJtZrI2tCTuqO+1Mh1qIpPj2u2z8FWiXHP4Nchc0b5+fnehcy5AAABPklEQVRo3u2Wja6DIAxG5SsgCP68/9NeFhs1d87MBWNNekwsUWMOtUUaRVEURXkC2NLU59SrweHgLnO3KgAO92R1Cd+6AkdZJRCPr8opzjx/MGsCQCJUm6NvC76Pa1Q51FMtx7eq+KmlUacA+HyVKocabfV2vqb/xS9WYM7OTFEURVEURdnF1KDZQ1VV9TLVPjoXe/MJAklR9bDeW3izYotc15ZBiwV7v2qP8AoB/X9VcQUQhzkOkS8ELARDYCSoOs914PaySnzVPUBVUlbXAhBfq29t5bZdb8GQAFVerNyYzAcCkEVk1YwtCi3BLLStMe6lZ7Hg7ldNbsq+xFW1Q6YSMjrOapZRqwmxjMeUOqSUTMFawyDMP6wgQnV0cbsmSd6u+GnkEUH4zmrI5imqk3+M6sxjttaqqqqiVavwB6e9DBphuEpEAAAAAElFTkSuQmCC',
			'H_L_2': 'data:image/png;base64,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',
			'H_L_3': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPoAAAAcCAMAAAB/L1KQAAAArlBMVEX+/v7m5ub7+/vGxsbLy8uHh4jFiET5+fnR0dH/wotChsKzs7Ph/v+Kyv9ERETs6+vF/////7qWlpZ3d3eISoh/f3+p3P7y8vLh4uL//93V1dX+2qvZ2NpjbaJnp+Hv7+/d3d1AZKS7g1y5ubmpZHjipWB5QECkpKTD5v//58Fdi7xKZYc8PGSNaFewZT+Bxebpw4JmZmZfpsN9s7y9wY5mPY5BQYY6goHYroBbWVt3khACAAACsklEQVRYw+2Zi3LaMBBF15KMnIAtYmpsjBMIlEdD0iR99/9/rCuJVpOCpKhT3GTqNaDXMvLl6O54Bohk0FYicgZtNXDDvXRoIXzSocV4Kp2c9nqWdNLO9VQ6AUu0Qt1/Dx31jvoJqR8A6Ki/Uupi7qKuo3c9kM3ZOX68u8uy23s1fbG+0usP62w3/kM4/456XhQ5WKgb6Y9XP6VPv99L+Xr89c1QtZdbeLgc/B3q/b6DOq+aGdE9Dr7A7LljtT8S+cZP/ePdeC+9p0RPldBe2kvlaCEXIYiO+YJfOphv8YTSimMrqtK7HWmYsCdBEQOAn3p6hlql9AvFWQf2lQX2cyGejHWEep1A2VBal7O6Ft7dSMISYV3NRxgAfuopLFIlXePWsdK/BH4ssmy3DaJulId4XXajhCbJvPQeMp4wVtmS1HlfHhzV49JR5G/SJ+9TtQLT9fkAVqoSBnEP97rqVpQy7jhkZSRXUHkSYZIDOwcxx5eXOur+Jb2XZV+Gqqsr32dEP3kbWOJjUPkW6Q7qjCV0TuzUE1YT4DVLkLmDelFAXiyXcQ4+6qgtNV6XzSqTcTuWA13rAoNAuNdJRdmMN9QBlDHWlA1jMsVOXYxyiDaj4hleR7i7T7rCa+nqvKsxAg+njhcEP80hc1QOwBtWWoGWqF2fdhf1pbR6PtoI8FV4VdYeb1D0+sMAJovr4Zk2Nzb43sqaF0w93OuCUiFbXtccbFEyjHovx2r1AuKcxkXspa7rmnqaW+Apvxlo/Hva39YZzgQ/ToV7XWgDS+4zu40BjT4DB3UYJUUfhFq3UtdTAXFKr+tbsd6TSeJR5M7b5H2T76JudjWZZtIMTu513XXvZ+7HkWdWXNRN6mEmmOGLoo6XPy+EOjlGnbxO6qSj3lE/Rh1eAHVoj3r3F8T/+sfTDxRaM2lYIWt0AAAAAElFTkSuQmCC',
			'F_L_1': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAAAdCAMAAAD2MPKiAAAAeFBMVEXm5ub///+/v7+ZmZkhc0Z3d3fGxsa8////6aioqKiajEb//+J10/1Nc4l/f4Hc3Nze/////8bevGkhjKiWlZVNvOLW1taMjIx1c0Yhc4khpMaa6f/Q0NDKysr/04mzs7O8pEZNc2lNc0a8pIl1pMZNjKhwcHAhc2mvovFdAAABbElEQVRYw+3X2a6DIBAGYLC4YD2gLdW6tZ79/d+woGPiTbHFJWr8Ex2XG78wCqLDHMHDczAImiOj4NBCs+N23AKz40bBxTSx7YTGSJNpcRUhqYuPfqCxRMw1wN0ZteLYouyONJkOJ1GZfPafZ7jTOVR7khrgRBLDACYCaTIdLvrLVdHiqsz7eB9HRcdJUW8czR1T3DVocT4hgbrQKRUhJJN3DXAF46rYttpzVvTaNDjHCFe3XNbg/nNcncOjf8HeZw4F2tIERykCHJz12LQ4xwAHY6d4UlMbbqmrjqEMwLGyiyuTPpse55jggKdGLKgNJ6JygTIAZ3O5QVRfzj5ykLoPAXdrNFBGxc3/znm/oSSkbouLrrI9v9uCZXuatmWhacvpv5ag+2omccDV5wGGAi/k1B+U1S2/Xp0KVol7dRJfJw4JwZsDLgR6lrXi1MK55LzULpxXi1vAL8+2flbJGEELzaZxe/a8GWvDeQAlQh/uJHXZbgAAAABJRU5ErkJggg==',
			'F_R_1': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAwIAAAAdBAMAAADr+sZYAAAAG1BMVEXm5ub///+rq6u/v7+ZmZnb29t3d3fExMSzs7OG1QkwAAAApElEQVRo3u3YsQ2EMAxA0eg2MAX1wQosQMEKDJAmNR0rMDYCGowwNMRI6L8VvuIkDh1e0IZxMwQAAAAsfjVy6JV68z8tIKuiEjyo6JVKVqrARIEdCnyOUcCaQiUF8heIVwUSBSR7gXQxhUoKiEOBaBdIFPAokI5TiDOgOJwB7oEb7vcAbyEle4HIf8CN/R9gK2GiwOcYBdiNOrF3owAAAFg0eNcMfqiRK/yoG8MAAAAASUVORK5CYII=',
			'F_L_2': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAVBAMAAADGNLEtAAAAG1BMVEXx8fFRUFCWlZWFhIR0c3Onp6diYmLQ0NC5ubmJxcUaAAAAiklEQVQY083LMQoCMRSE4dlko1s6SMAyuoiti2gdhBBrG9uHgvbiARa8uLFwfQewcMqPf/CDuYgMVHBBa0Ke4Viw7j9kSX8YITZk0mlFLvvkWvUn4znU3JFcDzgZF8QDEOgy70OROadflItZBEN6PAezp9v1HgS20yVkY1bR+q0q0WVp2Hq8yz/dC8fgEQvypSH/AAAAAElFTkSuQmCC',
			'F_R_2': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAAVBAMAAAAOUc6XAAAAJ1BMVEXx8fHKysp0dHSrq6twcHBnZ2dRUFCnp6eFhIRiYmK5ubmWlZXQ0NBgdEA3AAABDElEQVRIx+3Wv0rEMBzA8a8FTXs4KPgAIYNCHX0FH8Al++EQ5FxKB/9stzl06XbgdKtObrc6FfpWljrEIEdqMHfH0W+W0i4ffg1p4eD0Vydsv5H1d9bZdd9PVqL6JDZ7K26W9b0cFn0Oq18MY2nNsO7BzDgyy9R8Culnqa74rPOKrHhgIablRLb4WRKSSKzDG3td8Ub2XvO6os79ewup1GZYJclKcvk0uZjv0rRK0o5VJaZtbr0s/7S01nC1Jq3XPQHd5bIeJS+Q52kRMC3V5bJCpmVZ7t5CzGvxEbK3gAgvMSueWYialjxdDp1WfNaxmdIYmNHcDTu3IrPCT/lw1t5+E3f0D2Jkjaz/7gtTwGWQ+UQ3fQAAAABJRU5ErkJggg==',
		},
		tencent: {
			'icon_1': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMjRweCIgaGVpZ2h0PSIyNHB4IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHZlcnNpb249IjEuMSI+IDx0aXRsZT5saXN0X2hvbWVfc2VsPC90aXRsZT4gPGRlZnM+IDxsaW5lYXJHcmFkaWVudCB4MT0iNTAlIiB5MT0iMCUiIHgyPSI2My4zNTY0MDE0JSIgeTI9IjEwMCUiIGlkPSJsaW5lYXJHcmFkaWVudC0xIj4gPHN0b3Agc3RvcC1jb2xvcj0iIzcwNzQ3QSIgb2Zmc2V0PSIwJSIvPiA8c3RvcCBzdG9wLWNvbG9yPSIjMzkzRTQ4IiBvZmZzZXQ9IjEwMCUiLz4gPC9saW5lYXJHcmFkaWVudD4gPC9kZWZzPiA8ZyBpZD0ibGlzdF9ob21lX3NlbCIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjEiIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCI+IDxyZWN0IGlkPSLnn6nlvaIiIHg9IjAiIHk9IjAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgcng9IjIiLz4gPHBhdGggZD0iTTEyLjUyNjI5NzgsMy43MDAwOTY4NyBMMTkuMTk2NTQwNiw5LjYwMzQyMDA2IEMxOS43MDc0Njc2LDEwLjA1NTYwMjcgMjAsMTAuNzA1MTQ1NiAyMCwxMS4zODc0MzI2IEwyMCwxOS43MDU4ODI0IEMyMCwyMC4xNDQ0NjE0IDE5LjY0NDQ2MTQsMjAuNSAxOS4yMDU4ODI0LDIwLjUgTDEzLjYsMjAuNSBMMTMuNiwxNy4zOTExNzU3IEMxMy42LDE2LjUwNzUyMDEgMTIuODgzNjU1NiwxNS43OTExNzU3IDEyLDE1Ljc5MTE3NTcgQzExLjExNjM0NDQsMTUuNzkxMTc1NyAxMC40LDE2LjUwNzUyMDEgMTAuNCwxNy4zOTExNzU3IEwxMC40LDE3LjM5MTE3NTcgTDEwLjQsMjAuNSBMNC43OTQxMTc2NSwyMC41IEM0LjM1NTUzODU4LDIwLjUgNCwyMC4xNDQ0NjE0IDQsMTkuNzA1ODgyNCBMNCwxMS4zODc0MzI2IEM0LDEwLjcwNTE0NTYgNC4yOTI1MzIzNSwxMC4wNTU2MDI3IDQuODAzNDU5NDUsOS42MDM0MjAwNiBMMTEuNDczNzAyMiwzLjcwMDA5Njg3IEMxMS43NzQxNzg5LDMuNDM0MTY3ODIgMTIuMjI1ODIxMSwzLjQzNDE2NzgyIDEyLjUyNjI5NzgsMy43MDAwOTY4NyBaIiBpZD0i5b2i54q257uT5ZCIIiBmaWxsPSJ1cmwoI2xpbmVhckdyYWRpZW50LTEpIi8+IDwvZz4gPC9zdmc+',
			'icon_2': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTJweCIgaGVpZ2h0PSIxMnB4IiB2aWV3Qm94PSIwIDAgMTIgMTIiIHZlcnNpb249IjEuMSI+IDx0aXRsZT5pY29uX3RoaXJkYXJ5X2Fycm93X2ZpbGxfZG93bjwvdGl0bGU+IDxnIGlkPSLop4bop4kiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIxIiBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPiA8ZyBpZD0iMDNf6K+E6K66X+ivhOiuuuW9kuahoyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTM0OC4wMDAwMDAsIC0xMzQuMDAwMDAwKSI+IDxnIGlkPSJpY29uX3RoaXJkYXJ5X2Fycm93X2ZpbGxfZG93biIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzQ4LjAwMDAwMCwgMTM0LjAwMDAwMCkiPiA8ZyBpZD0iUEMv5Z+656GAL+eureWktC/kuIoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDYuMDAwMDAwLCA2LjAwMDAwMCkgc2NhbGUoMSwgLTEpIHJvdGF0ZSgtMzYwLjAwMDAwMCkgdHJhbnNsYXRlKC02LjAwMDAwMCwgLTYuMDAwMDAwKSAiPiA8cmVjdCBpZD0i55+p5b2iIiB4PSIwIiB5PSIwIiB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHJ4PSIxLjUiLz4gPHBhdGggZD0iTTYuMTYsNC4yMTMzMzMzMyBMOC43Niw3LjY4IEM4LjgyNjI3NDE3LDcuNzY4MzY1NTYgOC44MDgzNjU1Niw3Ljg5MzcyNTgzIDguNzIsNy45NiBDOC42ODUzODA3Nyw3Ljk4NTk2NDQzIDguNjQzMjc0MDQsOCA4LjYsOCBMMy40LDggQzMuMjg5NTQzMDUsOCAzLjIsNy45MTA0NTY5NSAzLjIsNy44IEMzLjIsNy43NTY3MjU5NiAzLjIxNDAzNTU3LDcuNzE0NjE5MjMgMy4yNCw3LjY4IEw1Ljg0LDQuMjEzMzMzMzMgQzUuOTA2Mjc0MTcsNC4xMjQ5Njc3NyA2LjAzMTYzNDQ0LDQuMTA3MDU5MTYgNi4xMiw0LjE3MzMzMzMzIEM2LjEzNTE2MTEzLDQuMTg0NzA0MTggNi4xNDg2MjkxNSw0LjE5ODE3MjIgNi4xNiw0LjIxMzMzMzMzIFoiIGlkPSLkuInop5LlvaIiIGZpbGw9IiM4MTg2OEYiLz4gPC9nPiA8L2c+IDwvZz4gPC9nPiA8L3N2Zz4=',
			'icon_3': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0ibm9uZSI+PGcgY2xpcC1wYXRoPSJ1cmwoI2EpIj48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTggMS42OTMgNi41NDYgNC41NDljLS4xNC4yNzYtLjM3Mi41NDUtLjYzMi43NDktLjIzNi4xODYtLjYxLjQwNy0xLjA3NC40MzVsLTMuMjMyLjUxMiAyLjM5NCAyLjI1LjAwOC4wMDdjLjQ5NC40ODUuNjkgMS4xNS42OSAxLjczN3YuMDgybC0uNTQgMy4yOTEgMi44ODgtMS41MmExLjQ2IDEuNDYgMCAwIDEgLjgzNS0uMjg5aC4wMTlsLjIzNS0uMDA0LjIxLjAwNi4wMjMuMDAyYy4xMjMuMDA5LjUwOC4wNC44NDcuMjkxbDIuNjE4IDEuNDg0LS41MzUtMy4yNjF2LS4wODJjMC0uMjYyLjA2LS41NjQuMTUtLjgzMy4wOS0uMjYyLjI1MS0uNjIuNTQtLjkwNGwuMDA4LS4wMDggMi4zOTQtMi4yNS0zLjIzMi0uNTExYy0uNDY0LS4wMjgtLjgzOC0uMjUtMS4wNzQtLjQzNWEyLjM1MiAyLjM1MiAwIDAgMS0uNjMyLS43NDlMOCAxLjY5M1ptMy4yNTcgMy4wNDMgNC4wNC42NGMuNzgxLjEyOC45MTIuNjQuMzkgMS4wMjNsLTIuOTk2IDIuODE2Yy0uMjYxLjI1Ni0uMzkxLjc2OC0uMzkxIDEuMDI0bC42NTEgMy45NjhjLjEzLjY0LS4yNiAxLjAyNC0uOTEyLjY0bC0zLjM4OC0xLjkyYy0uMDg2LS4wODUtLjIzMS0uMTE0LS4zNTctLjEyM2wtLjE2NC0uMDA1LS4xOTQuMDAzYy0uMTQuMDA3LS4yMzQuMDM0LS4zMjcuMTI1bC0zLjY0OCAxLjkyYy0uNjE1LjM2Mi0uOTk4LjA0LS45My0uNTM2bC42Ny00LjA3MmMwLS4zODQtLjEzMS0uNzY4LS4zOTItMS4wMjRMLjMxMyA2LjRjLS41MjEtLjUxMS0uMzkxLTEuMDIzLjM5LTEuMDIzbDQuMDQtLjY0Yy4zOSAwIC43ODEtLjM4NC45MTItLjY0TDcuNDc5LjUxMkM3LjYwOS4yNTYgNy44NjkgMCA4IDBjLjEzIDAgLjM5LjEyOC41MjEuNTEybDEuODI0IDMuNTg0Yy4xMy4yNTYuNTIxLjY0LjkxMi42NFoiIGZpbGw9IiM4MTg2OEYiLz48L2c+PGRlZnM+PGNsaXBQYXRoIGlkPSJhIj48cGF0aCBkPSJNMCAyYTIgMiAwIDAgMSAyLTJoMTJhMiAyIDAgMCAxIDIgMnYxMmEyIDIgMCAwIDEtMiAySDJhMiAyIDAgMCAxLTItMlYyWiIgZmlsbD0iI2ZmZiIvPjwvY2xpcFBhdGg+PC9kZWZzPjwvc3ZnPg==',
			'icon_4': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Im03LjU1MyAzLjg5NC4yMS4xMDZIMTV2MTBIMVYzaDQuNzY0bDEuNzg5Ljg5NFpNMCAzYTEgMSAwIDAgMSAxLTFoNC43NjRhMSAxIDAgMCAxIC40NDcuMTA2TDggM2g3YTEgMSAwIDAgMSAxIDF2MTBhMSAxIDAgMCAxLTEgMUgxYTEgMSAwIDAgMS0xLTFWM1ptOSA4LjI4VjkuNUg0di0xaDVWNi43MmMwLS4xMjIuMDkzLS4yMi4yMDgtLjIyYS4yLjIgMCAwIDEgLjEzMy4wNTFsMi41ODQgMi4yOGMuMDg4LjA3OC4xLjIxNi4wMjcuMzFsLS4wMjcuMDI4LTIuNTg0IDIuMjhhLjIuMiAwIDAgMS0uMjkzLS4wMjhBLjIyOC4yMjggMCAwIDEgOSAxMS4yOFoiIGZpbGw9IiM4MTg2OEYiLz48L3N2Zz4=',
			'icon_5': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCBtZWV0IiBzdHlsZT0id2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsiPjxkZWZzPjxjbGlwUGF0aCBpZD0iYW5pbWF0aW9uTWFza19BQWVobXBkWGQ2Ij48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHg9IjAiIHk9IjAiPjwvcmVjdD48L2NsaXBQYXRoPjwvZGVmcz48ZyBjbGlwLXBhdGg9InVybCgjYW5pbWF0aW9uTWFza19BQWVobXBkWGQ2KSI+PGcgdHJhbnNmb3JtPSJtYXRyaXgoMSwwLDAsMSwtMC45ODQsLTAuOTg0KSIgb3BhY2l0eT0iMSIgc3R5bGU9InVzZXItc2VsZWN0OiBub25lOyI+PGcgb3BhY2l0eT0iMSIgdHJhbnNmb3JtPSJtYXRyaXgoMSwwLDAsMSw5LDkpIj48cGF0aCBzdHJva2UtbGluZWNhcD0iYnV0dCIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIgZmlsbC1vcGFjaXR5PSIwIiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiIHN0cm9rZT0icmdiKDEyOSwxMzQsMTQzKSIgc3Ryb2tlLW9wYWNpdHk9IjEiIHN0cm9rZS13aWR0aD0iMSIgZD0iTTAgMCBNMCwtNi41IEMwLC02LjUgMCwtNi41IDAsLTYuNSBDMy41OSwtNi41IDYuNSwtMy41OSA2LjUsMCBDNi41LDAgNi41LDAgNi41LDAgQzYuNSwzLjU5IDMuNTksNi41IDAsNi41IEMtMy41OSw2LjUgLTYuNSwzLjU5IC02LjUsMCBDLTYuNSwtMy41OSAtMy41OSwtNi41IDAsLTYuNSBDMCwtNi41IDAsLTYuNSAwLC02LjUiPjwvcGF0aD48L2c+PC9nPjxnIHRyYW5zZm9ybT0ibWF0cml4KDEsMCwwLDEsMi4xNjIsMy4yMSkiIG9wYWNpdHk9IjEiIHN0eWxlPSJ1c2VyLXNlbGVjdDogbm9uZTsiPjxnIG9wYWNpdHk9IjEiIHRyYW5zZm9ybT0ibWF0cml4KDEsMCwwLDEsNi4wNzcsNC43NDQpIj48cGF0aCBzdHJva2UtbGluZWNhcD0iYnV0dCIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIgZmlsbC1vcGFjaXR5PSIwIiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiIHN0cm9rZT0icmdiKDEyOSwxMzQsMTQzKSIgc3Ryb2tlLW9wYWNpdHk9IjEiIHN0cm9rZS13aWR0aD0iMSIgZD0iTTAgMCBNMy41NzcsLTIuMjQ0IEMzLjU3NywtMi4yNDQgLTAuOTExLDIuMjQ0IC0wLjkxMSwyLjI0NCBDLTAuOTExLDIuMjQ0IC0zLjU3NywtMC40MjMgLTMuNTc3LC0wLjQyMyI+PC9wYXRoPjwvZz48L2c+PC9nPjwvc3ZnPg==',
			'icon_6': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xMiAyMC45OTlIMy4wMjdhMS4wMTQgMS4wMTQgMCAwIDEtMS4wMjctMXYtMTZDMiAzLjQ0OSAyLjQ2IDMgMy4wMjcgM0gxNWw0IDQuNVYxMGgtMlY4LjI2TDE0LjEwMiA1SDR2MTMuOTk5aDh2MlptMi42NjktMTAuNzU2LTUgNC41LS43MDUuNjM1LS42Ny0uNjctMi41MDEtMi41IDEuNDE0LTEuNDE1IDEuODMgMS44MyA0LjI5NC0zLjg2NiAxLjMzOCAxLjQ4NlpNMTkgMTN2M2gzdjJoLTN2M2gtMnYtM2gtM3YtMmgzdi0zaDJaIiBmaWxsPSIjNDU0RDVBIi8+PC9zdmc+',
			'icon_7': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik00IDVoMTZ2Mkg0VjVabTAgNmgxNnYySDR2LTJabTE2IDZINHYyaDE2di0yWiIgZmlsbD0iIzQ1NEQ1QSIvPjwvc3ZnPg==',
			'icon_8': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Im05LjE1IDQgLjcyOCAxLjk5OWguMDAybC43MjggMmgtLjAwMmwxLjA5MiAzaC4wMDJsLjcyOCAyaC0uMDAyTDE0Ljk3NiAyMGgtMi4xMjlsLTEuNDU2LTRINC42MDhsLTEuNDU2IDRIMS4wMjVMNi44NDYgNEg5LjE1Wm0xMy40OSAxMnYyaC01LjJsLS43MjgtMmg1LjkyOFpNNS4zMzYgMTQgOCA2LjY4IDEwLjY2MyAxNEg1LjMzNlptMTcuMzA0LTN2MmgtNy4wMmwtLjcyOC0yaDcuNzQ4Wm0wLTNWNmgtOS41NjhsLjcyOCAyaDguODRaIiBmaWxsPSIjNDU0RDVBIi8+PC9zdmc+',
			'icon_9': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xMy41IDcuNWEzLjUgMy41IDAgMSAwLTcgMCAzLjUgMy41IDAgMCAwIDcgMFptLTUgMGExLjUgMS41IDAgMSAxIDMgMCAxLjUgMS41IDAgMCAxLTMgMFptNS41NjMgNS4yODZBMTEuMzMgMTEuMzMgMCAwIDAgMTAgMTJjLTMuNjMyIDAtOCAyLjA1Mi04IDUuMTI5VjIxaDEwdi0ySDR2LTEuODcxbC4wMDYtLjExN0M0LjE1NyAxNS41OTkgNi45OTMgMTQgMTAgMTRsLjI1LjAwNGMxLjQ4Ny4wNDMgMi45MTUuNDY4IDMuOTc1IDEuMDU3bC4wNzItLjA0NWEzLjk5NCAzLjk5NCAwIDAgMS0uMjM0LTIuMjNabTEuNzU4IDMuN0MxNC43OTMgMTYuOTYxIDE0IDE3Ljc1NiAxNCAxOC43NVYyMWg4di0yLjI1QzIyIDE3LjEgMTkuODE2IDE2IDE4IDE2YTUuMzc0IDUuMzc0IDAgMCAwLTIuMTc5LjQ4NlptMS43MTQtMS4wNEEyLjAwMiAyLjAwMiAwIDAgMSAxNiAxMy41YTIgMiAwIDEgMSAxLjUzNSAxLjk0NloiIGZpbGw9IiM0NTRENUEiLz48L3N2Zz4=',
			'icon_10': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNOCA4LjI1aDZjMi43NjEgMCA1IDEuOTg5IDUgNC43NWE1IDUgMCAwIDEtNSA1SDciIHN0cm9rZT0iIzQ2NEQ1QSIgc3Ryb2tlLXdpZHRoPSIxLjI1Ii8+PHBhdGggZD0iTTkgNS4zNzJWMTAuOWEuMi4yIDAgMCAxLS4zMDEuMTczTDQuMjc2IDguNDc0YS4yLjIgMCAwIDEtLjAwOS0uMzM5bDQuNDIzLTIuOTNhLjIuMiAwIDAgMSAuMzEuMTY4WiIgZmlsbD0iIzQ2NEQ1QSIvPjwvZz48L3N2Zz4=',
			'icon_11': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTYgOC4yNWgtNmMtMi43NjEgMC01IDEuOTg5LTUgNC43NWE1IDUgMCAwIDAgNSA1aDciIHN0cm9rZT0iIzQ2NEQ1QSIgc3Ryb2tlLXdpZHRoPSIxLjI1Ii8+PHBhdGggZD0iTTE1IDUuMzcyVjEwLjlhLjIuMiAwIDAgMCAuMzAxLjE3M2w0LjQyMy0yLjU5OWEuMi4yIDAgMCAwIC4wMDktLjMzOWwtNC40MjMtMi45M2EuMi4yIDAgMCAwLS4zMS4xNjhaIiBmaWxsPSIjNDY0RDVBIi8+PC9nPjwvc3ZnPg==',
			'icon_12': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHBhdGggZD0iTTEzLjUgMTR2NC4wNzhMMTAuNSAyMHYtNmgzWm01LTlhLjUuNSAwIDAgMSAuNS41djVhLjUuNSAwIDAgMS0uNS41aC00LjIzMWwtMS41MTkgMS40ODhWMTRIMTEuNXYtMmwuMDA3LS4wMDFMMTIuNTI1IDExSDUuNWEuNS41IDAgMCAxLS41LS41di01YS41LjUgMCAwIDEgLjUtLjVoMTNabS0uNzUgMS4yNUg2LjI1djMuNWgxMS41di0zLjVaIiBmaWxsPSIjNDY0RDVBIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=',
			'icon_13': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0iIzQ2NEQ1QSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNNSAxOC4yNWgxNHYxLjI1SDV6Ii8+PHBhdGggZD0ibTEzLjM1MyA0Ljk3NCA1LjQgNS40Yy4xNjYuMTY2LjE4LjQyNy4wNDUuNjJsLS4wNTguMDY4TDEyLjgwMSAxN2gtMS42ODlsMi45MzEtMi45My00LjM4Ny00LjM4Ny00LjAyOCA0LjAyN0w4LjkxOCAxN0g3LjE2NmwtMi45MTktMi45MmEuNDg3LjQ4NyAwIDAgMSAuMDEzLS42ODdsOC40MDUtOC40MDZhLjQ4Ny40ODcgMCAwIDEgLjY4OC0uMDEzWiIgZmlsbC1ydWxlPSJub256ZXJvIi8+PHBhdGggZD0iTTcgMTUuNzVoNkwxMiAxN0g4eiIvPjwvZz48L3N2Zz4=',
			'icon_14': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgzIDMpIj48Y2lyY2xlIHN0cm9rZT0iIzQ2NEQ1QSIgc3Ryb2tlLXdpZHRoPSIxLjI1IiBjeD0iOSIgY3k9IjkiIHI9IjguMzc1Ii8+PHBhdGggZmlsbD0iIzQ0NEQ1QiIgZmlsbC1ydWxlPSJub256ZXJvIiBkPSJNOS42MSA1djMuMzY5TDEzIDguMzd2MS4yNWwtMy4zOS0uMDAxVjEzSDguMzZWOS42MTlMNSA5LjYyVjguMzdsMy4zNi0uMDAxVjV6Ii8+PC9nPjxyZWN0IHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgcng9IjIiLz48cGF0aCBkPSJNMTIgM2E5IDkgMCAxIDEgMCAxOCA5IDkgMCAwIDEgMC0xOFptMCAxLjI1YTcuNzUgNy43NSAwIDEgMCAwIDE1LjUgNy43NSA3Ljc1IDAgMCAwIDAtMTUuNVpNMTIuNjEgOHYzLjM2OWwzLjM5LjAwMXYxLjI1bC0zLjM5LS4wMDFWMTZoLTEuMjV2LTMuMzgxTDggMTIuNjJ2LTEuMjVsMy4zNi0uMDAxVjhoMS4yNVoiIGZpbGw9IiM0NjRENUEiIGZpbGwtcnVsZT0ibm9uemVybyIvPjwvZz48L3N2Zz4=',
			'icon_15': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMCAwaDI0djI0SDB6Ii8+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNSA2KSI+PHJlY3Qgc3Ryb2tlPSIjNDY0RDVBIiBzdHJva2Utd2lkdGg9IjEuMjUiIHg9IjQuNjI1IiB5PSIuNjI1IiB3aWR0aD0iNi4yNSIgaGVpZ2h0PSIxMS4yNSIgcng9IjMuMTI1Ii8+PGNpcmNsZSBmaWxsPSIjNDY0RDVBIiBjeD0iMSIgY3k9IjExIiByPSIxIi8+PC9nPjwvZz48L3N2Zz4=',
			'icon_16': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgc3Ryb2tlPSIjNDY0RDVBIiBzdHJva2Utd2lkdGg9IjEuMyIgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTIuNSA2LjE1SDcuNjV2NS43aDQuODVjLjc4NyAwIDEuNS0uMzE5IDIuMDE1LS44MzVBMi44NDEgMi44NDEgMCAwIDAgMTUuMzUgOWMwLS43ODctLjMxOS0xLjUtLjgzNS0yLjAxNUEyLjg0MSAyLjg0MSAwIDAgMCAxMi41IDYuMTVaTTEzLjI1IDExLjloLTUuNnY2LjJoNS42YTMuMDkgMy4wOSAwIDAgMCAyLjE5Mi0uOTA4QTMuMDkgMy4wOSAwIDAgMCAxNi4zNSAxNWEzLjA5IDMuMDkgMCAwIDAtLjkwOC0yLjE5MiAzLjA5IDMuMDkgMCAwIDAtMi4xOTItLjkwOFoiLz48L2c+PC9zdmc+',
			'icon_17': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0iIzQ2NEQ1QSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTMuMDc1IDUuNSAxOCAxOWgtMS40OTJMMTIgNi42NCA3LjQ5MSAxOUg2bDQuOTIzLTEzLjVoMi4xNTJaIi8+PHBhdGggZD0iTTcuOTY2IDEzLjdoOFYxNWgtOHoiLz48L2c+PC9zdmc+',
			'icon_18': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0iIzQ2NEQ1QSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJtMTkuNzUgMTMgMS4wODUgMmMuMjIuNDEuMjIuOTEyLS4wMDIgMS4zMjItLjIyMi40MS0uNjMzLjY2Ny0xLjA4My42NzhhMS4yNzIgMS4yNzIgMCAwIDEtMS4wODMtLjY3OEExLjM5NyAxLjM5NyAwIDAgMSAxOC42NjUgMTVsMS4wODUtMloiLz48cGF0aCBkPSJNMTguODU4IDExLjMxNGMuMTkuMTkuMTkuNDk3IDAgLjY4NkwxMiAxOC44NThhLjQ4NS40ODUgMCAwIDEtLjY4NiAwbC02LjE3Mi02LjE3MmEuNDg1LjQ4NSAwIDAgMSAwLS42ODZMMTIgNS4xNDJjLjE5LS4xOS40OTYtLjE5LjY4NiAwbDYuMTcyIDYuMTcyWm0tMS40NC4zNDMtNS4wNzUtNS4wNzUtNS43NiA1Ljc2IDUuMDc0IDUuMDc2IDUuNzYtNS43NloiIGZpbGwtcnVsZT0ibm9uemVybyIvPjxwYXRoIGQ9Im02IDEzIDUuNjU5IDQuOTcxTDE3LjExNiAxM3oiLz48L2c+PC9zdmc+',
			'icon_19': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBvcGFjaXR5PSIuMDYiIGQ9Ik0wIDBoMjR2MjRIMHoiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg1IDUpIj48cGF0aCBmaWxsPSIjNDY0RDVBIiBkPSJNNyAxaDEuMnYxM0g3eiIvPjxyZWN0IHN0cm9rZT0iIzQ2NEQ1QSIgc3Ryb2tlLXdpZHRoPSIxLjIiIHg9Ii42IiB5PSIuNiIgd2lkdGg9IjEzLjgiIGhlaWdodD0iMTMuOCIgcng9Ii41Ii8+PHBhdGggZmlsbD0iIzQ2NEQ1QSIgZD0iTTE0IDd2MS4ySDFWN3oiLz48L2c+PC9nPjwvc3ZnPg==',
			'icon_20': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48ZyBpZD0i6KeG6KeJIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMSIgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48ZyBpZD0iMDNf6K+E6K66X+ivhOiuuuW9kuahoyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTI0MyAtMTk1KSI+PGcgaWQ9Iue8lue7hCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjQzIDE5NSkiPjxyZWN0IGlkPSJiZyIgeD0iMCIgeT0iMCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiByeD0iMiIvPjxwYXRoIGQ9Ik03IDExdjJINXYtMmgyWm02IDB2MmgtMnYtMmgyWm02IDB2MmgtMnYtMmgyWiIgaWQ9IuW9oueKtue7k+WQiCIgZmlsbD0iIzQ2NEQ1QSIgZmlsbC1ydWxlPSJub256ZXJvIi8+PC9nPjwvZz48L2c+PC9zdmc+',
			'icon_21': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHBhdGggZD0iTTE5IDE2LjZWMThINXYtMS40aDE0Wm0tNi01LjN2MS40SDV2LTEuNGg4Wk0xOSA2djEuNEg1VjZoMTRaIiBmaWxsPSIjNDY0RDVBIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=',
			'icon_22': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHBhdGggZD0ibTEyIDE0IDIuNSAzaC0xLjg3djNoLTEuMjV2LTNIOS41bDIuNS0zWm03LjUtMi43djEuNGgtMTV2LTEuNGgxNVpNMTIuNjMgNGwtLjAwMSAyLjk5OUwxNC41IDcgMTIgMTAgOS41IDdsMS44NzktLjAwMUwxMS4zOCA0aDEuMjVaIiBmaWxsPSIjNDY0RDVBIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=',
			'icon_23': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMSAxaDIydjIySDF6Ii8+PHBhdGggZD0iTTE2LjEyNSAxMS4zYTMuMzc1IDMuMzc1IDAgMCAxIDAgNi43NUgxNXYxLjZsLTMtMi4yMjR2LS4wNTJsMy0yLjIyNHYxLjQ5OWwxLjEyNS4wMDFhMS45NzUgMS45NzUgMCAxIDAgMC0zLjk1TDE0IDEyLjY5OXYuMDAxSDV2LTEuNGgxMS4xMjVaTTEwIDE2LjZWMThINXYtMS40aDVaTTE5IDZ2MS40SDVWNmgxNFoiIGZpbGw9IiM0NjRENUEiLz48L2c+PC9zdmc+',
			'icon_24': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHBhdGggZD0iTTEwLjUgNWEuNS41IDAgMCAxIC41LjV2NEg5LjY5OUw5LjcgNi4zSDV2MTIuNGg0LjdsLS4wMDEtMy4ySDExdjRhLjUuNSAwIDAgMS0uNS41SDQuMmEuNS41IDAgMCAxLS41LS41di0xNGEuNS41IDAgMCAxIC41LS41aDYuM1ptOC4zIDBhLjUuNSAwIDAgMSAuNDkyLjQxbC4wMDguMDl2MTRhLjUuNSAwIDAgMS0uNDEuNDkyTDE4LjggMjBoLTYuM2EuNS41IDAgMCAxLS40OTItLjQxTDEyIDE5LjV2LTRoMS4zMDFsLS4wMDEgMy4ySDE4VjYuM2gtNC43bC4wMDEgMy4ySDEydi00YS41LjUgMCAwIDEgLjQxLS40OTJMMTIuNSA1aDYuM1pNOC41IDEwLjVsMi41IDEuOTc1di4wNUw4LjUgMTQuNVYxM0g2LjI1di0xSDguNXYtMS41Wm02IDBWMTJoMi4yNXYxSDE0LjV2MS41TDEyIDEyLjUyNXYtLjA1bDIuNS0xLjk3NVoiIGZpbGw9IiM0NjRENUEiIGZpbGwtcnVsZT0ibm9uemVybyIvPjwvc3ZnPg==',
			'icon_25': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTguNSA1YS41LjUgMCAwIDEgLjUuNXYxM2EuNS41IDAgMCAxLS41LjVoLTEzYS41LjUgMCAwIDEtLjUtLjV2LTEzYS41LjUgMCAwIDEgLjUtLjVoMTNaTTYuMjUgMTcuNzVoNS4xMDl2LTUuMTI1SDYuMjV2NS4xMjVabTExLjUtNS4xMjVoLTUuMTQxdjUuMTI1aDUuMTQxdi01LjEyNVptMC0xLjI1VjYuMjVoLTUuMTQxdjUuMTI1aDUuMTQxWk0xMS4zNTkgNi4yNUg2LjI1djUuMTI1aDUuMTA5VjYuMjVaIiBmaWxsPSIjNDY0RDVBIi8+PHBhdGggc3Ryb2tlPSIjNDY0RDVBIiBkPSJNNiAxOCAxOCA2TTYgMTJsNi4wMTUtNiIvPjwvZz48L3N2Zz4=',
			'icon_26': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHBhdGggZD0ibTkuMjI1IDcgNS42NzYgNC42MTJhLjUuNSAwIDAgMSAwIC43NzZMOS4yMjQgMTdIMTl2MS41SDYuNDA4YS41LjUgMCAwIDEtLjMxNS0uODg4TDEzIDEyIDYuMDkzIDYuMzg4YS41LjUgMCAwIDEgLjMxNS0uODg4SDE5VjdIOS4yMjVaIiBmaWxsPSIjNDY0RDVBIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=',
			'icon_27': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHBhdGggZD0iTTE4LjQwOCA1YS41LjUgMCAwIDEgLjQwMi43OTdMMTMgMTMuNjQ4djQuNjAybC0xLjUwMiAxLjMxNWEuMy4zIDAgMCAxLS40OTgtLjIyNnYtNS42OUw1LjE5IDUuNzk3QS41LjUgMCAwIDEgNS41OTIgNWgxMi44MTZabS0xLjc4NyAxLjRINy4zNzhMMTIgMTIuNjQ2IDE2LjYyMSA2LjRaIiBmaWxsPSIjNDY0RDVBIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=',
			'icon_28': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0iIzQ2NEQ1QSIgZmlsbC1ydWxlPSJldmVub2RkIj48ZyBmaWxsLXJ1bGU9Im5vbnplcm8iIHN0cm9rZT0iIzQ2NEQ1QSIgc3Ryb2tlLXdpZHRoPSIuMjUiPjxwYXRoIGQ9Ik05LjE2IDE3LjI5SDYuNzNMNi4xMyAxOUg1bDIuMzMtNkg4LjZsMi4zMiA2SDkuNzVsLS41OS0xLjcxWm0tLjI2LS43NC0uMy0uODFjLS4yNC0uNjUtLjQ1LTEuMzItLjY3LTItLjIuNjktLjQyIDEuMzUtLjY1IDJsLS4yOS44MUg4LjlaTTUuMjggMTEuMTMgOS4xMSA2LjVINS42di0uOGg1di41N0w2Ljc3IDEwLjloMy44M3YuOEg1LjI4eiIvPjwvZz48cGF0aCBkPSJtMTYuNSAxOS4zIDIuNS00LTEuODUxLjAwMUwxNy4xNSA1LjJoLTEuM2wtLjAwMSAxMC4xMDFMMTQgMTUuM2wyLjUgNFoiLz48L2c+PC9zdmc+',
			'icon_29': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xNy42MjUgMy4zNzdjMC0uNzQ0LS45ODYtMS4wMDYtMS4zNTUtLjM2TDkuOTIzIDE0LjEyNWgzLjQ1MnY2Ljk5OGMwIC43NDQuOTg2IDEuMDA2IDEuMzU0LjM2bDYuMzQ4LTExLjEwOGgtMy40NTJWMy4zNzdabS01LjU0OCA5LjQ5OCA0LjI5OC03LjUyMXY2LjI3MWgyLjU0OGwtNC4yOTggNy41MjJ2LTYuMjcyaC0yLjU0OFpNOCAxMnYxLjI1SDNWMTJoNVpNNiA4SDV2MS4yNWg1VjhINlptMCA4SDV2MS4yNWg1VjE2SDZaIiBmaWxsPSIjNDU0RDVBIi8+PC9zdmc+',
			'icon_30': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIj4gPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xNC41NDEgOC45MzU3OUMxNS4yMjEgOS4zNTI0OSAxNi4xMSA5LjEzOTA5IDE2LjUyNjcgOC40NTkxNEMxNi45NDM0IDcuNzc5MTggMTYuNzMgNi44OTAxNiAxNi4wNSA2LjQ3MzQ1QzE1LjM3MDEgNi4wNTY3NSAxNC40ODExIDYuMjcwMTUgMTQuMDY0NCA2Ljk1MDFDMTMuNjQ3NiA3LjYzMDA2IDEzLjg2MSA4LjUxOTA4IDE0LjU0MSA4LjkzNTc5Wk0xMy44ODc4IDEwLjAwMTZDMTUuMTU2NCAxMC43NzkgMTYuODE1IDEwLjM4MDkgMTcuNTkyNSA5LjExMjNDMTguMzY5OSA3Ljg0MzczIDE3Ljk3MTggNi4xODUxMSAxNi43MDMyIDUuNDA3NjhDMTUuNDM0NiA0LjYzMDI0IDEzLjc3NiA1LjAyODM4IDEyLjk5ODYgNi4yOTY5NEMxMi4yMjExIDcuNTY1NTEgMTIuNjE5MyA5LjIyNDEzIDEzLjg4NzggMTAuMDAxNloiIGZpbGw9IiM0NTRENUEiLz4gPHBhdGggZD0iTTEzLjg3ODkgOC45OTYwOUwxNC45NDQ3IDkuNjQ5MjVMMTIuNDM4OSAxMy43MzhMMTEuMzczMSAxMy4wODQ4TDEzLjg3ODkgOC45OTYwOVoiIGZpbGw9IiM0NTRENUEiLz4gPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xMy44Nzg5IDguOTk2MDlMMTEuMzczMSAxMy4wODQ4TDEyLjQzODkgMTMuNzM4TDE0Ljk0NDcgOS42NDkyNUwxMy44Nzg5IDguOTk2MDlaIiBmaWxsPSIjNDU0RDVBIi8+IDxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNi4yNSAxNC4wODk4VjE2Ljk3NzhIMTcuMjE5OVYxNC4wODk4SDYuMjVaTTUuODk3OTkgMTIuODM5OEM1LjQwMjA0IDEyLjgzOTggNSAxMy4yNDE5IDUgMTMuNzM3OFYxNy4zMjk4QzUgMTcuODI1NyA1LjQwMjA0IDE4LjIyNzggNS44OTc5OSAxOC4yMjc4SDE3LjU3MTlDMTguMDY3OCAxOC4yMjc4IDE4LjQ2OTkgMTcuODI1OCAxOC40Njk5IDE3LjMyOThWMTMuNzM3OEMxOC40Njk5IDEzLjI0MTkgMTguMDY3OCAxMi44Mzk4IDE3LjU3MTkgMTIuODM5OEg1Ljg5Nzk5WiIgZmlsbD0iIzQ1NEQ1QSIvPiA8cGF0aCBkPSJNOC41OTE4OCAxNS41ODU1QzguNTkxODggMTYuMDgxNCA4LjE4OTg0IDE2LjQ4MzUgNy42OTM4OSAxNi40ODM1QzcuMTk3OTQgMTYuNDgzNSA2Ljc5NTkgMTYuMDgxNCA2Ljc5NTkgMTUuNTg1NUM2Ljc5NTkgMTUuMDg5NSA3LjE5Nzk0IDE0LjY4NzUgNy42OTM4OSAxNC42ODc1QzguMTg5ODQgMTQuNjg3NSA4LjU5MTg4IDE1LjA4OTUgOC41OTE4OCAxNS41ODU1WiIgZmlsbD0iIzQ1NEQ1QSIvPiA8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTcuNjkzODkgMTYuNDgzNUM4LjE4OTg0IDE2LjQ4MzUgOC41OTE4OCAxNi4wODE0IDguNTkxODggMTUuNTg1NUM4LjU5MTg4IDE1LjA4OTUgOC4xODk4NCAxNC42ODc1IDcuNjkzODkgMTQuNjg3NUM3LjE5Nzk0IDE0LjY4NzUgNi43OTU5IDE1LjA4OTUgNi43OTU5IDE1LjU4NTVDNi43OTU5IDE2LjA4MTQgNy4xOTc5NCAxNi40ODM1IDcuNjkzODkgMTYuNDgzNVoiIGZpbGw9IiM0NTRENUEiLz4gPC9zdmc+',
			'icon_31': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHBhdGggZD0iTTUuOTkgNi40OWE2LjUgNi41IDAgMCAxIDkuNjkyIDguNjMybDIuNDE3IDIuNDE2YS42MjUuNjI1IDAgMSAxLS44ODQuODg0bC0yLjQtMi40QTYuNSA2LjUgMCAwIDEgNS45OSA2LjQ5Wm0uOTkuOTlhNS4xIDUuMSAwIDEgMCA3LjIxMiA3LjIxMkE1LjEgNS4xIDAgMCAwIDYuOTggNy40OFoiIGZpbGw9IiM0NjRENUEiIGZpbGwtcnVsZT0ibm9uemVybyIvPjwvc3ZnPg==',
			'icon_32': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMCAwaDI0djI0SDB6Ii8+PHBhdGggc3Ryb2tlPSIjNDY0RDVBIiBzdHJva2Utd2lkdGg9IjEuMzUiIGQ9Ik02LjM0MyAxNSAxMiA5LjM0MyAxNy42NTcgMTUiLz48L2c+PC9zdmc+',
			'icon_33': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiPjxkZWZzPjxwYXRoIGQ9Ik0xMyA1djZoNnYyaC02djZoLTJ2LTZINXYtMmg2VjVoMnoiIGlkPSJhIi8+PC9kZWZzPjx1c2UgZmlsbD0iIzQ2NEQ1QSIgeGxpbms6aHJlZj0iI2EiIGZpbGwtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg==',
			'icon_34': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48ZyBzdHJva2U9IiM0NjRkNWEiIHN0cm9rZS13aWR0aD0iMS44IiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJtMTIgNS43NzggNy41NTYgNC03LjU1NiA0LTcuNTU2LTR6Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBkPSJtMTkuNTU2IDE0LjY2Ny03LjU1NiA0LTcuNTU2LTQiLz48L2c+PC9zdmc+',
			'icon_35': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSI+PHBhdGggZD0iTTEzLjUgNS41djVoNXYzaC01djVoLTN2LTVoLTV2LTNoNXYtNWgzWiIgZmlsbD0iI0NCQ0REMSIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNOS4yNSA1SDUuODc1QS44NzUuODc1IDAgMCAwIDUgNS44NzV2MTIuMjVjMCAuNDgzLjM5Mi44NzUuODc1Ljg3NWgxMi4yNWEuODc1Ljg3NSAwIDAgMCAuODc1LS44NzVWNS44NzVBLjg3NS44NzUgMCAwIDAgMTguMTI1IDVIOS4yNVptMCAxLjI1aC0zdjNoM3YtM1ptLTMgNC4yNWg0LjI1VjYuMjVoM3Y0LjI1aDQuMjV2M0gxMy41djQuMjVoLTNWMTMuNUg2LjI1di0zWm0wIDQuMjV2M2gzdi0zaC0zWm04LjUgM2gzdi0zaC0zdjNabTMtOC41di0zaC0zdjNoM1oiIGZpbGw9IiM0NTRENUEiLz48L3N2Zz4=',
			'icon_36': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMCAwaDI0djI0SDB6Ii8+PHBhdGggZD0ibTkuODA5IDEzLjMwOS44ODMuODgzLTMuNTU4IDMuNTZoMi44NThWMTlINXYtNC45OTVoMS4yNDhsLS4wMDEgMi44NjggMy41NjItMy41NjR6bTQuMzgyIDAgMy41NjIgMy41NjR2LTIuODY4SDE5VjE5aC00Ljk5MnYtMS4yNDlsMi44NTguMDAxLTMuNTU4LTMuNTYuODgzLS44ODN6TTkuOTkxIDV2MS4yNDlsLTIuODU4LS4wMDEgMy41NTkgMy41Ni0uODgzLjg4My0zLjU2Mi0zLjU2NHYyLjg2OEg1VjVoNC45OTJ6TTE5IDV2NC45OTVoLTEuMjQ4bC4wMDEtMi44NjgtMy41NjIgMy41NjQtLjg4My0uODgzIDMuNTU5LTMuNTZoLTIuODU5VjVIMTl6IiBmaWxsPSIjNDY0RDVBIi8+PC9nPjwvc3ZnPg==',
		},
	};
	function getExcelAsset(theme, key) {
		const t = EXCEL_ASSETS[theme] || EXCEL_ASSETS.tencent;
		return (t && t[key]) || '';
	}

	/** @type excelThemes */
	const excelThemes = {
		normalizeTheme(theme) {
			return theme === 'office' ? 'office' : 'tencent';
		},

		columnLetters() {
			const base = [];
			for (let i = 65; i < 91; i++) base.push(String.fromCharCode(i));
			const out = [];
			['', 'A', 'B', 'C'].forEach((n) => base.forEach((c) => out.push(`${n}${c}`)));
			return out;
		},

		ico(theme, key, size) {
			const url = getExcelAsset(theme, key);
			if (!url) return '';
			return `<div class="${PREFIX}-excel-ico ${PREFIX}-excel-ico${size}" style="background-image:url(${url})"></div>`;
		},

		vsep(h = 16, m = '0 8px') {
			return `<div class="${PREFIX}-excel-vsep" style="height:${h}px;margin:${m}"></div>`;
		},

		buildTencent(script) {
			const t = 'tencent';
			const cols = this.columnLetters()
				.map((c) => `<div class="${PREFIX}-excel-column">${c}</div>`)
				.join('');
			// 工具栏
			const tb = [
				[10, 11, 12, 13].map((i) => this.ico(t, `icon_${i}`, 20)).join(''),
				this.vsep(16, '0 4px'),
				this.ico(t, 'icon_14', 20),
				`<div class="${PREFIX}-excel-toolbar-label">插入</div>`,
				this.ico(t, 'icon_2', 12),
				this.vsep(16, '0 8px'),
				`<div class="${PREFIX}-excel-toolbar-label" style="padding:0 30px 0 4px">常规</div>`,
				this.ico(t, 'icon_2', 12),
				this.ico(t, 'icon_15', 20),
				`<div style="margin-left:1px;display:flex;flex-direction:column;justify-content:center">` +
				`<div class="${PREFIX}-excel-ico ${PREFIX}-excel-ico12" style="transform:rotate(180deg);background-image:url(${getExcelAsset(t, 'icon_2')})"></div>` +
				this.ico(t, 'icon_2', 12) +
				`</div>`,
				this.vsep(16, '0 4px'),
				`<div class="${PREFIX}-excel-toolbar-label" style="padding:0 4px 0 16px">默认字体</div>`,
				this.ico(t, 'icon_2', 12),
				`<div class="${PREFIX}-excel-toolbar-label" style="padding:0 4px 0 13px">10</div>`,
				this.ico(t, 'icon_2', 12),
				this.ico(t, 'icon_16', 20),
				// 取色/样式组
				`<div style="display:flex;align-items:center;margin-left:6px">` +
				this.ico(t, 'icon_17', 20) +
				`<div style="width:14px;height:3px;background:#000;margin:0 2px 0 0;border-radius:1px"></div>` +
				this.ico(t, 'icon_2', 12) +
				`</div>`,
				this.vsep(),
				[18, 19].map((i) => this.ico(t, `icon_${i}`, 20)).join(''),
				this.ico(t, 'icon_2', 12),
				this.ico(t, 'icon_20', 20),
				this.vsep(),
				[21, 22, 23, 24]
					.map(
						(i, idx) =>
							this.ico(t, `icon_${i}`, 20) +
							this.ico(t, 'icon_2', 12) +
							(idx < 3 ? `<span style="width:8px;display:inline-block"></span>` : '')
					)
					.join(''),
				this.vsep(),
				this.ico(t, 'icon_25', 20),
				this.ico(t, 'icon_2', 12),
				this.vsep(),
				[26, 27, 28, 29]
					.map(
						(i, idx) =>
							this.ico(t, `icon_${i}`, 20) +
							this.ico(t, 'icon_2', 12) +
							(idx < 3 ? `<span style="width:8px;display:inline-block"></span>` : '')
					)
					.join(''),
				this.vsep(),
				this.ico(t, 'icon_30', 20),
				this.ico(t, 'icon_2', 12),
				this.vsep(),
				[31, 32].map((i) => this.ico(t, `icon_${i}`, 20)).join(''),
				`<div class="${PREFIX}-excel-grow"></div>`,
			].join('');

			return `
        <div class="${PREFIX}-excel-header" data-theme="tencent">
          <div class="${PREFIX}-excel-titlebar">
            <div class="${PREFIX}-excel-home" role="link" title="返回首页" aria-label="返回首页">${this.ico(t, 'icon_1', 24)}</div>
            ${this.ico(t, 'icon_2', 12)}
            ${this.vsep(24, '0 12px')}
            <div class="${PREFIX}-excel-titlebar-title"></div>
            ${this.ico(t, 'icon_3', 16)}
            <span style="width:12px"></span>
            ${this.ico(t, 'icon_4', 16)}
            <span style="width:10px"></span>
            ${this.ico(t, 'icon_5', 16)}
            <div class="${PREFIX}-excel-muted">上次修改是在刚刚进行的</div>
            <div class="${PREFIX}-excel-grow"></div>
            ${this.vsep(24, '0 12px')}
            <div class="${PREFIX}-excel-chrome-actions" data-ldmy-chrome="1">
              <button type="button" class="${PREFIX}-excel-chrome-btn" data-act="search" title="搜索"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg></button>
              <button type="button" class="${PREFIX}-excel-chrome-btn" data-act="lang" title="语言 / 主题切换"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 3 2.5 15 0 18"/><path d="M12 3c-2.5 3-2.5 15 0 18"/></svg></button>
              <button type="button" class="${PREFIX}-excel-chrome-btn" data-act="me" aria-label="我的"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>
            </div>
            <div class="${PREFIX}-excel-fish" title="打开摸鱼设置" role="button">🐟</div>
          </div>
          <div class="${PREFIX}-excel-toolbar">${tb}</div>
          <div class="${PREFIX}-excel-formulabar">
            <div class="${PREFIX}-excel-fx-cell">A1</div>
            <div class="${PREFIX}-excel-fx-value"></div>
          </div>
          <div class="${PREFIX}-excel-h4">
            <div class="${PREFIX}-excel-sub"><div></div></div>
            ${cols}
          </div>
        </div>
        <div class="${PREFIX}-excel-footer" data-theme="tencent">
          ${this.ico(t, 'icon_33', 24)}
          <span style="width:10px"></span>
          ${this.ico(t, 'icon_34', 24)}
          <div class="${PREFIX}-excel-sheet-tab">
            <span class="${PREFIX}-excel-sheet-name">工作表1</span>
          </div>
          <span style="width:10px"></span>
          ${this.ico(t, 'icon_35', 24)}
          ${this.ico(t, 'icon_2', 12)}
          <div class="${PREFIX}-excel-footer-meta">
            <span class="${PREFIX}-excel-count"></span>
            <div class="${PREFIX}-excel-zoom">
              ${this.ico(t, 'icon_36', 24)}
              <span>-</span><span>100%</span><span>+</span>
            </div>
          </div>
        </div>`;
		},

		slice(theme, key, side) {
			const url = getExcelAsset(theme, key);
			if (!url) return '';
			return `<img class="${PREFIX}-excel-slice ${PREFIX}-excel-slice-${side}" src="${url}" alt="" draggable="false" />`;
		},

		buildOffice(script) {
			const t = 'office';
			const cols = this.columnLetters()
				.map((c) => `<div class="${PREFIX}-excel-column">${c}</div>`)
				.join('');
			const title =
				(script.advanced.excelTitle || '').trim() ||
				document.title.replace(/\s*[-|].*$/, '') ||
				'工作簿1';
			return `
        <div class="${PREFIX}-excel-header" data-theme="office">
          <div class="${PREFIX}-excel-h1">
            <div class="${PREFIX}-excel-h1-title">${title} - Excel</div>
            ${this.slice(t, 'H_L_1', 'l')}
            ${this.slice(t, 'H_R_1', 'r')}
            <div class="${PREFIX}-excel-chrome-actions" data-ldmy-chrome="1">
              <button type="button" class="${PREFIX}-excel-chrome-btn" data-act="search" title="搜索"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg></button>
              <button type="button" class="${PREFIX}-excel-chrome-btn" data-act="lang" title="语言 / 主题切换"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 3 2.5 15 0 18"/><path d="M12 3c-2.5 3-2.5 15 0 18"/></svg></button>
              <button type="button" class="${PREFIX}-excel-chrome-btn" data-act="me" aria-label="我的"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>
            </div>
          </div>
          <div class="${PREFIX}-excel-h2">
            ${this.slice(t, 'H_L_2', 'l')}
            ${this.slice(t, 'H_R_2', 'r')}
          </div>
          <div class="${PREFIX}-excel-h3">
            ${this.slice(t, 'H_L_3', 'l')}
            ${this.slice(t, 'H_R_3', 'r')}
            <div class="${PREFIX}-excel-fx"></div>
          </div>
          <div class="${PREFIX}-excel-h4">
            <div class="${PREFIX}-excel-sub"><div></div></div>
            ${cols}
          </div>
        </div>
        <div class="${PREFIX}-excel-footer" data-theme="office">
          <div class="${PREFIX}-excel-f1">
            ${this.slice(t, 'F_L_1', 'l')}
            ${this.slice(t, 'F_R_1', 'r')}
          </div>
          <div class="${PREFIX}-excel-f2">
            ${this.slice(t, 'F_L_2', 'l')}
            ${this.slice(t, 'F_R_2', 'r')}
          </div>
        </div>`;
		}
	};

	/** @type excelChrome */
	const excelChrome = {
		homeUrl() {
			try {
				const base = document.querySelector('link[rel="canonical"]')?.href;
				if (base) {
					const u = new URL(base);
					return u.origin + '/';
				}
			} catch (_) { }
			return location.origin + '/';
		},

		esc(s) {
			return String(s || '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;');
		},

		currentUsername() {
			const el = qs('[data-user-card]');
			return el ? el.getAttribute('data-user-card') || '' : '';
		},

		/** 当前页板块 / 标题，供公式栏 A1 区域展示 */
		getContextNav() {
			// 全页搜索：公式栏显示「搜索 › 关键词」
			if (isSearchPage()) {
				const termInput = qs('.search-query, .full-page-search, input[type="search"].search');
				const term =
					(termInput?.value || '').trim() ||
					qs('.search-page-heading .term, .result-count .term')?.textContent?.trim() ||
					'';
				return {
					catName: '搜索',
					catHref: location.origin + '/search',
					topicTitle: term ? `"${term}"` : '全站搜索',
					topicHref: '',
					isTopic: false,
				};
			}

			const catA =
				qs('a.badge-category, .badge-category__wrapper a, .topic-category a.badge-category__wrapper, .category-name a') ||
				qs('a[href*="/c/"]');
			let catName =
				catA?.textContent?.trim() ||
				qs('.badge-category__name')?.textContent?.trim() ||
				'';
			let catHref = catA?.getAttribute?.('href') || '';
			if (catHref && catHref.startsWith('/')) catHref = location.origin + catHref;

			const titleA = qs('a.fancy-title, .fancy-title a, h1 .fancy-title');
			const titleEl = titleA || qs('.fancy-title, h1[data-topic-id], .topic-title');
			let topicTitle =
				(titleA?.textContent || titleEl?.textContent || '')?.trim() || '';
			let topicHref = titleA?.getAttribute?.('href') || '';
			if (!topicHref && isTopicPage()) {
				const m = location.pathname.match(/(\/t\/[^?#]+)/);
				if (m) topicHref = location.origin + m[1];
			}
			if (topicHref && topicHref.startsWith('/')) topicHref = location.origin + topicHref;

			// 列表页：优先导航栏选中项 / 分类名
			if (!isTopicPage()) {
				const nav =
					qs('#navigation-bar a.active, .nav-pills a.active, .category-breadcrumb .badge-category__name') ||
					null;
				const navText = nav?.textContent?.trim();
				if (navText) catName = catName || navText;
				if (!topicTitle) {
					topicTitle =
						qs('h1, .category-name')?.textContent?.trim() ||
						document.title.replace(/\s*[-|].*$/, '').trim() ||
						'最新话题';
				}
			}

			return { catName, catHref, topicTitle, topicHref, isTopic: isTopicPage() };
		},

		renderFxNav(fxEl, extraText) {
			if (!fxEl) return;
			if (extraText) {
				fxEl.textContent = extraText;
				return;
			}
			const ctx = this.getContextNav();
			const parts = [];
			if (ctx.catName) {
				if (ctx.catHref) {
					parts.push(
						`<a class="${PREFIX}-excel-nav-link" href="${this.esc(ctx.catHref)}" data-ldmy-nav="cat">${this.esc(ctx.catName)}</a>`
					);
				} else {
					parts.push(`<span>${this.esc(ctx.catName)}</span>`);
				}
			}
			if (ctx.topicTitle) {
				if (parts.length) parts.push(`<span class="${PREFIX}-excel-nav-sep"> › </span>`);
				if (ctx.topicHref && ctx.isTopic) {
					parts.push(
						`<a class="${PREFIX}-excel-nav-link" href="${this.esc(ctx.topicHref)}" data-ldmy-nav="topic">${this.esc(ctx.topicTitle)}</a>`
					);
				} else {
					parts.push(`<span>${this.esc(ctx.topicTitle)}</span>`);
				}
			}
			const html = parts.join('') || 'A1';
			// 幂等：内容没变不重建，避免 renderPage 频繁替换链接导致点击失效
			if (fxEl.innerHTML !== html) fxEl.innerHTML = html;
		},

		ensureRoot(script) {
			let root = qs(`#${PREFIX}-excel-root`);
			if (!root) {
				root = document.createElement('div');
				root.id = `${PREFIX}-excel-root`;
				document.body.appendChild(root);
			}
			// chrome 点击 / 行选中：幂等绑定（页面快照里可能已有 root）
			if (!this._rootChromeBound) {
				this._rootChromeBound = true;
				root.addEventListener('click', (e) => {
					// A1 公式栏导航链接（分类/话题）→ 跳转（委托处理，链接重建也不丢点击）
					const navLink = e.target.closest(`.${PREFIX}-excel-nav-link`);
					if (navLink) {
						e.preventDefault();
						e.stopPropagation();
						location.assign(navLink.getAttribute('href') || '');
						return;
					}
					// 标题栏主页图标 / 工作簿标题 → 首页
					const homeHit = e.target.closest(
						`.${PREFIX}-excel-home, .${PREFIX}-excel-titlebar-title, .${PREFIX}-excel-h1-title`
					);
					if (homeHit) {
						e.preventDefault();
						e.stopPropagation();
						location.assign(this.homeUrl());
						return;
					}
					const chromeBtn = e.target.closest(`.${PREFIX}-excel-chrome-btn`);
					if (chromeBtn) {
						e.preventDefault();
						e.stopPropagation();
						this.handleChromeAction(chromeBtn.getAttribute('data-act'), script);
						return;
					}
					const fish = e.target.closest(`.${PREFIX}-excel-fish`);
					if (fish) {
						try {
							script.openPanel?.() || script.togglePanel?.(true);
							const fabBtn = qs(`#${PREFIX}-fab-settings, #${PREFIX}-fab .${PREFIX}-fab-btn[data-action="settings"]`);
							fabBtn?.click();
							qs(`#${PREFIX}-fab`)?.classList.add('open');
							const gear = qsa(`#${PREFIX}-fab button, #${PREFIX}-fab .btn`).find((b) =>
								/设置|setting/i.test(b.title || b.textContent || '')
							);
							gear?.click();
						} catch (_) { }
					}
				});
			}
			if (!this._rowClickBound) {
				this._rowClickBound = true;
				document.addEventListener(
					'click',
					(e) => {
						if (!script.normal.excelMode) return;
						const listRow = e.target.closest?.('.topic-list-item');
						const searchRow = e.target.closest?.('.fps-result');
						const row = listRow || searchRow;
						if (!row) return;
						qsa(`.topic-list-item.${PREFIX}-excel-row-active, .fps-result.${PREFIX}-excel-row-active`).forEach((r) =>
							r.classList.remove(`${PREFIX}-excel-row-active`)
						);
						row.classList.add(`${PREFIX}-excel-row-active`);
						const siblings = listRow
							? Array.from(row.parentElement?.querySelectorAll('.topic-list-item') || [])
							: Array.from(row.parentElement?.querySelectorAll('.fps-result') || []);
						const idx = siblings.indexOf(row);
						const title =
							row.querySelector(
								'a.raw-topic-link, a.title, a.search-link .topic-title, a.search-link, .topic-title'
							)?.textContent?.trim() || '';
						const cat =
							row
								.querySelector(
									'.badge-category__name, .search-category .badge-category__name, .badge-category__wrapper'
								)
								?.textContent?.trim() || '';
						const fxCell = document.querySelector(`#${PREFIX}-excel-root .${PREFIX}-excel-fx-cell`);
						const fxVal = document.querySelector(
							`#${PREFIX}-excel-root .${PREFIX}-excel-fx-value, #${PREFIX}-excel-root .${PREFIX}-excel-fx`
						);
						if (fxCell) fxCell.textContent = `A${Math.max(1, idx + 1)}`;
						if (fxVal) fxVal.textContent = cat && title ? `${cat} › ${title}` : title;
					},
					true
				);
			}
			this._root = root;
			return root;
		},
		rebuild(script, force = false) {
			const theme = this.normalizeTheme(script.advanced.excelTheme || 'tencent');
			const root = this.ensureRoot(script);
			if (!force && this._builtTheme === theme && root.childElementCount) return root;
			root.innerHTML = theme === 'office' ? this.buildOffice(script) : this.buildTencent(script);
			this._builtTheme = theme;
			// 腾讯标题栏主页图标左边距
			const homeIco =
				root.querySelector(`.${PREFIX}-excel-titlebar .${PREFIX}-excel-home`) ||
				root.querySelector(`.${PREFIX}-excel-titlebar .${PREFIX}-excel-ico24`);
			if (homeIco) homeIco.style.margin = '2px 2px 2px 10px';
			return root;
		},

		setFavicon(on) {
			if (on) {
				let link = qs(`#${PREFIX}-excel-favicon`);
				if (!link) {
					link = document.createElement('link');
					link.id = `${PREFIX}-excel-favicon`;
					link.rel = 'icon';
					link.type = 'image/png';
					document.head.appendChild(link);
				}
				link.href = EXCEL_FAVICON ;
				qsa('link[rel="icon"], link[rel="shortcut icon"]').forEach((el) => {
					if (el.id !== `${PREFIX}-excel-favicon`) {
						el.setAttribute('data-ldmy-icon-off', '1');
						el.remove();
					}
				});
			} else {
				qs(`#${PREFIX}-excel-favicon`)?.remove();
			}
		},

		syncChrome(script) {
			const theme = this.normalizeTheme(script.advanced.excelTheme || 'tencent');
			this.rebuild(script);
			const root = this._root;
			const title =
				(script.advanced.excelTitle || '').trim() ||
				'工作簿1';
			const titleEl = root.querySelector(
				`.${PREFIX}-excel-titlebar-title, .${PREFIX}-excel-h1-title`
			);
			const sheetEl = root.querySelector(`.${PREFIX}-excel-sheet-name`);
			const countEl = root.querySelector(`.${PREFIX}-excel-count`);
			const fxCell = root.querySelector(`.${PREFIX}-excel-fx-cell`);
			const fxVal = root.querySelector(`.${PREFIX}-excel-fx-value, .${PREFIX}-excel-fx`);
			if (titleEl) {
				titleEl.textContent = theme === 'office' ? `${title} - Excel` : title;
				titleEl.title = '点击返回首页';
				titleEl.setAttribute('role', 'link');
			}
			if (sheetEl) {
				const sheetLabel = title.length > 12 ? title.slice(0, 12) + '…' : title;
				sheetEl.textContent = sheetLabel;
				sheetEl.title = '点击返回首页';
				sheetEl.style.cursor = 'pointer';
				sheetEl.onclick = (ev) => {
					ev.preventDefault();
					location.assign(this.homeUrl());
				};
			}
			const n =
				qsa('table.topic-list .topic-list-item:not(.ldmy-banned-post)').length ||
				qsa('.fps-result-entries .fps-result:not(.ldmy-kw-blocked)').length ||
				qsa('.topic-post:not(.ldmy-banned-post)').length;
			if (countEl) countEl.textContent = n ? `${n} 行` : '';
			// A1 区：默认展示 板块 › 标题（可点击跳转）
			if (fxCell) fxCell.textContent = 'A1';
			this.renderFxNav(fxVal);
		},

		handleChromeAction(act, script) {
			// JS 兜底：触发后定时把页面 fixed/absolute 弹层（非脚本自身元素）提到 Excel 头之上
			const boostPopups = () => {
				// 只抬 body 直属浮层；绝不碰 #main / outlet 等页面内容容器，否则整页会盖过 Excel 头造成穿模
				const skipId = new Set([
					`${PREFIX}-excel-root`,
					`${PREFIX}-fab`,
					`${PREFIX}-overlay`,
					`${PREFIX}-panel`,
					`${PREFIX}-dialog`,
					`${PREFIX}-toast-box`,
					'main',
					'main-outlet',
					'main-outlet-wrapper',
				]);
				const skipClass = [
					'main-outlet',
					'main-outlet-wrapper',
					'list-container',
					'post-stream',
					'topic-area',
					'd-header',
					'd-header-wrap',
				];
				qsa('body > *').forEach((n) => {
					if (!n || n.nodeType !== 1) return;
					if (n.id && skipId.has(n.id)) return;
					if (skipClass.some((c) => n.classList && n.classList.contains(c))) return;
					if (n.closest && n.closest(`#${PREFIX}-excel-root`)) return;
					// 含主内容树的大容器跳过
					if (n.querySelector && n.querySelector('#main-outlet, #main-outlet-wrapper, .topic-post, .topic-list, .post-stream')) return;
					const cs = getComputedStyle(n);
					if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
					const z = parseInt(cs.zIndex, 10);
					if (Number.isNaN(z) || z >= 99990) return;
					n.style.setProperty('z-index', '100020', 'important');
				});
			};
			[200, 600, 1200].forEach((ms) => setTimeout(boostPopups, ms));

			const popupClass = `${PREFIX}-excel-popup-open`;
			const isPanelVisible = (sel) => {
				if (!sel) return false;
				const nodes = document.querySelectorAll(sel);
				for (const n of nodes) {
					const cs = getComputedStyle(n);
					if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
					const r = n.getBoundingClientRect();
					if (r.width > 2 && r.height > 2) return true;
				}
				return false;
			};
			const clickFirst = (sels, opts = {}) => {
				for (const sel of sels) {
					const el = document.querySelector(sel);
					if (!el) continue;
					const restore = [];
					// 祖先链上所有被隐藏的节点临时显示（Excel 下 banner / d-header 为 display:none，
					// 只改元素自身无法让 focus/click 生效）
					let node = el;
					while (node && node !== document.body) {
						const cs = getComputedStyle(node);
						if (cs.display === 'none' || cs.visibility === 'hidden') {
							restore.push([node, node.getAttribute('style')]);
							const isHeaderChrome =
								node.classList?.contains('d-header') ||
								node.classList?.contains('d-header-wrap') ||
								node.id === 'd-header';
							node.style.setProperty('display', 'block', 'important');
							node.style.setProperty('visibility', 'visible', 'important');
							// d-header 仅作弹层挂载点：保留布局尺寸（避免浮层锚点错位），弱化原生顶栏外观
							if (isHeaderChrome) {
								node.style.setProperty('pointer-events', 'none', 'important');
								node.style.setProperty('opacity', '1', 'important');
								node.style.setProperty('background', 'transparent', 'important');
								node.style.setProperty('box-shadow', 'none', 'important');
								node.style.setProperty('border', 'none', 'important');
								node.style.setProperty('overflow', 'visible', 'important');
							} else {
								node.style.setProperty('pointer-events', 'auto', 'important');
								node.style.setProperty('opacity', '1', 'important');
							}
						}
						node = node.parentElement;
					}
					// 元素本身也强制可交互
					restore.push([el, el.getAttribute('style')]);
					el.style.setProperty('display', 'block', 'important');
					el.style.setProperty('visibility', 'visible', 'important');
					el.style.setProperty('pointer-events', 'auto', 'important');
					el.style.setProperty('opacity', '1', 'important');
					document.body.classList.add(popupClass);
					// 双保险：弹层期间把 Excel chrome 整棵压到内容之下，避免 CSS 特异性/合成层残留
					const excelRoot = document.getElementById(`${PREFIX}-excel-root`);
					let excelRootStyle = null;
					if (excelRoot) {
						excelRootStyle = excelRoot.getAttribute('style');
						excelRoot.style.setProperty('z-index', '1', 'important');
					}
					try {
						if (opts.focus && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
							el.focus();
						} else {
							el.click();
						}
					} catch (_) { }
					// 点完后再抬一次 body 浮层（搜索菜单可能异步挂载）
					try { boostPopups(); } catch (_) { }
					const restoreAll = () => {
						document.body.classList.remove(popupClass);
						if (excelRoot) {
							if (excelRootStyle == null) excelRoot.removeAttribute('style');
							else excelRoot.setAttribute('style', excelRootStyle);
						}
						restore.forEach(([node, style]) => {
							if (style == null) node.removeAttribute('style');
							else node.setAttribute('style', style);
						});
					};
					if (opts.watchSel) {
						// 弹层打开期间保持 trigger 可定位；CSS 负责把 d-header chrome 视觉隐藏，
						// 只留 menu/search 面板。若面板已传送到 body，进一步把 header 压成 0 高挂载点。
						const t0 = Date.now();
						let seen = false;
						let collapsedHeader = false;
						const collapseHeaderChrome = () => {
							if (collapsedHeader) return;
							const panel = document.querySelector(opts.watchSel);
							if (!panel) return;
							const inHeader = !!(panel.closest && panel.closest('.d-header, .d-header-wrap'));
							// 无论面板是否在 header 内，都把 header 视觉壳压掉，避免 logo/图标露馅
							['.d-header-wrap', '.d-header'].forEach((sel) => {
								document.querySelectorAll(sel).forEach((node) => {
									restore.push([node, node.getAttribute('style')]);
									node.style.setProperty('background', 'transparent', 'important');
									node.style.setProperty('box-shadow', 'none', 'important');
									node.style.setProperty('border', 'none', 'important');
									node.style.setProperty('pointer-events', 'none', 'important');
									node.style.setProperty('overflow', 'visible', 'important');
									if (!inHeader) {
										// 面板已 portal 到 body：header 不再需要占位
										node.style.setProperty('height', '0', 'important');
										node.style.setProperty('min-height', '0', 'important');
										node.style.setProperty('max-height', '0', 'important');
										node.style.setProperty('opacity', '0', 'important');
									}
								});
							});
							// 额外藏掉 logo / 标题 / 图标壳
							const hideSel = [
								'.d-header .title',
								'.d-header .home-logo-wrapper',
								'.d-header .home-logo',
								'.d-header .extra-info-wrapper',
								'.d-header .d-header-icons',
								'.d-header .header-buttons',
								'.d-header .header-dropdown-toggle',
								'.d-header .auth-buttons',
							].join(',');
							document.querySelectorAll(hideSel).forEach((node) => {
								restore.push([node, node.getAttribute('style')]);
								node.style.setProperty('opacity', '0', 'important');
								node.style.setProperty('pointer-events', 'none', 'important');
								node.style.setProperty('visibility', 'hidden', 'important');
							});
							collapsedHeader = true;
						};
						const iv = setInterval(() => {
							const open = isPanelVisible(opts.watchSel);
							if (open) {
								seen = true;
								try { collapseHeaderChrome(); } catch (_) { }
								try { boostPopups(); } catch (_) { }
							}
							if (Date.now() - t0 > 8000 || (seen && !open) || (!seen && Date.now() - t0 > 1500 && !open)) {
								clearInterval(iv);
								restoreAll();
							}
						}, 200);
					} else {
						setTimeout(restoreAll, 120);
					}
					return true;
				}
				return false;
			};

			if (act === 'search') {
				// 真实搜索按钮 #search-button；弹层保持打开直到用户关闭
				if (
					clickFirst(
						[
							'#search-button',
							'.header-dropdown-toggle.search-dropdown button',
							'button.search-dropdown',
							'#welcome-banner-search-input',
							'.search-term__input',
							'button[aria-label*="搜索"]',
							'button[title*="搜索"]',
						],
						{ watchSel: '.search-menu, .search-menu-container, [class*="search-menu"]' }
					)
				) return;
				location.assign(location.origin + '/search?expanded=true');
				return;
			}
			if (act === 'lang') {
				if (clickFirst(
					[
						'button.language-switcher-trigger',
						'.language-switcher-trigger',
						'.fk-d-menu__trigger[data-identifier="language-switcher"]',
						'.sidebar-theme-toggle-dropdown .select-kit-header',
						'.sidebar-theme-toggle__wrapper .select-kit-header',
						'.sidebar-footer-actions .select-kit-header',
						'button[aria-label*="语言"]',
						'button[title*="语言"]',
					],
					{ watchSel: '.fk-d-menu' }
				)) return;
				location.assign(location.origin + '/my/preferences/interface');
				return;
			}
			if (act === 'me') {
				// 真实入口是右上角头像按钮 #toggle-current-user（弹「通知和帐户」菜单）
				if (clickFirst(
					[
						'#toggle-current-user',
						'#current-user',
						'.header-dropdown-toggle.current-user',
						'button.current-user',
						'.d-header .current-user button',
						'button[aria-label*="用户"]',
						'a[href*="/u/"][data-user-card]',
					],
					{ watchSel: '.user-menu-panel, .user-menu, .menu-panel.user-menu, [class*="user-menu"]' }
				)) return;
				location.assign(location.origin + '/my/summary');
			}
		},

		applyDocumentTitle(script) {
			const cover = (script.advanced.excelTitle || '').trim() || '工作簿1';
			if (document.title !== cover) document.title = cover;
		}
	};

	/** @type excelGridSync */
	const excelGridSync = {
		clearRowNums() {
			qsa(`.${PREFIX}-excel-rownum`).forEach((el) => el.remove());
		},

		applyRowNums(script) {
			if (!script.normal.excelMode || !script.advanced.excelShowRowIndex) {
				this.clearRowNums();
				return;
			}
			const table = qs('table.topic-list');
			if (!table) return;

			// 1) 表头行号：单例保留
			const headRow = table.querySelector('thead tr, .topic-list-header tr');
			if (headRow) {
				const existingThs = Array.from(headRow.querySelectorAll(`th.${PREFIX}-excel-rownum`));
				if (existingThs.length > 1) {
					existingThs.slice(1).forEach((th) => th.remove());
				}
				let th = existingThs[0];
				if (!th) {
					th = document.createElement('th');
					th.className = `${PREFIX}-excel-rownum topic-list-data`;
					th.scope = 'col';
					th.innerHTML = '<span class="sr-only">#</span>';
					headRow.insertBefore(th, headRow.firstChild);
				}
			}

			// 2) 数据行行号：就地更新，清理多余重复项
			qsa('table.topic-list .topic-list-item').forEach((row, i) => {
				const existingTds = Array.from(row.querySelectorAll(`td.${PREFIX}-excel-rownum`));
				if (existingTds.length > 1) {
					existingTds.slice(1).forEach((td) => td.remove());
				}
				let td = existingTds[0];
				const numStr = String(i + 1);
				if (!td) {
					td = document.createElement('td');
					td.className = `${PREFIX}-excel-rownum topic-list-data`;
					td.textContent = numStr;
					row.insertBefore(td, row.firstChild);
				} else if (td.textContent !== numStr) {
					td.textContent = numStr;
				}
			});
		},

		splitClassicMeta(script) {
			if (!script.normal.excelMode) return;
			if (document.body.classList.contains(`${PREFIX}-excel-horizon`)) return;
			const on = !!script.advanced.excelMetaCol;
			if (!on) {
				// 关闭时：把 link-bottom-line 放回 main-link，删除 meta 单元格
				qsa(`td.${PREFIX}-excel-meta-cell`).forEach((td) => {
					const lb = td.querySelector('.link-bottom-line');
					const main = td.closest('.topic-list-item')?.querySelector('.main-link');
					if (lb && main) main.appendChild(lb);
					td.remove();
				});
				qsa(`th.${PREFIX}-excel-meta-head`).forEach((th) => th.remove());
				return;
			}
			const table = qs('table.topic-list');
			if (!table) return;
			const headRow = table.querySelector('thead tr, .topic-list-header tr');
			const mainTh =
				headRow &&
				headRow.querySelector('th.main-link, th.default, th[data-sort-order="default"]');
			if (mainTh) {
				const metaHeads = Array.from(headRow.querySelectorAll(`th.${PREFIX}-excel-meta-head`));
				if (metaHeads.length > 1) metaHeads.slice(1).forEach((th) => th.remove());
				if (!metaHeads.length) {
					const th = document.createElement('th');
					th.className = `topic-list-data ${PREFIX}-excel-meta-head`;
					th.scope = 'col';
					th.textContent = '分类';
					mainTh.after(th);
				}
			}
			qsa('table.topic-list .topic-list-item').forEach((row) => {
				const main = row.querySelector('td.main-link');
				if (!main) return;
				const metaCells = Array.from(row.querySelectorAll(`td.${PREFIX}-excel-meta-cell`));
				if (metaCells.length > 1) {
					const keep = metaCells.find((c) => c.querySelector('.link-bottom-line')) || metaCells[0];
					metaCells.forEach((c) => {
						if (c !== keep) c.remove();
					});
				}
				let metaCell = row.querySelector(`td.${PREFIX}-excel-meta-cell`);
				const lb = main.querySelector('.link-bottom-line');
				if (lb) {
					if (!metaCell) {
						metaCell = document.createElement('td');
						metaCell.className = `topic-list-data ${PREFIX}-excel-meta-cell`;
						main.after(metaCell);
					}
					// 清理 metaCell 内部旧的 link-bottom-line，确保单例不重复堆叠
					const oldLbs = Array.from(metaCell.querySelectorAll('.link-bottom-line'));
					oldLbs.forEach((old) => {
						if (old !== lb) old.remove();
					});
					if (!metaCell.contains(lb)) {
						metaCell.appendChild(lb);
					}
				}
			});
		},

		/**
		 * Default/Moyu 经典列表：可选把 活动/浏览/回复 挪到标题前。
		 * 开启顺序：# | 活动 | 浏览 | 回复 | 标题 | (分类可选) | posters...
		 * 关闭/Excel 关闭时幂等恢复为：# | 标题 | (分类可选) | posters | 回复 | 浏览 | 活动
		 */
		reorderClassicMetaLeading(script) {
			if (document.body.classList.contains(`${PREFIX}-excel-horizon`)) return;
			const excelOn = !!script?.normal?.excelMode;
			const on = excelOn && !!script?.advanced?.excelMetaLeading;
			const isMetaCell = (el) =>
				!!el &&
				(el.classList.contains(`${PREFIX}-excel-meta-cell`) ||
					el.classList.contains(`${PREFIX}-excel-meta-head`));
			const isRownum = (el) => !!el && el.classList.contains(`${PREFIX}-excel-rownum`);
			const isMain = (el) =>
				!!el &&
				(el.classList.contains('main-link') ||
					el.classList.contains('default') ||
					el.getAttribute?.('data-sort-order') === 'default');
			const isPosts = (el) =>
				!!el && (el.classList.contains('posts') || el.classList.contains('posts-map'));
			const isViews = (el) => !!el && el.classList.contains('views');
			const isActivity = (el) =>
				!!el && (el.classList.contains('activity') || el.classList.contains('age'));
			const isPosters = (el) => !!el && (el.classList.contains('posters') || el.classList.contains('topic-posters'));
			const isBulkSelect = (el) => !!el && el.classList.contains('bulk-select');

			const dedupePick = (cells, pred) => {
				const matched = cells.filter(pred);
				if (!matched.length) return null;
				if (matched.length > 1) {
					const keep = matched[matched.length - 1];
					matched.slice(0, -1).forEach((el) => {
						try { el.remove(); } catch (_) { }
					});
					return keep;
				}
				return matched[0];
			};

			const reorderRow = (row) => {
				if (!row) return;
				const cells = Array.from(row.children);
				if (!cells.length) return;

				const rownum = dedupePick(cells, isRownum);
				const bulkSelect = dedupePick(cells, isBulkSelect);
				const main = dedupePick(cells, isMain);
				if (!main) return;
				const meta = dedupePick(cells, isMetaCell);
				const posts = dedupePick(cells, isPosts);
				const views = dedupePick(cells, isViews);
				const activity = dedupePick(cells, isActivity);
				const posters = dedupePick(cells, isPosters);

				const targetSet = new Set(
					[rownum, bulkSelect, main, meta, posts, views, activity, posters].filter(Boolean)
				);

				// 经典模式下：清理任何非目标的冗余单元格（如 Horizon 的残余列、意外复制等）
				Array.from(row.children).forEach((c) => {
					if (!targetSet.has(c)) {
						try { c.remove(); } catch (_) { }
					}
				});

				let ordered;
				if (on) {
					// # | (bulkSelect) | 活动 | 浏览 | 回复 | 标题 | 分类 | posters
					ordered = [rownum, bulkSelect, activity, views, posts, main, meta, posters].filter(Boolean);
				} else {
					// # | (bulkSelect) | 标题 | 分类 | posters | 回复 | 浏览 | 活动
					ordered = [rownum, bulkSelect, main, meta, posters, posts, views, activity].filter(Boolean);
				}

				const currentChildren = Array.from(row.children);
				const same =
					ordered.length === currentChildren.length &&
					ordered.every((c, i) => c === currentChildren[i]);
				if (same) return;
				ordered.forEach((node) => row.appendChild(node));
			};

			qsa('table.topic-list thead tr, table.topic-list .topic-list-header tr').forEach(reorderRow);
			qsa('table.topic-list .topic-list-item').forEach(reorderRow);
		}
	};

	/** @type excelHorizon */
	const excelHorizon = {
		HORIZON_COLS: [
			{ cls: 'ldmy-excel-rownum', label: '#', colClass: `${PREFIX}-excel-col-rownum` },
			{ cls: 'main-link', label: '话题', colClass: `${PREFIX}-excel-col-title` },
			{ cls: 'topic-category-data', label: '类别', colClass: `${PREFIX}-excel-col-category` },
			{ cls: 'topic-likes-replies-data', label: '回复', colClass: `${PREFIX}-excel-col-replies` },
			{ cls: 'topic-activity-data', label: '活动', colClass: `${PREFIX}-excel-col-activity` },
			{ cls: 'topic-status-data', label: '状态', colClass: `${PREFIX}-excel-col-status` },
		],

		/**
		 * Horizon 表头补齐：table-layout:fixed 按首行列数分配宽度，
		 * 而 Horizon 原生 thead 只有「行号 + 话题」两格，会把后面几列挤爆。
		 * 同时注入 <colgroup>，让标题列稳定占主宽。
		 */
		syncHorizonHeader(script) {
			if (!document.body.classList.contains(`${PREFIX}-excel-horizon`)) return;
			const table = qs('table.topic-list');
			if (!table) return;
			const headRow = table.querySelector('thead tr, .topic-list-header tr');
			if (!headRow) return;

			// 1) colgroup：fixed 布局下最稳的列宽来源
			let colgroup = table.querySelector(`colgroup.${PREFIX}-excel-cols`);
			if (!colgroup) {
				colgroup = document.createElement('colgroup');
				colgroup.className = `${PREFIX}-excel-cols`;
				table.insertBefore(colgroup, table.firstChild);
			}
			const wantedCols = this.HORIZON_COLS.map((c) => c.colClass);
			const currentCols = Array.from(colgroup.children).map((c) => c.className);
			if (currentCols.join('|') !== wantedCols.join('|')) {
				colgroup.innerHTML = '';
				this.HORIZON_COLS.forEach((col) => {
					const c = document.createElement('col');
					c.className = col.colClass;
					colgroup.appendChild(c);
				});
			}

			// 2) 表头：保证与数据列一一对应（含行号 / 标题）
			const ensureTh = (col) => {
				if (col.cls === 'ldmy-excel-rownum') {
					return headRow.querySelector(`th.${PREFIX}-excel-rownum`);
				}
				if (col.cls === 'main-link') {
					return (
						headRow.querySelector('th.main-link, th.default, th[data-sort-order="default"]') ||
						headRow.querySelector(`th[data-ldmy-col="main-link"]`)
					);
				}
				return headRow.querySelector(`th[data-ldmy-col="${col.cls}"]`);
			};
			const orderedThs = [];
			this.HORIZON_COLS.forEach((col) => {
				let th = ensureTh(col);
				if (!th) {
					th = document.createElement('th');
					th.scope = 'col';
					th.dataset.ldmyCol = col.cls;
					if (col.cls === 'ldmy-excel-rownum') {
						th.className = `${PREFIX}-excel-rownum topic-list-data`;
						th.innerHTML = '<span class="sr-only">#</span>';
					} else if (col.cls === 'main-link') {
						th.className = 'topic-list-data main-link default';
						th.dataset.sortOrder = 'default';
						th.textContent = col.label;
					} else {
						th.className = `topic-list-data ${col.cls}`;
						th.textContent = col.label;
					}
				} else {
					// 标记 data-ldmy-col，方便 CSS / 重排识别
					if (!th.dataset.ldmyCol) th.dataset.ldmyCol = col.cls;
					if (col.cls !== 'ldmy-excel-rownum' && col.cls !== 'main-link') {
						if (!th.classList.contains(col.cls)) th.classList.add(col.cls);
						if (!th.textContent.trim()) th.textContent = col.label;
					} else if (col.cls === 'main-link') {
						// Horizon 原生「话题」常被隐藏，Excel 下强制显示表头文字
						th.classList.add('main-link', 'default');
						th.classList.remove('sf-hidden', 'sr-only');
						th.querySelectorAll('.sr-only, .sf-hidden').forEach((el) => {
							el.classList.remove('sr-only', 'sf-hidden');
						});
						const visibleText = (th.textContent || '').replace(/\s+/g, ' ').trim();
						if (!visibleText || visibleText === '#' || !/话题|Topic/i.test(visibleText)) {
							let label = th.querySelector('.' + PREFIX + '-excel-th-label');
							if (!label) {
								label = document.createElement('span');
								label.className = PREFIX + '-excel-th-label';
								th.appendChild(label);
							}
							label.textContent = col.label || '话题';
						}
						th.dataset.ldmyTitleFixed = '1';
					}
				}
				orderedThs.push(th);
			});
			// 按目标顺序重挂，去掉多余 th（创建者等）
			orderedThs.forEach((th) => headRow.appendChild(th));
			Array.from(headRow.children).forEach((th) => {
				if (!orderedThs.includes(th)) th.remove();
			});
			// 关键：任何 sf-hidden/sr-only 作用在 th 上都会让 fixed 表格少一列，标题与表头错位
			orderedThs.forEach((th) => {
				th.classList.remove('sf-hidden', 'sr-only');
				th.removeAttribute('hidden');
				th.style.removeProperty('display');
				th.style.removeProperty('width');
				th.style.removeProperty('height');
				th.style.removeProperty('position');
				th.style.removeProperty('clip');
				th.style.removeProperty('clip-path');
				// 表头内部若仅有 .sf-hidden/.sr-only 包裹的文字，解除隐藏
				th.querySelectorAll('.sf-hidden, .sr-only').forEach((el) => {
					el.classList.remove('sf-hidden', 'sr-only');
				});
			});
			// 标题列表头强制有「话题」字样
			const titleTh = orderedThs.find((th) =>
				th.dataset.ldmyCol === 'main-link' ||
				th.classList.contains('main-link') ||
				th.classList.contains('default')
			);
			if (titleTh) {
				const txt = (titleTh.textContent || '').replace(/\s+/g, ' ').trim();
				if (!txt || !/话题|Topic/i.test(txt)) {
					let label = titleTh.querySelector('.' + PREFIX + '-excel-th-label');
					if (!label) {
						label = document.createElement('span');
						label.className = PREFIX + '-excel-th-label';
						titleTh.appendChild(label);
					}
					label.textContent = '话题';
				}
			}
		},

		clearHorizonHeader() {
			qsa(`table.topic-list colgroup.${PREFIX}-excel-cols`).forEach((el) => el.remove());
			qsa('table.topic-list th[data-ldmy-col]').forEach((th) => th.remove());
			qsa(`table.topic-list th .${PREFIX}-excel-th-label`).forEach((el) => el.remove());
		},

		/** Horizon：按 HORIZON_COLS 重排单元格，隐藏创建者列 */
		compactHorizonCols(script) {
			if (!script.normal.excelMode) return;
			if (!document.body.classList.contains(`${PREFIX}-excel-horizon`)) return;
			this.syncHorizonHeader(script);
			const wanted = this.HORIZON_COLS.map((c) => c.cls);
			qsa('table.topic-list .topic-list-item').forEach((row) => {
				const dedupePick = (cls) => {
					const matched = Array.from(row.children).filter((c) => c.classList?.contains(cls));
					if (!matched.length) return null;
					if (matched.length > 1) {
						const keep = matched[matched.length - 1];
						matched.slice(0, -1).forEach((el) => {
							try { el.remove(); } catch (_) { }
						});
						return keep;
					}
					return matched[0];
				};

				const ordered = wanted.map(dedupePick).filter(Boolean);
				const wantedSet = new Set(ordered);

				// 把非 wanted 的未知节点（创建者等）留在后面
				const rest = Array.from(row.children).filter((c) => !wantedSet.has(c));

				const newOrder = [...ordered, ...rest];
				const currentChildren = Array.from(row.children);
				const same =
					newOrder.length === currentChildren.length &&
					newOrder.every((c, i) => c === currentChildren[i]);

				if (!same) {
					newOrder.forEach((node) => row.appendChild(node));
				}

				// 创建者列：只加标记类，交给 CSS 隐藏（不动 Ember 管理的节点）
				const creator = Array.from(row.children).find((c) => c.classList?.contains('topic-creator-data'));
				if (creator) creator.classList.add(`${PREFIX}-excel-col-empty`);

				const status = Array.from(row.children).find((c) => c.classList?.contains('topic-status-data'));
				if (status) {
					status.classList.toggle(
						`${PREFIX}-excel-col-empty`,
						!status.querySelector('.topic-status-card')
					);
				}
				// 标题单元格：去掉可能把内容挤没的 colspan / 残留 grid 样式
				const main = Array.from(row.children).find((c) => c.classList?.contains('main-link'));
				if (main) {
					if (main.getAttribute('colspan')) main.removeAttribute('colspan');
					main.style.removeProperty('display');
					main.style.removeProperty('width');
					main.style.removeProperty('max-width');
					main.style.removeProperty('grid-area');
				}
			});
		},

	};

	/** @type excelLifecycle */
	const excelLifecycle = {
		onApply(script) {
			if (!script.normal.excelMode) {
				this.teardown(script);
				return;
			}
			if (this._origTitle == null) this._origTitle = document.title;
			this.startTitleGuard(script);
			this.setFavicon(true);
			this.syncChrome(script);
			this.applyRowNums(script);
			this.compactHorizonCols(script);
			this.splitClassicMeta(script);
			this.reorderClassicMetaLeading(script);
		},

		render(script) {
			if (!script.normal.excelMode) return;
			// 只同步环境 class，禁止 applyBodyFlags：否则会把滑块即时预览冲回旧值
			try { script.syncExcelEnvFlags?.(); } catch (_) { }
			this.applyDocumentTitle(script);
			this.syncChrome(script);
			this.applyRowNums(script);
			this.compactHorizonCols(script);
			this.splitClassicMeta(script);
			this.reorderClassicMetaLeading(script);
		},

		/** Horizon 列顺序（视觉）：# | 标题 | 分类 | 回复 | 活动 | 状态 */
		teardown(script) {
			this.clearRowNums();
			this.clearHorizonHeader();
			this.splitClassicMeta({ normal: { excelMode: false } });
			this.reorderClassicMetaLeading({ normal: { excelMode: false }, advanced: {} });
			qsa(`.topic-list-item.${PREFIX}-excel-row-active, .fps-result.${PREFIX}-excel-row-active`).forEach((r) =>
				r.classList.remove(`${PREFIX}-excel-row-active`)
			);
			this.stopTitleGuard();
			if (this._origTitle != null) {
				document.title = this._origTitle;
				this._origTitle = null;
			}
			this.setFavicon(false);
			// 保留 DOM，靠 body class 隐藏
		},

		/** Discourse SPA 常改 document.title，用 title 元素 MutationObserver 持续覆盖 */
		startTitleGuard(script) {
			this.stopTitleGuard();
			const titleEl = document.querySelector('head > title') || document.querySelector('title');
			if (!titleEl) {
				this.applyDocumentTitle(script);
				return;
			}
			this._titleObserver = new MutationObserver(() => {
				if (!script.normal.excelMode) return;
				this.applyDocumentTitle(script);
			});
			this._titleObserver.observe(titleEl, {
				childList: true,
				characterData: true,
				subtree: true,
			});
			this.applyDocumentTitle(script);
		},

		stopTitleGuard() {
			if (this._titleObserver) {
				try { this._titleObserver.disconnect(); } catch (_) { }
				this._titleObserver = null;
			}
		},
	};

	/** ExcelMode 门面：组合 themes / chrome / grid / horizon / lifecycle */

	const ExcelMode = {
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

	/** FabController */

	const FabController = {
		name: 'FabController',
		settings: [
			{ type: 'normal', key: 'floorJump', default: true, label: '楼层跳转按钮', group: 'enhance' },
			{ type: 'normal', key: 'backToTop', default: true, label: '返回顶部按钮', group: 'enhance' },
		],
		render(script) {
			script.updateFabVisibility();
		},
	};

	/** Excel 摸鱼外观 */

	/** 内置模块注册表 */

	/** @type {import('../core/script.js').LinuxDoMoyu} */
	const builtinModules = [
		OpenInNewTab,
		ImageEnhance,
		HideImagePlaceholder,
		BanAndMark,
		KeywordsBlock,
		HideEmojiText,
		HighlightOP,
		ExcelMode,
		FabController,
	];

	/**
	 * LINUX DO 优化摸鱼体验 — 入口
	 */

	function boot() {
		const gen = document.querySelector('meta[name="generator"]');
		const isDiscourse =
			(gen && /discourse/i.test(gen.getAttribute('content') || '')) ||
			document.querySelector('#data-discourse-setup, meta[name="discourse_theme_id"]') ||
			document.body?.classList?.contains('docked') ||
			location.hostname.includes('linux.do') ||
			location.hostname.includes('idcflare.com');
		if (!isDiscourse) {
			console.info(`[${SCRIPT_NAME}] 非 Discourse 页面，跳过`);
			return;
		}

		const script = new LinuxDoMoyu();
		for (const mod of builtinModules) {
			script.addModule(mod);
		}
		loadPluginsFromGlobal(script);
		script.start();

		try {
			window.__LDMY__ = script;
			window.__LINUXDO_MOYU_PLUGINS__ = window.__LINUXDO_MOYU_PLUGINS__ || [];
		} catch (_) {
			/* ignore */
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}

})();
