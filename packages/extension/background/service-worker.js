import { sendNativeRequest } from '../shared/native-transport.js';
import { EXT_MESSAGE_TYPE, METHODS, formatNativeError } from '../shared/protocol.js';

/**
 * Service Worker — Chrome Collect
 * 监听书签创建事件，自动触发页面静态化抓取并发送给 Native Host
 */

const BADGE_TIMEOUT = 3000;
const PING_INTERVAL = 2 * 60 * 1000;

async function pingNative() {
  try {
    await sendNativeRequest(METHODS.EXTENSION_PING);
  } catch {
    // 忽略心跳错误
  }
}

pingNative();
chrome.runtime.onInstalled.addListener(() => { void pingNative(); });
chrome.runtime.onStartup.addListener(() => { void pingNative(); });
setInterval(pingNative, PING_INTERVAL);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'MANUAL_CAPTURE') {
    handleManualCapture(msg.tabId, msg.url, msg.title).then(sendResponse);
    return true;
  }
  if (msg.type === 'OPEN_MANAGER') {
    handleOpenManager().then(sendResponse);
    return true;
  }
  if (msg.type === EXT_MESSAGE_TYPE) {
    handleExtensionBridge(msg.method, msg.payload || {}).then(result => {
      sendResponse({ ok: true, result });
    }).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
});

async function handleExtensionBridge(method, payload) {
  if (method === METHODS.UI_OPEN_EXPORT) {
    const id = payload?.id;
    if (!id) {
      throw new Error('缺少收藏 ID');
    }
    const previewUrl = chrome.runtime.getURL(`preview/preview.html?id=${encodeURIComponent(id)}`);
    await chrome.tabs.create({ url: previewUrl });
    return { ok: true };
  }
  return sendNativeRequest(method, payload);
}

async function handleOpenManager() {
  try {
    await sendNativeRequest(METHODS.UI_OPEN_MANAGER);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatNativeError(err.message) };
  }
}

async function handleManualCapture(tabId, url, title) {
  try {
    setBadge('…', '#3498db', tabId);

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/capture.js'],
    });

    if (!result?.result?.html) {
      throw new Error('抓取返回空');
    }

    let screenshot = '';
    try {
      const tab = await chrome.tabs.get(tabId);
      screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 80,
      });
    } catch {
      // ignore
    }

    const saved = await sendNativeRequest(METHODS.BOOKMARK_SAVE, {
      url,
      title: result.result.title || title,
      favicon: result.result.favicon,
      html: result.result.html,
      screenshot,
      bookmarkId: null,
    });

    setBadge('✓', '#27ae60', tabId);
    setTimeout(() => clearBadge(tabId), BADGE_TIMEOUT);
    chrome.storage.session.set({ lastSaved: Date.now() });
    return { ok: true, id: saved?.id };
  } catch (err) {
    setBadge('✗', '#e74c3c', tabId);
    setTimeout(() => clearBadge(tabId), BADGE_TIMEOUT);
    return { ok: false, error: err.message };
  }
}

function setBadge(text, color, tabId) {
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

function clearBadge(tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
}
