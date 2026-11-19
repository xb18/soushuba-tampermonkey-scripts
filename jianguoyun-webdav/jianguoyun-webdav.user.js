// ==UserScript==
// @name         坚果云 WebDAV 网页端密码管理
// @namespace    https://github.com/urzeye/tampermonkey-scripts
// @version      1.0.3
// @description  恢复坚果云网页版在安全选项页面中被隐藏的 WebDAV 第三方应用密码管理功能，免下载客户端，直接在网页端查看、创建、复制和撤销应用密码（支持 Obsidian / Zotero / KeePass 等）；同时净化侧边栏应用推荐与底部轮播广告。
// @author       urzeye
// @match        https://www.jianguoyun.com/d/home*
// @match        https://www.jianguoyun.com/d/account*
// @grant        none
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const WEBDAV_SERVER = 'https://dav.jianguoyun.com/dav/';
  const MOBILE_ASP_URL = '/d/mobile_asp';
  const ACCOUNT_SAFE_URL = '/d/account';
  const GENERATE_ASP_URL = '/d/ajax/userop/generateAsp';
  const REVOKE_ASP_URL = '/d/ajax/userop/revokeAsp';

  const CONTAINER_SELECTOR = '.item-box.item-app-manage .third-content-b';
  const PANEL_ID = 'jgy-custom-asp-panel';

  // 状态缓存
  let currentSecrets = [];
  let currentUserAccount = '';
  let isLoading = false;
  let observer = null;

  /**
   * 复制文本到剪贴板
   */
  async function copyText(text, successMsg = '已复制到剪贴板') {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast(successMsg, 'success');
    } catch (err) {
      console.error('复制失败:', err);
      showToast('复制失败，请手动选择复制', 'error');
    }
  }

  /**
   * 页面轻量 Toast 提示
   */
  function showToast(message, type = 'info') {
    let container = document.getElementById('jgy-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'jgy-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `jgy-toast jgy-toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('jgy-toast-show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('jgy-toast-show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2600);
  }

  /**
   * 自定义确认弹窗，替代原生 window.confirm
   */
  function showConfirmModal({ title = '确认操作', content = '', confirmText = '确定', cancelText = '取消', isDanger = false }) {
    return new Promise((resolve) => {
      const oldModal = document.getElementById('jgy-confirm-modal');
      if (oldModal) oldModal.remove();

      const modalWrap = document.createElement('div');
      modalWrap.id = 'jgy-confirm-modal';
      modalWrap.innerHTML = `
        <div class="jgy-modal-mask"></div>
        <div class="jgy-modal-dialog">
          <div class="jgy-modal-header">
            <span class="jgy-modal-icon ${isDanger ? 'jgy-icon-danger' : 'jgy-icon-info'}">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </span>
            <span class="jgy-modal-title">${escapeHtml(title)}</span>
          </div>
          <div class="jgy-modal-body">
            ${content}
          </div>
          <div class="jgy-modal-footer">
            <button type="button" class="jgy-btn-default jgy-modal-cancel">${escapeHtml(cancelText)}</button>
            <button type="button" class="${isDanger ? 'jgy-btn-danger' : 'jgy-btn-primary'} jgy-modal-confirm">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modalWrap);

      // 动画触发
      requestAnimationFrame(() => {
        modalWrap.classList.add('jgy-modal-open');
      });

      const cleanup = (result) => {
        document.removeEventListener('keydown', handleKeyDown);
        modalWrap.classList.remove('jgy-modal-open');
        setTimeout(() => {
          if (modalWrap.parentNode) modalWrap.parentNode.removeChild(modalWrap);
        }, 200);
        resolve(result);
      };

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') cleanup(false);
        if (e.key === 'Enter') cleanup(true);
      };
      document.addEventListener('keydown', handleKeyDown);

      modalWrap.querySelector('.jgy-modal-mask').addEventListener('click', () => cleanup(false));
      modalWrap.querySelector('.jgy-modal-cancel').addEventListener('click', () => cleanup(false));
      modalWrap.querySelector('.jgy-modal-confirm').addEventListener('click', () => cleanup(true));
    });
  }

  /**
   * 注入自定义样式，与坚果云原有风格保持一致
   */
  function injectStyles() {
    if (document.getElementById('jgy-asp-styles')) return;

    const style = document.createElement('style');
    style.id = 'jgy-asp-styles';
    style.textContent = `
      #jgy-toast-container {
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }
      .jgy-toast {
        padding: 9px 18px;
        font-size: 13px;
        border-radius: 4px;
        color: #fff;
        background: rgba(0, 0, 0, 0.75);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        opacity: 0;
        transform: translateY(-8px);
        transition: all 0.25s ease;
        pointer-events: auto;
      }
      .jgy-toast-show {
        opacity: 1;
        transform: translateY(0);
      }
      .jgy-toast-success {
        background: #52c41a;
      }
      .jgy-toast-error {
        background: #f5222d;
      }
      .jgy-toast-info {
        background: #1890ff;
      }

      /* 面板容器 */
      #${PANEL_ID} {
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px dashed #e8e8e8;
        font-size: 13px;
        color: #333;
      }

      /* 示例区域 */
      #${PANEL_ID} .jgy-example-box {
        background: #fafafa;
        border: 1px solid #f0f0f0;
        border-radius: 4px;
        padding: 12px 16px;
        margin-bottom: 16px;
      }
      #${PANEL_ID} .jgy-example-title {
        font-weight: 600;
        font-size: 13px;
        color: #333;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .jgy-example-list {
        list-style: none;
        padding: 0;
        margin: 0;
        line-height: 1.8;
      }
      #${PANEL_ID} .jgy-example-item {
        display: flex;
        align-items: center;
      }
      #${PANEL_ID} .jgy-example-label {
        color: #8c8c8c;
        width: 85px;
      }
      #${PANEL_ID} .jgy-example-val {
        color: #333;
        font-family: Menlo, Monaco, Consolas, monospace;
      }
      #${PANEL_ID} .jgy-copy-btn {
        margin-left: 10px;
        padding: 1px 7px;
        font-size: 12px;
        color: #107ffc;
        background: transparent;
        border: 1px solid #d4e8ff;
        border-radius: 3px;
        cursor: pointer;
        transition: all 0.2s;
      }
      #${PANEL_ID} .jgy-copy-btn:hover {
        background: #e6f1fc;
        border-color: #107ffc;
      }

      /* 表格区域 */
      #${PANEL_ID} .jgy-table-wrap {
        border: 1px solid #f0f0f0;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 16px;
      }
      #${PANEL_ID} .jgy-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      #${PANEL_ID} .jgy-table th {
        background: #fafafa;
        color: #555;
        font-weight: 600;
        padding: 10px 14px;
        border-bottom: 1px solid #f0f0f0;
        font-size: 13px;
      }
      #${PANEL_ID} .jgy-table td {
        padding: 10px 14px;
        border-bottom: 1px solid #f0f0f0;
        color: #333;
        vertical-align: middle;
      }
      #${PANEL_ID} .jgy-table tr:last-child td {
        border-bottom: none;
      }
      #${PANEL_ID} .jgy-table tr:hover td {
        background: #fbfbfb;
      }
      #${PANEL_ID} .jgy-col-name {
        width: 25%;
        font-weight: 500;
      }
      #${PANEL_ID} .jgy-col-date {
        width: 20%;
        color: #888;
      }
      #${PANEL_ID} .jgy-col-pwd {
        width: 35%;
        font-family: Menlo, Monaco, Consolas, monospace;
      }
      #${PANEL_ID} .jgy-pwd-val {
        display: inline-block;
        width: 155px;
        vertical-align: middle;
        font-family: Menlo, Monaco, Consolas, monospace;
        letter-spacing: 0;
      }
      #${PANEL_ID} .jgy-col-action {
        width: 20%;
        text-align: right;
      }

      #${PANEL_ID} .jgy-pwd-masked {
        color: #888;
      }
      #${PANEL_ID} .jgy-pwd-plain {
        color: #107ffc;
        font-weight: 600;
      }
      #${PANEL_ID} .jgy-toggle-pwd {
        display: inline-block;
        width: 32px;
        text-align: center;
      }

      /* 操作链接 */
      #${PANEL_ID} .jgy-link-action {
        color: #107ffc;
        cursor: pointer;
        text-decoration: none;
        margin-left: 8px;
        font-size: 13px;
      }
      #${PANEL_ID} .jgy-link-action:hover {
        color: #0b66ca;
        text-decoration: underline;
      }
      #${PANEL_ID} .jgy-link-delete {
        color: #ff4d4f;
      }
      #${PANEL_ID} .jgy-link-delete:hover {
        color: #cf1322;
      }

      /* 空状态 */
      #${PANEL_ID} .jgy-empty {
        text-align: center;
        padding: 24px;
        color: #999;
      }

      /* 新建密码面板 */
      #${PANEL_ID} .jgy-add-btn-wrap {
        display: flex;
        align-items: center;
      }
      #${PANEL_ID} .jgy-btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: #107ffc;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 7px 16px;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.2s;
      }
      #${PANEL_ID} .jgy-btn-primary:hover {
        background: #0b66ca;
      }
      #${PANEL_ID} .jgy-btn-primary:disabled {
        background: #a0cfff;
        cursor: not-allowed;
      }

      #${PANEL_ID} .jgy-create-panel {
        display: none;
        align-items: center;
        gap: 10px;
        background: #fafafa;
        border: 1px solid #e8e8e8;
        border-radius: 4px;
        padding: 12px 16px;
        margin-top: 10px;
      }
      #${PANEL_ID} .jgy-input {
        flex: 1;
        max-width: 280px;
        height: 32px;
        padding: 0 10px;
        font-size: 13px;
        border: 1px solid #d9d9d9;
        border-radius: 4px;
        outline: none;
        transition: all 0.2s;
      }
      #${PANEL_ID} .jgy-input:focus {
        border-color: #107ffc;
        box-shadow: 0 0 0 2px rgba(16, 127, 252, 0.15);
      }
      #${PANEL_ID} .jgy-btn-default {
        height: 32px;
        padding: 0 14px;
        font-size: 13px;
        background: #fff;
        border: 1px solid #d9d9d9;
        border-radius: 4px;
        cursor: pointer;
        color: #555;
        transition: all 0.2s;
      }
      #${PANEL_ID} .jgy-btn-default:hover {
        border-color: #999;
        color: #333;
      }

      /* 正在加载提示 */
      #${PANEL_ID} .jgy-loading {
        text-align: center;
        padding: 24px;
        color: #888;
      }

      /* 自定义确认弹窗 */
      #jgy-confirm-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
      #jgy-confirm-modal.jgy-modal-open {
        opacity: 1;
        pointer-events: auto;
      }
      #jgy-confirm-modal .jgy-modal-mask {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(2px);
      }
      #jgy-confirm-modal .jgy-modal-dialog {
        position: relative;
        background: #fff;
        border-radius: 8px;
        width: 440px;
        max-width: 90vw;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
        padding: 24px;
        transform: scale(0.92);
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 1;
      }
      #jgy-confirm-modal.jgy-modal-open .jgy-modal-dialog {
        transform: scale(1);
      }
      #jgy-confirm-modal .jgy-modal-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }
      #jgy-confirm-modal .jgy-modal-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      #jgy-confirm-modal .jgy-icon-danger {
        color: #ff4d4f;
      }
      #jgy-confirm-modal .jgy-icon-info {
        color: #107ffc;
      }
      #jgy-confirm-modal .jgy-modal-title {
        font-size: 16px;
        font-weight: 600;
        color: #1f1f1f;
      }
      #jgy-confirm-modal .jgy-modal-body {
        font-size: 14px;
        color: #555;
        line-height: 1.6;
        margin-bottom: 24px;
        padding-left: 32px;
      }
      #jgy-confirm-modal .jgy-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
      #jgy-confirm-modal .jgy-btn-danger {
        height: 32px;
        padding: 0 16px;
        font-size: 13px;
        background: #ff4d4f;
        border: none;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
        transition: background 0.2s;
      }
      #jgy-confirm-modal .jgy-btn-danger:hover {
        background: #d9363e;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 优先从 /d/mobile_asp 获取应用密码列表
   */
  async function fetchSecretsFromMobileAsp() {
    const resp = await fetch(MOBILE_ASP_URL, {
      credentials: 'include',
      headers: { Accept: 'text/html,application/xhtml+xml' }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    // 匹配 userAspsStr
    const match = html.match(/userAspsStr\s*[:=]\s*['"]((?:\\['"]|[^'"])*)['"]/);
    if (!match) throw new Error('userAspsStr not found');

    const rawStr = match[1].replace(/\\\\/g, '\\').replace(/\\'/g, "'").replace(/\\"/g, '"');
    const json = JSON.parse(rawStr);

    // 尝试提取账号
    let account = '';
    const accMatch = html.match(/(?:account|username|loginName|email)\s*[:=]\s*["']([^"'@\s]+@[^"'\s]+)["']/i) ||
                     html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (accMatch) account = accMatch[1] || accMatch[0];

    return {
      secrets: json.map(item => ({
        name: item.name || '',
        creationTime: item.creationTime || '',
        credential: item.credential || ''
      })),
      account
    };
  }

  /**
   * 备用方案：从 /d/account 解析 HTML 表格
   */
  async function fetchSecretsFromAccountSafe() {
    const resp = await fetch(ACCOUNT_SAFE_URL, {
      credentials: 'include',
      headers: { Accept: 'text/html,application/xhtml+xml' }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 提取账号
    let account = '';
    const emailElem = doc.querySelector('.topuser strong') || doc.querySelector('#safe .item-value');
    if (emailElem && emailElem.textContent.includes('@')) {
      account = emailElem.textContent.trim();
    } else {
      const match = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (match) account = match[0];
    }

    const secrets = [];
    const rows = doc.querySelectorAll('#app-list tr.app-psw');
    rows.forEach(row => {
      const name = row.querySelector('.name')?.textContent.trim() || '';
      const creationTime = row.querySelector('.date')?.textContent.trim() || '';
      const credential = row.querySelector('.password .detail')?.textContent.trim() || '';
      if (name) {
        secrets.push({ name, creationTime, credential });
      }
    });

    return { secrets, account };
  }

  /**
   * 获取账号密码列表主入口
   */
  async function loadSecrets() {
    try {
      const res = await fetchSecretsFromMobileAsp();
      currentSecrets = res.secrets;
      if (res.account) currentUserAccount = res.account;
      return;
    } catch (err) {
      console.warn('从 /d/mobile_asp 获取失败，尝试从 /d/account 获取:', err);
    }

    try {
      const res = await fetchSecretsFromAccountSafe();
      currentSecrets = res.secrets;
      if (res.account) currentUserAccount = res.account;
    } catch (err) {
      console.error('获取坚果云第三方应用密码列表失败:', err);
      throw err;
    }
  }

  /**
   * 调用后台接口生成新密码
   */
  async function apiGenerateAsp(appName) {
    const resp = await fetch(GENERATE_ASP_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: 'asp_name=' + encodeURIComponent(appName)
    });

    if (!resp.ok) {
      throw new Error(`创建失败 (HTTP ${resp.status})`);
    }

    const data = await resp.json();
    if (!data || !data.credential) {
      throw new Error('服务器未返回有效密码');
    }
    return data;
  }

  /**
   * 调用后台接口撤销授权
   */
  async function apiRevokeAsp(appName) {
    const resp = await fetch(REVOKE_ASP_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: 'asp_name=' + encodeURIComponent(appName)
    });

    if (!resp.ok) {
      throw new Error(`撤销失败 (HTTP ${resp.status})`);
    }
  }

  /**
   * 尝试从当前页面提取用户信息
   */
  function detectAccountFromPage() {
    if (currentUserAccount) return currentUserAccount;
    const candidates = [
      document.querySelector('.top-right .user-name'),
      document.querySelector('.user-info .user-name'),
      document.querySelector('.profile-name'),
      document.querySelector('.email')
    ];
    for (const c of candidates) {
      if (c && c.textContent && c.textContent.includes('@')) {
        currentUserAccount = c.textContent.trim();
        return currentUserAccount;
      }
    }
    return '';
  }

  /**
   * 渲染应用密码管理完整面板
   */
  function renderPanel(container) {
    // 还原提示文案，去除强制引导下载客户端的说明
    const tipElem = container.querySelector('.left .tip');
    if (tipElem && tipElem.textContent.includes('下载并安装坚果客户端')) {
      tipElem.textContent = '用于授权第三方 WebDAV 应用访问您的云空间。';
    }

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      container.appendChild(panel);
    }

    const account = currentUserAccount || detectAccountFromPage() || '（您的坚果云账号）';

    panel.innerHTML = `
      <div class="jgy-example-box">
        <div class="jgy-example-title">WebDAV 连接示例</div>
        <ul class="jgy-example-list">
          <li class="jgy-example-item">
            <span class="jgy-example-label">服务器地址：</span>
            <span class="jgy-example-val">${WEBDAV_SERVER}</span>
            <button type="button" class="jgy-copy-btn" id="jgy-copy-server">复制</button>
          </li>
          <li class="jgy-example-item">
            <span class="jgy-example-label">账户：</span>
            <span class="jgy-example-val">${account}</span>
            <button type="button" class="jgy-copy-btn" id="jgy-copy-account">复制</button>
          </li>
          <li class="jgy-example-item">
            <span class="jgy-example-label">密码：</span>
            <span class="jgy-example-val">(下方生成的专属应用密码)</span>
          </li>
        </ul>
      </div>

      <div class="jgy-table-wrap">
        <table class="jgy-table">
          <thead>
            <tr>
              <th class="jgy-col-name">应用名称</th>
              <th class="jgy-col-date">授权日期</th>
              <th class="jgy-col-pwd">应用密码</th>
              <th class="jgy-col-action">操作</th>
            </tr>
          </thead>
          <tbody id="jgy-table-body"></tbody>
        </table>
      </div>

      <div class="jgy-add-btn-wrap">
        <button type="button" class="jgy-btn-primary" id="jgy-open-create-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          添加应用密码
        </button>
      </div>

      <div class="jgy-create-panel" id="jgy-create-panel">
        <input type="text" class="jgy-input" id="jgy-app-name-input" placeholder="输入应用名称（如: Obsidian, Zotero）" maxlength="50" />
        <button type="button" class="jgy-btn-primary" id="jgy-submit-create-btn">生成密码</button>
        <button type="button" class="jgy-btn-default" id="jgy-cancel-create-btn">取消</button>
      </div>
    `;

    // 绑定示例复制事件
    panel.querySelector('#jgy-copy-server').addEventListener('click', () => {
      copyText(WEBDAV_SERVER, '已复制服务器地址');
    });
    panel.querySelector('#jgy-copy-account').addEventListener('click', () => {
      if (account && !account.startsWith('（')) {
        copyText(account, '已复制账号');
      } else {
        showToast('未检测到账号，请手动输入邮箱', 'error');
      }
    });

    // 绑定添加密码交互
    const openCreateBtn = panel.querySelector('#jgy-open-create-btn');
    const createPanel = panel.querySelector('#jgy-create-panel');
    const inputName = panel.querySelector('#jgy-app-name-input');
    const submitBtn = panel.querySelector('#jgy-submit-create-btn');
    const cancelBtn = panel.querySelector('#jgy-cancel-create-btn');

    openCreateBtn.addEventListener('click', () => {
      openCreateBtn.style.display = 'none';
      createPanel.style.display = 'flex';
      inputName.value = '';
      inputName.focus();
    });

    cancelBtn.addEventListener('click', () => {
      createPanel.style.display = 'none';
      openCreateBtn.style.display = 'inline-flex';
    });

    const handleCreate = async () => {
      const name = inputName.value.trim();
      if (!name) {
        showToast('请输入应用名称', 'error');
        inputName.focus();
        return;
      }

      // 重名检查
      if (currentSecrets.some(item => item.name === name)) {
        showToast('该应用名称已存在，请换一个名称', 'error');
        inputName.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '生成中...';

      try {
        const result = await apiGenerateAsp(name);
        showToast(`成功为“${name}”生成应用密码！`, 'success');

        // 插入当前列表首部
        currentSecrets.unshift({
          name: result.name || name,
          creationTime: result.creationTime || new Date().toISOString().split('T')[0],
          credential: result.credential
        });

        // 重新渲染表格
        renderTableRows();

        // 自动复制新生成的密码
        copyText(result.credential, `生成成功！已自动复制“${name}”的应用密码`);

        // 重置新建面板
        createPanel.style.display = 'none';
        openCreateBtn.style.display = 'inline-flex';
      } catch (err) {
        console.error('生成应用密码失败:', err);
        showToast(err.message || '生成应用密码失败，请稍后重试', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '生成密码';
      }
    };

    submitBtn.addEventListener('click', handleCreate);
    inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleCreate();
      if (e.key === 'Escape') cancelBtn.click();
    });

    renderTableRows();
  }

  /**
   * 渲染表格行
   */
  function renderTableRows() {
    const tbody = document.getElementById('jgy-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!currentSecrets || currentSecrets.length === 0) {
      const emptyTr = document.createElement('tr');
      emptyTr.innerHTML = `
        <td colspan="4" class="jgy-empty">
          您当前未授权任何第三方应用
        </td>
      `;
      tbody.appendChild(emptyTr);
      return;
    }

    currentSecrets.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.dataset.name = item.name;

      tr.innerHTML = `
        <td class="jgy-col-name">${escapeHtml(item.name)}</td>
        <td class="jgy-col-date">${escapeHtml(item.creationTime)}</td>
        <td class="jgy-col-pwd">
          <span class="jgy-pwd-val jgy-pwd-masked">••••••••••••••••</span>
          <a class="jgy-link-action jgy-toggle-pwd">显示</a>
          <a class="jgy-link-action jgy-copy-pwd">复制</a>
        </td>
        <td class="jgy-col-action">
          <a class="jgy-link-action jgy-link-delete jgy-del-pwd">撤消授权</a>
        </td>
      `;

      const pwdVal = tr.querySelector('.jgy-pwd-val');
      const toggleBtn = tr.querySelector('.jgy-toggle-pwd');
      const copyBtn = tr.querySelector('.jgy-copy-pwd');
      const delBtn = tr.querySelector('.jgy-del-pwd');

      let isShown = false;

      // 切换显隐
      toggleBtn.addEventListener('click', () => {
        isShown = !isShown;
        if (isShown) {
          pwdVal.textContent = item.credential;
          pwdVal.className = 'jgy-pwd-val jgy-pwd-plain';
          toggleBtn.textContent = '隐藏';
        } else {
          pwdVal.textContent = '••••••••••••••••';
          pwdVal.className = 'jgy-pwd-val jgy-pwd-masked';
          toggleBtn.textContent = '显示';
        }
      });

      // 复制密码
      copyBtn.addEventListener('click', () => {
        copyText(item.credential, `已复制“${item.name}”的应用密码`);
      });

      // 撤销授权
      delBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmModal({
          title: '撤销授权确认',
          content: `确定要撤销对 <strong>「${escapeHtml(item.name)}」</strong> 的授权吗？<br><span style="color: #8c8c8c; font-size: 13px; display: inline-block; margin-top: 6px;">撤销后该第三方应用将无法继续访问您的坚果云。</span>`,
          confirmText: '确定撤销',
          cancelText: '取消',
          isDanger: true
        });
        if (!confirmed) return;

        delBtn.textContent = '撤销中...';
        try {
          await apiRevokeAsp(item.name);
          showToast(`已成功撤销对“${item.name}”的授权`, 'success');
          // 从列表中移除
          currentSecrets.splice(index, 1);
          renderTableRows();
        } catch (err) {
          console.error('撤销失败:', err);
          showToast(err.message || '撤销授权失败，请稍后重试', 'error');
          delBtn.textContent = '撤消授权';
        }
      });

      tbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 检查当前页面路由并执行挂载
   */
  async function checkAndMount() {
    // 仅在 #/safety 路由或安全设置页面执行
    const isSafetyRoute = location.hash.includes('#/safety') || location.pathname.endsWith('/account');
    if (!isSafetyRoute) return;

    const container = document.querySelector(CONTAINER_SELECTOR);
    if (!container) return;

    // 避免重复挂载
    if (document.getElementById(PANEL_ID)) return;
    if (isLoading) return;

    injectStyles();

    // 插入 loading 占位
    const loadingDiv = document.createElement('div');
    loadingDiv.id = PANEL_ID;
    loadingDiv.className = 'jgy-loading';
    loadingDiv.textContent = '正在获取第三方应用密码列表...';
    container.appendChild(loadingDiv);

    isLoading = true;
    try {
      await loadSecrets();
      renderPanel(container);
    } catch (err) {
      loadingDiv.innerHTML = `
        <div style="color: #f5222d; padding: 12px 0;">
          获取第三方应用密码列表失败：${escapeHtml(err.message)}
          <br>
          <button type="button" class="jgy-btn-default" style="margin-top: 8px;" id="jgy-retry-btn">重试</button>
        </div>
      `;
      loadingDiv.querySelector('#jgy-retry-btn')?.addEventListener('click', () => {
        loadingDiv.remove();
        isLoading = false;
        checkAndMount();
      });
    } finally {
      isLoading = false;
    }
  }

  /**
   * 注入去广告专属样式，确保全站第一时间生效且无闪烁
   */
  function injectAdBlockStyles() {
    if (document.getElementById('jgy-adblock-styles')) return;

    const style = document.createElement('style');
    style.id = 'jgy-adblock-styles';
    style.textContent = `
      /* 去除左侧侧边栏“应用推荐”广告项目 */
      .bar-item:has(.recommend-ad),
      .recommend-ad,
      /* 去除左下角悬浮推广轮播广告卡片 */
      .teaser-container,
      .teaser {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * DOM 辅助去广告（兼容不支持 :has 的浏览器与动态渲染）
   */
  function cleanAds() {
    // 隐藏侧边栏“应用推荐”整个 item（包含图标和文字）
    document.querySelectorAll('.recommend-ad').forEach(el => {
      const barItem = el.closest('.bar-item') || el;
      if (barItem.style.display !== 'none') {
        barItem.style.setProperty('display', 'none', 'important');
      }
    });

    // 隐藏底部轮播广告卡片
    document.querySelectorAll('.teaser-container, .teaser').forEach(el => {
      if (el.style.display !== 'none') {
        el.style.setProperty('display', 'none', 'important');
      }
    });
  }

  /**
   * 初始化监听页面与路由
   */
  function init() {
    // 优先注入去广告样式与执行初步清理
    injectAdBlockStyles();
    cleanAds();

    window.addEventListener('hashchange', () => {
      cleanAds();
      setTimeout(checkAndMount, 150);
    });

    window.addEventListener('popstate', () => {
      cleanAds();
      setTimeout(checkAndMount, 150);
    });

    // 观察 DOM 变化以兼容 SPA 视图渲染
    let timer = null;
    observer = new MutationObserver(() => {
      cleanAds();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        checkAndMount();
      }, 200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    checkAndMount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
