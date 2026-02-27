//go:build darwin

package main

import (
	"fmt"
	"os"
	"path/filepath"
)

const plistLabel = "com.chrome-collect"

func plistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", plistLabel+".plist")
}

// isAutoStartEnabled 检查 LaunchAgents plist 是否存在
func isAutoStartEnabled() bool {
	_, err := os.Stat(plistPath())
	return err == nil
}

// setAutoStart 设置或取消开机自启（通过 LaunchAgents plist）
func setAutoStart(enable bool) error {
	path := plistPath()
	if !enable {
		err := os.Remove(path)
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>%s</string>
  <key>ProgramArguments</key>
  <array>
    <string>%s</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
`, plistLabel, exePath)

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(plist), 0644)
}
