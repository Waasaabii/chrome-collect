package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"
)

// runUpdaterMode 是自更新模式的入口。
// 当新下载的 exe 以 --update-pid=<pid> --update-target=<path> 启动时，
// 此函数负责等待旧进程退出、覆盖旧 exe、然后以正常模式重启。
func runUpdaterMode(oldPID int, targetPath string) {
	// 等待旧进程退出（最长等 30 秒）
	for i := 0; i < 300; i++ {
		p, err := os.FindProcess(oldPID)
		if err != nil {
			break // 进程已不存在
		}
		// 在 Unix/Mac 上发送 signal 0 来检测进程是否存活
		// 在 Windows 上 FindProcess 总是成功，所以额外尝试 os.Kill(0)
		if err := tryPing(p); err != nil {
			break // 进程已退出
		}
		time.Sleep(100 * time.Millisecond)
	}

	// 等一小会儿确保文件句柄已释放
	time.Sleep(500 * time.Millisecond)

	// 获取当前（新）exe 路径
	selfPath, err := os.Executable()
	if err != nil {
		return
	}

	// 覆盖旧 exe（同盘路径用 Rename 更快；失败则回退到 copy+remove）
	if err := os.Rename(selfPath, targetPath); err != nil {
		// Rename 跨盘失败，改用复制
		if err2 := copyFile(selfPath, targetPath); err2 != nil {
			return
		}
		os.Remove(selfPath)
	}

	// 以正常模式重启
	cmd := exec.Command(targetPath)
	cmd.Start()
}

// downloadUpdate 下载新版 exe 到临时目录，返回临时文件路径
func downloadUpdate(downloadURL, version string) (string, error) {
	ext := ".exe"
	if os.PathSeparator == '/' {
		ext = "" // macOS/Linux 无扩展名
	}
	tmpPath := filepath.Join(os.TempDir(), fmt.Sprintf("chrome-collect-%s%s", version, ext))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("下载失败: HTTP %d", resp.StatusCode)
	}

	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return "", err
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		return "", err
	}
	return tmpPath, nil
}

// launchUpdater 启动新 exe（临时路径），传入旧 PID 和旧 exe 路径，然后让调用方退出
func launchUpdater(tmpPath string) error {
	selfPath, err := os.Executable()
	if err != nil {
		return err
	}
	pid := os.Getpid()

	cmd := exec.Command(tmpPath,
		fmt.Sprintf("--update-pid=%d", pid),
		fmt.Sprintf("--update-target=%s", selfPath),
	)
	return cmd.Start()
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

// parseUpdaterArgs 解析命令行参数，返回 (pid, targetPath, isUpdaterMode)
func parseUpdaterArgs() (int, string, bool) {
	var pid int
	var target string
	for _, arg := range os.Args[1:] {
		if len(arg) > 12 && arg[:12] == "--update-pid" {
			pid, _ = strconv.Atoi(arg[13:])
		}
		if len(arg) > 16 && arg[:16] == "--update-target=" {
			target = arg[16:]
		}
	}
	if pid > 0 && target != "" {
		return pid, target, true
	}
	return 0, "", false
}
