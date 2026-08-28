import { PREFIX } from '../../shared/constants.js';
import { EXCEL_FAVICON, getExcelAsset } from '../../assets/excel-themes.js';

/** @type excelThemes */
export const excelThemes = {
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
            <div class="${PREFIX}-excel-home ${PREFIX}-excel-ico-btn" role="link" title="返回首页" aria-label="返回首页">${this.ico(t, 'icon_1', 24)}</div>
            <div class="${PREFIX}-excel-home ${PREFIX}-excel-ico-btn" role="link" title="返回首页">${this.ico(t, 'icon_2', 12)}</div>
            ${this.vsep(24, '0 12px')}
            <div class="${PREFIX}-excel-titlebar-title"></div>
            <div class="${PREFIX}-excel-home ${PREFIX}-excel-ico-btn" role="link" title="返回首页">${this.ico(t, 'icon_3', 16)}</div>
            <span style="width:12px"></span>
            <div class="${PREFIX}-excel-home ${PREFIX}-excel-ico-btn" role="link" title="返回首页">${this.ico(t, 'icon_4', 16)}</div>
            <span style="width:10px"></span>
            <div class="${PREFIX}-excel-home ${PREFIX}-excel-ico-btn" role="link" title="返回首页">${this.ico(t, 'icon_5', 16)}</div>
            <div class="${PREFIX}-excel-muted ${PREFIX}-excel-home" role="link" title="返回首页">上次修改是在刚刚进行的</div>
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
            <div class="${PREFIX}-excel-zoom" data-ldmy-timeline="1">
              ${this.ico(t, 'icon_36', 24)}
              <button type="button" class="${PREFIX}-excel-zoom-btn ${PREFIX}-excel-zoom-minus" title="上一楼 / 顶部">-</button>
              <div class="${PREFIX}-excel-slider-wrap">
                <input type="range" class="${PREFIX}-excel-floor-slider" min="1" max="100" value="100" step="1" title="滑动跳转楼层" />
              </div>
              <button type="button" class="${PREFIX}-excel-zoom-btn ${PREFIX}-excel-zoom-plus" title="下一楼 / 底部">+</button>
              <span class="${PREFIX}-excel-floor-text" title="点击输入楼层跳转">100%</span>
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
            <div class="${PREFIX}-excel-home ${PREFIX}-excel-h1-home" role="link" title="返回首页"></div>
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
            <div class="${PREFIX}-excel-home ${PREFIX}-excel-h2-file" role="link" title="返回首页"></div>
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
            <div class="${PREFIX}-excel-zoom ${PREFIX}-excel-zoom-office" data-ldmy-timeline="1">
              <button type="button" class="${PREFIX}-excel-zoom-btn ${PREFIX}-excel-zoom-minus" title="上一楼 / 顶部">-</button>
              <div class="${PREFIX}-excel-slider-wrap">
                <input type="range" class="${PREFIX}-excel-floor-slider" min="1" max="100" value="100" step="1" title="滑动跳转楼层" />
              </div>
              <button type="button" class="${PREFIX}-excel-zoom-btn ${PREFIX}-excel-zoom-plus" title="下一楼 / 底部">+</button>
              <span class="${PREFIX}-excel-floor-text" title="点击输入楼层跳转">100%</span>
            </div>
          </div>
        </div>`;
	}
};
