/* list.js —— 清单加载与卡片渲染（§4.1） */
(function () {
  const app = document.getElementById('app');

  function renderError(msg) {
    app.innerHTML = '<div class="err"><h2>模板清单加载失败</h2><p>' + esc(msg) +
      '<br>请检查网络，或确认 Bunny /model/index.json 是否已同步</p>' +
      '<button class="btn" onclick="location.reload()">重新加载</button></div>';
  }

  loadJSON('index.json').then(function (list) {
    if (!Array.isArray(list)) return renderError('index.json 格式错误（应为数组）');
    /* sort 升序，缺省排最后（§4.1） */
    list.sort((a, b) => (a.sort == null ? 9999 : a.sort) - (b.sort == null ? 9999 : b.sort));

    const cards = list.map(function (t) {
      const cover = MODEL_BASES[0] + '/' + (t.cover || ((t.id || '') + '.jpg'));
      return '<a class="card" href="template.html?id=' + encodeURIComponent(t.id || '') + '">' +
        '<div class="cover"><img loading="lazy" src="' + esc(cover) + '" alt="" onerror="this.remove()"></div>' +
        '<div class="meta"><h3>' + esc(t.name || t.id) + '</h3><p>' + esc(t.desc || '') + '</p></div></a>';
    }).join('');

    app.innerHTML = '<div class="indexbar"><span>model/index.json</span><b>' + list.length + ' templates</b></div>' +
      '<div class="cards">' + (cards ||
        '<div class="err"><h2>暂无模板</h2><p>清单为空：向 model/ 添加 JSON 后重跑同步脚本</p></div>') + '</div>';
  }).catch(function (e) { renderError(e.message); });
})();