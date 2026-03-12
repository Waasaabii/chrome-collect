import { EXT_MESSAGE_TYPE } from './protocol.js';

export function invokeExtension(method, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: EXT_MESSAGE_TYPE, method, payload }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('扩展没有响应'));
        return;
      }
      if (response.ok) {
        resolve(response.result);
        return;
      }
      reject(new Error(response.error || '扩展操作失败'));
    });
  });
}
