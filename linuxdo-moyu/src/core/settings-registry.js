/** 从模块声明收集 settings */
import { DEFAULT_NORMAL, DEFAULT_ADVANCED } from '../shared/constants.js';

/**
 * @param {object[]} modules
 * @returns {{ normal: object, advanced: object, registry: object[] }}
 */
export function collectSettingsFromModules(modules) {
	const normal = { ...DEFAULT_NORMAL };
	const advanced = { ...DEFAULT_ADVANCED };
	const registry = [];
	const seen = new Set();

	const addOne = (mod, setting) => {
		if (!setting || !setting.key) return;
		const type = setting.type || 'normal';
		const id = `${type}:${setting.key}`;
		if (seen.has(id)) {
			// builtin defaults win; later duplicate skipped
			return;
		}
		seen.add(id);
		registry.push({ ...setting, type, module: mod.name });
		const bucket = type === 'advanced' ? advanced : normal;
		if (!(setting.key in bucket)) {
			bucket[setting.key] = setting.default;
		} else if (Object.prototype.hasOwnProperty.call(setting, 'default')) {
			// keep DEFAULT_* as source of truth when already present
		}
	};

	for (const mod of modules) {
		if (mod.setting) addOne(mod, mod.setting);
		if (Array.isArray(mod.settings)) {
			for (const s of mod.settings) addOne(mod, s);
		}
	}
	return { normal, advanced, registry };
}
