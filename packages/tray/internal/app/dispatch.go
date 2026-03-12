package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"chrome-collect-tray/internal/protocol"
)

type Dispatcher struct {
	Service         *Service
	OpenManagerFunc func() error
}

func (d *Dispatcher) Handle(req protocol.Request) protocol.Response {
	if req.ProtocolVersion != protocol.ProtocolVersion {
		return protocol.NewError(req.ID, "protocol_mismatch", "请同时升级桌面端与扩展")
	}
	result, err := d.dispatch(req.Method, req.Payload)
	if err != nil {
		return protocol.NewError(req.ID, errorCode(err), err.Error())
	}
	return protocol.NewSuccess(req.ID, result)
}

func (d *Dispatcher) dispatch(method string, payload json.RawMessage) (any, error) {
	switch method {
	case protocol.MethodHello:
		return d.Service.Hello(), nil
	case protocol.MethodAppOpenManager:
		if d.OpenManagerFunc == nil {
			return nil, errors.New("当前环境不支持打开管理窗口")
		}
		return map[string]any{"ok": true}, d.OpenManagerFunc()
	case protocol.MethodShellOpenExternal:
		var input struct {
			URL string `json:"url"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, d.Service.OpenExternal(input.URL)
	case protocol.MethodBookmarkSave:
		var input SaveInput
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return d.Service.SaveBookmark(input)
	case protocol.MethodBookmarkExistsByURL:
		var input struct {
			URL string `json:"url"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		exists, err := d.Service.ExistsByURL(input.URL)
		if err != nil {
			return nil, err
		}
		return map[string]bool{"exists": exists}, nil
	case protocol.MethodBookmarkList:
		var input struct {
			Limit  int    `json:"limit"`
			Offset int    `json:"offset"`
			Q      string `json:"q"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return d.Service.ListBookmarks(input.Limit, input.Offset, input.Q)
	case protocol.MethodBookmarkListRecent:
		var input struct {
			Limit int `json:"limit"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		items, err := d.Service.ListRecentBookmarks(input.Limit)
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	case protocol.MethodBookmarkGet:
		var input struct {
			ID string `json:"id"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return d.Service.GetBookmark(input.ID)
	case protocol.MethodBookmarkGetHTML:
		var input struct {
			ID string `json:"id"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return d.Service.GetBookmarkHTML(input.ID)
	case protocol.MethodBookmarkDelete:
		var input struct {
			ID string `json:"id"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, d.Service.DeleteBookmark(input.ID)
	case protocol.MethodBookmarkUpdateAlias:
		var input struct {
			ID    string `json:"id"`
			Alias string `json:"alias"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, d.Service.UpdateAlias(input.ID, input.Alias)
	case protocol.MethodBookmarkUpdateNotes:
		var input struct {
			ID    string `json:"id"`
			Notes string `json:"notes"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, d.Service.UpdateNotes(input.ID, input.Notes)
	case protocol.MethodBookmarkDownload:
		var input struct {
			ID string `json:"id"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return d.Service.DownloadBookmarkHTML(input.ID)
	case protocol.MethodBookmarkOpenFolder:
		var input struct {
			ID string `json:"id"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return d.Service.OpenBookmarkFolder(input.ID)
	case protocol.MethodTrashList:
		return d.Service.ListTrash()
	case protocol.MethodTrashRestore:
		var input struct {
			ID string `json:"id"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, d.Service.RestoreBookmark(input.ID)
	case protocol.MethodTrashDelete:
		var input struct {
			ID string `json:"id"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, d.Service.PermanentDelete(input.ID)
	case protocol.MethodTrashEmpty:
		return d.Service.EmptyTrash()
	case protocol.MethodStatsGet:
		return d.Service.GetStats(), nil
	case protocol.MethodSettingsGet:
		return d.Service.GetSettings(), nil
	case protocol.MethodSettingsSetAuto:
		var input struct {
			Enabled bool `json:"enabled"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return d.Service.SetAutoStart(input.Enabled)
	case protocol.MethodVersionGet:
		var input struct {
			Force bool `json:"force"`
		}
		if err := decodePayload(payload, &input); err != nil {
			return nil, err
		}
		return d.Service.GetVersionInfo(input.Force)
	case protocol.MethodUpdateStart:
		return d.Service.StartUpdate()
	case protocol.MethodExtensionPing:
		return map[string]any{"ok": true}, d.Service.PingExtension()
	default:
		return nil, fmt.Errorf("未知方法: %s", method)
	}
}

func decodePayload(payload json.RawMessage, target any) error {
	if len(payload) == 0 || string(payload) == "null" {
		return nil
	}
	if err := json.Unmarshal(payload, target); err != nil {
		return errors.New("无效请求")
	}
	return nil
}

func errorCode(err error) string {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return "not_found"
	case strings.Contains(err.Error(), "协议"):
		return "protocol_mismatch"
	default:
		return "operation_failed"
	}
}
