import type { Bookmark } from '../api'
import { relativeTime, formatSize, getDomain } from '../utils'

interface Props {
    item: Bookmark
    selected: boolean
    onPreview: () => void
    onDelete: () => void
    onEditAlias: () => void
    onEditNotes: () => void
    onToggleSelect: () => void
    onDownload: () => void
    onOpenFolder: () => void
}

export default function BookmarkCard({ item, selected, onPreview, onDelete, onEditAlias, onEditNotes, onToggleSelect, onDownload, onOpenFolder }: Props) {
    const displayTitle = item.alias || item.title || item.url

    return (
        <div
            className={`card-base group ${selected ? 'border-accent! shadow-[0_0_0_2px_rgba(0,212,170,0.3)]' : ''}`}
            onClick={onPreview}
        >
            {/* 缩略图 */}
            {item.thumb_path ? (
                <img src={`/pages/${item.id}.png`} alt="" loading="lazy"
                    className="w-full h-40 object-cover block bg-bg-3" />
            ) : (
                <div className="w-full h-40 bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center">
                    <div className="i-lucide-bookmark w-10 h-10 text-white/20" />
                </div>
            )}

            {/* 复选框 */}
            <div
                className={`
          absolute top-2.5 left-2.5 w-5 h-5 rounded-1.5
          border-2 bg-[rgba(10,12,20,0.7)] backdrop-blur-sm
          cursor-pointer flex items-center justify-center
          transition-all opacity-0 group-hover:opacity-100
          ${selected ? 'opacity-100! bg-accent! border-accent!' : 'border-border-2'}
        `}
                onClick={e => { e.stopPropagation(); onToggleSelect() }}
            >
                {selected && <div className="i-lucide-check w-3 h-3 text-white" />}
            </div>

            {/* 悬停操作 */}
            <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ActionBtn icon="i-lucide-eye" title="预览" onClick={e => { e.stopPropagation(); onPreview() }} />
                <ActionBtn icon="i-lucide-pencil" title="编辑别名" onClick={e => { e.stopPropagation(); onEditAlias() }} />
                <ActionBtn icon="i-lucide-sticky-note" title="编辑备注" onClick={e => { e.stopPropagation(); onEditNotes() }} />
                <ActionBtn icon="i-lucide-download" title="下载 HTML" onClick={e => { e.stopPropagation(); onDownload() }} />
                <ActionBtn icon="i-lucide-folder-open" title="打开文件夹" onClick={e => { e.stopPropagation(); onOpenFolder() }} />
                <ActionBtn icon="i-lucide-trash-2" title="删除" danger onClick={e => { e.stopPropagation(); onDelete() }} />
            </div>

            {/* 内容 */}
            <div className="p-3.5 px-4">
                <div className="flex items-start gap-2.5 mb-2">
                    {item.favicon && (
                        <img src={item.favicon} alt="" className="w-4.5 h-4.5 rounded-1 object-contain shrink-0 mt-0.5"
                            onError={e => (e.currentTarget.style.display = 'none')} />
                    )}
                    <div className="font-semibold text-13px leading-snug line-clamp-2 flex-1 text-white cursor-text hover:text-accent transition-colors"
                        onDoubleClick={e => { e.stopPropagation(); onEditAlias() }}>
                        {displayTitle}
                    </div>
                </div>

                {/* 备注 */}
                {item.notes && (
                    <div className="text-11px text-accent/70 mb-2 line-clamp-2 cursor-pointer hover:text-accent transition-colors"
                        onClick={e => { e.stopPropagation(); onEditNotes() }}>
                        📝 {item.notes.replace(/[#*`~>\-\[\]!_|]/g, '').trim()}
                    </div>
                )}

                <div className="text-11px text-muted truncate mb-2.5">{getDomain(item.url)}</div>
                <div className="flex items-center justify-between">
                    <span className="text-11px text-muted">{relativeTime(item.created_at)}</span>
                    <span className="text-11px text-muted">{formatSize(item.file_size)}</span>
                </div>
            </div>
        </div>
    )
}

function ActionBtn({ icon, title, danger, onClick }: { icon: string; title: string; danger?: boolean; onClick: (e: React.MouseEvent) => void }) {
    return (
        <button
            title={title}
            className={`
        w-7 h-7 bg-[rgba(10,12,20,0.8)] backdrop-blur-sm
        border border-border-2 rounded-2 text-muted-2
        flex items-center justify-center cursor-pointer transition-all
        ${danger ? 'hover:text-danger hover:border-danger/50' : 'hover:text-accent hover:border-accent/50'}
      `}
            onClick={onClick}
        >
            <div className={`${icon} w-3.5 h-3.5`} />
        </button>
    )
}
