import { PREFIX } from '../../shared/constants.js';
import { qs, qsa } from '../../shared/dom.js';

/** @type excelGridSync */
export const excelGridSync = {
	clearRowNums() {
		qsa(`.${PREFIX}-excel-rownum`).forEach((el) => el.remove());
	},

	applyRowNums(script) {
		this.clearRowNums();
		if (!script.normal.excelMode || !script.advanced.excelShowRowIndex) return;
		const table = qs('table.topic-list');
		if (!table) return;
		const headRow = table.querySelector('thead tr');
		if (headRow && !headRow.querySelector(`.${PREFIX}-excel-rownum`)) {
			const th = document.createElement('th');
			th.className = `${PREFIX}-excel-rownum topic-list-data`;
			th.scope = 'col';
			th.innerHTML = '<span class="sr-only">#</span>';
			headRow.insertBefore(th, headRow.firstChild);
		}
		qsa('table.topic-list .topic-list-item').forEach((row, i) => {
			if (row.querySelector(`.${PREFIX}-excel-rownum`)) return;
			const td = document.createElement('td');
			td.className = `${PREFIX}-excel-rownum topic-list-data`;
			td.textContent = String(i + 1);
			row.insertBefore(td, row.firstChild);
		});
	},

	splitClassicMeta(script) {
		if (!script.normal.excelMode) return;
		if (document.body.classList.contains(`${PREFIX}-excel-horizon`)) return;
		const on = !!script.advanced.excelMetaCol;
		// 幂等：先拆回原状（把 link-bottom-line 放回标题 td，删掉临时 td/th）
		qsa(`td.${PREFIX}-excel-meta-cell`).forEach((td) => {
			const lb = td.querySelector('.link-bottom-line');
			const main = td.closest('.topic-list-item')?.querySelector('.main-link');
			if (lb && main) main.appendChild(lb);
			td.remove();
		});
		qsa(`th.${PREFIX}-excel-meta-head`).forEach((th) => th.remove());
		if (!on) return;
		const table = qs('table.topic-list');
		if (!table) return;
		const headRow = table.querySelector('thead tr, .topic-list-header tr');
		const mainTh =
			headRow &&
			headRow.querySelector('th.main-link, th.default, th[data-sort-order="default"]');
		if (mainTh && !headRow.querySelector(`th.${PREFIX}-excel-meta-head`)) {
			const th = document.createElement('th');
			th.className = `topic-list-data ${PREFIX}-excel-meta-head`;
			th.scope = 'col';
			th.textContent = '分类';
			mainTh.after(th);
		}
		qsa('table.topic-list .topic-list-item').forEach((row) => {
			const main = row.querySelector('td.main-link');
			if (!main) return;
			const lb = main.querySelector('.link-bottom-line');
			if (!lb) return;
			const td = document.createElement('td');
			td.className = `topic-list-data ${PREFIX}-excel-meta-cell`;
			td.appendChild(lb);
			main.after(td);
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
		const isPosters = (el) => !!el && el.classList.contains('posters');
		const pick = (cells, pred) => cells.find(pred) || null;
		const reorderRow = (row) => {
			if (!row) return;
			const cells = Array.from(row.children);
			if (!cells.length) return;
			const rownum = pick(cells, isRownum);
			const main = pick(cells, isMain);
			if (!main) return;
			const meta = pick(cells, isMetaCell);
			const posts = pick(cells, isPosts);
			const views = pick(cells, isViews);
			const activity = pick(cells, isActivity);
			const posters = pick(cells, isPosters);
			const known = new Set(
				[rownum, main, meta, posts, views, activity, posters].filter(Boolean)
			);
			const rest = cells.filter((c) => !known.has(c));
			let ordered;
			if (on) {
				// # | 活动 | 浏览 | 回复 | 标题 | 分类 | posters | 其他
				ordered = [rownum, activity, views, posts, main, meta, posters, ...rest].filter(Boolean);
			} else {
				// # | 标题 | 分类 | posters | 回复 | 浏览 | 活动 | 其他
				ordered = [rownum, main, meta, posters, posts, views, activity, ...rest].filter(Boolean);
			}
			// 仅在顺序变化时重挂，减少无必要 DOM 抖动
			const same =
				ordered.length === cells.length && ordered.every((c, i) => c === cells[i]);
			if (same) return;
			ordered.forEach((node) => row.appendChild(node));
		};
		qsa('table.topic-list thead tr, table.topic-list .topic-list-header tr').forEach(reorderRow);
		qsa('table.topic-list .topic-list-item').forEach(reorderRow);
	}
};
