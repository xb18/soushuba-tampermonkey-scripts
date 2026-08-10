/** 按 order 收集并注入样式 */
import baseCss from '../styles/base.css';
import featuresCss from '../styles/features.css';

/**
 * @param {Array<{name?: string, style?: string|string[], styleOrder?: number, asyncStyle?: Function}>} modules
 * @param {object} script
 */
export function collectStyles(modules, script) {
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

export function injectCss(css) {
	if (typeof GM_addStyle === 'function') {
		return GM_addStyle(css);
	}
	const el = document.createElement('style');
	el.textContent = css;
	document.documentElement.appendChild(el);
	return el;
}
