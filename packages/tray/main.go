package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/getlantern/systray"
)

// 嵌入前端静态资源
//
//go:embed static/*
var staticFiles embed.FS

func main() {
	// 确定数据根目录（exe 所在目录）
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal("无法获取 exe 路径:", err)
	}
	rootDir := filepath.Dir(exePath)

	// 初始化数据库
	initDB(rootDir)

	// 启动 HTTP 服务（后台 goroutine）
	go startHTTP()

	// 启动系统托盘（阻塞直到退出）
	systray.Run(onReady, func() {
		log.Println("Chrome Collect 已退出")
		os.Exit(0)
	})
}

func startHTTP() {
	// 从嵌入的 embed.FS 中取出 static 子目录
	sub, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal("无法读取嵌入的前端资源:", err)
	}

	mux := newMux(sub)
	log.Println("[Chrome Collect] 服务已启动 → http://localhost:3210")
	if err := http.ListenAndServe(":3210", mux); err != nil {
		log.Fatal("HTTP 服务启动失败:", err)
	}
}

func onReady() {
	systray.SetIcon(getIcon())
	systray.SetTooltip("Chrome Collect - 网页收藏工具")

	mOpen := systray.AddMenuItem("📂 打开管理界面", "在浏览器中打开管理界面")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("✖ 退出", "关闭 Chrome Collect")

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				openBrowser("http://localhost:3210")
			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}

func openBrowser(url string) {
	exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

// getIcon 生成一个 16x16 绿色书签 ICO 图标（内联，无需外部文件）
func getIcon() []byte {
	w, h := 16, 16
	pixels := make([]byte, w*h*4)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			i := ((h - 1 - y) * w * 4) + x*4
			inShape := x >= 3 && x <= 12 && y >= 1
			if inShape && y > 11 {
				// V 形底部缺口
				mid := 7.5
				depth := float64(y - 11)
				if float64(x) > mid-depth && float64(x) < mid+depth {
					inShape = false
				}
			}
			if inShape {
				pixels[i+0] = 0xaa // B
				pixels[i+1] = 0xd4 // G
				pixels[i+2] = 0x00 // R
				pixels[i+3] = 0xff // A
			}
		}
	}

	mask := make([]byte, h*4)
	for y := 0; y < h; y++ {
		var row uint16
		for x := 0; x < w; x++ {
			if pixels[((h-1-y)*w+x)*4+3] == 0 {
				row |= 1 << (15 - x)
			}
		}
		mask[y*4+0] = byte(row >> 8)
		mask[y*4+1] = byte(row)
	}

	dataSize := 40 + len(pixels) + len(mask)
	ico := []byte{0, 0, 1, 0, 1, 0} // ICO header
	ico = append(ico,
		byte(w), byte(h), 0, 0, 1, 0, 32, 0,
		byte(dataSize), byte(dataSize>>8), byte(dataSize>>16), byte(dataSize>>24),
		22, 0, 0, 0,
	)
	ico = appendLE32(ico, 40)    // BITMAPINFOHEADER size
	ico = appendLE32(ico, w)     // width
	ico = appendLE32(ico, h*2)   // height*2
	ico = append(ico, 1, 0, 32, 0, 0, 0, 0, 0) // planes, bpp, compression
	ico = appendLE32(ico, len(pixels)+len(mask)) // image size
	ico = append(ico, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
	ico = append(ico, pixels...)
	ico = append(ico, mask...)
	return ico
}

func appendLE32(b []byte, v int) []byte {
	return append(b, byte(v), byte(v>>8), byte(v>>16), byte(v>>24))
}
