/**
 * LINUX DO 优化摸鱼体验 — 入口
 */
import { SCRIPT_NAME } from './shared/constants.js';
import { LinuxDoMoyu } from './core/script.js';
import { loadPluginsFromGlobal } from './core/plugin-loader.js';
import { builtinModules } from './modules/index.js';

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
