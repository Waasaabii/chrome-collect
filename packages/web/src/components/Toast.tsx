import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

// ── Toast 上下文 ──────────────────────────────────────────────
type ToastType = 'success' | 'error' | ''

interface ToastCtx {
    show: (msg: string, type?: ToastType) => void
}

const Ctx = createContext<ToastCtx>({ show: () => { } })

export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
    const [msg, setMsg] = useState('')
    const [type, setType] = useState<ToastType>('')
    const [visible, setVisible] = useState(false)

    const show = useCallback((m: string, t: ToastType = '') => {
        setMsg(m)
        setType(t)
        setVisible(true)
        setTimeout(() => setVisible(false), 3000)
    }, [])

    return (
        <Ctx.Provider value={{ show }}>
            {children}
            {visible && (
                <div className={`
          fixed bottom-7 left-1/2 -translate-x-1/2 z-300
          bg-bg-3 border rounded-3 text-sm font-medium
          px-5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]
          animate-fade-in whitespace-nowrap
          ${type === 'success' ? 'border-accent/50 text-accent' : ''}
          ${type === 'error' ? 'border-danger/50 text-danger' : ''}
          ${!type ? 'border-border-2 text-white' : ''}
        `}>
                    {msg}
                </div>
            )}
        </Ctx.Provider>
    )
}
