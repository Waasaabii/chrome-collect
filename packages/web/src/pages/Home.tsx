import { useState, useEffect, useCallback, useMemo } from 'react'
import { ToastProvider, useToast } from '../components/Toast'
import BookmarkCard from '../components/BookmarkCard'
import TrashCard from '../components/TrashCard'
import AliasModal from '../components/AliasModal'
import NotesModal from '../components/NotesModal'
import SetupGuide from '../components/SetupGuide'
import * as api from '../api'
import type { Bookmark, Stats, VersionInfo } from '../api'
import { formatSize, getDomain } from '../utils'

export default function Home() {
    return (
        <ToastProvider>
            <HomeInner />
        </ToastProvider>
    )
}

type ViewMode = 'main' | 'trash'
type SortOrder = 'newest' | 'oldest' | 'largest'
type GroupMode = 'none' | 'domain'

function HomeInner() {
    const toast = useToast()

    // ── 状态 ──────────────────────────────────────────────────────
    const [items, setItems] = useState<Bookmark[]>([])
    const [trashItems, setTrashItems] = useState<Bookmark[]>([])
    const [stats, setStats] = useState<Stats>({ total: 0, totalSize: 0, trashCount: 0 })
    const [loading, setLoading] = useState(true)
    const [viewMode, setViewMode] = useState<ViewMode>('main')
    const [search, setSearch] = useState('')
    const [sort, setSort] = useState<SortOrder>('newest')
    const [groupMode, setGroupMode] = useState<GroupMode>('domain')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null)
    const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

    // ── 设置 ──────────────────────────────────────────────────────
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [autoStart, setAutoStart] = useState(false)

    // ── 别名编辑 ──────────────────────────────────────────────────
    const [aliasTarget, setAliasTarget] = useState<{ id: string; value: string } | null>(null)

    // ── 备注编辑 ──────────────────────────────────────────────────
    const [notesTarget, setNotesTarget] = useState<{ id: string; value: string } | null>(null)

    // ── 数据加载 ──────────────────────────────────────────────────
    const loadMain = useCallback(async () => {
        setLoading(true)
        try {
            const [bmRes, statsRes] = await Promise.all([
                api.fetchBookmarks({ limit: 1000 }),
                api.fetchStats(),
            ])
            setItems(bmRes.items)
            setStats(statsRes)
        } catch {
            toast.show('无法连接到本地服务', 'error')
        } finally {
            setLoading(false)
        }
    }, [toast])

    const loadTrash = useCallback(async () => {
        setLoading(true)
        try {
            const items = await api.fetchTrash()
            setTrashItems(items)
        } catch {
            toast.show('加载回收站失败', 'error')
        } finally {
            setLoading(false)
        }
    }, [toast])

    // ── 初始加载 ──────────────────────────────────────────────────
    useEffect(() => {
        loadMain()
        api.checkExtensionInstalled().then(setExtensionInstalled)
        // 检查更新（异步，不影响主流程）
        api.fetchVersion().then(setVersionInfo).catch(() => { })
        // 获取开机自启状态
        api.fetchAutoStart().then(r => setAutoStart(r.enabled)).catch(() => { })
    }, [loadMain])

    const handleToggleAutoStart = async () => {
        const next = !autoStart
        setAutoStart(next)
        try {
            await api.setAutoStart(next)
            toast.show(next ? '已开启开机自启' : '已关闭开机自启', 'success')
        } catch {
            setAutoStart(!next) // 回滚
            toast.show('设置失败', 'error')
        }
    }

    useEffect(() => {
        if (viewMode === 'trash') loadTrash()
    }, [viewMode, loadTrash])

    // ── 过滤 + 排序 ──────────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = [...items]
        if (search) {
            const q = search.toLowerCase()
            list = list.filter(i => {
                const title = (i.alias || i.title || '').toLowerCase()
                const notes = (i.notes || '').toLowerCase()
                return title.includes(q) || i.url.toLowerCase().includes(q) || notes.includes(q)
            })
        }
        if (sort === 'newest') list.sort((a, b) => b.created_at - a.created_at)
        else if (sort === 'oldest') list.sort((a, b) => a.created_at - b.created_at)
        else if (sort === 'largest') list.sort((a, b) => b.file_size - a.file_size)
        return list
    }, [items, search, sort])

    // ── 按域名分组 ────────────────────────────────────────────────
    const grouped = useMemo(() => {
        if (groupMode !== 'domain') return null
        const map = new Map<string, Bookmark[]>()
        for (const item of filtered) {
            const domain = getDomain(item.url)
            if (!map.has(domain)) map.set(domain, [])
            map.get(domain)!.push(item)
        }
        // 按组内数量排序
        return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
    }, [filtered, groupMode])

    // ── 操作 ──────────────────────────────────────────────────────
    const handleDelete = async (id: string) => {
        if (!confirm('确认移入回收站？（7 天后自动永久删除）')) return
        await api.deleteBookmark(id)
        toast.show('已移入回收站', 'success')
        loadMain()
    }

    const handleBatchDelete = async () => {
        if (!selectedIds.size) return
        if (!confirm(`确认将 ${selectedIds.size} 条收藏移入回收站？`)) return
        await Promise.all([...selectedIds].map(id => api.deleteBookmark(id)))
        setSelectedIds(new Set())
        toast.show('已移入回收站', 'success')
        loadMain()
    }

    const handleRestore = async (id: string) => {
        await api.restoreBookmark(id)
        toast.show('已恢复', 'success')
        loadTrash()
        api.fetchStats().then(setStats)
    }

    const handlePermanentDelete = async (id: string) => {
        if (!confirm('确认永久删除？此操作不可恢复！')) return
        await api.permanentDelete(id)
        toast.show('已永久删除', 'success')
        loadTrash()
        api.fetchStats().then(setStats)
    }

    const handleSaveAlias = async (alias: string) => {
        if (!aliasTarget) return
        await api.updateAlias(aliasTarget.id, alias)
        const item = items.find(i => i.id === aliasTarget.id)
        if (item) item.alias = alias
        setAliasTarget(null)
        setItems([...items])
        toast.show('别名已保存', 'success')
    }

    const handleDownload = (id: string) => {
        api.downloadHtml(id)
    }

    const handleOpenFolder = async (id: string) => {
        await api.openFolder(id)
        toast.show('已打开文件夹', 'success')
    }

    const handleSaveNotes = async (notes: string) => {
        if (!notesTarget) return
        await api.updateNotes(notesTarget.id, notes)
        const item = items.find(i => i.id === notesTarget.id)
        if (item) item.notes = notes
        setNotesTarget(null)
        setItems([...items])
        toast.show('备注已保存', 'success')
    }

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        next.has(id) ? next.delete(id) : next.add(id)
        setSelectedIds(next)
    }

    // ── 扩展未安装：显示引导 ──────────────────────────────────────
    if (extensionInstalled === false && items.length === 0) {
        return <SetupGuide />
    }

    // ── 卡片渲染辅助 ──────────────────────────────────────────────
    const renderCard = (item: Bookmark) => (
        <BookmarkCard
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            onPreview={() => window.open(`/export/${item.id}`, '_blank')}
            onDelete={() => handleDelete(item.id)}
            onEditAlias={() => setAliasTarget({ id: item.id, value: item.alias || item.title || '' })}
            onToggleSelect={() => toggleSelect(item.id)}
            onDownload={() => handleDownload(item.id)}
            onOpenFolder={() => handleOpenFolder(item.id)}
            onEditNotes={() => setNotesTarget({ id: item.id, value: item.notes || '' })}
        />
    )

    // ── 渲染 ──────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-bg text-white font-sans">
            {/* 顶部导航 */}
            <header className="fixed top-0 left-0 right-0 h-16 bg-[rgba(10,12,20,0.85)] backdrop-blur-4 border-b border-border flex items-center justify-between px-6 gap-4 z-100">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2.5">
                        <div className="i-lucide-bookmark w-6 h-6 text-accent" />
                        <span className="font-bold text-lg bg-gradient-to-r from-accent to-blue bg-clip-text text-transparent whitespace-nowrap">
                            Chrome Collect
                        </span>
                    </div>
                    <span className="text-xs text-muted whitespace-nowrap">{stats.total} 条收藏 · {formatSize(stats.totalSize)}</span>
                    {versionInfo && (
                        versionInfo.updateAvailable ? (
                            <a href={versionInfo.downloadUrl || versionInfo.releasesUrl} target="_blank" rel="noreferrer"
                                className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full no-underline hover:bg-accent/25 transition-colors flex items-center gap-1 whitespace-nowrap">
                                🆕 {versionInfo.latest}
                            </a>
                        ) : (
                            <span className="text-xs text-muted/50 whitespace-nowrap">{versionInfo.current}</span>
                        )
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* 搜索 */}
                    <div className="relative flex items-center w-60">
                        <div className="i-lucide-search w-4 h-4 text-muted absolute left-3 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            disabled={viewMode === 'trash'}
                            placeholder="搜索标题、别名、网址…"
                            className="w-full bg-bg-3 border border-border-2 rounded-2.5 text-white text-sm pl-10 pr-3 py-2 outline-none focus:border-accent transition-colors disabled:opacity-50"
                        />
                    </div>

                    {/* 排序 */}
                    <select
                        value={sort}
                        onChange={e => setSort(e.target.value as SortOrder)}
                        disabled={viewMode === 'trash'}
                        className="bg-bg-3 border border-border-2 rounded-2.5 text-white text-sm px-3 py-2 outline-none cursor-pointer disabled:opacity-50"
                    >
                        <option value="newest">最新收藏</option>
                        <option value="oldest">最早收藏</option>
                        <option value="largest">文件最大</option>
                    </select>

                    {/* 分组模式 */}
                    <button
                        className={`btn-ghost text-xs ${groupMode === 'domain' ? 'bg-accent/10! border-accent! text-accent!' : ''}`}
                        onClick={() => setGroupMode(g => g === 'none' ? 'domain' : 'none')}
                        disabled={viewMode === 'trash'}
                    >
                        <div className="i-lucide-layout-grid w-3.5 h-3.5" />
                        {groupMode === 'domain' ? '取消分组' : '按域名分组'}
                    </button>

                    {/* 回收站按钮 */}
                    <button
                        className={`btn-ghost relative ${viewMode === 'trash' ? 'bg-accent/10! border-accent! text-accent!' : ''}`}
                        onClick={() => setViewMode(v => v === 'main' ? 'trash' : 'main')}
                    >
                        <div className="i-lucide-trash-2 w-4 h-4" />
                        <span>回收站</span>
                        {stats.trashCount > 0 && (
                            <span className="inline-flex items-center justify-center min-w-4.5 h-4.5 bg-danger text-white text-11px font-bold rounded-full px-1 leading-none">
                                {stats.trashCount}
                            </span>
                        )}
                    </button>

                    {/* 设置按钮 */}
                    <div className="relative">
                        <button
                            className={`btn-ghost ${settingsOpen ? 'bg-accent/10! border-accent! text-accent!' : ''}`}
                            onClick={() => setSettingsOpen(v => !v)}
                        >
                            <div className="i-lucide-settings w-4 h-4" />
                        </button>
                        {settingsOpen && (
                            <>
                                <div className="fixed inset-0 z-200" onClick={() => setSettingsOpen(false)} />
                                <div className="absolute right-0 top-full mt-2 w-64 bg-bg-2 border border-border-2 rounded-3 shadow-xl z-201 p-4">
                                    <div className="text-sm font-semibold text-white mb-3">设置</div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm text-white">开机自启</div>
                                            <div className="text-xs text-muted mt-0.5">系统启动时自动运行</div>
                                        </div>
                                        <button
                                            onClick={handleToggleAutoStart}
                                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer border-none ${autoStart ? 'bg-accent' : 'bg-bg-3'
                                                }`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-sm ${autoStart ? 'translate-x-5' : 'translate-x-0'
                                                }`} />
                                        </button>
                                    </div>
                                    <div className="border-t border-border mt-3 pt-3 flex flex-col gap-2">
                                        <button
                                            onClick={async () => {
                                                const info = await api.forceCheckVersion()
                                                setVersionInfo(info)
                                                if (info.updateAvailable) {
                                                    toast.show(`发现新版本 ${info.latest}`, 'success')
                                                } else {
                                                    toast.show('已是最新版本', 'success')
                                                }
                                            }}
                                            className="btn-ghost w-full text-sm justify-center"
                                        >
                                            <div className="i-lucide-refresh-cw w-3.5 h-3.5" />
                                            检查更新
                                            {versionInfo && <span className="text-muted text-xs ml-1">当前 {versionInfo.current}</span>}
                                        </button>
                                        {versionInfo?.updateAvailable && (
                                            <button
                                                onClick={async () => {
                                                    toast.show(`正在下载 ${versionInfo.latest}，完成后将自动重启…`, 'success')
                                                    await api.triggerUpdate()
                                                    setSettingsOpen(false)
                                                }}
                                                className="btn-ghost w-full text-sm justify-center bg-accent/10! border-accent! text-accent!"
                                            >
                                                <div className="i-lucide-download w-3.5 h-3.5" />
                                                立即更新到 {versionInfo.latest}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* 批量删除 */}
                    {selectedIds.size > 0 && (
                        <button className="btn-danger" onClick={handleBatchDelete}>
                            <div className="i-lucide-trash-2 w-3.5 h-3.5" />
                            批量删除 ({selectedIds.size})
                        </button>
                    )}
                </div>
            </header>

            {/* 主内容 */}
            <main className="mt-16 p-7 max-w-350 mx-auto">
                {loading ? (
                    <div className="flex items-center justify-center gap-3 py-15 text-muted">
                        <div className="w-6 h-6 border-2 border-border-2 border-t-accent rounded-full animate-spin" />
                        <span>加载中…</span>
                    </div>
                ) : viewMode === 'main' ? (
                    filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted text-center">
                            <div className="i-lucide-bookmark w-16 h-16 opacity-30" />
                            <p className="text-base font-medium">暂无收藏</p>
                            <small className="text-sm">在任意网页点击扩展图标即可收藏</small>
                        </div>
                    ) : grouped ? (
                        /* ── 域名分组模式 ── */
                        <div className="space-y-8">
                            {grouped.map(([domain, domainItems]) => (
                                <section key={domain}>
                                    <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
                                        <div className="i-lucide-globe w-4 h-4 text-accent shrink-0" />
                                        <h2 className="text-sm font-semibold text-white">{domain}</h2>
                                        <span className="text-xs text-muted">{domainItems.length} 条</span>
                                    </div>
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
                                        {domainItems.map(renderCard)}
                                    </div>
                                </section>
                            ))}
                        </div>
                    ) : (
                        /* ── 普通列表模式 ── */
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
                            {filtered.map(renderCard)}
                        </div>
                    )
                ) : (
                    trashItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted text-center">
                            <div className="i-lucide-trash-2 w-16 h-16 opacity-30" />
                            <p className="text-base font-medium">回收站是空的</p>
                            <small className="text-sm">删除的收藏会在这里保留 7 天</small>
                        </div>
                    ) : (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
                            {trashItems.map(item => (
                                <TrashCard
                                    key={item.id}
                                    item={item}
                                    onRestore={() => handleRestore(item.id)}
                                    onPermanentDelete={() => handlePermanentDelete(item.id)}
                                />
                            ))}
                        </div>
                    )
                )}
            </main>

            {/* 别名编辑弹窗 */}
            <AliasModal
                open={!!aliasTarget}
                initialValue={aliasTarget?.value || ''}
                onSave={handleSaveAlias}
                onClose={() => setAliasTarget(null)}
            />

            {/* 备注编辑弹窗 */}
            <NotesModal
                open={!!notesTarget}
                initialValue={notesTarget?.value || ''}
                onSave={handleSaveNotes}
                onClose={() => setNotesTarget(null)}
            />
        </div>
    )
}
