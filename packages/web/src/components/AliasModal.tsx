import { useState, useEffect, useRef } from 'react'

interface Props {
    open: boolean
    initialValue: string
    onSave: (alias: string) => void
    onClose: () => void
}

export default function AliasModal({ open, initialValue, onSave, onClose }: Props) {
    const [value, setValue] = useState(initialValue)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (open) {
            setValue(initialValue)
            setTimeout(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
            }, 50)
        }
    }, [open, initialValue])

    if (!open) return null

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-1.5 flex items-center justify-center z-200 animate-fade-in"
            onClick={onClose}>
            <div className="bg-bg-2 border border-border-2 rounded-4 p-6 w-105 max-w-[90vw] shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-slide-in-up"
                onClick={e => e.stopPropagation()}>
                <div className="text-base font-semibold mb-4">编辑别名</div>
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') onSave(value.trim())
                        if (e.key === 'Escape') onClose()
                    }}
                    placeholder="输入自定义别名（留空则显示原标题）"
                    className="w-full bg-bg-3 border border-border-2 rounded-2.5 text-white text-sm px-3.5 py-2.5 outline-none mb-4 focus:border-accent transition-colors"
                />
                <div className="flex justify-end gap-2.5">
                    <button className="btn-ghost" onClick={onClose}>取消</button>
                    <button className="btn-primary" onClick={() => onSave(value.trim())}>保存</button>
                </div>
            </div>
        </div>
    )
}
