//go:build darwin

package app

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const plistLabel = "com.chrome-collect.desktop"

func plistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", plistLabel+".plist")
}

func isAutoStartEnabled() bool {
	_, err := os.Stat(plistPath())
	return err == nil
}

func setAutoStart(enable bool) error {
	path := plistPath()
	if !enable {
		if err := os.Remove(path); os.IsNotExist(err) {
			return nil
		} else {
			return err
		}
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

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(plist), 0o644)
}

func openExternal(rawURL string) error {
	return exec.Command("open", rawURL).Start()
}

func openFolder(filePath string) error {
	return exec.Command("open", "-R", filePath).Start()
}

func launchInstaller(filePath string) error {
	return exec.Command("open", filePath).Start()
}

func desktopBinaryName() string {
	return "chrome-collect-desktop"
}

func nativeHostBinaryName() string {
	return "chrome-collect-native-host"
}

func launchDesktopWindow() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	desktopPath := exe
	if filepath.Base(exe) != desktopBinaryName() {
		desktopPath = filepath.Join(filepath.Dir(exe), desktopBinaryName())
	}
	return exec.Command(desktopPath, "--window").Start()
}

func installManifestPath(installDir string) string {
	return filepath.Join(installDir, "chrome-collect-host.json")
}
