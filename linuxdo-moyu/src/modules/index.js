/** 内置模块注册表 */
export { OpenInNewTab } from './open-in-new-tab.js';
export { ImageEnhance } from './image-enhance.js';
export { HideImagePlaceholder } from './hide-image-placeholder.js';
export { BanAndMark } from './ban-and-mark.js';
export { KeywordsBlock } from './keywords-block.js';
export { HideEmojiText } from './hide-emoji-text.js';
export { HighlightOP } from './highlight-op.js';
export { ExcelMode } from './excel-mode/index.js';
export { FabController } from './fab-controller.js';

import { OpenInNewTab } from './open-in-new-tab.js';
import { ImageEnhance } from './image-enhance.js';
import { HideImagePlaceholder } from './hide-image-placeholder.js';
import { BanAndMark } from './ban-and-mark.js';
import { KeywordsBlock } from './keywords-block.js';
import { HideEmojiText } from './hide-emoji-text.js';
import { HighlightOP } from './highlight-op.js';
import { ExcelMode } from './excel-mode/index.js';
import { FabController } from './fab-controller.js';

/** @type {import('../core/script.js').LinuxDoMoyu} */
export const builtinModules = [
	OpenInNewTab,
	ImageEnhance,
	HideImagePlaceholder,
	BanAndMark,
	KeywordsBlock,
	HideEmojiText,
	HighlightOP,
	ExcelMode,
	FabController,
];
