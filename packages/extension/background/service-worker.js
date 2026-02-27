/**
 * Service Worker — Chrome Collect
 * 监听书签创建事件，自动触发页面静态化抓取并发送给本地 Bun 服务
 */

const SERVER_URL = 'http://localhost:3210';
const BADGE_TIMEOUT = 3000;

// ── 心跳：定期通知服务端扩展已安装 ────────────────────────────────────────────
function pingServer() {
  fetch(`${SERVER_URL}/api/extension/ping`, { method: 'POST' }).catch(() => { });
}
pingServer(); // 启动时立即 ping
setInterval(pingServer, 2 * 60 * 1000); // 每 2 分钟 ping 一次

// ── Popup 消息通信 ─────────────────────────────────────────────────────────────
// 注意：不再监听 chrome.bookmarks.onCreated，只通过手动点击插件收藏
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'MANUAL_CAPTURE') {
    handleManualCapture(msg.tabId, msg.url, msg.title).then(sendResponse);
    return true; // 异步响应
  }
  if (msg.type === 'OPEN_MANAGER') {
    chrome.tabs.create({ url: `${SERVER_URL}` });
    sendResponse({ ok: true });
  }
});

// ── 手动收藏（来自 Popup 的一键收藏按钮）─────────────────────────────────────
async function handleManualCapture(tabId, url, title) {
  try {
    setBadge('…', '#3498db', tabId);

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/capture.js'],
    });

    if (!result?.result?.html) throw new Error('抓取返回空');

    let screenshot = '';
    try {
      const tab = await chrome.tabs.get(tabId);
      screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 80,
      });
    } catch { }

    const res = await fetch(`${SERVER_URL}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        title: result.result.title || title,
        favicon: result.result.favicon,
        html: result.result.html,
        screenshot,
        bookmarkId: null,
      }),
    });

    if (!res.ok) throw new Error(`Server ${res.status}`);
    const saved = await res.json();
    setBadge('✓', '#27ae60', tabId);
    setTimeout(() => clearBadge(tabId), BADGE_TIMEOUT);
    chrome.storage.session.set({ lastSaved: Date.now() });
    return { ok: true, id: saved.id };
  } catch (err) {
    setBadge('✗', '#e74c3c', tabId);
    setTimeout(() => clearBadge(tabId), BADGE_TIMEOUT);
    return { ok: false, error: err.message };
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function setBadge(text, color, tabId) {
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

function clearBadge(tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
}

