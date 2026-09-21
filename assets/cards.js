/* 知识卡弹窗幻灯（用户令 2026-09-20：点图绝不许裸开一张原图，要么弹窗要么详情页）。
   同一页上的所有卡是一组：← → 键翻页、手机左右滑动、Esc／点背景／浏览器返回键关闭，
   网址带 #look-<key> 可以分享回到这一张。无 JS 时卡本身是链接，点进去是详情页，照样能看大图。
   移植自 youth-care-guide/src/components/Cards.astro（2026-09-20 全站共用做法），
   只把按钮类名换成本站设计系统的 .vv-btn。 */
(function () {
  var figs = Array.prototype.slice.call(document.querySelectorAll('figure.kcard[data-key]'));
  if (!figs.length) return;
  var lb = document.createElement('dialog');
  lb.className = 'lb';
  lb.setAttribute('aria-label', '知识卡放大');
  lb.innerHTML =
    '<button class="lb-x" aria-label="关闭">✕</button>' +
    '<button class="lb-nav lb-prev" aria-label="上一张">‹</button>' +
    '<button class="lb-nav lb-next" aria-label="下一张">›</button>' +
    '<div class="lb-body"><figure class="lb-fig"><img class="lb-img" alt=""></figure>' +
    '<aside class="lb-cap"><p class="lb-count"></p><h3 class="lb-title"></h3><p class="lb-sub"></p>' +
    '<b class="lb-take"></b><ul class="guide lb-guide"></ul>' +
    '<p class="lb-acts"><a class="vv-btn vv-btn--primary lb-detail" href="#">详情页 · 可分享</a>' +
    '<a class="vv-btn vv-btn--secondary lb-page" href="#">读这一节正文</a>' +
    '<a class="vv-btn vv-btn--secondary lb-dl" href="#" download>下载原图</a></p>' +
    '<p class="lb-hint">← → 翻页 · Esc 关闭</p></aside></div>';
  document.body.appendChild(lb);
  var q = function (s) { return lb.querySelector(s); };
  var img = q('.lb-img');
  var cur = -1, pushed = false, opener = null;
  // 图库页上每张卡都配一个「读这一节正文」；正文页上那个按钮是多余的（你已经在那一页）
  var onLibrary = /\/cards\/?(index\.html)?$/.test(location.pathname);

  function show(i) {
    cur = (i + figs.length) % figs.length;
    var f = figs[cur], d = f.dataset;
    img.src = d.full;
    img.alt = f.querySelector('img').alt;
    q('.lb-count').textContent = d.pageTitle + ' · 第 ' + (cur + 1) + ' / ' + figs.length + ' 张';
    q('.lb-title').textContent = d.title;
    q('.lb-sub').textContent = d.sub || '';
    q('.lb-sub').style.display = d.sub ? '' : 'none';
    q('.lb-take').textContent = f.querySelector('.takeaway').textContent;
    q('.lb-guide').innerHTML = f.querySelector('.guide').innerHTML;
    q('.lb-detail').href = d.detail;
    var pg = q('.lb-page');
    pg.href = d.page;
    pg.style.display = onLibrary ? '' : 'none';
    q('.lb-dl').href = d.full;
    q('.lb-prev').style.visibility = q('.lb-next').style.visibility = figs.length > 1 ? 'visible' : 'hidden';
    [cur - 1, cur + 1].forEach(function (j) {
      var p = new Image();
      p.src = figs[(j + figs.length) % figs.length].dataset.full;
    });
    history.replaceState(history.state, '', '#look-' + d.key);
  }

  function open(i, from) {
    opener = from || null;
    if (!lb.open) {
      history.pushState({ lb: 1 }, '', location.href);
      pushed = true;
      lb.showModal();
      document.body.classList.add('lb-open');
    }
    show(i);
  }
  function close() { if (lb.open) lb.close(); }

  lb.addEventListener('close', function () {
    document.body.classList.remove('lb-open');
    if (pushed) { pushed = false; history.back(); }
    else if (location.hash.indexOf('#look-') === 0) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (opener) opener.focus();
  });
  window.addEventListener('popstate', function () {
    if (lb.open) { pushed = false; lb.close(); }
  });
  lb.addEventListener('click', function (e) {
    if (e.target === lb || e.target.classList.contains('lb-body')) close();
  });
  q('.lb-x').addEventListener('click', close);
  q('.lb-prev').addEventListener('click', function () { show(cur - 1); });
  q('.lb-next').addEventListener('click', function () { show(cur + 1); });
  // ← → 只归弹窗：讲解页自己在 document 上也听 ← →（翻到上/下一篇），
  // 事件从 dialog 冒上去就会连带翻页。preventDefault 挡不住另一个监听器，要 stopPropagation。
  lb.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      show(cur + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });
  var tx = 0;
  lb.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
  }, { passive: true });

  figs.forEach(function (f, i) {
    var pic = f.querySelector('.kcard-pic');
    pic.addEventListener('click', function (e) { e.preventDefault(); open(i, pic); });
  });
  var m = location.hash.match(/^#look-([\w-]+)$/);
  if (m) {
    var i = figs.map(function (f) { return f.dataset.key; }).indexOf(m[1]);
    if (i >= 0) open(i);
  }
})();
