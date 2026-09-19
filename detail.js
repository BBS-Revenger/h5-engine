/* detail.js —— 所有模板共用一个页面，按 {id}.json 动态渲染（§4.2 ~ §4.5） */
(function () {
  'use strict';

  const app = document.getElementById('app');
  const footBtn = document.getElementById('footBtn');
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  const controls = [];
  let tpl = null;

  function renderError(title, html, retry) {
    app.innerHTML = '<div class="err"><h2>' + esc(title) + '</h2><p>' + html + '</p>' +
      (retry ? '<button class="btn" onclick="location.reload()">重新加载</button>' : '') +
      ' <a class="btn ghost" href="index.html">返回列表</a></div>';
    footBtn.disabled = true; footBtn.textContent = '不可用';
  }

  /* 1. id 白名单校验，防路径穿越（§4.2） */
  const id = (new URLSearchParams(location.search).get('id') || '').trim();
  if (!/^[a-z0-9-]+$/.test(id)) {
    renderError('非法的模板 ID',
      '参数 <code>' + esc(id) + '</code> 未通过白名单校验 <code>/^[a-z0-9-]+$/</code>，已拦截。');
    return;
  }

  /* 2. 拉取模板 JSON */
  loadJSON(id + '.json').then(init).catch(function (e) {
    renderError('模板加载失败',
      '请求 <code>model/' + esc(id) + '.json</code> 失败（' + esc(e.message) + '）', true);
  });

  function init(t) {
    if (!t || typeof t !== 'object' || !Array.isArray(t.inputs)) {
      renderError('模板结构无效', '<code>inputs</code> 字段缺失或不是数组'); return;
    }
    tpl = t;
    document.title = (tpl.name || id) + ' · 拾光影像';

    const cover = MODEL_BASES[0] + '/' + (tpl.cover || (id + '.jpg'));
    app.innerHTML = '<div class="hero"><img src="' + esc(cover) + '" alt="" onerror="this.style.display=\'none\'">' +
      '<h1>' + esc(tpl.name || id) + '</h1><p>' + esc(tpl.desc || '') + '</p></div>' +
      '<div class="form" id="form"></div>';

    const form = document.getElementById('form');
    tpl.inputs.forEach(function (spec, i) {          /* 按 inputs 顺序渲染 */
      const c = buildControl(spec, i);
      if (c) { form.appendChild(c.el); controls.push(c); }   /* 未知类型已在内部跳过 */
    });
    footBtn.disabled = false;
    footBtn.innerHTML = '<span>开始生成</span>';
  }

  /* 3. 控件解释器（§4.3）：image / text / choice，未知 type 跳过不报错（§5 兼容规则） */
  function buildControl(spec, i) {
    if (!spec || typeof spec !== 'object') return null;
    const label = spec.label || spec.key || ('字段' + i);
    const req = !!spec.required;
    const el = document.createElement('section');
    el.className = 'ctrl';
    const head = '<label>' + esc(label) + (req ? ' <i>*</i>' : '') + '</label>';
    const tip = spec.tip ? '<p class="tip">' + esc(spec.tip) + '</p>' : '';
    let c = null;

    if (spec.type === 'image') {
      const max = Math.max(1, parseInt(spec.maxCount, 10) || 1);
      const acc = (Array.isArray(spec.accept) && spec.accept.length)
        ? spec.accept.map(s => String(s).toLowerCase().replace(/\./g, '')) : null;
      el.innerHTML = head +
        '<div class="ugrid"></div>' +
        '<input type="file" hidden ' + (max > 1 ? 'multiple' : '') + '>' + tip;
      const grid = el.querySelector('.ugrid');
      const file = el.querySelector('input[type=file]');
      if (acc) file.accept = acc.map(e => MIME[e] || ('.' + e)).join(',');
      const st = { imgs: [] };

      function draw() {
        grid.classList.toggle('solo', max === 1);
        grid.innerHTML = st.imgs.map((u, k) =>
          '<figure><img src="' + u + '" alt="">' +
          '<button type="button" class="del" data-i="' + k + '">×</button></figure>').join('') +
          (st.imgs.length >= max ? '' :
            '<button type="button" class="add">' + (st.imgs.length ? '继续添加'
              : (max > 1 ? '添加图片（最多 ' + max + ' 张）' : '上传图片')) + '</button>');  /* 传满隐藏 + */
      }
      grid.addEventListener('click', function (ev) {
        const del = ev.target.closest('.del');
        if (del) { st.imgs.splice(+del.dataset.i, 1); draw(); return; }
        if (ev.target.closest('.add') && st.imgs.length < max) file.click();
      });
      file.addEventListener('change', async function () {
        for (const f of file.files) {
          if (st.imgs.length >= max) { toast('「' + label + '」最多 ' + max + ' 张'); break; }
          const ext = (f.name.split('.').pop() || '').toLowerCase();
          if (acc && acc.indexOf(ext) < 0) { toast('仅支持 ' + acc.join(' / ') + ' 格式'); continue; }
          if (f.size > 10 * 1024 * 1024) { toast('「' + f.name + '」超过 10MB'); continue; }
          const dataUrl = await new Promise(res => {
            const r = new FileReader();
            r.onload = () => res(r.result); r.onerror = () => res(null);
            r.readAsDataURL(f);      /* 一期方案：直接转 base64（§4.4） */
          });
          if (dataUrl) st.imgs.push(dataUrl);
        }
        file.value = ''; draw();
      });
      draw();
      c = { value: () => st.imgs.slice(), validate: () => (req && !st.imgs.length) ? '请上传「' + label + '」' : null };

    } else if (spec.type === 'text') {
      const ml = Math.max(1, parseInt(spec.maxLength, 10) || 500);
      el.innerHTML = head +
        '<div class="twrap"><textarea maxlength="' + ml + '" placeholder="' +
        esc(spec.placeholder || '请输入') + '"></textarea><span class="cnt">0 / ' + ml + '</span></div>' + tip;
      const ta = el.querySelector('textarea'), cnt = el.querySelector('.cnt');
      ta.addEventListener('input', () => { cnt.textContent = ta.value.length + ' / ' + ml; });
      c = { value: () => ta.value.trim(), validate: () => (req && !ta.value.trim()) ? '请填写「' + label + '」' : null };

    } else if (spec.type === 'choice') {
      const opts = Array.isArray(spec.options) ? spec.options : [];
      const def = (spec.default != null) ? spec.default : (opts[0] && opts[0].value);
      el.innerHTML = head + '<div class="chips" data-v="' + esc(def == null ? '' : def) + '">' +
        opts.map(o => '<button type="button" class="chip ' + (o.value === def ? 'on' : '') +
          '" data-v="' + esc(o.value) + '">' + esc(o.label) + '</button>').join('') + '</div>' + tip;
      const box = el.querySelector('.chips');
      box.addEventListener('click', function (ev) {
        const b = ev.target.closest('.chip'); if (!b) return;
        box.dataset.v = b.dataset.v;
        box.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
      });
      c = { value: () => box.dataset.v || null, validate: () => (req && !box.dataset.v) ? '请选择「' + label + '」' : null };

    } else {
      console.warn('[engine] 跳过未知控件类型:', spec.type, 'key =', spec.key);  /* §5 版本兼容 */
      return null;
    }
    c.spec = spec; c.i = i;
    return c;
  }

  /* 4. 提交（§4.4） */
  footBtn.addEventListener('click', onSubmit);

  async function onSubmit() {
    for (const ct of controls) {                       /* 逐项校验 required */
      const err = ct.validate();
      if (err) {
        toast(err);
        ct.el.classList.remove('shake'); void ct.el.offsetWidth; ct.el.classList.add('shake');
        ct.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    const inputs = {};
    controls.forEach(ct => { inputs[ct.spec.key || ('field' + ct.i)] = ct.value(); });
    const body = { template: tpl.id, inputs };         /* 请求体契约（§4.4） */

    footBtn.disabled = true;
    footBtn.innerHTML = '<span class="spin"></span>提交中…';
    try {
      if (!REAL_API) {                                 /* 未接后台：弹窗展示报文，验证契约 */
        showPayload((tpl.submit && tpl.submit.api) || '/api/ai/create', body);
        footBtn.disabled = false; footBtn.innerHTML = '<span>开始生成</span>';
        return;
      }
      const taskId = await createTask(body);
      await runPoll(taskId);
    } catch (e) {
      toast('提交失败：' + e.message);                 /* 失败弹错，按钮恢复即可重试 */
      footBtn.disabled = false; footBtn.innerHTML = '<span>开始生成</span>';
    }
  }

  /* ---- 报文预览弹窗 ---- */
  const modal = document.getElementById('modal');
  function showPayload(api, body) {
    document.getElementById('mApi').textContent = api;
    document.getElementById('mBody').textContent = JSON.stringify(body, (k, v) =>
      (typeof v === 'string' && v.length > 72) ? v.slice(0, 48) + '…〔' + v.length + ' 字符〕' : v, 2);
    document.getElementById('mCopy').onclick = function () {
      navigator.clipboard.writeText(JSON.stringify(body))
        .then(() => toast('完整报文已复制，可发给后台同学联调', 'ok'),
              () => toast('复制失败，请手动选择文本'));
    };
    modal.hidden = false;
  }
  document.getElementById('mClose').onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

  /* ---- REAL_API=true 时的真实提交 + 轮询（§4.5） ---- */
  function getByPath(o, p) { return String(p).split('.').reduce((x, k) => (x == null ? x : x[k]), o); }

  async function createTask(body) {
    const cfg = tpl.submit || {};
    const res = await fetch(cfg.api, {
      method: cfg.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.code != null && data.code !== 0)) throw new Error(data.message || ('HTTP ' + res.status));
    const t = data.data && data.data.taskId;
    if (!t) throw new Error('响应缺少 taskId');
    return t;
  }

  async function runPoll(taskId) {
    const cfg = tpl.result;
    if (!cfg) {                                        /* result 段可缺省（§5） */
      footBtn.disabled = false; footBtn.innerHTML = '<span>开始生成</span>';
      toast('已提交（该模板未配置 result 轮询）', 'ok'); return;
    }
    const form = document.getElementById('form');
    form.innerHTML = '<div class="loading">生成中，请稍候…</div>';
    const url = String(cfg.queryApi).replace('{{task.id}}', encodeURIComponent(taskId));
    for (;;) {
      let out = null;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (res.ok) out = getByPath(data, cfg.urlField || 'data.url');
      } catch (e) { /* 单次失败忽略，继续轮询 */ }
      if (out) { renderResult(out, cfg.display || 'image'); return; }
      await new Promise(r => setTimeout(r, cfg.interval || 2000));
    }
  }

  function renderResult(url, display) {
    const form = document.getElementById('form');
    form.innerHTML = (display === 'video')
      ? '<div class="result"><video controls playsinline src="' + esc(url) + '"></video></div>'
      : '<div class="result"><img src="' + esc(url) + '" alt="生成结果"></div>';
    form.insertAdjacentHTML('beforeend',
      '<div class="result-ops"><a class="btn" href="' + esc(url) + '" download target="_blank" rel="noopener">保存</a>' +
      '<a class="btn ghost" href="index.html">返回列表</a></div>');
    footBtn.style.display = 'none';
  }
})();