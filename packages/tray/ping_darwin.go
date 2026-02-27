//go:build darwin || linux

package main

import (
	"os"
	"syscall"
)

// tryPing 检查进程是否仍然存活（Unix 实现：发送 signal 0）
func tryPing(p *os.Process) error {
	return p.Signal(syscall.Signal(0))
}
