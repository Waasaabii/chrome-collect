package protocol

import "encoding/json"

const (
	ProtocolVersion = 1
	NativeHostName  = "com.chrome_collect.native_host"
)

const (
	MethodHello               = "hello"
	MethodAppOpenManager      = "ui.openManager"
	MethodShellOpenExternal   = "shell.openExternal"
	MethodBookmarkSave        = "bookmark.save"
	MethodBookmarkExistsByURL = "bookmark.existsByUrl"
	MethodBookmarkList        = "bookmark.list"
	MethodBookmarkListRecent  = "bookmark.listRecent"
	MethodBookmarkGet         = "bookmark.get"
	MethodBookmarkGetHTML     = "bookmark.getHtml"
	MethodBookmarkDelete      = "bookmark.delete"
	MethodBookmarkUpdateAlias = "bookmark.updateAlias"
	MethodBookmarkUpdateNotes = "bookmark.updateNotes"
	MethodBookmarkDownload    = "bookmark.downloadHtml"
	MethodBookmarkOpenFolder  = "bookmark.openFolder"
	MethodTrashList           = "trash.list"
	MethodTrashRestore        = "trash.restore"
	MethodTrashDelete         = "trash.delete"
	MethodTrashEmpty          = "trash.empty"
	MethodStatsGet            = "stats.get"
	MethodSettingsGet         = "settings.get"
	MethodSettingsSetAuto     = "settings.setAutoStart"
	MethodVersionGet          = "version.get"
	MethodUpdateStart         = "update.start"
	MethodExtensionPing       = "extension.ping"
)

type Request struct {
	ID              string          `json:"id"`
	ProtocolVersion int             `json:"protocolVersion"`
	Method          string          `json:"method"`
	Payload         json.RawMessage `json:"payload"`
}

type Response struct {
	ID              string `json:"id"`
	ProtocolVersion int    `json:"protocolVersion"`
	OK              bool   `json:"ok"`
	Result          any    `json:"result,omitempty"`
	Error           *Error `json:"error,omitempty"`
}

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func NewSuccess(id string, result any) Response {
	return Response{
		ID:              id,
		ProtocolVersion: ProtocolVersion,
		OK:              true,
		Result:          result,
	}
}

func NewError(id, code, message string) Response {
	return Response{
		ID:              id,
		ProtocolVersion: ProtocolVersion,
		OK:              false,
		Error: &Error{
			Code:    code,
			Message: message,
		},
	}
}
