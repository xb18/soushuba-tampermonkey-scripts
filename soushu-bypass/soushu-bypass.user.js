// ==UserScript==
// @name         搜书吧免积分下载
// @namespace    https://github.com/urzeye/tampermonkey-scripts
// @version      1.0.0
// @description  搜书吧附件免积分一键下载（需登录）
// @author       urzeye
// @include      *://*/*forum.php*
// @grant        none
// @run-at       document-end
// ==/UserScript==

!function () { 'use strict'; if (/[?&]mod=attachment/.test(location.search)) { var e = document.querySelector('a[href*="mod=attachment"]'); if (e) { var t = document.createElement('a'); t.href = e.getAttribute('href'), location.replace(t.href) } return } if ('undefined' == typeof window.discuz_uid) return; if (parseInt(window.discuz_uid, 10) <= 0) return; var a = document.querySelector('meta[name="generator"]'); if (!a || !/Discuz!/i.test(a.getAttribute('content') || '')) return; document.querySelectorAll('a[href*="attachpay"]').forEach(function (e) { var t = e.getAttribute('href') || '', a = t.match(/[&?]a(?:mp;)?id=(\d+)/); if (!a) return; var o = t.match(/[&?]t(?:mp;)?id=(\d+)/), n = document.createElement('a'); n.href = 'forum.php?mod=attachment&aid=' + btoa([a[1], '1', '1', '1', o ? o[1] : '0'].join('|')), n.target = '_self', n.style.cssText = 'margin-left:10px;color:red;font-weight:bold', n.textContent = '\u26a1\u4e0b\u8f7d', e.parentNode.insertBefore(n, e.nextSibling) }) }();
