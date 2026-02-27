//go:build windows

package main

import "os/exec"

// openBrowser 在系统默认浏览器中打开 URL（Windows）
func openBrowser(url string) {
	exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}
