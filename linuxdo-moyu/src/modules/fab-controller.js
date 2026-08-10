/** FabController */

export const FabController = {
	name: 'FabController',
	settings: [
		{ type: 'normal', key: 'floorJump', default: true, label: '楼层跳转按钮', group: 'enhance' },
		{ type: 'normal', key: 'backToTop', default: true, label: '返回顶部按钮', group: 'enhance' },
	],
	render(script) {
		script.updateFabVisibility();
	},
};

/** Excel 摸鱼外观 */
