/** 插件加载口子（无管理 UI） */
import { SCRIPT_NAME } from '../shared/constants.js';

export const PLUGIN_GLOBAL_KEY = '__LINUXDO_MOYU_PLUGINS__';

/**
 * 读取页面上第三方注册的插件模块并 addModule。
 * @param {import('./script.js').LinuxDoMoyu} script
 */
export function loadPluginsFromGlobal(script) {
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
