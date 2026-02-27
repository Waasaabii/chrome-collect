//go:build darwin

package main

import "os/exec"

// openBrowser 在系统默认浏览器中打开 URL（macOS）
func openBrowser(url string) {
	exec.Command("open", url).Start()
}
