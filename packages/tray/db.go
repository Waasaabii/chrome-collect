package main

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// ── 全局变量 ──────────────────────────────────────────────────────────────────

var (
	db      *sql.DB
	dataDir string // 数据目录绝对路径
)

const trashRetentionMs = 7 * 24 * 60 * 60 * 1000 // 7天

// ── 数据类型 ──────────────────────────────────────────────────────────────────

type Bookmark struct {
	ID         string `json:"id"`
	URL        string `json:"url"`
	Title      string `json:"title"`
	Alias      string `json:"alias"`
	Favicon    string `json:"favicon"`
	FilePath   string `json:"file_path"`
	ThumbPath  string `json:"thumb_path"`
	FileSize   int64  `json:"file_size"`
	CreatedAt  int64  `json:"created_at"`
	DeletedAt  int64  `json:"deleted_at"`
	Notes      string `json:"notes"`
	Tags       string `json:"tags"`
	BookmarkID string `json:"bookmark_id"`
}

type SaveInput struct {
	URL        string `json:"url"`
	Title      string `json:"title"`
	Favicon    string `json:"favicon"`
	HTML       string `json:"html"`
	Screenshot string `json:"screenshot"` // base64 data URI
	BookmarkID string `json:"bookmarkId"`
}

// ── 初始化 ────────────────────────────────────────────────────────────────────

func initDB(rootDir string) {
	dataDir = filepath.Join(rootDir, "data")
	pagesDir := filepath.Join(dataDir, "pages")
	dbPath := filepath.Join(dataDir, "collect.db")

	if err := os.MkdirAll(pagesDir, 0755); err != nil {
		log.Fatal("创建数据目录失败:", err)
	}

	var err error
	db, err = sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		log.Fatal("打开数据库失败:", err)
	}

	// 建表
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS bookmarks (
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
	)`)
	if err != nil {
		log.Fatal("建表失败:", err)
	}

	// 迁移：添加列（忽略已存在错误）
	for _, col := range []string{
		"ALTER TABLE bookmarks ADD COLUMN deleted_at INTEGER DEFAULT 0",
		"ALTER TABLE bookmarks ADD COLUMN notes TEXT DEFAULT ''",
	} {
		db.Exec(col) // 忽略错误
	}

	// 启动时迁移旧文件
	migrateOldFiles()

	// 清理过期回收站
	purged := purgeExpiredTrash()
	if purged > 0 {
		log.Printf("[启动清理] 已永久删除 %d 条过期回收站条目", purged)
	}
}

// ── 文件名工具 ────────────────────────────────────────────────────────────────

var illegalCharsRe = regexp.MustCompile(`[\\/:*?"<>|\r\n\t]`)
var multiUnderscoreRe = regexp.MustCompile(`_+`)

func getDomain(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.Hostname() == "" {
		return "unknown"
	}
	return u.Hostname()
}

func sanitizeFilename(name string, maxLen int) string {
	safe := illegalCharsRe.ReplaceAllString(name, "_")
	safe = multiUnderscoreRe.ReplaceAllString(safe, "_")
	safe = strings.Trim(safe, ". ")
	if maxLen <= 0 {
		maxLen = 80
	}
	// 按 rune 截断，避免切断多字节字符
	if utf8.RuneCountInString(safe) > maxLen {
		runes := []rune(safe)
		safe = string(runes[:maxLen])
	}
	if safe == "" {
		return "untitled"
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

func getAbsoluteFilePath(relativePath string) string {
	return filepath.Join(dataDir, filepath.FromSlash(relativePath))
}

func toRelativePath(absPath string) string {
	rel, err := filepath.Rel(dataDir, absPath)
	if err != nil {
		return absPath
	}
	return filepath.ToSlash(rel)
}

// ── 数据库操作 ────────────────────────────────────────────────────────────────

func scanBookmark(row interface {
	Scan(dest ...any) error
}) (*Bookmark, error) {
	bm := &Bookmark{}
	err := row.Scan(
		&bm.ID, &bm.URL, &bm.Title, &bm.Alias, &bm.Favicon,
		&bm.FilePath, &bm.ThumbPath, &bm.FileSize, &bm.CreatedAt,
		&bm.Tags, &bm.BookmarkID, &bm.DeletedAt, &bm.Notes,
	)
	return bm, err
}

func saveBookmark(input SaveInput) (*Bookmark, error) {
	id := uuid.New().String()
	now := time.Now().UnixMilli()

	domain := getDomain(input.URL)
	domainDir := filepath.Join(dataDir, "pages", domain)
	if err := os.MkdirAll(domainDir, 0755); err != nil {
		return nil, fmt.Errorf("创建目录失败: %w", err)
	}

	safeTitle := sanitizeFilename(input.Title, 80)
	if safeTitle == "" {
		safeTitle = "untitled"
	}

	htmlPath := getUniqueFilePath(domainDir, safeTitle, ".html")
	if err := os.WriteFile(htmlPath, []byte(input.HTML), 0644); err != nil {
		return nil, fmt.Errorf("写 HTML 失败: %w", err)
	}
	fileSize := int64(len(input.HTML))
	htmlRelative := toRelativePath(htmlPath)

	thumbRelative := ""
	if strings.HasPrefix(input.Screenshot, "data:image/") {
		parts := strings.SplitN(input.Screenshot, ",", 2)
		if len(parts) == 2 {
			data, err := base64.StdEncoding.DecodeString(parts[1])
			if err == nil {
				thumbPath := getUniqueFilePath(domainDir, safeTitle, ".png")
				if err := os.WriteFile(thumbPath, data, 0644); err == nil {
					thumbRelative = toRelativePath(thumbPath)
				}
			}
		}
	}

	favicon := input.Favicon
	if len(favicon) > 100000 {
		favicon = ""
	}

	_, err := db.Exec(`INSERT INTO bookmarks
		(id, url, title, alias, favicon, file_path, thumb_path, file_size, created_at, bookmark_id, deleted_at, notes)
		VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, 0, '')`,
		id, input.URL, input.Title, favicon, htmlRelative, thumbRelative, fileSize, now, input.BookmarkID)
	if err != nil {
		return nil, fmt.Errorf("写入数据库失败: %w", err)
	}

	return getBookmark(id)
}

func getAllBookmarks(q, urlParam string, limit, offset int) ([]Bookmark, int, error) {
	where := "deleted_at = 0"
	args := []any{}

	if urlParam != "" {
		where += " AND url = ?"
		args = append(args, urlParam)
	} else if q != "" {
		where += " AND (title LIKE ? OR alias LIKE ? OR url LIKE ?)"
		like := "%" + q + "%"
		args = append(args, like, like, like)
	}

	var total int
	row := db.QueryRow("SELECT COUNT(*) FROM bookmarks WHERE "+where, args...)
	if err := row.Scan(&total); err != nil {
		return nil, 0, err
	}

	queryArgs := append(args, limit, offset)
	rows, err := db.Query("SELECT * FROM bookmarks WHERE "+where+" ORDER BY created_at DESC LIMIT ? OFFSET ?", queryArgs...)
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
		items = append(items, *bm)
	}
	if items == nil {
		items = []Bookmark{}
	}
	return items, total, nil
}

func getBookmark(id string) (*Bookmark, error) {
	row := db.QueryRow("SELECT * FROM bookmarks WHERE id = ?", id)
	bm, err := scanBookmark(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return bm, err
}

func updateAlias(id, alias string) (bool, error) {
	res, err := db.Exec("UPDATE bookmarks SET alias = ? WHERE id = ? AND deleted_at = 0", alias, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func updateNotes(id, notes string) (bool, error) {
	res, err := db.Exec("UPDATE bookmarks SET notes = ? WHERE id = ? AND deleted_at = 0", notes, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func softDeleteBookmark(id string) (bool, error) {
	bm, err := getBookmark(id)
	if err != nil || bm == nil || bm.DeletedAt > 0 {
		return false, err
	}
	_, err = db.Exec("UPDATE bookmarks SET deleted_at = ? WHERE id = ?", time.Now().UnixMilli(), id)
	return err == nil, err
}

func getTrashItems() ([]Bookmark, error) {
	rows, err := db.Query("SELECT * FROM bookmarks WHERE deleted_at > 0 ORDER BY deleted_at DESC")
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
		items = append(items, *bm)
	}
	if items == nil {
		items = []Bookmark{}
	}
	return items, nil
}

func getTrashCount() int {
	var c int
	db.QueryRow("SELECT COUNT(*) FROM bookmarks WHERE deleted_at > 0").Scan(&c)
	return c
}

func restoreBookmark(id string) (bool, error) {
	bm, err := getBookmark(id)
	if err != nil || bm == nil || bm.DeletedAt == 0 {
		return false, err
	}
	_, err = db.Exec("UPDATE bookmarks SET deleted_at = 0 WHERE id = ?", id)
	return err == nil, err
}

func permanentDelete(id string) (bool, error) {
	bm, err := getBookmark(id)
	if err != nil || bm == nil {
		return false, err
	}

	if bm.FilePath != "" {
		htmlFile := getAbsoluteFilePath(bm.FilePath)
		os.Remove(htmlFile)

		// 清理空目录
		dir := filepath.Dir(htmlFile)
		entries, err := os.ReadDir(dir)
		if err == nil && len(entries) == 0 {
			os.Remove(dir)
		}
	}

	if bm.ThumbPath != "" {
		os.Remove(getAbsoluteFilePath(bm.ThumbPath))
	}

	_, err = db.Exec("DELETE FROM bookmarks WHERE id = ?", id)
	return err == nil, err
}

func emptyTrash() (int, error) {
	items, err := getTrashItems()
	if err != nil {
		return 0, err
	}
	count := 0
	for _, item := range items {
		if ok, _ := permanentDelete(item.ID); ok {
			count++
		}
	}
	return count, nil
}

func purgeExpiredTrash() int {
	cutoff := time.Now().UnixMilli() - trashRetentionMs
	rows, err := db.Query("SELECT * FROM bookmarks WHERE deleted_at > 0 AND deleted_at < ?", cutoff)
	if err != nil {
		return 0
	}
	defer rows.Close()

	var expired []Bookmark
	for rows.Next() {
		bm, err := scanBookmark(rows)
		if err == nil {
			expired = append(expired, *bm)
		}
	}
	rows.Close()

	count := 0
	for _, bm := range expired {
		if ok, _ := permanentDelete(bm.ID); ok {
			count++
		}
	}
	return count
}

func getStats() map[string]any {
	var total int
	var totalSize int64
	db.QueryRow("SELECT COUNT(*), COALESCE(SUM(file_size),0) FROM bookmarks WHERE deleted_at = 0").Scan(&total, &totalSize)
	return map[string]any{
		"total":      total,
		"totalSize":  totalSize,
		"trashCount": getTrashCount(),
	}
}

// ── 迁移旧文件（UUID 命名 → 域名/标题命名）────────────────────────────────────

func migrateOldFiles() {
	uuidPattern := regexp.MustCompile(`^pages/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.html$`)

	rows, err := db.Query("SELECT * FROM bookmarks")
	if err != nil {
		return
	}
	defer rows.Close()

	var toMigrate []Bookmark
	for rows.Next() {
		bm, err := scanBookmark(rows)
		if err == nil && uuidPattern.MatchString(bm.FilePath) {
			toMigrate = append(toMigrate, *bm)
		}
	}
	rows.Close()

	if len(toMigrate) == 0 {
		return
	}

	log.Printf("[迁移] 发现 %d 个旧格式文件，开始迁移...", len(toMigrate))

	for _, item := range toMigrate {
		domain := getDomain(item.URL)
		safeTitle := sanitizeFilename(item.Title, 80)
		if safeTitle == "" {
			safeTitle = sanitizeFilename(item.Alias, 80)
		}
		if safeTitle == "" {
			safeTitle = "untitled"
		}

		domainDir := filepath.Join(dataDir, "pages", domain)
		os.MkdirAll(domainDir, 0755)

		oldHtmlPath := getAbsoluteFilePath(item.FilePath)
		if _, err := os.Stat(oldHtmlPath); err != nil {
			continue
		}

		newHtmlPath := getUniqueFilePath(domainDir, safeTitle, ".html")
		if err := os.Rename(oldHtmlPath, newHtmlPath); err != nil {
			log.Printf("  ✗ 迁移失败: %s — %v", item.ID, err)
			continue
		}
		newHtmlRelative := toRelativePath(newHtmlPath)

		newThumbRelative := item.ThumbPath
		if item.ThumbPath != "" {
			oldThumbPath := getAbsoluteFilePath(item.ThumbPath)
			if _, err := os.Stat(oldThumbPath); err == nil {
				newThumbPath := getUniqueFilePath(domainDir, safeTitle, ".png")
				if err := os.Rename(oldThumbPath, newThumbPath); err == nil {
					newThumbRelative = toRelativePath(newThumbPath)
				}
			}
		}

		db.Exec("UPDATE bookmarks SET file_path = ?, thumb_path = ? WHERE id = ?",
			newHtmlRelative, newThumbRelative, item.ID)

		log.Printf("  ✓ %s → %s/%s", item.Title, domain, safeTitle)
	}
	log.Println("[迁移] 完成")
}
