//go:build windows

package main

import (
	"os"

	"golang.org/x/sys/windows"
)

// tryPing 检查进程是否仍然存活（Windows 实现）
func tryPing(p *os.Process) error {
	h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(p.Pid))
	if err != nil {
		return err // 进程不存在
	}
	defer windows.CloseHandle(h)
	// WaitForSingleObject 超时 0ms：立即返回
	r, _ := windows.WaitForSingleObject(h, 0)
	if r == windows.WAIT_OBJECT_0 {
		return os.ErrProcessDone // 进程已退出
	}
	return nil // 进程仍在运行
}
