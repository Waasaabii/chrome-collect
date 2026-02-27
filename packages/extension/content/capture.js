/**
 * capture.js — 页面资源完整内联化脚本
 * 注入到用户当前打开的页面中执行，将所有外部资源转为 base64 内联
 * 最终返回一个零外部依赖的自包含 HTML 字符串
 */

// 文件级 ID 计数器，供所有函数共享
let _ccIdCounter = 0;

(async function captureCurrentPage() {
    // ── 1. 等待页面完全加载 ─────────────────────────────────────────────────────
    if (document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
    }

    // ── 2. 检测是否存在虚拟滚动 ──────────────────────────────────────────────────
    const hasVirtualScroll = !!document.querySelector('.post-stream');

    let savedRemovedNodes = [];
    if (hasVirtualScroll) {
        // ── 虚拟滚动路径：标记 + MutationObserver + 恢复 ──
        // 给所有元素打标记（用于后续在 clone 中定位）
        document.querySelectorAll('*').forEach(el => {
            el.setAttribute('data-cc-id', String(_ccIdCounter++));
        });
        const result = await scrollAndCaptureVirtualScroll();
        savedRemovedNodes = result.removedNodes;
    } else {
        // ── 普通路径：只滚动触发懒加载，不做复杂标记 ──
        await scrollForLazyLoad();
    }

    // ── 3. 提取 favicon ──────────────────────────────────────────────────────────
    const favicon = await extractFavicon();

    // ── 4. 克隆完整 DOM ──────────────────────────────────────────────────────────
    const clone = document.documentElement.cloneNode(true);

    // ── 4.1 把虚拟滚动移除的节点放回 clone（仅虚拟滚动路径）─────────────────────
    if (hasVirtualScroll) {
        restoreRemovedNodes(clone, savedRemovedNodes);
    }

    // 移除所有 <script> 标签（静态化不需要 JS）
    clone.querySelectorAll('script').forEach(el => el.remove());
    // 移除 noscript（已无 JS 环境，显示 noscript 内容可能干扰布局）
    clone.querySelectorAll('noscript').forEach(el => el.remove());

    // 移除所有会触发外部请求的 <link> 标签
    const removeSelectors = [
        'link[rel="preload"]',
        'link[rel="modulepreload"]',
        'link[rel="prefetch"]',
        'link[rel="preconnect"]',
        'link[rel="dns-prefetch"]',
        'link[rel="manifest"]',
        'link[rel="prerender"]',
        'link[as="script"]',
    ];
    clone.querySelectorAll(removeSelectors.join(',')).forEach(el => el.remove());

    // 移除 <base> 标签（防止相对路径被解析到错误的域名）
    clone.querySelectorAll('base').forEach(el => el.remove());

    // 移除 <iframe>（无法静态化，且会触发外部请求或 X-Frame-Options 错误）
    clone.querySelectorAll('iframe').forEach(el => el.remove());

    // 移除 <meta http-equiv="Content-Security-Policy">（可能阻止内联资源显示）
    clone.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach(el => el.remove());

    // 移除 <meta> refresh 跳转
    clone.querySelectorAll('meta[http-equiv="refresh"]').forEach(el => el.remove());

    // 移除 <object> <embed> <applet>（过时元素，可能触发外部请求）
    clone.querySelectorAll('object, embed, applet').forEach(el => el.remove());

    // 移除 <video> <audio> 的 src（留下 poster 图片稍后内联）
    clone.querySelectorAll('video[src], audio[src]').forEach(el => {
        el.removeAttribute('src');
        el.querySelectorAll('source').forEach(s => s.remove());
    });

    // ── 5. 清理虚拟滚动占位（仅虚拟滚动路径）──────────────────────────────────
    if (hasVirtualScroll) {
        removeVirtualScrollGaps(clone);
    }

    // ── 6. 内联所有 <link rel="stylesheet"> ─────────────────────────────────────
    await inlineStylesheets(clone);

    // ── 7. 冻结展开/折叠等动态状态（将 computed style 写入 inline）──────────────
    freezeVisibilityStates(clone);

    // ── 8. 内联所有图片资源 ──────────────────────────────────────────────────────
    await inlineImages(clone);

    // ── 9. 内联所有 CSS 中的 url()（背景图、字体等）────────────────────────────
    await inlineCSSUrlsInStyleTags(clone);

    // ── 10. 内联 <canvas> 元素 ────────────────────────────────────────────────────
    inlineCanvases(clone);

    // ── 11. 修正相对链接 → 绝对 URL ─────────────────────────────────────────────
    absolutifyLinks(clone);

    // ── 12. 再次清理恢复节点后可能带入的空白占位（仅虚拟滚动路径）────────────────
    if (hasVirtualScroll) {
        removeVirtualScrollGaps(clone);
    }

    // ── 13. 移除内部标记 data-cc-id / data-cc-visible（不应出现在最终输出中）──
    clone.querySelectorAll('[data-cc-id]').forEach(el => el.removeAttribute('data-cc-id'));
    clone.querySelectorAll('[data-cc-visible]').forEach(el => el.removeAttribute('data-cc-visible'));

    // ── 13. 生成完整 HTML ─────────────────────────────────────────────────────────
    const html = '<!DOCTYPE html>\n' + clone.outerHTML;

    return {
        title: document.title,
        favicon,
        html,
    };
})();


// ═══════════════════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 简单滚动触发懒加载（普通页面用）
 * 不做任何标记和 MutationObserver，只是从上到下滚一遍让图片懒加载触发
 */
async function scrollForLazyLoad() {
    const origScrollY = window.scrollY;
    const maxHeight = document.body.scrollHeight;
    const step = window.innerHeight;

    window.scrollTo(0, 0);
    await sleep(300);

    for (let y = 0; y <= maxHeight; y += step) {
        window.scrollTo(0, y);
        await sleep(120);
    }

    // 恢复到用户原始位置
    window.scrollTo(0, origScrollY);
    await sleep(200);

    // 等待所有图片加载完成（最多 5 秒）
    const imgs = [...document.querySelectorAll('img')];
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        const allLoaded = imgs.every(img => img.complete && (img.naturalWidth > 0 || img.src === ''));
        if (allLoaded) break;
        await sleep(300);
    }
    await sleep(200);
}

/**
 * 虚拟滚动捕获（Discourse 等使用虚拟滚动的页面用）
 * 滚动遍历 + MutationObserver 捕获被移除的节点 + 标记可视元素
 */
async function scrollAndCaptureVirtualScroll() {
    const origScrollY = window.scrollY;
    const maxHeight = document.body.scrollHeight;
    const step = window.innerHeight;

    // 记录所有被移除的内容节点（用 Map 按 data-cc-id 去重，只保留最新版本）
    const removedMap = new Map();
    // 记录当前仍在 DOM 中的节点 id（用于最终判断哪些真正缺失）
    const reAddedIds = new Set();

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            // 记录被移除的节点
            for (const node of mutation.removedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'LINK') continue;

                const ccId = node.getAttribute('data-cc-id');
                if (!ccId) continue;

                // 只保存有实际内容的节点（必须被标记为可视过）
                if (!node.hasAttribute('data-cc-visible')) continue;

                const parentId = mutation.target.getAttribute('data-cc-id');
                if (!parentId) continue;

                removedMap.set(ccId, {
                    clone: node.cloneNode(true),
                    parentId: parentId,
                    ccId: ccId,
                });
                reAddedIds.delete(ccId);
            }

            // 记录被重新添加的节点（虚拟滚动来回切换时会重复添加）
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                const ccId = node.getAttribute('data-cc-id');
                if (ccId) {
                    reAddedIds.add(ccId);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // 从顶部到底部逐步滚动
    window.scrollTo(0, 0);
    await sleep(300);

    for (let y = 0; y <= maxHeight; y += step) {
        window.scrollTo(0, y);
        await sleep(120);

        // ── 标记当前视口内可见的元素 ──
        markVisibleElements();
    }
    // 滚到最底部后再标记一次
    markVisibleElements();

    observer.disconnect();

    // 恢复到用户原始位置
    window.scrollTo(0, origScrollY);
    await sleep(200);

    // 过滤：只保留最终不在 DOM 中的节点（排除被重新添加的）
    const removedNodes = [];
    for (const [ccId, item] of removedMap) {
        if (!reAddedIds.has(ccId)) {
            removedNodes.push(item);
        }
    }

    // 等待所有图片加载完成（最多 5 秒）
    const imgs = [...document.querySelectorAll('img')];
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        const allLoaded = imgs.every(img => img.complete && (img.naturalWidth > 0 || img.src === ''));
        if (allLoaded) break;
        await sleep(300);
    }

    await sleep(200);
    return { removedNodes };
}

/**
 * 标记当前视口中可见的元素（打 data-cc-visible 属性）
 * 滚动遍历时每个位置都调用，确保每个曾经在视口中出现过的元素都被标记。
 * 被虚拟滚动移除的节点已经带有标记，MutationObserver 克隆时会保留。
 *
 * 关键：虚拟滚动框架（如 Discourse）在 uncloaking 时会创建全新的 DOM 节点，
 * 这些节点没有 data-cc-id，需要在此补打，否则 MutationObserver 无法跟踪。
 */
function markVisibleElements() {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // ── 步骤 1：给所有新出现的元素补打 data-cc-id ──
    // 虚拟滚动框架 uncloaking 时会创建全新 DOM 节点，没有 data-cc-id
    document.querySelectorAll('*:not([data-cc-id])').forEach(el => {
        el.setAttribute('data-cc-id', String(_ccIdCounter++));
    });

    // ── 步骤 2：标记视口内可见的元素 ──
    const candidates = document.querySelectorAll('[data-cc-id]');
    for (const el of candidates) {
        // 已标记的跳过
        if (el.hasAttribute('data-cc-visible')) continue;

        const rect = el.getBoundingClientRect();
        // 元素不在视口内 → 跳过
        if (rect.bottom < 0 || rect.top > viewportHeight) continue;
        if (rect.right < 0 || rect.left > viewportWidth) continue;
        // 零尺寸元素跳过（不可见）
        if (rect.width === 0 && rect.height === 0) continue;

        // 标记为可视
        el.setAttribute('data-cc-visible', '');

        // 同时标记它的所有子元素（确保子树都被标记）
        el.querySelectorAll('[data-cc-id]').forEach(child => {
            child.setAttribute('data-cc-visible', '');
        });
    }
}

/**
 * 把 MutationObserver 捕获的被移除节点放回 clone 对应的父元素中
 */
function restoreRemovedNodes(clone, removedNodes) {
    if (!removedNodes || removedNodes.length === 0) return;

    // 收集 clone 中已有的内容指纹，用于二次去重
    // 虚拟滚动框架可能重新创建了新 DOM 节点（没有 data-cc-id），
    // 但 id 属性（如 post_1）和 data-post-id 等业务属性会保留
    const existingFingerprints = new Set();
    clone.querySelectorAll('[id]').forEach(el => {
        existingFingerprints.add('id:' + el.id);
    });
    clone.querySelectorAll('[data-post-id]').forEach(el => {
        existingFingerprints.add('post-id:' + el.getAttribute('data-post-id'));
    });

    // 按 parentId 分组
    const byParent = new Map();
    for (const item of removedNodes) {
        if (!byParent.has(item.parentId)) {
            byParent.set(item.parentId, []);
        }
        byParent.get(item.parentId).push(item);
    }

    // 在 clone 中找到对应父元素并插入子节点
    for (const [parentId, items] of byParent) {
        const parent = clone.querySelector(`[data-cc-id="${parentId}"]`);
        if (!parent) continue;

        for (const item of items) {
            // 全局去重 1：如果整个 clone 中已有同 data-cc-id 的节点就跳过
            if (clone.querySelector(`[data-cc-id="${item.ccId}"]`)) continue;

            // 全局去重 2：如果恢复节点的 id / data-post-id 已在 clone 中存在就跳过
            // （框架重新创建的新 DOM 节点没有 data-cc-id 但有业务属性）
            const nodeId = item.clone.id;
            const postId = item.clone.getAttribute('data-post-id');
            if (nodeId && existingFingerprints.has('id:' + nodeId)) continue;
            if (postId && existingFingerprints.has('post-id:' + postId)) continue;

            // 也检查恢复节点的子元素中是否有重复指纹
            let hasDupChild = false;
            item.clone.querySelectorAll('[id]').forEach(child => {
                if (existingFingerprints.has('id:' + child.id)) hasDupChild = true;
            });
            item.clone.querySelectorAll('[data-post-id]').forEach(child => {
                if (existingFingerprints.has('post-id:' + child.getAttribute('data-post-id'))) hasDupChild = true;
            });
            if (hasDupChild) continue;

            // 清除恢复节点上的大 height / padding 内联样式（可能是占位样式）
            stripPlaceholderStyles(item.clone);

            // 注册新插入节点的指纹
            if (nodeId) existingFingerprints.add('id:' + nodeId);
            if (postId) existingFingerprints.add('post-id:' + postId);
            item.clone.querySelectorAll('[id]').forEach(child => {
                existingFingerprints.add('id:' + child.id);
            });
            item.clone.querySelectorAll('[data-post-id]').forEach(child => {
                existingFingerprints.add('post-id:' + child.getAttribute('data-post-id'));
            });

            // 按 data-cc-id 数值顺序插入到正确位置
            const ccIdNum = parseInt(item.ccId);
            let inserted = false;
            for (const existing of parent.children) {
                const existingId = parseInt(existing.getAttribute('data-cc-id') || '999999');
                if (ccIdNum < existingId) {
                    parent.insertBefore(item.clone, existing);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                parent.appendChild(item.clone);
            }
        }
    }
}

/** 清除元素及其直接子元素上的大 height/padding 占位样式 */
function stripPlaceholderStyles(el) {
    const strip = (node) => {
        const style = node.getAttribute('style');
        if (!style) return;
        // 移除 height: >300px 的声明
        let cleaned = style.replace(/height:\s*\d{3,}px\s*;?/gi, '');
        // 移除 padding-top: >300px 的声明
        cleaned = cleaned.replace(/padding-top:\s*\d{3,}px\s*;?/gi, '');
        if (cleaned.trim()) {
            node.setAttribute('style', cleaned);
        } else {
            node.removeAttribute('style');
        }
    };
    strip(el);
    // 也处理直接子元素
    for (const child of el.children) {
        strip(child);
    }
}

/** 提取网站 favicon，转为 base64 */
async function extractFavicon() {
    // 优先查找 <link rel="icon">
    const candidates = [
        ...document.querySelectorAll('link[rel~="icon"]'),
        ...document.querySelectorAll('link[rel~="shortcut"]'),
    ];
    const iconLink = candidates[0];
    const iconUrl = iconLink?.href || `${location.origin}/favicon.ico`;

    try {
        return await urlToBase64(iconUrl);
    } catch {
        return '';
    }
}

/** 将所有 <link rel="stylesheet"> 转为 <style> 内联 */
async function inlineStylesheets(root) {
    const links = [...root.querySelectorAll('link[rel="stylesheet"]')];
    await Promise.all(links.map(async link => {
        try {
            const cssText = await fetchText(link.href);
            const resolved = await resolveCSSImports(cssText, link.href);
            const style = document.createElement('style');
            style.textContent = resolved;
            link.replaceWith(style);
        } catch {
            // fetch 失败 → 保留原始 link 标签（外部引用总比无样式好）
        }
    }));
}

/** 递归解析 CSS 中的 @import */
async function resolveCSSImports(cssText, baseUrl) {
    const importRegex = /@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?[^;]*;/g;
    const promises = [];
    let match;

    while ((match = importRegex.exec(cssText)) !== null) {
        const importUrl = resolveUrl(match[1], baseUrl);
        promises.push(
            fetchText(importUrl)
                .then(text => ({ original: match[0], resolved: text, url: importUrl }))
                .catch(() => ({ original: match[0], resolved: '', url: importUrl }))
        );
    }

    const results = await Promise.all(promises);
    let result = cssText;
    for (const { original, resolved, url } of results) {
        const withImports = await resolveCSSImports(resolved, url);
        result = result.replace(original, withImports);
    }
    return result;
}

/** 冻结页面中可能被 JS 动态控制的展开/折叠状态 */
function freezeVisibilityStates(root) {
    // 只冻结 div/section/article/details 等容器元素
    // 跳过 html/head/body/meta/link/script/style 等结构性标签
    const SKIP_TAGS = new Set([
        'HTML', 'HEAD', 'BODY', 'META', 'LINK', 'SCRIPT', 'STYLE', 'TITLE',
        'BR', 'HR', 'IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON',
        'SVG', 'PATH', 'CIRCLE', 'RECT', 'LINE', 'POLYGON', 'POLYLINE',
        'DEFS', 'G', 'USE', 'SYMBOL', 'CLIPPATH', 'MASK',
    ]);

    const allCloneEls = [...root.querySelectorAll('*')];
    const allOrigEls = [...document.querySelectorAll('*')];
    const len = Math.min(allCloneEls.length, allOrigEls.length);

    for (let i = 0; i < len; i++) {
        const origEl = allOrigEls[i];
        const cloneEl = allCloneEls[i];

        // 跳过不该冻结的标签
        if (SKIP_TAGS.has(cloneEl.tagName)) continue;

        const computed = window.getComputedStyle(origEl);
        const display = computed.getPropertyValue('display');
        const visibility = computed.getPropertyValue('visibility');
        const overflow = computed.getPropertyValue('overflow');
        const maxHeight = computed.getPropertyValue('max-height');

        // 只处理当前 "可见" 的元素 — 如果原本就是 none，不做处理
        // 这样被 JS toggle 为可见的面板会被冻结为可见
        // 跳过 display: none 的元素 —— 不应该把隐藏面板冻结为可见
        if (display === 'none' || visibility === 'hidden') continue;

        // 只处理 max-height: 0px 的折叠样式（常见于手风琴面板），强制展开
        // 注意：不碰 overflow: hidden，很多 SPA 正常使用它做裁切
        if (maxHeight === '0px') {
            cloneEl.style.setProperty('max-height', 'none', 'important');
            cloneEl.style.setProperty('overflow', 'visible', 'important');
        }
    }
}


/** 内联所有 img 的 src / srcset */
async function inlineImages(root) {
    const imgs = [...root.querySelectorAll('img[src], img[data-src], img[data-lazy-src]')];

    await Promise.all(imgs.map(async img => {
        // 处理懒加载属性
        const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (!src || src.startsWith('data:')) return;

        try {
            const dataUri = await urlToBase64(src);
            img.setAttribute('src', dataUri);
        } catch {
            // 无法获取就保留原 src（可能是跨域或已被清理）
        }

        // 清理 srcset（防止浏览器覆盖 src）
        img.removeAttribute('srcset');
        img.removeAttribute('data-src');
        img.removeAttribute('data-lazy-src');
        img.removeAttribute('loading');
    }));

    // 处理 <picture><source srcset>
    const sources = [...root.querySelectorAll('source[srcset]')];
    await Promise.all(sources.map(async source => {
        try {
            // 取第一个 URL
            const firstUrl = source.getAttribute('srcset').split(',')[0].trim().split(' ')[0];
            if (firstUrl && !firstUrl.startsWith('data:')) {
                const dataUri = await urlToBase64(firstUrl);
                source.setAttribute('srcset', dataUri);
            }
        } catch {
            source.remove();
        }
    }));
}

/** 内联 <style> 标签中的 CSS url()（背景图、字体等）*/
async function inlineCSSUrlsInStyleTags(root) {
    const styles = [...root.querySelectorAll('style')];
    await Promise.all(styles.map(async style => {
        try {
            style.textContent = await inlineCSSUrls(style.textContent, location.href);
        } catch { }
    }));
}

/** 将 CSS 文本中所有 url(...) 转为 base64 */
async function inlineCSSUrls(cssText, baseUrl) {
    // 匹配 url("...") url('...') url(...)
    const urlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
    const matches = [];
    let m;
    while ((m = urlRegex.exec(cssText)) !== null) {
        const url = m[2];
        if (!url.startsWith('data:') && !url.startsWith('#')) {
            matches.push({ full: m[0], url: resolveUrl(url, baseUrl) });
        }
    }

    // 并行 fetch 所有资源
    const replacements = await Promise.all(matches.map(async ({ full, url }) => {
        try {
            const dataUri = await urlToBase64(url);
            return { full, dataUri };
        } catch {
            return { full, dataUri: null };
        }
    }));

    let result = cssText;
    for (const { full, dataUri } of replacements) {
        if (dataUri) {
            result = result.replaceAll(full, `url("${dataUri}")`);
        }
    }
    return result;
}

/** 将 <canvas> 转为 <img data-uri> */
function inlineCanvases(root) {
    // 克隆的 canvas 是空的，从原始页面找对应 canvas
    const origCanvases = [...document.querySelectorAll('canvas')];
    const cloneCanvases = [...root.querySelectorAll('canvas')];
    const len = Math.min(origCanvases.length, cloneCanvases.length);
    for (let i = 0; i < len; i++) {
        try {
            const dataUri = origCanvases[i].toDataURL('image/png');
            const img = document.createElement('img');
            img.src = dataUri;
            img.width = origCanvases[i].width;
            img.height = origCanvases[i].height;
            cloneCanvases[i].replaceWith(img);
        } catch { }
    }
}

/** 将所有 a[href] 转为绝对 URL（方便离线状态下识别原链接）*/
function absolutifyLinks(root) {
    root.querySelectorAll('a[href]').forEach(a => {
        try {
            const abs = new URL(a.getAttribute('href'), location.href).href;
            a.setAttribute('href', abs);
        } catch { }
    });
}

/** 清理虚拟滚动留下的空占位容器 */
function removeVirtualScrollGaps(root) {
    const toRemove = [];

    // ── 策略 1：仅在 Discourse 类页面中移除 cloaked 占位节点 ──
    // 只有检测到 .post-stream 容器时才执行，避免误伤 SPA
    const postStream = root.querySelector('.post-stream');
    if (postStream) {
        // 移除明确的 cloaked 元素
        postStream.querySelectorAll('.post-stream--cloaked').forEach(el => el.remove());

        // 在 post-stream 内移除没有 data-cc-visible 标记且内容极少的占位
        for (const el of postStream.children) {
            if (el.hasAttribute('data-cc-visible')) continue;
            if (el.querySelector('[data-cc-visible]')) continue;

            const textLen = (el.textContent || '').trim().length;
            const imgCount = el.querySelectorAll('img').length;
            if (textLen + imgCount * 200 < 50) {
                toRemove.push(el);
            }
        }
    }

    toRemove.forEach(el => el.remove());

    // ── 策略 2：清理 inline style 中大 height 但无内容的占位 ──
    root.querySelectorAll('div, section').forEach(el => {
        const style = el.getAttribute('style') || '';
        const heightMatch = style.match(/(?:^|;)\s*height:\s*(\d+)px/i);
        if (!heightMatch) return;
        const h = parseInt(heightMatch[1]);
        if (h < 300) return;

        const textLen = (el.textContent || '').trim().length;
        const imgCount = el.querySelectorAll('img').length;
        const childEls = el.querySelectorAll('*').length;
        const density = (textLen + imgCount * 200) / h;

        if (density < 0.1 && childEls < 5) {
            el.remove();
        }
    });

    // ── 策略 3：清理大 padding/margin 占位 ──
    root.querySelectorAll('div, section').forEach(el => {
        const style = el.getAttribute('style') || '';
        const paddingMatch = style.match(/padding-top:\s*(\d+)px/i) || style.match(/margin-top:\s*(\d+)px/i);
        if (paddingMatch && parseInt(paddingMatch[1]) > 500) {
            if ((el.textContent || '').trim().length < 10 && el.children.length === 0) {
                el.remove();
            }
        }
    });
}


// ── fetch 工具 ────────────────────────────────────────────────────────────────

/** 将 URL 资源 fetch 并转为 base64 data URI */
async function urlToBase64(url) {
    const absUrl = resolveUrl(url, location.href);
    const resp = await fetch(absUrl, { credentials: 'include' });
    if (!resp.ok) throw new Error(`${resp.status} ${absUrl}`);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/** fetch 文本内容 */
async function fetchText(url) {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error(`${resp.status} ${url}`);
    return resp.text();
}

/** 将相对 URL 解析为绝对 URL */
function resolveUrl(url, base) {
    try {
        return new URL(url, base).href;
    } catch {
        return url;
    }
}

/** 简单 sleep */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
