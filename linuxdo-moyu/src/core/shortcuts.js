/** 快捷键总线：收集模块 shortcuts 声明 */

/**
 * @param {object[]} modules
 * @returns {Map<string, {action: string, handler: Function, defaultKey?: string, dynamic?: boolean, module?: string}>}
 */
export function collectShortcutHandlers(modules) {
	const map = new Map();
	for (const mod of modules) {
		const list = mod.shortcuts;
		if (!Array.isArray(list)) continue;
		for (const item of list) {
			if (!item || !item.action || typeof item.handler !== 'function') continue;
			if (map.has(item.action)) {
				console.warn(`[ldmy] shortcut action conflict: ${item.action} (${mod.name})`);
				continue;
			}
			map.set(item.action, { ...item, module: mod.name });
		}
	}
	return map;
}
