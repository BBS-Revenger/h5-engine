/* detail.js —— 所有模板共用一个页面，按 {id}.json 动态渲染（§4.2 ~ §4.5） */
(function () {
  'use strict';

  const app = document.getElementById('app');
  const footBtn = document.getElementById('footBtn');
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' };
  const controls = [];
  let tpl = null;
  let currentTask = sessionStorage.getItem('task:' + location.search) || null;

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
    if ((t.minEngineVersion || 1) > (typeof ENGINE_VERSION === 'number' ? ENGINE_VERSION : 1)) {
      renderError('前端版本需要更新', '请上传最新的 HTML、JS 和 CSS 文件后刷新页面。'); return;
    }
    const supported = ['image', 'audio', 'video', 'text', 'choice', 'number', 'boolean'];
    const seen = new Set();
    const invalid = t.inputs.some(spec => {
      if (!spec || !supported.includes(spec.type) || typeof spec.key !== 'string' || !spec.key || seen.has(spec.key)) return true;
      seen.add(spec.key); return false;
    });
    if (invalid) {
      renderError('模板控件不受支持', '请更新前端文件，并检查 inputs 中的控件类型和字段名称。'); return;
    }
    tpl = t;
    document.title = (tpl.name || id) + ' · 拾光影像';

    const cover = MODEL_BASES[0] + '/' + (tpl.cover || (id + '.jpg'));
    app.innerHTML = '<div class="hero"><img src="' + esc(cover) + '" alt="" onerror="this.style.display=\'none\'">' +
      '<h1>' + esc(tpl.name || id) + '</h1><p>' + esc(tpl.desc || '') + '</p></div>' +
      '<div class="form" id="form"></div>';

    const form = document.getElementById('form');
    if (tpl.submit && tpl.submit.real && tpl.submit.auth === 'test-token') {
      const auth = document.createElement('section');
      auth.className = 'ctrl test-auth';
      auth.innerHTML = '<label for="testToken">测试口令</label><input id="testToken" type="password" autocomplete="off" placeholder="填写测试口令">' +
        '<p class="tip">内部联调使用，生成会消耗 RunningHub 余额。</p>';
      form.appendChild(auth);
      document.getElementById('testToken').value = sessionStorage.getItem('edge_test_token') || '';
    }
    tpl.inputs.forEach(function (spec, i) {          /* 按 inputs 顺序渲染 */
      const c = buildControl(spec, i);
      if (c) { form.appendChild(c.el); controls.push(c); }   /* 模板类型已在初始化时校验 */
    });
    footBtn.disabled = false;
    footBtn.innerHTML = currentTask ? '<span>继续查询上次任务</span>' : '<span>开始生成</span>';
  }

  /* 3. JSON 控件解释器 */
  function buildControl(spec, i) {
    if (!spec || typeof spec !== 'object') return null;
    const label = spec.label || spec.key || ('字段' + i);
    const req = !!spec.required;
    const el = document.createElement('section');
    el.className = 'ctrl';
    const head = '<label>' + esc(label) + (req ? ' <i>*</i>' : '') + '</label>';
    const tip = spec.tip ? '<p class="tip">' + esc(spec.tip) + '</p>' : '';
    let c = null;

    if (['image', 'audio', 'video'].includes(spec.type)) {
      const video = spec.type === 'video', audio = spec.type === 'audio';
      const mediaName = video ? '视频' : audio ? '音频' : '图片';
      const maxMB = Math.min(10, Number(spec.maxSizeMB) > 0 ? Number(spec.maxSizeMB) : 10);
      const max = Math.min(20, Math.max(1, parseInt(spec.maxCount, 10) || 1));
      const acc = (Array.isArray(spec.accept) && spec.accept.length)
        ? spec.accept.map(s => String(s).toLowerCase().replace(/^\./, ''))
        : (video ? ['mp4', 'webm'] : audio ? ['mp3', 'wav', 'ogg', 'm4a'] : ['jpg', 'jpeg', 'png', 'webp']);
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
          '<figure class="media-' + spec.type + '">' + (audio ? '<audio controls preload="metadata" src="' + esc(u) + '"></audio>' : video ? '<video controls playsinline preload="metadata" src="' + esc(u) + '"></video>' : '<img src="' + esc(u) + '" alt="">') +
          '<button type="button" class="del" data-i="' + k + '">×</button></figure>').join('') +
          (st.imgs.length >= max ? '' :
            '<button type="button" class="add">' + (st.imgs.length ? '继续添加'
              : (max > 1 ? '添加' + mediaName + '（最多 ' + max + ' 个）' : '上传' + mediaName)) + '</button>');
      }
      grid.addEventListener('click', function (ev) {
        const del = ev.target.closest('.del');
        if (del) { st.imgs.splice(+del.dataset.i, 1); draw(); return; }
        if (ev.target.closest('.add') && st.imgs.length < max) file.click();
      });
      file.addEventListener('change', async function () {
        for (const f of file.files) {
          if (st.imgs.length >= max) { toast('「' + label + '」最多 ' + max + ' 个'); break; }
          const ext = (f.name.split('.').pop() || '').toLowerCase();
          if (acc && acc.indexOf(ext) < 0) { toast('仅支持 ' + acc.join(' / ') + ' 格式'); continue; }
          if (!f.size) { toast('文件为空'); continue; }
          if (f.size > maxMB * 1024 * 1024) { toast('「' + f.name + '」超过 ' + maxMB + 'MB'); continue; }
          const existingBytes = controls.filter(ct => ['image', 'audio', 'video'].includes(ct.spec.type))
            .flatMap(ct => ct.value()).reduce((sum, u) => sum + Math.floor((u.split(',')[1] || '').replace(/=+$/, '').length * 3 / 4), 0);
          if (existingBytes + f.size > 10 * 1024 * 1024) { toast('所有上传文件合计不能超过 10MB'); continue; }
          let dataUrl = await new Promise(res => {
            const r = new FileReader();
            r.onload = () => res(r.result); r.onerror = () => res(null);
            r.readAsDataURL(f);      /* 一期方案：直接转 base64（§4.4） */
          });
          // 统一浏览器返回的 MIME 别名；后端仍校验实际文件头。
          if (dataUrl && MIME[ext]) dataUrl = dataUrl.replace(/^data:[^;]*;/, 'data:' + MIME[ext] + ';');
          if (dataUrl) st.imgs.push(dataUrl);
        }
        file.value = ''; draw();
      });
      draw();
      c = { value: () => st.imgs.slice(), validate: () => (req && !st.imgs.length) ? '请上传「' + label + '」' : null };

    } else if (spec.type === 'text') {
      const ml = Math.max(1, parseInt(spec.maxLength, 10) || 500);
      const field = spec.multiline === false ? '<input type="text"' : '<textarea';
      el.innerHTML = head + '<div class="twrap">' + field + ' maxlength="' + ml + '" placeholder="' +
        esc(spec.placeholder || '请输入') + '">' + (spec.multiline === false ? '' : '</textarea>') +
        '<span class="cnt"></span></div>' + tip;
      const ta = el.querySelector('textarea, input'), cnt = el.querySelector('.cnt');
      ta.value = spec.default == null ? '' : String(spec.default);
      const count = () => { cnt.textContent = ta.value.length + ' / ' + ml; };
      ta.addEventListener('input', count); count();
      c = { value: () => ta.value, validate: () => req && !ta.value.trim() ? '请填写「' + label + '」' : ta.value.length > ml ? '「' + label + '」文字过长' : null };

    } else if (spec.type === 'number') {
      const integer = spec.numericType === 'integer';
      const step = spec.step ?? (integer ? 1 : 'any');
      el.innerHTML = head + '<input class="numeric" type="number" step="' + esc(step) + '"' +
        (spec.min != null ? ' min="' + esc(spec.min) + '"' : '') +
        (spec.max != null ? ' max="' + esc(spec.max) + '"' : '') + '>' + tip;
      const input = el.querySelector('input');
      if (spec.default != null) input.value = String(spec.default);
      c = { value: () => input.value === '' ? null : Number(input.value), validate: () => {
        if (input.validity.badInput) return '请填写有效数字：' + label;
        if (input.value === '') return req ? '请填写「' + label + '」' : null;
        const n = Number(input.value);
        if (!Number.isFinite(n) || integer && !Number.isSafeInteger(n)) return '「' + label + '」必须是' + (integer ? '整数' : '有效数字');
        if (spec.min != null && n < spec.min || spec.max != null && n > spec.max) return '「' + label + '」超出允许范围';
        const steps = (n - (spec.stepBase ?? spec.min ?? 0)) / Number(step);
        if (step !== 'any' && (!(Number(step) > 0) || Math.abs(steps - Math.round(steps)) > 1e-7 * Math.max(1, Math.abs(steps)))) return '「' + label + '」不符合步长 ' + step;
        return null;
      } };

    } else if (spec.type === 'boolean') {
      if (spec.default != null && typeof spec.default !== 'boolean') throw Error('布尔默认值必须是 true 或 false');
      el.innerHTML = head + '<label class="switch"><input type="checkbox"><span>' + esc(spec.onLabel || '启用') + '</span></label>' + tip;
      const input = el.querySelector('input'); input.checked = spec.default === true;
      c = { value: () => input.checked, validate: () => null };

    } else if (spec.type === 'choice') {
      const opts = Array.isArray(spec.options) ? spec.options : [];
      const def = spec.default ?? (opts[0] && opts[0].value);
      const optionValue = value => value == null ? '' : String(value);
      let box;
      if (spec.presentation === 'select') {
        el.innerHTML = head + '<select>' + opts.map(o => '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>').join('') + '</select>' + tip;
        box = el.querySelector('select'); box.value = optionValue(def);
      } else {
        el.innerHTML = head + '<div class="chips" data-v="' + esc(optionValue(def)) + '">' +
          opts.map(o => '<button type="button" class="chip ' + (optionValue(o.value) === optionValue(def) ? 'on' : '') +
            '" data-v="' + esc(o.value) + '">' + esc(o.label) + '</button>').join('') + '</div>' + tip;
        box = el.querySelector('.chips');
        box.addEventListener('click', function (ev) {
          const b = ev.target.closest('.chip'); if (!b) return;
          box.dataset.v = b.dataset.v;
          box.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
        });
      }
      const value = () => spec.presentation === 'select' ? box.value : box.dataset.v;
      c = { value: () => value() === '' ? null : value(), validate: () => {
        const v = value();
        return !v && !req ? null : opts.some(o => optionValue(o.value) === v) ? null : '请选择「' + label + '」';
      } };

    } else { return null; }
    el.querySelectorAll('input, textarea, select').forEach(field => field.setAttribute('aria-label', label));
    c.spec = spec; c.i = i; c.el = el;
    return c;
  }

  /* 4. 提交（§4.4） */
  footBtn.addEventListener('click', onSubmit);

  async function onSubmit() {
    if (currentTask) {
      footBtn.disabled = true;
      try { await runPoll(currentTask); } catch (e) { restoreForm(); toast(e.message); }
      return;
    }
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
    const mediaBytes = controls.filter(ct => ['image', 'audio', 'video'].includes(ct.spec.type))
      .flatMap(ct => ct.value()).reduce((sum, u) => sum + Math.floor((u.split(',')[1] || '').replace(/=+$/, '').length * 3 / 4), 0);
    if (mediaBytes > 10 * 1024 * 1024) { toast('所有上传文件合计不能超过 10MB'); return; }
    const body = { template: tpl.id, inputs };         /* 请求体契约（§4.4） */

    footBtn.disabled = true;
    footBtn.innerHTML = '<span class="spin"></span>提交中…';
    try {
      if (!REAL_API && !(tpl.submit && tpl.submit.real)) {
        showPayload((tpl.submit && tpl.submit.api) || '/api/ai/create', body);
        footBtn.disabled = false; footBtn.innerHTML = '<span>开始生成</span>';
        return;
      }
      const taskId = await createTask(body);
      currentTask = taskId;
      sessionStorage.setItem('task:' + location.search, taskId);
      await runPoll(taskId);
    } catch (e) {
      toast('提交失败：' + e.message);                 /* 失败弹错，按钮恢复即可重试 */
      restoreForm();
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
    const res = await apiFetch(cfg.api, {
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
    controls.forEach(c => { c.el.hidden = true; });
    let loading = form.querySelector('.loading');
    if (!loading) { loading = document.createElement('div'); loading.className = 'loading'; form.appendChild(loading); }
    loading.textContent = '生成中，请稍候…';
    footBtn.innerHTML = '<span class="spin"></span>正在生成…';
    const url = String(cfg.queryApi).replace('{{task.id}}', encodeURIComponent(taskId));
    const started = Date.now();
    let failures = 0;
    for (;;) {
      if (Date.now() - started > (cfg.timeout || 900000)) throw new Error('查询超时，可继续查询上次任务');
      let out = null;
      let terminalError = null;
      try {
        const res = await apiFetch(url);
        const data = await res.json();
        if (!res.ok || data.code !== 0) throw new Error(data.message || ('HTTP ' + res.status));
        failures = 0;
        const state = data.data && data.data.status;
        if (state === 'FAILED' || state === 'CANCEL' || state === 'CANCELED') terminalError = data.data.message || '生成失败';
        if (state === 'SUCCESS') {
          out = Array.isArray(data.data.results) && data.data.results.length ? data.data.results : null;
          if (!out) {
            const legacy = getByPath(data, cfg.urlField || 'data.url');
            if (legacy) out = [{ type: cfg.display || 'image', url: legacy }];
          }
        }
        if (state === 'SUCCESS' && !out) terminalError = '任务完成，但没有返回结果';
        loading.textContent = state === 'QUEUED' ? '任务排队中，请稍候…' : '生成中，请稍候…';
      } catch (e) {
        if (++failures >= 3) throw new Error('连续查询失败：' + e.message + '。可继续查询上次任务');
      }
      if (terminalError) { clearTask(); throw new Error(terminalError); }
      if (out) { renderResult(out, cfg.display || 'image'); return; }
      await new Promise(r => setTimeout(r, cfg.interval || 2000));
    }
  }

  function renderResult(results) {
    const safeUrl = value => {
      try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; }
      catch { return null; }
    };
    const usable = results.filter(item => item.type === 'text' && typeof item.text === 'string' || safeUrl(item.url));
    if (!usable.length) { clearTask(); throw Error('结果格式或链接无效'); }
    clearTask();
    const form = document.getElementById('form');
    form.innerHTML = usable.map((item, i) => {
      const url = safeUrl(item.url);
      const content = item.type === 'text' && typeof item.text === 'string' ? '<pre class="text-result">' + esc(item.text) + '</pre>'
        : item.type === 'video' ? '<video controls playsinline src="' + esc(url) + '"></video>'
        : item.type === 'audio' ? '<audio controls src="' + esc(url) + '"></audio>'
        : item.type === 'image' ? '<img src="' + esc(url) + '" alt="生成结果">'
        : '<p>输出文件 ' + (i + 1) + '</p>';
      return '<div class="result">' + content + '</div>' + (url ?
        '<div class="result-ops"><a class="btn" href="' + esc(url) + '" download target="_blank" rel="noopener">保存' + (usable.length > 1 ? '结果 ' + (i + 1) : '') + '</a></div>' : '');
    }).join('');
    form.insertAdjacentHTML('beforeend', '<div class="result-ops"><a class="btn ghost" href="index.html">返回列表</a></div>');
    footBtn.style.display = 'none';
  }

  function clearTask() {
    currentTask = null;
    sessionStorage.removeItem('task:' + location.search);
  }
  function restoreForm() {
    const form = document.getElementById('form');
    const loading = form && form.querySelector('.loading');
    if (loading) loading.remove();
    controls.forEach(c => { c.el.hidden = false; });
    footBtn.disabled = false;
    footBtn.innerHTML = currentTask ? '<span>继续查询上次任务</span>' : '<span>开始生成</span>';
  }
})();
