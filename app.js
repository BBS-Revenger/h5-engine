/* 引擎公共配置与工具（两页共用） */
'use strict';

/* 模板 JSON 和封面统一从 Bunny Storage 对应的 CDN 读取。 */
const MODEL_BASES = ['https://h5-model-cdn.b-cdn.net/model'];

/* 后台 API 接好后改为 true：提交将真实 POST submit.api 并按 result 轮询 */
const REAL_API = false;

// API 地址由模板 JSON 指定；第三方密钥只保存在 Bunny 后端 Secrets。
async function apiFetch(path, options) {
  const headers = new Headers((options && options.headers) || {});
  const token = document.getElementById('testToken');
  if (token) {
    if (!token.value.trim()) throw new Error('请先填写测试口令');
    headers.set('Authorization', 'Bearer ' + token.value.trim());
    sessionStorage.setItem('edge_test_token', token.value.trim());
  }
  return fetch(path, Object.assign({}, options, { headers, signal: AbortSignal.timeout(60000) }));
}

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
