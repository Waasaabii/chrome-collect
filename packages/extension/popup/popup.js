import { invokeExtension } from '../shared/extension-api.js';
import { METHODS } from '../shared/protocol.js';

const BADGE_TIMEOUT = 3000;

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentTab();
  await loadRecentBookmarks();
  setupListeners();
});

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const titleEl = document.getElementById('current-title');
  const urlEl = document.getElementById('current-url');
  const faviconEl = document.getElementById('current-favicon');
  const savedBadge = document.getElementById('saved-badge');
  const captureBtn = document.getElementById('btn-capture');

  titleEl.textContent = tab.title || tab.url;
  urlEl.textContent = tab.url;
  if (tab.favIconUrl) faviconEl.src = tab.favIconUrl;

  captureBtn.dataset.tabId = tab.id;
  captureBtn.dataset.url = tab.url;
  captureBtn.dataset.title = tab.title;

  try {
    const exists = await invokeExtension(METHODS.BOOKMARK_EXISTS, { url: tab.url });
    if (exists?.exists) {
      savedBadge.classList.remove('hidden');
    }
  } catch {
    // ignore
  }
}

async function loadRecentBookmarks() {
  const list = document.getElementById('recent-list');
  try {
    const data = await invokeExtension(METHODS.BOOKMARK_LIST_RECENT, { limit: 5 });
    const items = data.items || [];

    if (items.length === 0) {
      list.innerHTML = '<div class="empty-hint">暂无收藏记录</div>';
      return;
    }

    list.innerHTML = items.map(item => `
      <div class="recent-item" data-id="${item.id}">
        ${item.thumb_data_url
            ? `<img class="recent-thumb" src="${item.thumb_data_url}" alt="" />`
            : `<div class="recent-thumb"></div>`
          }
        <img class="recent-favicon" src="${item.favicon || ''}" alt="" onerror="this.style.display='none'" />
        <div class="recent-info">
          <div class="recent-title">${escHtml(item.alias || item.title || item.url)}</div>
          <div class="recent-time">${relativeTime(item.created_at)}</div>
        </div>
        <div class="recent-actions">
          <button class="action-btn preview-btn" data-id="${item.id}" title="预览">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button class="action-btn delete-btn delete" data-id="${item.id}" title="删除">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.preview-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await invokeExtension(METHODS.UI_OPEN_EXPORT, { id: btn.dataset.id });
        window.close();
      });
    });

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('确认删除？')) return;
        await invokeExtension(METHODS.BOOKMARK_DELETE, { id: btn.dataset.id });
        await loadRecentBookmarks();
      });
    });
  } catch {
    list.innerHTML = '<div class="empty-hint">⚠️ 无法连接桌面服务，请稍后重试</div>';
  }
}

function setupListeners() {
  document.getElementById('btn-capture').addEventListener('click', async () => {
    const btn = document.getElementById('btn-capture');
    const label = document.getElementById('capture-label');
    const tabId = parseInt(btn.dataset.tabId);

    btn.disabled = true;
    btn.classList.add('loading');
    label.textContent = '正在抓取…';

    const res = await chrome.runtime.sendMessage({
      type: 'MANUAL_CAPTURE',
      tabId,
      url: btn.dataset.url,
      title: btn.dataset.title,
    });

    btn.classList.remove('loading');

    if (res?.ok) {
      btn.classList.add('success');
      label.textContent = '收藏成功 ✓';
      document.getElementById('saved-badge').classList.remove('hidden');
      await loadRecentBookmarks();
      setTimeout(() => { btn.classList.remove('success'); label.textContent = '收藏当前页'; btn.disabled = false; }, 2000);
    } else {
      btn.classList.add('error');
      label.textContent = '收藏失败';
      showStatus(`错误：${res?.error || '未知错误'}`, 'error');
      setTimeout(() => { btn.classList.remove('error'); label.textContent = '收藏当前页'; btn.disabled = false; }, 3000);
    }
  });

  document.getElementById('btn-open-manager').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_MANAGER' }, res => {
      if (!res?.ok) {
        showStatus(`错误：${res?.error || '无法打开管理面板'}`, 'error');
      }
      window.close();
    });
  });
}

function showStatus(msg, type = '') {
  const bar = document.getElementById('status-bar');
  bar.textContent = msg;
  bar.className = `status-bar ${type}`;
  setTimeout(() => { bar.className = 'status-bar hidden'; }, 4000);
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function relativeTime(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}
