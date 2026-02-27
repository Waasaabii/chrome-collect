package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/getlantern/systray"
)

// ── 版本检查缓存 ──────────────────────────────────────────────────────────────
const githubRepo = "Waasaabii/chrome-collect"
const releasesPage = "https://github.com/" + githubRepo + "/releases/latest"

var (
	versionCacheMu      sync.Mutex
	versionCacheResult  map[string]any
	versionCacheExpires time.Time
)

// ── 扩展心跳 ──────────────────────────────────────────────────────────────────
var lastExtensionPing atomic.Int64 // Unix ms

// ── 响应工具 ──────────────────────────────────────────────────────────────────

var corsHeaders = map[string]string{
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	for k, v := range corsHeaders {
		w.Header().Set(k, v)
	}
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeOK(w http.ResponseWriter) {
	writeJSON(w, 200, map[string]any{"ok": true})
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}

func writeCORS(w http.ResponseWriter) {
	for k, v := range corsHeaders {
		w.Header().Set(k, v)
	}
	w.WriteHeader(204)
}

// ── 路由注册 ──────────────────────────────────────────────────────────────────

func newMux(staticFS fs.FS) *http.ServeMux {
	mux := http.NewServeMux()

	// OPTIONS Preflight
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			writeCORS(w)
			return
		}
		handleRequest(w, r, staticFS)
	})

	return mux
}

func handleRequest(w http.ResponseWriter, r *http.Request, staticFS fs.FS) {
	path := r.URL.Path
	method := r.Method

	// ── POST /api/save ──────────────────────────────────────────────────────
	if method == "POST" && path == "/api/save" {
		var input SaveInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.URL == "" || input.HTML == "" {
			writeErr(w, 400, "缺少 url 或 html 字段")
			return
		}
		bm, err := saveBookmark(input)
		if err != nil {
			writeErr(w, 500, fmt.Sprintf("保存失败: %v", err))
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "id": bm.ID})
		return
	}

	// ── GET /api/bookmarks?q=&limit=&offset=&url= ───────────────────────────
	if method == "GET" && path == "/api/bookmarks" {
		q := r.URL.Query().Get("q")
		urlParam := r.URL.Query().Get("url")
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		if limit <= 0 {
			limit = 50
		}
		items, total, err := getAllBookmarks(q, urlParam, limit, offset)
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"items": items, "total": total})
		return
	}

	// ── GET /api/bookmarks/:id ───────────────────────────────────────────────
	if method == "GET" && strings.HasPrefix(path, "/api/bookmarks/") {
		parts := strings.Split(path, "/")
		if len(parts) == 4 {
			id := parts[3]
			bm, err := getBookmark(id)
			if err != nil || bm == nil {
				writeErr(w, 404, "Not Found")
				return
			}
			writeJSON(w, 200, bm)
			return
		}
	}

	// ── PATCH /api/bookmarks/:id ─────────────────────────────────────────────
	if method == "PATCH" && strings.HasPrefix(path, "/api/bookmarks/") {
		parts := strings.Split(path, "/")
		if len(parts) == 4 {
			id := parts[3]
			var body map[string]string
			json.NewDecoder(r.Body).Decode(&body)

			if alias, ok := body["alias"]; ok {
				if ok2, _ := updateAlias(id, alias); ok2 {
					writeOK(w)
				} else {
					writeErr(w, 404, "Not Found")
				}
				return
			}
			if notes, ok := body["notes"]; ok {
				if ok2, _ := updateNotes(id, notes); ok2 {
					writeOK(w)
				} else {
					writeErr(w, 404, "Not Found")
				}
				return
			}
			writeErr(w, 400, "无效操作")
			return
		}
	}

	// ── DELETE /api/bookmarks/:id ────────────────────────────────────────────
	if method == "DELETE" && strings.HasPrefix(path, "/api/bookmarks/") {
		parts := strings.Split(path, "/")
		if len(parts) == 4 {
			id := parts[3]
			if ok, _ := softDeleteBookmark(id); ok {
				writeOK(w)
			} else {
				writeErr(w, 404, "Not Found")
			}
			return
		}
	}

	// ── GET /api/stats ───────────────────────────────────────────────────────
	if method == "GET" && path == "/api/stats" {
		writeJSON(w, 200, getStats())
		return
	}

	// ── GET /api/bookmarks/:id/download ─────────────────────────────────────
	if method == "GET" && strings.HasSuffix(path, "/download") {
		parts := strings.Split(path, "/")
		if len(parts) == 5 && parts[1] == "api" && parts[2] == "bookmarks" {
			id := parts[3]
			bm, err := getBookmark(id)
			if err != nil || bm == nil {
				writeErr(w, 404, "Not Found")
				return
			}
			filePath := getAbsoluteFilePath(bm.FilePath)
			data, err := os.ReadFile(filePath)
			if err != nil {
				writeErr(w, 404, "Not Found")
				return
			}
			name := bm.Alias
			if name == "" {
				name = bm.Title
			}
			if name == "" {
				name = bm.ID
			}
			name = strings.NewReplacer(`\`, "_", "/", "_", ":", "_", "*", "_", "?", "_", `"`, "_", "<", "_", ">", "_", "|", "_").Replace(name) + ".html"
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Content-Disposition", `attachment; filename*=UTF-8''`+url.PathEscape(name))
			w.Write(data)
			return
		}
	}

	// ── POST /api/bookmarks/:id/open-folder ─────────────────────────────────
	if method == "POST" && strings.HasSuffix(path, "/open-folder") {
		parts := strings.Split(path, "/")
		if len(parts) == 5 && parts[1] == "api" && parts[2] == "bookmarks" {
			id := parts[3]
			bm, err := getBookmark(id)
			if err != nil || bm == nil {
				writeErr(w, 404, "Not Found")
				return
			}
			filePath := filepath.FromSlash(getAbsoluteFilePath(bm.FilePath))
			exec.Command("explorer", "/select,", filePath).Start()
			writeOK(w)
			return
		}
	}

	// ── 回收站路由 ────────────────────────────────────────────────────────────

	// DELETE /api/trash （先于 /api/trash/:id）
	if method == "DELETE" && path == "/api/trash" {
		count, _ := emptyTrash()
		writeJSON(w, 200, map[string]any{"ok": true, "deleted": count})
		return
	}

	// GET /api/trash
	if method == "GET" && path == "/api/trash" {
		items, err := getTrashItems()
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, items)
		return
	}

	// POST /api/trash/:id/restore
	if method == "POST" && strings.HasSuffix(path, "/restore") {
		parts := strings.Split(path, "/")
		if len(parts) == 5 {
			id := parts[3]
			if ok, _ := restoreBookmark(id); ok {
				writeOK(w)
			} else {
				writeErr(w, 404, "Not Found")
			}
			return
		}
	}

	// DELETE /api/trash/:id
	if method == "DELETE" && strings.HasPrefix(path, "/api/trash/") {
		id := strings.TrimPrefix(path, "/api/trash/")
		if ok, _ := permanentDelete(id); ok {
			writeOK(w)
		} else {
			writeErr(w, 404, "Not Found")
		}
		return
	}

	// ── 设置路由 ──────────────────────────────────────────────────────────────

	// GET /api/settings/autostart
	if method == "GET" && path == "/api/settings/autostart" {
		writeJSON(w, 200, map[string]any{"enabled": isAutoStartEnabled()})
		return
	}

	// PUT /api/settings/autostart
	if method == "PUT" && path == "/api/settings/autostart" {
		var body struct {
			Enabled bool `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, 400, "无效请求")
			return
		}
		if err := setAutoStart(body.Enabled); err != nil {
			writeErr(w, 500, fmt.Sprintf("设置失败: %v", err))
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "enabled": body.Enabled})
		return
	}

	// ── 自更新 ────────────────────────────────────────────────────────────────

	// POST /api/update
	if method == "POST" && path == "/api/update" {
		info := getVersionInfo()
		downloadURL, _ := info["downloadUrl"].(string)
		version, _ := info["latest"].(string)
		if downloadURL == "" || version == "" {
			writeErr(w, 400, "暂无可用更新")
			return
		}
		writeOK(w) // 先响应，避免客户端等待太久
		go func() {
			tmpPath, err := downloadUpdate(downloadURL, version)
			if err != nil {
				return
			}
			if err := launchUpdater(tmpPath); err != nil {
				return
			}
			systray.Quit()
		}()
		return
	}

	// ── 版本检查 ──────────────────────────────────────────────────────────────

	// GET /api/version?force=1
	if method == "GET" && path == "/api/version" {
		if r.URL.Query().Get("force") == "1" {
			// 清除缓存，强制重新检查
			versionCacheMu.Lock()
			versionCacheResult = nil
			versionCacheMu.Unlock()
		}
		writeJSON(w, 200, getVersionInfo())
		return
	}

	// ── 扩展心跳 ──────────────────────────────────────────────────────────────

	// POST /api/extension/ping
	if method == "POST" && path == "/api/extension/ping" {
		lastExtensionPing.Store(time.Now().UnixMilli())
		writeOK(w)
		return
	}

	// GET /api/extension/status
	if method == "GET" && path == "/api/extension/status" {
		installed := (time.Now().UnixMilli() - lastExtensionPing.Load()) < 5*60*1000
		writeJSON(w, 200, map[string]any{"installed": installed})
		return
	}

	// ── 数据目录内的静态文件（HTML 页面 + 截图）───────────────────────────────

	// GET /pages/:id.html
	if method == "GET" && strings.HasPrefix(path, "/pages/") && strings.HasSuffix(path, ".html") {
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/pages/"), ".html")
		bm, err := getBookmark(id)
		if err != nil || bm == nil {
			http.NotFound(w, r)
			return
		}
		data, err := os.ReadFile(getAbsoluteFilePath(bm.FilePath))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		html := string(data)
		cleanupScript := `<script>
(function(){
	var isDiscourse=!!document.querySelector('.post-stream');
	if(!isDiscourse)return;
	document.querySelectorAll('.post-stream--cloaked').forEach(function(el){el.remove();});
	document.querySelectorAll('[data-cc-id]').forEach(function(el){
		el.removeAttribute('data-cc-id');el.removeAttribute('data-cc-visible');
	});
})();
</script>`
		if strings.Contains(html, "</body>") {
			html = strings.Replace(html, "</body>", cleanupScript+"</body>", 1)
		} else {
			html += cleanupScript
		}
		for k, v := range corsHeaders {
			w.Header().Set(k, v)
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, html)
		return
	}

	// GET /pages/:id.png
	if method == "GET" && strings.HasPrefix(path, "/pages/") && strings.HasSuffix(path, ".png") {
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/pages/"), ".png")
		bm, err := getBookmark(id)
		if err != nil || bm == nil || bm.ThumbPath == "" {
			http.NotFound(w, r)
			return
		}
		data, err := os.ReadFile(getAbsoluteFilePath(bm.ThumbPath))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		for k, v := range corsHeaders {
			w.Header().Set(k, v)
		}
		w.Header().Set("Content-Type", "image/png")
		w.Write(data)
		return
	}

	// ── 嵌入的前端静态文件（React SPA）────────────────────────────────────────
	if method == "GET" && staticFS != nil {
		// 有文件扩展名：尝试直接读取
		if ext := filepath.Ext(path); ext != "" {
			filePath := strings.TrimPrefix(path, "/")
			if data, err := fs.ReadFile(staticFS, filePath); err == nil {
				mime := mimeByExt(ext)
				w.Header().Set("Content-Type", mime)
				w.Write(data)
				return
			}
		}
		// SPA fallback：返回 index.html
		if data, err := fs.ReadFile(staticFS, "index.html"); err == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(data)
			return
		}
	}

	http.NotFound(w, r)
}

func mimeByExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".html":
		return "text/html; charset=utf-8"
	case ".js", ".mjs":
		return "application/javascript"
	case ".css":
		return "text/css"
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".ico":
		return "image/x-icon"
	case ".json":
		return "application/json"
	case ".woff":
		return "font/woff"
	case ".woff2":
		return "font/woff2"
	default:
		return "application/octet-stream"
	}
}

// getVersionInfo 返回当前版本 + GitHub 最新版本（带 1 小时缓存）
func getVersionInfo() map[string]any {
	versionCacheMu.Lock()
	defer versionCacheMu.Unlock()

	if versionCacheResult != nil && time.Now().Before(versionCacheExpires) {
		return versionCacheResult
	}

	result := map[string]any{
		"current":         Version,
		"latest":          Version,
		"updateAvailable": false,
		"releasesUrl":     releasesPage,
	}

	// 调 GitHub API 获取最新 release
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get("https://api.github.com/repos/" + githubRepo + "/releases/latest")
	if err == nil && resp.StatusCode == 200 {
		defer resp.Body.Close()
		var release struct {
			TagName string `json:"tag_name"`
		}
		if json.NewDecoder(resp.Body).Decode(&release) == nil && release.TagName != "" {
			result["latest"] = release.TagName
			result["updateAvailable"] = release.TagName != Version && Version != "dev"
			result["downloadUrl"] = "https://github.com/" + githubRepo + "/releases/download/" + release.TagName + "/chrome-collect.exe"
		}
	}

	versionCacheResult = result
	versionCacheExpires = time.Now().Add(1 * time.Hour)
	return result
}
