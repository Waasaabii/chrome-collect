import type { Bookmark } from '../api'
import { formatSize, getDomain } from '../utils'

interface Props {
    item: Bookmark
    onRestore: () => void
    onPermanentDelete: () => void
}

export default function TrashCard({ item, onRestore, onPermanentDelete }: Props) {
    const displayTitle = item.alias || item.title || item.url
    const daysLeft = Math.max(0, Math.ceil(7 - (Date.now() - item.deleted_at) / (24 * 60 * 60 * 1000)))

    return (
        <div className="card-base group opacity-70 hover:opacity-100 hover:border-danger/30">
            {/* 缩略图 */}
            {item.thumb_path ? (
                <img src={`/pages/${item.id}.png`} alt="" loading="lazy"
                    className="w-full h-40 object-cover block bg-bg-3 grayscale-50 group-hover:grayscale-0 transition-all" />
            ) : (
                <div className="w-full h-40 bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center grayscale-50 group-hover:grayscale-0 transition-all">
                    <div className="i-lucide-bookmark w-10 h-10 text-white/20" />
                </div>
            )}

            {/* 操作按钮 */}
            <div className="absolute top-2.5 right-2.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    className="w-7.5 h-7.5 bg-[rgba(10,12,20,0.8)] backdrop-blur-sm border border-border-2 rounded-2 text-muted-2 flex items-center justify-center cursor-pointer transition-all hover:text-accent hover:border-accent/50"
                    title="恢复"
                    onClick={e => { e.stopPropagation(); onRestore() }}
                >
                    <div className="i-lucide-undo-2 w-3.5 h-3.5" />
                </button>
                <button
                    className="w-7.5 h-7.5 bg-[rgba(10,12,20,0.8)] backdrop-blur-sm border border-border-2 rounded-2 text-muted-2 flex items-center justify-center cursor-pointer transition-all hover:text-danger hover:border-danger/50"
                    title="永久删除"
                    onClick={e => { e.stopPropagation(); onPermanentDelete() }}
                >
                    <div className="i-lucide-x w-3.5 h-3.5" />
                </button>
            </div>

            {/* 内容 */}
            <div className="p-3.5 px-4">
                <div className="flex items-start gap-2.5 mb-2">
                    {item.favicon && (
                        <img src={item.favicon} alt="" className="w-4.5 h-4.5 rounded-1 object-contain shrink-0 mt-0.5"
                            onError={e => (e.currentTarget.style.display = 'none')} />
                    )}
                    <div className="font-semibold text-13px leading-snug line-clamp-2 flex-1 text-white/70">
                        {displayTitle}
                    </div>
                </div>
                <div className="text-11px text-muted truncate mb-2.5">{getDomain(item.url)}</div>
                <div className="flex items-center justify-between">
                    <span className="text-11px text-danger font-medium">
                        {daysLeft > 0 ? `${daysLeft} 天后永久删除` : '即将永久删除'}
                    </span>
                    <span className="text-11px text-muted">{formatSize(item.file_size)}</span>
                </div>
            </div>
        </div>
    )
}
