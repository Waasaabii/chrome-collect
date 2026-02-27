// 只看 body 标签的 style 属性
const f = await Bun.file('data/pages/c038e3bb-62a1-469a-bc68-e2b1a7cdae30.html').text();
const bodyIdx = f.indexOf('<body');
const bodyTagEnd = f.indexOf('>', bodyIdx);
const bodyTag = f.substring(bodyIdx, bodyTagEnd + 1);
console.log('body标签长度:', bodyTag.length);
// 提取 style 属性
const styleMatch = bodyTag.match(/style="([^"]*)"/);
if (styleMatch) {
    console.log('body style:', styleMatch[1].substring(0, 500));
} else {
    console.log('body 没有 style 属性');
}
// 看 body 后面的前 500 字符
console.log('\nbody后500字:', f.substring(bodyTagEnd + 1, bodyTagEnd + 501));
