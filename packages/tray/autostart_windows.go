//go:build windows

package main

import (
	"os"

	"golang.org/x/sys/windows/registry"
)

const autoStartKeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`
const autoStartValueName = "ChromeCollect"

// isAutoStartEnabled 检查注册表中是否存在开机自启项
func isAutoStartEnabled() bool {
	key, err := registry.OpenKey(registry.CURRENT_USER, autoStartKeyPath, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer key.Close()

	_, _, err = key.GetStringValue(autoStartValueName)
	return err == nil
}

// setAutoStart 设置或取消开机自启
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
	err = key.DeleteValue(autoStartValueName)
	if err == registry.ErrNotExist {
		return nil
	}
	return err
}
