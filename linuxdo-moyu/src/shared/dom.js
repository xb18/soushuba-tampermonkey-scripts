/** DOM 与节流工具 */
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function debounce(fn, wait = 120) {
	let t;
	return function (...args) {
		clearTimeout(t);
		t = setTimeout(() => fn.apply(this, args), wait);
	};
}

export function throttle(fn, wait = 200) {
	let last = 0;
	let timer;
	return function (...args) {
		const now = Date.now();
		const remain = wait - (now - last);
		if (remain <= 0) {
			clearTimeout(timer);
			last = now;
			fn.apply(this, args);
		} else {
			clearTimeout(timer);
			timer = setTimeout(() => {
				last = Date.now();
				fn.apply(this, args);
			}, remain);
		}
	};
}
