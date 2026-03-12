export const PROTOCOL_VERSION = 1;
export const NATIVE_HOST_NAME = 'com.chrome_collect.native_host';
export const EXT_MESSAGE_TYPE = 'EXT_REQUEST';

export const METHODS = {
  HELLO: 'hello',
  BOOKMARK_SAVE: 'bookmark.save',
  BOOKMARK_EXISTS: 'bookmark.existsByUrl',
  BOOKMARK_LIST: 'bookmark.list',
  BOOKMARK_LIST_RECENT: 'bookmark.listRecent',
  BOOKMARK_DELETE: 'bookmark.delete',
  BOOKMARK_GET: 'bookmark.get',
  BOOKMARK_GET_HTML: 'bookmark.getHtml',
  BOOKMARK_UPDATE_ALIAS: 'bookmark.updateAlias',
  BOOKMARK_UPDATE_NOTES: 'bookmark.updateNotes',
  BOOKMARK_DOWNLOAD_HTML: 'bookmark.downloadHtml',
  BOOKMARK_OPEN_FOLDER: 'bookmark.openFolder',
  TRASH_LIST: 'trash.list',
  TRASH_RESTORE: 'trash.restore',
  TRASH_DELETE: 'trash.delete',
  TRASH_EMPTY: 'trash.empty',
  STATS_GET: 'stats.get',
  SETTINGS_GET: 'settings.get',
  SETTINGS_SET_AUTOSTART: 'settings.setAutoStart',
  VERSION_GET: 'version.get',
  UPDATE_START: 'update.start',
  EXTENSION_PING: 'extension.ping',
  UI_OPEN_MANAGER: 'ui.openManager',
  UI_OPEN_EXPORT: 'ui.openExport',
  SHELL_OPEN_EXTERNAL: 'shell.openExternal',
};

export const DEFAULT_TIMEOUT = 15000;

export function formatNativeError(message) {
  if (!message) return 'Native host 错误';
  if (typeof message === 'string') return message;
  if (message.error) return message.error;
  return 'Native host 返回错误';
}
