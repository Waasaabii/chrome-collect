import { invokeNative } from './nativeBridge'

/** API 封装层 */

export interface Bookmark {
  id: string
  url: string
  title: string
  alias: string
  favicon: string
  file_path: string
  thumb_path: string
  thumb_data_url?: string
  file_size: number
  created_at: number
  deleted_at: number
  notes: string
  tags: string
  bookmark_id: string
}

export interface Stats {
  total: number
  totalSize: number
  trashCount: number
}

export interface VersionInfo {
  current: string
  latest: string
  updateAvailable: boolean
  releasesUrl: string
  downloadUrl?: string
}

function invoke<T = any>(method: string, payload?: any) {
  return invokeNative<T>(method, payload)
}

// ── 收藏 API ──────────────────────────────────────────────────
export async function fetchBookmarks(
  opts?: { limit?: number; q?: string },
): Promise<{ items: Bookmark[]; total: number }> {
  return invoke('bookmark.list', opts)
}

export async function fetchStats(): Promise<Stats> {
  return invoke('stats.get')
}

export async function fetchVersion(): Promise<VersionInfo> {
  return invoke('version.get')
}

export async function forceCheckVersion(): Promise<VersionInfo> {
  return invoke('version.get', { force: true })
}

export async function triggerUpdate(): Promise<void> {
  await invoke('update.start')
}

export async function deleteBookmark(id: string): Promise<void> {
  await invoke('bookmark.delete', { id })
}

export async function downloadHtml(id: string): Promise<void> {
  await invoke('bookmark.downloadHtml', { id })
}

export async function openFolder(id: string): Promise<void> {
  await invoke('bookmark.openFolder', { id })
}

export async function updateAlias(id: string, alias: string): Promise<void> {
  await invoke('bookmark.updateAlias', { id, alias })
}

export async function updateNotes(id: string, notes: string): Promise<void> {
  await invoke('bookmark.updateNotes', { id, notes })
}

export async function fetchBookmark(id: string): Promise<Bookmark | null> {
  return invoke('bookmark.get', { id })
}

export async function fetchBookmarkHtml(id: string): Promise<{ html: string; title?: string }> {
  return invoke('bookmark.getHtml', { id })
}

// ── 回收站 API ───────────────────────────────────────────────
export async function fetchTrash(): Promise<Bookmark[]> {
  return invoke('trash.list')
}

export async function restoreBookmark(id: string): Promise<void> {
  await invoke('trash.restore', { id })
}

export async function permanentDelete(id: string): Promise<void> {
  await invoke('trash.delete', { id })
}

export async function emptyTrash(): Promise<void> {
  await invoke('trash.empty')
}

// ── 扩展检测 API ──────────────────────────────────────────────
export async function checkExtensionInstalled(): Promise<boolean> {
  try {
    const settings = await invoke<{ extensionInstalled?: boolean }>('settings.get')
    return !!settings.extensionInstalled
  } catch {
    return false
  }
}

// ── 设置 API ──────────────────────────────────────────────
export async function fetchAutoStart(): Promise<{ enabled?: boolean; autoStart?: boolean }> {
  return invoke('settings.get')
}

export async function setAutoStart(enabled: boolean): Promise<void> {
  await invoke('settings.setAutoStart', { enabled })
}
