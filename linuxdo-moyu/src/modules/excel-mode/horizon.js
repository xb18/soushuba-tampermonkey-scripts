import { PREFIX } from '../../shared/constants.js';
import { qs, qsa } from '../../shared/dom.js';

/** @type excelHorizon */
export const excelHorizon = {
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
			const pick = (cls) =>
				Array.from(row.children).find((c) => c.classList?.contains(cls));
			const ordered = wanted.map(pick).filter(Boolean);
			// 先把目标列按顺序挂到末尾，再把非目标列（创建者等）挪到最后并隐藏
			ordered.forEach((node) => row.appendChild(node));
			Array.from(row.children).forEach((cell) => {
				const isWanted = wanted.some((cls) => cell.classList?.contains(cls));
				if (!isWanted) row.appendChild(cell);
			});
			// 创建者列：只加标记类，交给 CSS 隐藏（不动 Ember 管理的节点）
			pick('topic-creator-data')?.classList.add(`${PREFIX}-excel-col-empty`);
			const status = pick('topic-status-data');
			if (status) {
				status.classList.toggle(
					`${PREFIX}-excel-col-empty`,
					!status.querySelector('.topic-status-card')
				);
			}
			// 标题单元格：去掉可能把内容挤没的 colspan / 残留 grid 样式
			const main = pick('main-link');
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
