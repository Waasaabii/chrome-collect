//go:build !cgo

package main

import "log"

func main() {
	log.Fatal("chrome-collect desktop 需要启用 CGO 以编译 WebView 窗口")
}
