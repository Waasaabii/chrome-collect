//go:build cgo

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"

	"chrome-collect-tray/internal/app"
	"chrome-collect-tray/internal/protocol"

	"github.com/getlantern/systray"
	webview "github.com/webview/webview_go"
)

var Version = "dev"

func main() {
	service, err := app.New(Version)
	if err != nil {
		log.Fatal(err)
	}
	defer service.Close()

	dispatcher := &app.Dispatcher{
		Service: service,
		OpenManagerFunc: func() error {
			return launchWindowProcess()
		},
	}

	if hasArg("--window") {
		if err := runWindow(dispatcher); err != nil {
			log.Fatal(err)
		}
		return
	}

	systray.Run(func() {
		onReady()
	}, func() {
		os.Exit(0)
	})
}

func onReady() {
	systray.SetIcon(getIcon())
	systray.SetTooltip("Chrome Collect Desktop")

	openItem := systray.AddMenuItem("打开管理窗口", "打开 Chrome Collect 管理窗口")
	systray.AddSeparator()
	quitItem := systray.AddMenuItem("退出", "退出 Chrome Collect")

	go func() {
		for {
			select {
			case <-openItem.ClickedCh:
				if err := launchWindowProcess(); err != nil {
					log.Println("打开管理窗口失败:", err)
				}
			case <-quitItem.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}

func launchWindowProcess() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe, "--window")
	return cmd.Start()
}

func runWindow(dispatcher *app.Dispatcher) error {
	w := webview.New(true)
	if w == nil {
		return errors.New("无法创建桌面窗口")
	}
	defer w.Destroy()

	w.SetTitle("Chrome Collect")
	w.SetSize(1280, 860, webview.HintNone)

	if err := w.Bind("chromeCollectInvoke", func(method string, payload any) (any, error) {
		raw, err := json.Marshal(payload)
		if err != nil {
			return protocol.NewError("desktop-window", "encode_failed", err.Error()), nil
		}
		resp := dispatcher.Handle(protocol.Request{
			ID:              "desktop-window",
			ProtocolVersion: protocol.ProtocolVersion,
			Method:          method,
			Payload:         raw,
		})
		return resp, nil
	}); err != nil {
		return err
	}

	w.Init(`window.chromeCollect = { invoke(method, payload = {}) { return chromeCollectInvoke(method, payload); } };`)
	indexURL, err := resolveIndexURL()
	if err != nil {
		return err
	}
	w.Navigate(indexURL)
	w.Run()
	return nil
}

func resolveIndexURL() (string, error) {
	candidates := []string{}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "resources", "web", "index.html"),
			filepath.Join(exeDir, "..", "resources", "web", "index.html"),
			filepath.Join(exeDir, "..", "..", "packages", "web", "dist", "index.html"),
		)
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(cwd, "packages", "web", "dist", "index.html"),
			filepath.Join(cwd, "..", "web", "dist", "index.html"),
		)
	}

	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return "file:///" + filepath.ToSlash(candidate) + "#/", nil
		}
	}
	return "", fmt.Errorf("未找到桌面前端资源 index.html")
}

func hasArg(flag string) bool {
	for _, arg := range os.Args[1:] {
		if arg == flag {
			return true
		}
	}
	return false
}

func getIcon() []byte {
	w, h := 16, 16
	pixels := make([]byte, w*h*4)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			index := ((h - 1 - y) * w * 4) + x*4
			inShape := x >= 3 && x <= 12 && y >= 1
			if inShape && y > 11 {
				mid := 7.5
				depth := float64(y - 11)
				if float64(x) > mid-depth && float64(x) < mid+depth {
					inShape = false
				}
			}
			if inShape {
				pixels[index+0] = 0xaa
				pixels[index+1] = 0xd4
				pixels[index+2] = 0x00
				pixels[index+3] = 0xff
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
		mask[y*4] = byte(row >> 8)
		mask[y*4+1] = byte(row)
	}
	dataSize := 40 + len(pixels) + len(mask)
	ico := []byte{0, 0, 1, 0, 1, 0}
	ico = append(ico,
		byte(w), byte(h), 0, 0, 1, 0, 32, 0,
		byte(dataSize), byte(dataSize>>8), byte(dataSize>>16), byte(dataSize>>24),
		22, 0, 0, 0,
	)
	ico = appendLE32(ico, 40)
	ico = appendLE32(ico, w)
	ico = appendLE32(ico, h*2)
	ico = append(ico, 1, 0, 32, 0, 0, 0, 0, 0)
	ico = appendLE32(ico, len(pixels)+len(mask))
	ico = append(ico, make([]byte, 16)...)
	ico = append(ico, pixels...)
	ico = append(ico, mask...)
	return ico
}

func appendLE32(buffer []byte, value int) []byte {
	return append(buffer, byte(value), byte(value>>8), byte(value>>16), byte(value>>24))
}
