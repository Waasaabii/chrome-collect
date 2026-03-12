//go:build windows

package app

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const autoStartKeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`
const autoStartValueName = "ChromeCollectDesktop"

func isAutoStartEnabled() bool {
	key, err := registry.OpenKey(registry.CURRENT_USER, autoStartKeyPath, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer key.Close()
	_, _, err = key.GetStringValue(autoStartValueName)
	return err == nil
}

func setAutoStart(enable bool) error {
	if enable {
		exePath, err := os.Executable()
		if err != nil {
			return err
		}
		key, _, err := registry.CreateKey(registry.CURRENT_USER, autoStartKeyPath, registry.SET_VALUE)
		if err != nil {
			return err
		}
		defer key.Close()
		return key.SetStringValue(autoStartValueName, exePath)
	}
	key, err := registry.OpenKey(registry.CURRENT_USER, autoStartKeyPath, registry.SET_VALUE)
	if err != nil {
		return nil
	}
	defer key.Close()
	if err := key.DeleteValue(autoStartValueName); err == registry.ErrNotExist {
		return nil
	} else {
		return err
	}
}

func openExternal(rawURL string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", rawURL).Start()
}

func openFolder(filePath string) error {
	return exec.Command("explorer", "/select,", filePath).Start()
}

func launchInstaller(filePath string) error {
	return exec.Command("msiexec", "/i", filePath).Start()
}

func desktopBinaryName() string {
	return "chrome-collect-desktop.exe"
}

func nativeHostBinaryName() string {
	return "chrome-collect-native-host.exe"
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

func windowsHostRegistryPath() string {
	return fmt.Sprintf(`Software\Google\Chrome\NativeMessagingHosts\%s`, "com.chrome_collect.host")
}
