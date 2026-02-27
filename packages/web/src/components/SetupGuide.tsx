export default function SetupGuide() {
    return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-8">
            <div className="max-w-lg w-full">
                {/* 标题 */}
                <div className="text-center mb-10">
                    <div className="i-lucide-puzzle w-16 h-16 text-accent mx-auto mb-4" />
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-accent to-blue bg-clip-text text-transparent">
                        安装浏览器扩展
                    </h1>
                    <p className="text-muted mt-2 text-sm">只需 3 步，即可开始收藏网页</p>
                </div>

                {/* 步骤 */}
                <div className="space-y-5">
                    <Step num={1} title="下载扩展">
                        <a href="/api/extension/download" download
                            className="btn-primary mt-2 no-underline inline-flex">
                            <div className="i-lucide-download w-4 h-4" />
                            下载 extension.zip
                        </a>
                    </Step>

                    <Step num={2} title="打开扩展管理页">
                        <p className="text-muted text-sm">
                            在 Chrome 地址栏输入 <code className="bg-bg-3 px-2 py-0.5 rounded text-accent text-xs">chrome://extensions</code> 并回车
                        </p>
                        <p className="text-muted text-sm mt-1">
                            打开右上角的 <strong className="text-white">开发者模式</strong> 开关
                        </p>
                    </Step>

                    <Step num={3} title="加载扩展">
                        <p className="text-muted text-sm">
                            解压下载的 zip 文件，点击 <strong className="text-white">加载已解压的扩展程序</strong>，选择解压后的文件夹
                        </p>
                    </Step>
                </div>

                {/* 底部提示 */}
                <div className="mt-8 text-center">
                    <p className="text-muted text-xs">安装完成后刷新此页面，引导将自动消失</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="btn-ghost mt-3 text-sm"
                    >
                        <div className="i-lucide-refresh-cw w-3.5 h-3.5" />
                        刷新页面
                    </button>
                </div>
            </div>
        </div>
    )
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
    return (
        <div className="glass rounded-3 p-4 flex gap-4">
            <div className="w-8 h-8 rounded-full bg-accent/15 text-accent font-bold flex items-center justify-center shrink-0 text-sm">
                {num}
            </div>
            <div className="flex-1">
                <div className="font-semibold text-white mb-1">{title}</div>
                {children}
            </div>
        </div>
    )
}
