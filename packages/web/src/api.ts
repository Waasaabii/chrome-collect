/** API 封装层 */

export interface Bookmark {
    id: string
    url: string
    title: string
    alias: string
    favicon: string
    file_path: string
    thumb_path: string
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

// ── 收藏 API ──────────────────────────────────────────────────
export async function fetchBookmarks(opts?: { limit?: number; q?: string }): Promise<{ items: Bookmark[]; total: number }> {
    const params = new URLSearchParams()
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.q) params.set('q', opts.q)
    const res = await fetch(`/api/bookmarks?${params}`)
    return res.json()
}

export async function fetchStats(): Promise<Stats> {
    return fetch('/api/stats').then(r => r.json())
}

export interface VersionInfo {
    current: string
    latest: string
    updateAvailable: boolean
    releasesUrl: string
    downloadUrl?: string
}

export async function fetchVersion(): Promise<VersionInfo> {
    return fetch('/api/version').then(r => r.json())
}

export async function deleteBookmark(id: string): Promise<void> {
    await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' })
}

export async function downloadHtml(id: string): Promise<void> {
    window.open(`/api/bookmarks/${id}/download`, '_blank')
}

export async function openFolder(id: string): Promise<void> {
    await fetch(`/api/bookmarks/${id}/open-folder`, { method: 'POST' })
}

export async function updateAlias(id: string, alias: string): Promise<void> {
    await fetch(`/api/bookmarks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias }),
    })
}

export async function updateNotes(id: string, notes: string): Promise<void> {
    await fetch(`/api/bookmarks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
    })
}

// ── 回收站 API ────────────────────────────────────────────────
export async function fetchTrash(): Promise<Bookmark[]> {
    return fetch('/api/trash').then(r => r.json())
}

export async function restoreBookmark(id: string): Promise<void> {
    await fetch(`/api/trash/${id}/restore`, { method: 'POST' })
}

export async function permanentDelete(id: string): Promise<void> {
    await fetch(`/api/trash/${id}`, { method: 'DELETE' })
}

export async function emptyTrash(): Promise<void> {
    await fetch('/api/trash', { method: 'DELETE' })
}

// ── 扩展检测 API ──────────────────────────────────────────────
export async function checkExtensionInstalled(): Promise<boolean> {
    try {
        const res = await fetch('/api/extension/status')
        const data = await res.json()
        return !!data.installed
    } catch {
        return false
    }
}
