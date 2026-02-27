import { useState, useRef, useEffect, useMemo } from 'react'
import { marked } from 'marked'

// 配置 marked：安全模式
marked.setOptions({ breaks: true, gfm: true })

interface Props {
    open: boolean
    initialValue: string
    onSave: (notes: string) => void
    onClose: () => void
}

export default function NotesModal({ open, initialValue, onSave, onClose }: Props) {
    const [value, setValue] = useState(initialValue)
    const [preview, setPreview] = useState(false)
    const ref = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (open) {
            setValue(initialValue)
            setPreview(false)
            setTimeout(() => ref.current?.focus(), 100)
        }
    }, [open, initialValue])

    const renderedHtml = useMemo(() => {
        if (!preview || !value) return ''
        return marked.parse(value) as string
    }, [value, preview])

    if (!open) return null

    return (
        <div className="fixed inset-0 bg-[rgba(0,0,0,0.6)] flex items-center justify-center z-200" onClick={onClose}>
            <div className="bg-bg-2 border border-border-2 rounded-3 p-5 w-140 max-w-[90vw] shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                        <div className="i-lucide-sticky-note w-4 h-4 text-accent" />
                        编辑备注
                    </h3>

                    {/* 编辑/预览切换 */}
                    <div className="flex bg-[rgba(255,255,255,0.08)] rounded-1.5 p-0.5">
                        <button
                            className={`px-3 py-1 rounded-1 text-xs cursor-pointer transition-all ${!preview ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
                            onClick={() => setPreview(false)}
                        >
                            编辑
                        </button>
                        <button
                            className={`px-3 py-1 rounded-1 text-xs cursor-pointer transition-all ${preview ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
                            onClick={() => setPreview(true)}
                        >
                            预览
                        </button>
                    </div>
                </div>

                {!preview ? (
                    <textarea
                        ref={ref}
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        rows={8}
                        placeholder="支持 Markdown 格式…"
                        className="w-full bg-bg-3 border border-border-2 rounded-2 text-white text-sm p-3 outline-none focus:border-accent resize-y min-h-32 transition-colors font-mono"
                    />
                ) : (
                    <div
                        className="w-full bg-bg-3 border border-border-2 rounded-2 text-sm p-3 min-h-32 max-h-80 overflow-auto prose prose-invert prose-sm"
                        dangerouslySetInnerHTML={{ __html: renderedHtml || '<span class="text-muted">无内容</span>' }}
                    />
                )}

                <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-muted">支持 Markdown · **粗体** *斜体* `代码` - 列表</span>
                    <div className="flex gap-2">
                        <button className="btn-ghost text-sm" onClick={onClose}>取消</button>
                        <button className="btn-accent text-sm" onClick={() => onSave(value)}>保存</button>
                    </div>
                </div>
            </div>
        </div>
    )
}
