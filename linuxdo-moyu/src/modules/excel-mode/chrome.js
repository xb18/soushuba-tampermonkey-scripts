import { PREFIX } from '../../shared/constants.js';
import { qs, qsa } from '../../shared/dom.js';
import { isTopicPage, isSearchPage } from '../../shared/utils.js';
import { EXCEL_FAVICON, getExcelAsset } from '../../assets/excel-themes.js';

/** @type excelChrome */
export const excelChrome = {
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
			link.href = typeof EXCEL_FAVICON !== 'undefined' ? EXCEL_FAVICON : link.href;
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
			const sheetLabel = title.length > 12 ? title.slice(0, 12) + '…' : title || '工作表1';
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
