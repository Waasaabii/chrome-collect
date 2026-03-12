import { invokeExtension } from '../shared/extension-api.js';
import { METHODS } from '../shared/protocol.js';

const params = new URLSearchParams(window.location.search);
const bookmarkId = params.get('id');

const titleEl = document.getElementById('page-title');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const frameEl = document.getElementById('preview-frame');
const sourceBtn = document.getElementById('btn-source');
const downloadBtn = document.getElementById('btn-download');

document.getElementById('btn-back').addEventListener('click', () => window.history.back());
downloadBtn.addEventListener('click', async () => {
  if (!bookmarkId) return;
  await invokeExtension(METHODS.BOOKMARK_DOWNLOAD_HTML, { id: bookmarkId });
});

init().catch(err => {
  loadingEl.classList.add('hidden');
  errorEl.textContent = err?.message || '预览加载失败';
  errorEl.classList.remove('hidden');
});

async function init() {
  if (!bookmarkId) {
    throw new Error('缺少收藏 ID');
  }

  const [bookmark, content] = await Promise.all([
    invokeExtension(METHODS.BOOKMARK_GET, { id: bookmarkId }),
    invokeExtension(METHODS.BOOKMARK_GET_HTML, { id: bookmarkId }),
  ]);

  titleEl.textContent = bookmark?.alias || bookmark?.title || bookmark?.url || 'Chrome Collect';
  document.title = `${titleEl.textContent} - Chrome Collect`;
  sourceBtn.addEventListener('click', async () => {
    if (bookmark?.url) {
      await invokeExtension(METHODS.SHELL_OPEN_EXTERNAL, { url: bookmark.url });
    }
  });

  frameEl.srcdoc = content?.html || '';
  loadingEl.classList.add('hidden');
  frameEl.classList.remove('hidden');
}
