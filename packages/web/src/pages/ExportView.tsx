import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'

export default function ExportView() {
    const { id } = useParams<{ id: string }>()
    const [html, setHtml] = useState<string | null>(null)
    const [title, setTitle] = useState('')
    const [sourceUrl, setSourceUrl] = useState('')
    const [loading, setLoading] = useState(true)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    useEffect(() => {
        if (!id) return

        // 获取收藏信息（原始 URL）
        fetch(`/api/bookmarks/${id}`)
            .then(r => r.json())
            .then(bm => {
                if (bm) {
                    setSourceUrl(bm.url)
                    setTitle(bm.alias || bm.title || bm.url)
                }
            })
            .catch(() => { })

        // 获取 HTML 内容
        fetch(`/pages/${id}.html`)
            .then(r => r.text())
            .then(text => {
                setHtml(text)
                const match = text.match(/<title>(.*?)<\/title>/i)
                if (match && !title) setTitle(match[1])
            })
            .catch(() => setHtml(null))
            .finally(() => setLoading(false))
    }, [id])

    // 更新页面标题
    useEffect(() => {
        if (title) document.title = `${title} - Chrome Collect`
        return () => { document.title = 'Chrome Collect' }
    }, [title])

    const handlePrintPDF = () => {
        if (!html) return
        // 在新窗口打开 HTML 并打印（绕过 sandbox 限制）
        const printWin = window.open('', '_blank')
        if (!printWin) return
        printWin.document.write(html)
        printWin.document.close()
        // 等待资源加载完成后打印
        printWin.onload = () => {
            printWin.print()
        }
        // 兜底：2 秒后触发打印（某些页面 onload 不触发）
        setTimeout(() => {
            try { printWin.print() } catch { }
        }, 2000)
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center text-muted">
                <div className="w-6 h-6 border-2 border-border-2 border-t-accent rounded-full animate-spin mr-3" />
                加载中…
            </div>
        )
    }

    if (!html) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center text-muted">
                页面不存在
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-white">
            {/* 顶部工具栏 */}
            <div className="fixed top-0 left-0 right-0 h-10 bg-[rgba(10,12,20,0.95)] backdrop-blur-4 flex items-center px-4 gap-3 z-100 text-white text-xs">
                <button
                    className="text-muted hover:text-white transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    onClick={() => window.history.back()}
                >
                    <div className="i-lucide-arrow-left w-3.5 h-3.5" />
                    返回
                </button>

                <span className="text-muted truncate flex-1">{title}</span>

                {/* 访问原站 */}
                {sourceUrl && (
                    <a
                        href={sourceUrl}
                        target="_self"
                        className="text-blue hover:text-white transition-colors no-underline flex items-center gap-1 shrink-0"
                    >
                        <div className="i-lucide-external-link w-3.5 h-3.5" />
                        访问原站
                    </a>
                )}

                {/* 导出 PDF */}
                <button
                    className="text-muted hover:text-accent transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    onClick={handlePrintPDF}
                >
                    <div className="i-lucide-file-text w-3.5 h-3.5" />
                    导出 PDF
                </button>

                {/* 下载 HTML */}
                <a
                    href={`/api/bookmarks/${id}/download`}
                    className="text-accent hover:text-white transition-colors no-underline flex items-center gap-1 shrink-0"
                >
                    <div className="i-lucide-download w-3.5 h-3.5" />
                    下载 HTML
                </a>
            </div>

            {/* 页面内容 */}
            <iframe
                ref={iframeRef}
                srcDoc={html}
                className="w-full border-none mt-10"
                style={{ height: 'calc(100vh - 40px)' }}
                sandbox="allow-same-origin allow-modals"
                title={title}
            />
        </div>
    )
}
