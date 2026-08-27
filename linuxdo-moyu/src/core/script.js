/** LinuxDoMoyu 核心总线 */
import {
	SCRIPT_NAME,
	SCRIPT_VERSION,
	PREFIX,
	PROJECT_URL,
	STORAGE,
	SETTINGS_REV,
	DEFAULT_NORMAL,
	DEFAULT_ADVANCED,
	DEFAULT_SHORTCUTS,
} from '../shared/constants.js';
import { qs, qsa, debounce } from '../shared/dom.js';
import {
	storageGet,
	storageSet,
	isTypingTarget,
	isTopicListPage,
	isTopicPage,
	isSearchPage,
	notify,
	escHtml,
	promptDialog,
	downloadText,
	randomMarkColor,
} from '../shared/utils.js';
import { SUPPORT_WECHAT_IMG } from '../assets/support-wechat.js';
import { collectStyles, injectCss } from './style-loader.js';
import { collectShortcutHandlers } from './shortcuts.js';
import { collectSettingsFromModules } from './settings-registry.js';

export class LinuxDoMoyu {
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
			default:
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
