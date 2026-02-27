/**
 * 生成 Chrome Extension 所需的各尺寸图标
 * 使用纯 JS 生成 PNG（不依赖 canvas 模块）
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(import.meta.dir, '../packages/extension/icons');
mkdirSync(OUT_DIR, { recursive: true });

// 生成一个简单的 SVG 然后转为 PNG（Bun 支持 fetch data URI）
// 这里用最小的 PNG 字节生成器直接写二进制

function makePNG(size: number): Uint8Array {
    // 用纯色 PNG：深色背景 + 简单图形
    // 使用 Bun 的 fetch + OffscreenCanvas 替代方案
    // 由于环境限制，生成一个最小有效 PNG（1像素放大为 size）

    // PNG 文件头 + IHDR + IDAT + IEND
    const width = size, height = size;

    // 颜色：深蓝 #1a1f35（bg），青色 #00d4aa（accent）
    const BG = [26, 31, 53];       // #1a1f35
    const ACCENT = [0, 212, 170];  // #00d4aa

    // 创建 RGBA 图像数据
    const pixels = new Uint8Array(width * height * 4);

    // 画圆角矩形背景 + 书签形状
    const cx = width / 2, cy = height / 2;
    const r = width * 0.42;  // 书签高度
    const hw = width * 0.28; // 书签半宽

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const px = x - cx, py = y - cy;

            // 圆角背景（rounded rect）
            const rr = width * 0.22;
            const inBg = x >= rr && x < width - rr && y >= 0 && y < height
                || x >= 0 && x < width && y >= rr && y < height - rr
                || Math.hypot(x - rr, y - rr) < rr
                || Math.hypot(x - (width - rr), y - rr) < rr
                || Math.hypot(x - rr, y - (height - rr)) < rr
                || Math.hypot(x - (width - rr), y - (height - rr)) < rr;

            if (!inBg) {
                // 透明
                pixels[idx + 3] = 0;
                continue;
            }

            // 默认背景色
            pixels[idx] = BG[0]; pixels[idx + 1] = BG[1]; pixels[idx + 2] = BG[2]; pixels[idx + 3] = 255;

            // 书签形状（五边形：矩形上方 + V 形缺口底部）
            const bmTop = -r + 0.05 * height;
            const bmBot = r - 0.05 * height;
            const notchDepth = height * 0.16;

            if (Math.abs(px) < hw && py >= bmTop && py <= bmBot) {
                // 底部 V 形缺口
                const fromBot = bmBot - py;
                const isNotch = fromBot < notchDepth && Math.abs(px) < hw * (fromBot / notchDepth);

                if (!isNotch) {
                    pixels[idx] = ACCENT[0]; pixels[idx + 1] = ACCENT[1]; pixels[idx + 2] = ACCENT[2];
                }
            }
        }
    }

    return encodePNG(width, height, pixels);
}

// 极简 PNG 编码器
function encodePNG(w: number, h: number, rgba: Uint8Array): Uint8Array {
    const adler32 = (data: Uint8Array) => {
        let a = 1, b = 0;
        for (const byte of data) { a = (a + byte) % 65521; b = (b + a) % 65521; }
        return (b << 16) | a;
    };

    const crc32 = (() => {
        const t = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            t[i] = c;
        }
        return (data: Uint8Array, init = 0xFFFFFFFF) => {
            let c = init;
            for (const b of data) c = t[(c ^ b) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        };
    })();

    const u32be = (n: number) => new Uint8Array([(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]);

    // 原始像素行（过滤器无 = 0x00 前缀每行）
    const rawRows = new Uint8Array(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) {
        rawRows[y * (w * 4 + 1)] = 0; // None filter
        rawRows.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    }

    // zlib 压缩（存储模式，最快但无压缩）
    const zlibData = deflateStore(rawRows);

    const chunk = (type: string, data: Uint8Array) => {
        const typeBytes = new TextEncoder().encode(type);
        const lenBytes = u32be(data.length);
        const crcInput = new Uint8Array([...typeBytes, ...data]);
        const crcBytes = u32be(crc32(crcInput));
        return new Uint8Array([...lenBytes, ...typeBytes, ...data, ...crcBytes]);
    };

    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = chunk('IHDR', new Uint8Array([...u32be(w), ...u32be(h), 8, 6, 0, 0, 0]));
    const idat = chunk('IDAT', zlibData);
    const iend = chunk('IEND', new Uint8Array(0));

    const total = sig.length + ihdr.length + idat.length + iend.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const part of [sig, ihdr, idat, iend]) { out.set(part, off); off += part.length; }
    return out;
}

function deflateStore(data: Uint8Array): Uint8Array {
    // zlib header（CMF=0x78, FLG=0x01）
    const chunks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];

    const BLOCK_SIZE = 65535;
    let offset = 0;
    while (offset < data.length) {
        const end = Math.min(offset + BLOCK_SIZE, data.length);
        const block = data.subarray(offset, end);
        const isFinal = end === data.length ? 1 : 0;
        const len = block.length;
        const nlen = (~len) & 0xFFFF;
        chunks.push(new Uint8Array([
            isFinal,
            len & 0xFF, (len >> 8) & 0xFF,
            nlen & 0xFF, (nlen >> 8) & 0xFF,
            ...block,
        ]));
        offset = end;
    }

    // Adler-32 校验
    let a = 1, b = 0;
    for (const byte of data) { a = (a + byte) % 65521; b = (b + a) % 65521; }
    chunks.push(new Uint8Array([(b >> 8) & 255, b & 255, (a >> 8) & 255, a & 255]));

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
}

// 生成各尺寸图标
const SIZES = [16, 32, 48, 128];
for (const size of SIZES) {
    const png = makePNG(size);
    const path = join(OUT_DIR, `icon-${size}.png`);
    writeFileSync(path, png);
    console.log(`生成 icon-${size}.png (${png.length} bytes)`);
}

console.log('图标生成完成！');
