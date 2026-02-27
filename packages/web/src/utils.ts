/** 工具函数 */

export function relativeTime(ts: number): string {
    const diff = (Date.now() - ts) / 1000
    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`
    return new Date(ts).toLocaleDateString('zh-CN')
}

export function formatSize(bytes: number): string {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function getDomain(url: string): string {
    try { return new URL(url).hostname } catch { return url || '' }
}
