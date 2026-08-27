import { PREFIX } from '../../shared/constants.js';
import { qs, qsa } from '../../shared/dom.js';

/** @type excelGridSync */
export const excelGridSync = {
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
