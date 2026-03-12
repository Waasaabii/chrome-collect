import { DEFAULT_TIMEOUT, NATIVE_HOST_NAME, PROTOCOL_VERSION } from './protocol.js';

let port = null;
let nextId = 1;
const pending = new Map();

function ensurePort() {
  if (port) return port;
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  } catch (err) {
    throw new Error(err?.message || '无法连接 Native Host');
  }
  port.onMessage.addListener(handleNativeMessage);
  port.onDisconnect.addListener(handleDisconnect);
  return port;
}

function handleNativeMessage(message) {
  const { id, ok, result, error, protocolVersion } = message || {};
  if (protocolVersion && protocolVersion !== PROTOCOL_VERSION) {
    rejectPending(new Error('Native host 协议版本不一致'));
    return;
  }
  if (!id) return;
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(id);
  if (ok) {
    entry.resolve(result);
  } else {
    entry.reject(new Error(resolveErrorMessage(error)));
  }
}

function handleDisconnect() {
  const err = new Error('Native host 已断开连接');
  port = null;
  rejectPending(err);
}

function rejectPending(err) {
  pending.forEach(entry => {
    clearTimeout(entry.timer);
    entry.reject(err);
  });
  pending.clear();
}

export async function sendNativeRequest(method, payload = {}, timeout = DEFAULT_TIMEOUT) {
  const targetPort = ensurePort();
  return new Promise((resolve, reject) => {
    const id = String(nextId++);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Native host 请求超时'));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    try {
      targetPort.postMessage({
        id,
        protocolVersion: PROTOCOL_VERSION,
        method,
        payload,
      });
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(new Error(err?.message || 'Native host 发送失败'));
    }
  });
}

function resolveErrorMessage(error) {
  if (!error) return 'Native host 返回失败';
  if (typeof error === 'string') return error;
  return error.message || 'Native host 返回失败';
}
