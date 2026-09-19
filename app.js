/* 引擎公共配置与工具（两页共用） */
'use strict';

/* ★ 把这里改成你自己的 Pull Zone 域名（Bunny 创建 Pull Zone 后生成）
   数组预留多源 fallback 能力，主源失败自动试下一个 */
const MODEL_BASES = [
  'https://h5-model-cdn.b-cdn.net/model'
];

/* 后台 API 接好后改为 true：提交将真实 POST submit.api 并按 result 轮询 */
const REAL_API = false;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function toast(msg, type) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 2600);
}

/* 模板 JSON 拉取：多源依次尝试 + ?t= 时间戳防缓存（需求 §9） */
async function loadJSON(name) {
  let lastErr = '网络错误';
  for (const base of MODEL_BASES) {
    try {
      const res = await fetch(base + '/' + name + '?t=' + Date.now());
      if (res.ok) return await res.json();
      if (res.status === 404) throw new Error('404 Not Found：' + name);
      lastErr = 'HTTP ' + res.status;
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(lastErr);
}