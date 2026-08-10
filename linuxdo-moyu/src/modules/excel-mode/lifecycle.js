import { PREFIX, SCRIPT_NAME } from '../../shared/constants.js';
import { qs, qsa } from '../../shared/dom.js';
import { isTopicListPage, isTopicPage, isSearchPage, notify } from '../../shared/utils.js';

/** @type excelLifecycle */
export const excelLifecycle = {
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
