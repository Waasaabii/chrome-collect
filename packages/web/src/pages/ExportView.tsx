import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import * as api from '../api'

export default function ExportView() {
  const { id } = useParams<{ id: string }>()
  const [html, setHtml] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)

    Promise.all([api.fetchBookmark(id), api.fetchBookmarkHtml(id)])
      .then(([bookmark, htmlResp]) => {
        if (cancelled) return
        let nextTitle = ''
        if (bookmark) {
          setSourceUrl(bookmark.url)
          nextTitle = bookmark.alias || bookmark.title || bookmark.url
        }
        if (htmlResp?.html) {
          setHtml(htmlResp.html)
          if (!nextTitle) {
            const match = htmlResp.html.match(/<title>(.*?)<\/title>/i)
            if (match) nextTitle = match[1]
          }
        } else {
          setHtml(null)
        }
        if (nextTitle) {
          setTitle(nextTitle)
        }
      })
      .catch(() => {
        if (!cancelled) setHtml(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (title) document.title = `${title} - Chrome Collect`
    return () => {
      document.title = 'Chrome Collect'
    }
  }, [title])

  const handlePrintPDF = () => {
    if (!html) return
    window.print()
  }

  const handleDownload = async () => {
    if (!id) return
    await api.downloadHtml(id)
  }

  const handleOpenFolder = async () => {
    if (!id) return
    await api.openFolder(id)
  }

  const handleOpenSource = async () => {
    if (!sourceUrl) return
    if (window.chromeCollect?.invoke) {
      await window.chromeCollect.invoke('shell.openExternal', { url: sourceUrl })
      return
    }
    window.open(sourceUrl, '_blank', 'noopener,noreferrer')
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
      <div className="fixed top-0 left-0 right-0 h-10 bg-[rgba(10,12,20,0.95)] backdrop-blur-4 flex items-center px-4 gap-3 z-100 text-white text-xs">
        <button
          className="text-muted hover:text-white transition-colors cursor-pointer flex items-center gap-1 shrink-0"
          onClick={() => window.history.back()}
        >
          <div className="i-lucide-arrow-left w-3.5 h-3.5" />
          返回
        </button>

        <span className="text-muted truncate flex-1">{title}</span>

        {sourceUrl && (
          <button
            className="text-blue hover:text-white transition-colors bg-transparent border-none cursor-pointer flex items-center gap-1 shrink-0"
            onClick={() => void handleOpenSource()}
          >
            <div className="i-lucide-external-link w-3.5 h-3.5" />
            访问原站
          </button>
        )}

        <button
          className="text-muted hover:text-accent transition-colors cursor-pointer flex items-center gap-1 shrink-0"
          onClick={handlePrintPDF}
        >
          <div className="i-lucide-file-text w-3.5 h-3.5" />
          导出 PDF
        </button>

        <button
          className="text-accent hover:text-white transition-colors no-underline flex items-center gap-1 shrink-0"
          onClick={handleDownload}
        >
          <div className="i-lucide-download w-3.5 h-3.5" />
          下载 HTML
        </button>

        <button
          className="text-accent hover:text-white transition-colors no-underline flex items-center gap-1 shrink-0"
          onClick={handleOpenFolder}
        >
          <div className="i-lucide-folder-open w-3.5 h-3.5" />
          打开文件夹
        </button>
      </div>

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
