package app

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

const (
	trashRetentionMs  = 7 * 24 * 60 * 60 * 1000
	metaLastExtension = "last_extension_ping"
	githubRepo        = "Waasaabii/chrome-collect"
	releasesPage      = "https://github.com/" + githubRepo + "/releases/latest"
)

type Service struct {
	dbPath             string
	dataDir            string
	db                 *sql.DB
	version            string
	versionCacheMu     sync.Mutex
	versionCacheResult VersionInfo
	versionCacheExpiry time.Time
}

type Bookmark struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	Title       string `json:"title"`
	Alias       string `json:"alias"`
	Favicon     string `json:"favicon"`
	FilePath    string `json:"file_path"`
	ThumbPath   string `json:"thumb_path"`
	ThumbData   string `json:"thumb_data_url,omitempty"`
	FileSize    int64  `json:"file_size"`
	CreatedAt   int64  `json:"created_at"`
	DeletedAt   int64  `json:"deleted_at"`
	Notes       string `json:"notes"`
	Tags        string `json:"tags"`
	BookmarkID  string `json:"bookmark_id"`
}

type SaveInput struct {
	URL        string `json:"url"`
	Title      string `json:"title"`
	Favicon    string `json:"favicon"`
	HTML       string `json:"html"`
	Screenshot string `json:"screenshot"`
	BookmarkID string `json:"bookmarkId"`
}

type BookmarksResult struct {
	Items []Bookmark `json:"items"`
	Total int        `json:"total"`
}

type Stats struct {
	Total      int   `json:"total"`
	TotalSize  int64 `json:"totalSize"`
	TrashCount int   `json:"trashCount"`
}

type Settings struct {
	Enabled            bool `json:"enabled"`
	AutoStart          bool `json:"autoStart"`
	ExtensionInstalled bool `json:"extensionInstalled"`
}

type VersionInfo struct {
	Current         string `json:"current"`
	Latest          string `json:"latest"`
	UpdateAvailable bool   `json:"updateAvailable"`
	ReleasesURL     string `json:"releasesUrl"`
	DownloadURL     string `json:"downloadUrl,omitempty"`
}

type BookmarkContent struct {
	Bookmark Bookmark `json:"bookmark"`
	HTML     string   `json:"html"`
}

type FileOperationResult struct {
	Path string `json:"path"`
}

type EmptyTrashResult struct {
	Deleted int `json:"deleted"`
}

type UpdateResult struct {
	Path string `json:"path"`
	URL  string `json:"url"`
}

func New(version string) (*Service, error) {
	rootDir, err := appRootDir()
	if err != nil {
		return nil, err
	}
	dataDir := filepath.Join(rootDir, "data")
	pagesDir := filepath.Join(dataDir, "pages")
	if err := os.MkdirAll(pagesDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建数据目录失败: %w", err)
	}

	dbPath := filepath.Join(dataDir, "collect.db")
	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}

	svc := &Service{
		dbPath:  dbPath,
		dataDir: dataDir,
		db:      db,
		version: version,
	}

	if err := svc.initSchema(); err != nil {
		return nil, err
	}
	svc.migrateOldFiles()
	svc.purgeExpiredTrash()
	return svc, nil
}

func (s *Service) Close() error {
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

func appRootDir() (string, error) {
	appData, err := os.UserConfigDir()
	if err != nil {
		exe, exeErr := os.Executable()
		if exeErr != nil {
			return "", err
		}
		return filepath.Join(filepath.Dir(exe), "ChromeCollect"), nil
	}
	return filepath.Join(appData, "ChromeCollect"), nil
}

func (s *Service) initSchema() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS bookmarks (
			id          TEXT PRIMARY KEY,
			url         TEXT NOT NULL,
			title       TEXT DEFAULT '',
			alias       TEXT DEFAULT '',
			favicon     TEXT DEFAULT '',
			file_path   TEXT DEFAULT '',
			thumb_path  TEXT DEFAULT '',
			file_size   INTEGER DEFAULT 0,
			created_at  INTEGER NOT NULL,
			tags        TEXT DEFAULT '[]',
			bookmark_id TEXT DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS app_meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`ALTER TABLE bookmarks ADD COLUMN deleted_at INTEGER DEFAULT 0`,
		`ALTER TABLE bookmarks ADD COLUMN notes TEXT DEFAULT ''`,
	}
	for index, stmt := range stmts {
		if index < 2 {
			if _, err := s.db.Exec(stmt); err != nil {
				return err
			}
			continue
		}
		_, _ = s.db.Exec(stmt)
	}
	return nil
}

func (s *Service) Hello() map[string]any {
	return map[string]any{
		"protocolVersion": 1,
		"version":         s.version,
		"platform":        runtime.GOOS,
	}
}

func (s *Service) SaveBookmark(input SaveInput) (*Bookmark, error) {
	if input.URL == "" || input.HTML == "" {
		return nil, errors.New("缺少 url 或 html 字段")
	}

	id := uuid.New().String()
	now := time.Now().UnixMilli()

	domainDir := filepath.Join(s.dataDir, "pages", getDomain(input.URL))
	if err := os.MkdirAll(domainDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建目录失败: %w", err)
	}

	safeTitle := sanitizeFilename(input.Title, 80)
	htmlPath := getUniqueFilePath(domainDir, safeTitle, ".html")
	if err := os.WriteFile(htmlPath, []byte(input.HTML), 0o644); err != nil {
		return nil, fmt.Errorf("写 HTML 失败: %w", err)
	}

	thumbRelative := ""
	if strings.HasPrefix(input.Screenshot, "data:image/") {
		parts := strings.SplitN(input.Screenshot, ",", 2)
		if len(parts) == 2 {
			if data, err := base64.StdEncoding.DecodeString(parts[1]); err == nil {
				thumbPath := getUniqueFilePath(domainDir, safeTitle, ".png")
				if err := os.WriteFile(thumbPath, data, 0o644); err == nil {
					thumbRelative = toRelativePath(s.dataDir, thumbPath)
				}
			}
		}
	}

	favicon := input.Favicon
	if len(favicon) > 100000 {
		favicon = ""
	}

	_, err := s.db.Exec(`INSERT INTO bookmarks
		(id, url, title, alias, favicon, file_path, thumb_path, file_size, created_at, bookmark_id, deleted_at, notes)
		VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, 0, '')`,
		id,
		input.URL,
		input.Title,
		favicon,
		toRelativePath(s.dataDir, htmlPath),
		thumbRelative,
		int64(len(input.HTML)),
		now,
		input.BookmarkID,
	)
	if err != nil {
		return nil, fmt.Errorf("写入数据库失败: %w", err)
	}

	return s.GetBookmark(id)
}

func (s *Service) ExistsByURL(rawURL string) (bool, error) {
	items, _, err := s.listBookmarks("", rawURL, 1, 0)
	return len(items) > 0, err
}

func (s *Service) ListBookmarks(limit, offset int, q string) (*BookmarksResult, error) {
	items, total, err := s.listBookmarks(q, "", limit, offset)
	if err != nil {
		return nil, err
	}
	return &BookmarksResult{Items: items, Total: total}, nil
}

func (s *Service) ListRecentBookmarks(limit int) ([]Bookmark, error) {
	if limit <= 0 {
		limit = 5
	}
	items, _, err := s.listBookmarks("", "", limit, 0)
	return items, err
}

func (s *Service) listBookmarks(q, urlParam string, limit, offset int) ([]Bookmark, int, error) {
	if limit <= 0 {
		limit = 50
	}
	where := "deleted_at = 0"
	args := []any{}
	if urlParam != "" {
		where += " AND url = ?"
		args = append(args, urlParam)
	} else if q != "" {
		where += " AND (title LIKE ? OR alias LIKE ? OR url LIKE ? OR notes LIKE ?)"
		like := "%" + q + "%"
		args = append(args, like, like, like, like)
	}

	var total int
	row := s.db.QueryRow("SELECT COUNT(*) FROM bookmarks WHERE "+where, args...)
	if err := row.Scan(&total); err != nil {
		return nil, 0, err
	}

	queryArgs := append(args, limit, offset)
	rows, err := s.db.Query("SELECT * FROM bookmarks WHERE "+where+" ORDER BY created_at DESC LIMIT ? OFFSET ?", queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []Bookmark
	for rows.Next() {
		bm, err := scanBookmark(rows)
		if err != nil {
			return nil, 0, err
		}
		s.attachThumbData(bm)
		items = append(items, *bm)
	}
	if items == nil {
		items = []Bookmark{}
	}
	return items, total, nil
}

func (s *Service) GetBookmark(id string) (*Bookmark, error) {
	row := s.db.QueryRow("SELECT * FROM bookmarks WHERE id = ?", id)
	bm, err := scanBookmark(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	s.attachThumbData(bm)
	return bm, nil
}

func (s *Service) GetBookmarkHTML(id string) (*BookmarkContent, error) {
	bm, err := s.GetBookmark(id)
	if err != nil {
		return nil, err
	}
	if bm == nil {
		return nil, sql.ErrNoRows
	}
	data, err := os.ReadFile(getAbsoluteFilePath(s.dataDir, bm.FilePath))
	if err != nil {
		return nil, err
	}
	return &BookmarkContent{
		Bookmark: *bm,
		HTML:     string(data),
	}, nil
}

func (s *Service) UpdateAlias(id, alias string) error {
	result, err := s.db.Exec("UPDATE bookmarks SET alias = ? WHERE id = ? AND deleted_at = 0", alias, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Service) UpdateNotes(id, notes string) error {
	result, err := s.db.Exec("UPDATE bookmarks SET notes = ? WHERE id = ? AND deleted_at = 0", notes, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Service) DeleteBookmark(id string) error {
	bm, err := s.GetBookmark(id)
	if err != nil {
		return err
	}
	if bm == nil || bm.DeletedAt > 0 {
		return sql.ErrNoRows
	}
	_, err = s.db.Exec("UPDATE bookmarks SET deleted_at = ? WHERE id = ?", time.Now().UnixMilli(), id)
	return err
}

func (s *Service) ListTrash() ([]Bookmark, error) {
	rows, err := s.db.Query("SELECT * FROM bookmarks WHERE deleted_at > 0 ORDER BY deleted_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Bookmark
	for rows.Next() {
		bm, err := scanBookmark(rows)
		if err != nil {
			return nil, err
		}
		s.attachThumbData(bm)
		items = append(items, *bm)
	}
	if items == nil {
		items = []Bookmark{}
	}
	return items, nil
}

func (s *Service) RestoreBookmark(id string) error {
	bm, err := s.GetBookmark(id)
	if err != nil {
		return err
	}
	if bm == nil || bm.DeletedAt == 0 {
		return sql.ErrNoRows
	}
	_, err = s.db.Exec("UPDATE bookmarks SET deleted_at = 0 WHERE id = ?", id)
	return err
}

func (s *Service) PermanentDelete(id string) error {
	row := s.db.QueryRow("SELECT * FROM bookmarks WHERE id = ?", id)
	bm, err := scanBookmark(row)
	if err == sql.ErrNoRows {
		return sql.ErrNoRows
	}
	if err != nil {
		return err
	}

	if bm.FilePath != "" {
		htmlFile := getAbsoluteFilePath(s.dataDir, bm.FilePath)
		_ = os.Remove(htmlFile)
		dir := filepath.Dir(htmlFile)
		if entries, err := os.ReadDir(dir); err == nil && len(entries) == 0 {
			_ = os.Remove(dir)
		}
	}
	if bm.ThumbPath != "" {
		_ = os.Remove(getAbsoluteFilePath(s.dataDir, bm.ThumbPath))
	}
	_, err = s.db.Exec("DELETE FROM bookmarks WHERE id = ?", id)
	return err
}

func (s *Service) EmptyTrash() (*EmptyTrashResult, error) {
	items, err := s.ListTrash()
	if err != nil {
		return nil, err
	}
	count := 0
	for _, item := range items {
		if err := s.PermanentDelete(item.ID); err == nil {
			count++
		}
	}
	return &EmptyTrashResult{Deleted: count}, nil
}

func (s *Service) GetStats() Stats {
	var total int
	var totalSize int64
	_ = s.db.QueryRow("SELECT COUNT(*), COALESCE(SUM(file_size), 0) FROM bookmarks WHERE deleted_at = 0").Scan(&total, &totalSize)
	return Stats{
		Total:      total,
		TotalSize:  totalSize,
		TrashCount: s.getTrashCount(),
	}
}

func (s *Service) GetSettings() Settings {
	autoStart := isAutoStartEnabled()
	return Settings{
		Enabled:            autoStart,
		AutoStart:          autoStart,
		ExtensionInstalled: s.IsExtensionInstalled(),
	}
}

func (s *Service) SetAutoStart(enabled bool) (Settings, error) {
	if err := setAutoStart(enabled); err != nil {
		return Settings{}, err
	}
	return s.GetSettings(), nil
}

func (s *Service) PingExtension() error {
	return s.setMeta(metaLastExtension, fmt.Sprintf("%d", time.Now().UnixMilli()))
}

func (s *Service) IsExtensionInstalled() bool {
	value, err := s.getMeta(metaLastExtension)
	if err != nil || value == "" {
		return false
	}
	unixMs, convErr := parseInt64(value)
	if convErr != nil {
		return false
	}
	return (time.Now().UnixMilli() - unixMs) < 5*60*1000
}

func (s *Service) GetVersionInfo(force bool) (VersionInfo, error) {
	s.versionCacheMu.Lock()
	defer s.versionCacheMu.Unlock()

	if !force && s.versionCacheExpiry.After(time.Now()) && s.versionCacheResult.Current != "" {
		return s.versionCacheResult, nil
	}

	info := VersionInfo{
		Current:         s.version,
		Latest:          s.version,
		UpdateAvailable: false,
		ReleasesURL:     releasesPage,
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://api.github.com/repos/"+githubRepo+"/releases/latest", nil)
	if err != nil {
		return info, err
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		var release struct {
			TagName string `json:"tag_name"`
			Assets  []struct {
				Name string `json:"name"`
				URL  string `json:"browser_download_url"`
			} `json:"assets"`
		}
		if decodeErr := json.NewDecoder(resp.Body).Decode(&release); decodeErr == nil && release.TagName != "" {
			info.Latest = release.TagName
			info.UpdateAvailable = release.TagName != s.version && s.version != "dev"
			info.DownloadURL = pickInstallerURL(release.Assets)
		}
	}

	s.versionCacheResult = info
	s.versionCacheExpiry = time.Now().Add(time.Hour)
	return info, nil
}

func (s *Service) StartUpdate() (*UpdateResult, error) {
	info, err := s.GetVersionInfo(true)
	if err != nil {
		return nil, err
	}
	if info.DownloadURL == "" {
		return nil, errors.New("暂无可用更新")
	}
	filePath, err := downloadInstaller(info.DownloadURL, info.Latest)
	if err != nil {
		return nil, err
	}
	if err := launchInstaller(filePath); err != nil {
		return nil, err
	}
	return &UpdateResult{
		Path: filePath,
		URL:  info.DownloadURL,
	}, nil
}

func (s *Service) DownloadBookmarkHTML(id string) (*FileOperationResult, error) {
	content, err := s.GetBookmarkHTML(id)
	if err != nil {
		return nil, err
	}
	targetDir, err := downloadsDir()
	if err != nil {
		return nil, err
	}
	name := content.Bookmark.Alias
	if name == "" {
		name = content.Bookmark.Title
	}
	if name == "" {
		name = content.Bookmark.ID
	}
	name = sanitizeFilename(name, 80) + ".html"
	targetPath := getUniqueFilePath(targetDir, strings.TrimSuffix(name, ".html"), ".html")
	if err := os.WriteFile(targetPath, []byte(content.HTML), 0o644); err != nil {
		return nil, err
	}
	return &FileOperationResult{Path: targetPath}, nil
}

func (s *Service) OpenBookmarkFolder(id string) (*FileOperationResult, error) {
	bm, err := s.GetBookmark(id)
	if err != nil {
		return nil, err
	}
	if bm == nil {
		return nil, sql.ErrNoRows
	}
	filePath := filepath.FromSlash(getAbsoluteFilePath(s.dataDir, bm.FilePath))
	if err := openFolder(filePath); err != nil {
		return nil, err
	}
	return &FileOperationResult{Path: filePath}, nil
}

func (s *Service) OpenExternal(rawURL string) error {
	if rawURL == "" {
		return errors.New("缺少 url")
	}
	return openExternal(rawURL)
}

func (s *Service) getTrashCount() int {
	var count int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM bookmarks WHERE deleted_at > 0").Scan(&count)
	return count
}

func (s *Service) attachThumbData(bm *Bookmark) {
	if bm == nil || bm.ThumbPath == "" {
		return
	}
	data, err := os.ReadFile(getAbsoluteFilePath(s.dataDir, bm.ThumbPath))
	if err != nil {
		return
	}
	bm.ThumbData = "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
}

func scanBookmark(row interface{ Scan(dest ...any) error }) (*Bookmark, error) {
	bm := &Bookmark{}
	err := row.Scan(
		&bm.ID,
		&bm.URL,
		&bm.Title,
		&bm.Alias,
		&bm.Favicon,
		&bm.FilePath,
		&bm.ThumbPath,
		&bm.FileSize,
		&bm.CreatedAt,
		&bm.Tags,
		&bm.BookmarkID,
		&bm.DeletedAt,
		&bm.Notes,
	)
	return bm, err
}

func (s *Service) setMeta(key, value string) error {
	_, err := s.db.Exec(`INSERT INTO app_meta (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

func (s *Service) getMeta(key string) (string, error) {
	var value string
	err := s.db.QueryRow("SELECT value FROM app_meta WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (s *Service) purgeExpiredTrash() {
	cutoff := time.Now().UnixMilli() - trashRetentionMs
	rows, err := s.db.Query("SELECT id FROM bookmarks WHERE deleted_at > 0 AND deleted_at < ?", cutoff)
	if err != nil {
		return
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	for _, id := range ids {
		_ = s.PermanentDelete(id)
	}
}

func (s *Service) migrateOldFiles() {
	uuidPattern := regexp.MustCompile(`^pages/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.html$`)
	rows, err := s.db.Query("SELECT * FROM bookmarks")
	if err != nil {
		return
	}
	defer rows.Close()

	var items []Bookmark
	for rows.Next() {
		bm, err := scanBookmark(rows)
		if err == nil && uuidPattern.MatchString(bm.FilePath) {
			items = append(items, *bm)
		}
	}
	for _, item := range items {
		domainDir := filepath.Join(s.dataDir, "pages", getDomain(item.URL))
		_ = os.MkdirAll(domainDir, 0o755)
		safeTitle := sanitizeFilename(item.Title, 80)
		if safeTitle == "untitled" && item.Alias != "" {
			safeTitle = sanitizeFilename(item.Alias, 80)
		}
		oldHTML := getAbsoluteFilePath(s.dataDir, item.FilePath)
		if _, err := os.Stat(oldHTML); err != nil {
			continue
		}
		newHTML := getUniqueFilePath(domainDir, safeTitle, ".html")
		if err := os.Rename(oldHTML, newHTML); err != nil {
			continue
		}
		newThumb := item.ThumbPath
		if item.ThumbPath != "" {
			oldThumb := getAbsoluteFilePath(s.dataDir, item.ThumbPath)
			if _, err := os.Stat(oldThumb); err == nil {
				target := getUniqueFilePath(domainDir, safeTitle, ".png")
				if err := os.Rename(oldThumb, target); err == nil {
					newThumb = toRelativePath(s.dataDir, target)
				}
			}
		}
		_, _ = s.db.Exec("UPDATE bookmarks SET file_path = ?, thumb_path = ? WHERE id = ?", toRelativePath(s.dataDir, newHTML), newThumb, item.ID)
	}
}

var illegalCharsRe = regexp.MustCompile(`[\\/:*?"<>|\r\n\t]`)
var multiUnderscoreRe = regexp.MustCompile(`_+`)

func getDomain(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Hostname() == "" {
		return "unknown"
	}
	return parsed.Hostname()
}

func sanitizeFilename(name string, maxLen int) string {
	safe := illegalCharsRe.ReplaceAllString(name, "_")
	safe = multiUnderscoreRe.ReplaceAllString(safe, "_")
	safe = strings.Trim(safe, ". ")
	if safe == "" {
		safe = "untitled"
	}
	if maxLen > 0 && utf8.RuneCountInString(safe) > maxLen {
		runes := []rune(safe)
		safe = string(runes[:maxLen])
	}
	return safe
}

func getUniqueFilePath(dir, baseName, ext string) string {
	path := filepath.Join(dir, baseName+ext)
	counter := 1
	for {
		if _, err := os.Stat(path); os.IsNotExist(err) {
			return path
		}
		path = filepath.Join(dir, fmt.Sprintf("%s_%d%s", baseName, counter, ext))
		counter++
	}
}

func getAbsoluteFilePath(dataDir, relativePath string) string {
	return filepath.Join(dataDir, filepath.FromSlash(relativePath))
}

func toRelativePath(dataDir, absPath string) string {
	rel, err := filepath.Rel(dataDir, absPath)
	if err != nil {
		return absPath
	}
	return filepath.ToSlash(rel)
}

func pickInstallerURL(assets []struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}) string {
	suffix := ".pkg"
	if runtime.GOOS == "windows" {
		suffix = ".msi"
	}
	for _, asset := range assets {
		if strings.HasSuffix(strings.ToLower(asset.Name), suffix) {
			return asset.URL
		}
	}
	return ""
}

func downloadInstaller(downloadURL, version string) (string, error) {
	fileName := fmt.Sprintf("chrome-collect-%s", version)
	if runtime.GOOS == "windows" {
		fileName += ".msi"
	} else {
		fileName += ".pkg"
	}
	tmpPath := filepath.Join(os.TempDir(), fileName)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("下载失败: HTTP %d", resp.StatusCode)
	}
	file, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return "", err
	}
	defer file.Close()
	if _, err := io.Copy(file, resp.Body); err != nil {
		return "", err
	}
	return tmpPath, nil
}

func downloadsDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Downloads"), os.MkdirAll(filepath.Join(home, "Downloads"), 0o755)
}

func parseInt64(value string) (int64, error) {
	return strconv.ParseInt(value, 10, 64)
}
