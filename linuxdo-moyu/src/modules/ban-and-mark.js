/** BanAndMark */
import { PREFIX } from '../shared/constants.js';
import { qs, qsa } from '../shared/dom.js';
import { notify, promptDialog, randomMarkColor, markFgFor } from '../shared/utils.js';

export const BanAndMark = {
	name: 'BanAndMark',
	settings: [
		{ type: 'normal', key: 'banAndMark', default: true, label: '黑名单 / 备注', group: 'enhance' },
	],
	styleOrder: 100,
	clearResiduals() {
		qsa('.topic-list-item').forEach((row) => {
			if (row.dataset.ldmyBanHide !== '1' && !row.classList.contains(`${PREFIX}-banned-post`)) return;
			row.classList.remove(`${PREFIX}-banned-post`);
			delete row.dataset.ldmyBanHide;
			row.style.display = '';
		});
		qsa('.topic-post').forEach((post) => {
			post.classList.remove(`${PREFIX}-banned-post`, `${PREFIX}-ban-collapsed`);
			post.querySelector(`.${PREFIX}-ban-placeholder`)?.remove();
		});
		qsa(`.${PREFIX}-user-actions, .${PREFIX}-mark-tags`).forEach((el) => el.remove());
	},
	/** 备注标签删除：document 级事件委托（capture 抢在页面 handler 前），renderPage 重建 DOM 也不丢监听 */
	init(script) {
		let lastHit = 0;
		const deleteMark = (e) => {
			const tag = e.target && e.target.closest ? e.target.closest(`.${PREFIX}-mark-tag`) : null;
			if (!tag) return;
			e.preventDefault();
			e.stopPropagation();
			const username = tag.dataset.ldmyMarkUser;
			const text = tag.dataset.ldmyMarkText;
			const color = tag.dataset.ldmyMarkColor;
			if (!username) return;
			const item = script.markList.find((m) => m.username === username);
			if (!item || !Array.isArray(item.tags)) return;
			const i = item.tags.findIndex(
				(x) => x.text === text && (x.color || '#8e44ad') === (color || '#8e44ad')
			);
			if (i >= 0) item.tags.splice(i, 1);
			if (!item.tags.length) {
				script.markList = script.markList.filter((m) => m.username !== username);
			}
			script.saveLists();
			notify(`已删除 @${username} 备注`);
			script.renderPage();
		};
		// pointerdown 优先：抢在页面任何 click/选择逻辑之前，点击必触发
		document.addEventListener(
			'pointerdown',
			(e) => {
				if (!e.target || !e.target.closest || !e.target.closest(`.${PREFIX}-mark-tag`)) return;
				lastHit = Date.now();
				deleteMark(e);
			},
			true
		);
		// click 兜底（键盘激活等）；删除后 DOM 重建，防同一次点击连删
		document.addEventListener(
			'click',
			(e) => {
				if (Date.now() - lastHit < 400) return;
				deleteMark(e);
			},
			true
		);
	},
	isBanned(script, username) {
		return script.banList.some((b) => b.username === username);
	},
	render(script) {
		if (!script.normal.banAndMark) {
			this.clearResiduals();
			return;
		}
		const banSet = new Set(script.banList.map((b) => b.username));
		const markMap = new Map(script.markList.map((m) => [m.username, m]));

		// topic list: hide topics whose first poster is banned
		qsa('.topic-list-item').forEach((row) => {
			const first = row.querySelector('.posters a[data-user-card], a[data-user-card]');
			const user = first?.getAttribute('data-user-card');
			const blocked = !!(user && banSet.has(user));
			if (blocked) {
				if (script.advanced.banMode === 'remove') {
					row.remove();
					return;
				}
				row.classList.add(`${PREFIX}-banned-post`);
				row.dataset.ldmyBanHide = '1';
				row.style.display = 'none';
			} else if (row.dataset.ldmyBanHide === '1') {
				// 解除拉黑后恢复
				row.classList.remove(`${PREFIX}-banned-post`);
				delete row.dataset.ldmyBanHide;
				row.style.display = '';
			}
		});

		qsa('.topic-post').forEach((post) => {
			const userEl = post.querySelector('[data-user-card]');
			const username = userEl?.getAttribute('data-user-card');
			if (!username) return;

			// 挂到主楼 topic-meta-data，避免插入 names 里夹在表情/徽章中间
			// 不取 embedded-reply 的 meta
			const meta =
				post.querySelector(
					':scope > article > .post__row > .topic-body > .topic-meta-data, :scope > article > .row > .topic-body > .topic-meta-data, :scope > article > .post__row > .post__body > .topic-meta-data, :scope > article > .row > .post__body > .topic-meta-data, :scope > article > .topic-body > .topic-meta-data, :scope > article > .post__body > .topic-meta-data'
				) ||
				post.querySelector('.topic-meta-data:not(.embedded-reply)') ||
				post.querySelector('.topic-meta-data') ||
				post.querySelector('.names');
			const actionHost = meta;
			if (actionHost && !actionHost.querySelector(`.${PREFIX}-user-actions`)) {
				const actions = document.createElement('span');
				actions.className = `${PREFIX}-user-actions`;
				actions.innerHTML = `
            <button type="button" class="mark" title="添加备注（点标签可删除）">备注</button>
            <button type="button" class="ban" title="拉黑 / 解除">拉黑</button>
          `;
				actions.querySelector('.mark').addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					promptDialog({
						title: `为 @${username} 添加备注`,
						fields: [
							{ key: 'text', label: '标签文字', value: '关注' },
							{ key: 'color', label: '颜色', type: 'color', value: randomMarkColor() },
						],
						okText: '添加',
					}).then((res) => {
						if (!res || !res.text || !res.text.trim()) return;
						const text = res.text.trim();
						const color = res.color || '#6E9BB8';
						const fg = markFgFor(color);
						let item = script.markList.find((m) => m.username === username);
						if (!item) {
							item = { username, tags: [], time: Date.now() };
							script.markList.push(item);
						}
						item.tags.push({ text, color, fg });
						script.saveLists();
						// force re-render marks
						actionHost.querySelector(`.${PREFIX}-mark-tags`)?.remove();
						post.dataset.ldmyMarked = '';
						script.renderPage();
						notify(`已备注 @${username}`);
					});
				});
				actions.querySelector('.ban').addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					// 必须读最新 banList，不能依赖 render 闭包里的 banSet
					if (BanAndMark.isBanned(script, username)) {
						script.banList = script.banList.filter((b) => b.username !== username);
						script.saveLists();
						notify(`已解除 @${username}`);
						script.renderPage();
						return;
					}
					promptDialog({
						title: `拉黑 @${username}`,
						fields: [{ key: 'reason', label: '原因（可选）' }],
						okText: '拉黑',
					}).then((res) => {
						if (res === null) return;
						const reason = (res.reason || '').trim();
						if (BanAndMark.isBanned(script, username)) {
							notify(`@${username} 已在黑名单中`);
							return;
						}
						script.banList.push({ username, reason, time: Date.now() });
						script.saveLists();
						notify(`已拉黑 @${username}`);
						script.renderPage();
					});
				});
				actionHost.appendChild(actions);
			}

			// 同步拉黑/备注按钮文案（页内可直接解除，无需只靠名单管理）
			const banBtn = actionHost?.querySelector(`.${PREFIX}-user-actions .ban`);
			if (banBtn) {
				const bannedNow = banSet.has(username);
				banBtn.textContent = bannedNow ? '解除' : '拉黑';
				banBtn.title = bannedNow ? '点击解除拉黑' : '拉黑该用户';
			}
			const markBtn = actionHost?.querySelector(`.${PREFIX}-user-actions .mark`);
			if (markBtn) {
				const hasMark = markMap.has(username);
				markBtn.textContent = hasMark ? '加备注' : '备注';
				markBtn.title = hasMark ? '继续添加备注；点击已有彩色标签可删除' : '添加备注标签';
			}

			// marks（标签可直接点删，不必只去名单管理）
			const mark = markMap.get(username);
			if (mark && actionHost) {
				actionHost.querySelector(`.${PREFIX}-mark-tags`)?.remove();
				const wrap = document.createElement('span');
				wrap.className = `${PREFIX}-mark-tags`;
				(mark.tags || []).forEach((tagItem) => {
					const tag = document.createElement('span');
					tag.className = `${PREFIX}-mark-tag`;
					tag.title = '点击删除此备注';
					tag.style.background = tagItem.color || '#6E9BB8';
					tag.style.color = tagItem.fg || markFgFor(tagItem.color);
					tag.dataset.ldmyMarkUser = username;
					tag.dataset.ldmyMarkText = tagItem.text || '';
					tag.dataset.ldmyMarkColor = tagItem.color || '#8e44ad';
					tag.innerHTML = `<span>${tagItem.text || ''}</span><span class="${PREFIX}-mark-x" aria-hidden="true">×</span>`;
					// 删除逻辑在 init() 的 document 事件委托里，点击即删 + toast
					wrap.appendChild(tag);
				});
				actionHost.appendChild(wrap);
			} else if (actionHost) {
				actionHost.querySelector(`.${PREFIX}-mark-tags`)?.remove();
			}

			// ban apply / restore
			if (banSet.has(username)) {
				if (script.advanced.banMode === 'remove') {
					post.remove();
					return;
				}
				post.classList.add(`${PREFIX}-banned-post`, `${PREFIX}-ban-collapsed`);
				if (!post.querySelector(`.${PREFIX}-ban-placeholder`)) {
					const ph = document.createElement('div');
					ph.className = `${PREFIX}-ban-placeholder`;
					const info = script.banList.find((b) => b.username === username);
					const collapsedText = `已屏蔽 @${username}${info?.reason ? '：' + info.reason : ''}（点击查看）`;
					const openText = `已屏蔽 @${username}（点击重新折叠）`;
					ph.textContent = collapsedText;
					ph.style.cursor = 'pointer';
					ph.addEventListener('click', () => {
						const collapsed = post.classList.toggle(`${PREFIX}-ban-collapsed`);
						ph.textContent = collapsed ? collapsedText : openText;
					});
					const body = post.querySelector('.post__body, .topic-body') || post;
					body.insertBefore(ph, body.firstChild);
				}
			} else {
				post.classList.remove(`${PREFIX}-banned-post`, `${PREFIX}-ban-collapsed`);
				post.querySelector(`.${PREFIX}-ban-placeholder`)?.remove();
			}
		});
	},
};

/** 关键字屏蔽 */
