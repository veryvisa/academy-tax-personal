/**
 * 讲义卡组 —— 幻灯片 × 闪卡的合体。零依赖。
 *
 * 为什么不是「把长文切成幻灯片」：
 *   自动切分 9000 字的文档会得到 40 张垃圾片。幻灯片的价值在**取舍**——
 *   什么值得独占一屏，是判断，不是排版。所以卡组是**单独编排的**（courses/bc-level1/decks/*.json），
 *   与全文讲解页并存：卡组用来第一遍学与考前过，全文用来查与深读。
 *
 * 为什么每几张概念片后必须插一张自测片：
 *   被动翻页会产生「流畅错觉」——看着眼熟就以为记住了，实测这是备考里最贵的错觉。
 *   只有主动检索能形成记忆。所以 check 片是卡组的骨架，不是点缀；
 *   `deckLint` 强制每 5 张概念片至少一张 check（见 gates/deck_lint.py）。
 *
 * 交互：← → / 空格 / 点击左右半屏 / 手机左右滑。ESC 回目录。
 */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** 允许 **粗体** / `代码` / <br>，其余转义。讲义里这三样够用。 */
const rich = (s) => esc(s)
  .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
  .replace(/&lt;b&gt;/gi, "<b>")
  .replace(/&lt;\/b&gt;/gi, "</b>")
  .replace(/&lt;i&gt;/gi, "<i>")
  .replace(/&lt;\/i&gt;/gi, "</i>")
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>")
  .replace(/`(.+?)`/g, "<code>$1</code>");

const TONE = { principle: "principle", number: "number", ok: "ok", warn: "warn" };

/* ─────────────── 课程上下文 ───────────────
 *
 * 讲义进度存 localStorage，键必须**带课程名**——一个站两门课，
 * 不带课名的 `vv.deck.<id>` 会在两门课都有同名卡组时互相覆盖。
 * app.js 用的是同一套键（`vv.<课>.deck.<id>`），两处必须一致：
 * 不一致的表现是「进度页显示看过 12 张，讲义里却从第 1 张开始」。
 *
 * 课程身份从清册取，不在页面里塞全局变量——那样会有第二个说法。
 * 取不到就退回 bc-level1（它是根目录那门课，也是历史键的归属）。
 */
let CTX = { course: "bc-level1", blueprint: {} };
const deckKey = (id) => `vv.${CTX.course}.deck.${id}`;
async function loadCtx() {
  try {
    const m = await fetch("assets/manifest.json", { cache: "no-store" }).then((r) => r.json());
    CTX = { course: m.course || "bc-level1", blueprint: m.blueprint || {} };
  } catch { /* 清册取不到就用缺省，讲义本身不该因此打不开 */ }
}

/* ─────────────── 各类片的渲染 ─────────────── */

const renderers = {
  cover: (s) => `
    <div class="sl-cover">
      <h1>${rich(s.title)}</h1>
      ${s.title_en ? `<p class="sl-en">${esc(s.title_en)}</p>` : ""}
      ${s.lede ? `<p class="sl-lede">${rich(s.lede)}</p>` : ""}
      ${s.points ? `<ul class="sl-points">${s.points.map((p) => `<li>${rich(p)}</li>`).join("")}</ul>` : ""}
    </div>`,

  map: (s) => `
    <div class="sl-body">
      <h2>${rich(s.title)}</h2>
      ${s.hint ? `<p class="sl-hint">${rich(s.hint)}</p>` : ""}
      <div class="sl-groups">
        ${s.groups.map((g) => `
          <div class="sl-group sl-t-${TONE[g.tone] || "principle"}">
            <div class="sl-group-k">${esc(g.key)}</div>
            <div class="sl-group-b">
              <b>${esc(g.label)}</b>
              <span class="sl-en-sm">${esc(g.en || "")}</span>
              <div class="sl-ns">${g.ns.map((n) => `<i>${n}</i>`).join("")}</div>
            </div>
          </div>`).join("")}
      </div>
      ${s.aside ? `<p class="sl-aside">${rich(s.aside)}</p>` : ""}
    </div>`,

  section: (s) => `
    <div class="sl-section">
      <div class="sl-section-k">${esc(s.key)}</div>
      <h2>${rich(s.title)}</h2>
      ${s.en ? `<p class="sl-en">${esc(s.en)}</p>` : ""}
      ${s.ns ? `<div class="sl-ns big">${s.ns.map((n) => `<i>${n}</i>`).join("")}</div>` : ""}
      ${s.lede ? `<p class="sl-lede">${rich(s.lede)}</p>` : ""}
    </div>`,

  // 概念片：中英双行标题是刻意的——考卷考英文条名，讲解用中文。
  concept: (s) => `
    <div class="sl-body">
      <div class="sl-cn-head">
        ${s.n != null ? `<span class="sl-n">${s.n}</span>` : ""}
        <div>
          <h2 class="sl-term-en">${esc(s.en || "")}</h2>
          <p class="sl-term-cn">${esc(s.cn || "")}</p>
        </div>
      </div>
      <div class="sl-text">${rich(s.body)}</div>
      ${s.numbers ? `<div class="sl-nums">${s.numbers.map((n) =>
        `<span class="sl-num"><b>${esc(n.v)}</b>${esc(n.k)}</span>`).join("")}</div>` : ""}
      ${s.hook ? `<p class="sl-hook"><span>记法</span>${rich(s.hook)}</p>` : ""}
      ${s.watch ? `<p class="sl-watch">${rich(s.watch)}</p>` : ""}
      ${s.term_note ? `<p class="sl-termnote">${rich(s.term_note)}</p>` : ""}
    </div>`,


  // 分步计算片：赔款题的正解是「按顺序走完每一步」，不是心算出答案。
  // 把步骤逐行铺开，是因为考场上丢分最多的不是不会算，是跳步——
  // 算出 ACV 就当答案交了，忘了还有「取最小」和「减免赔额」。
  calc: (s) => `
    <div class="sl-body sl-calc">
      <h2>${rich(s.title)}</h2>
      ${s.subtitle ? `<p class="sl-hint">${rich(s.subtitle)}</p>` : ""}
      <div class="sl-given">
        ${(s.given || []).map((g) => `<span><i>${esc(g.k)}</i><b>${esc(g.v)}</b></span>`).join("")}
      </div>
      <ol class="sl-steps">
        ${(s.steps || []).map((st) => `<li>
          <span class="sl-step-l">${esc(st.label)}</span>
          <span class="sl-step-e">${rich(st.expr)}</span>
          ${st.note ? `<span class="sl-step-n">${rich(st.note)}</span>` : ""}
        </li>`).join("")}
      </ol>
      ${s.result ? `<div class="sl-result"><i>赔付</i><b>${esc(s.result.v)}</b>
        ${s.result.note ? `<span>${rich(s.result.note)}</span>` : ""}</div>` : ""}
      ${s.trap ? `<p class="sl-aside">${rich(s.trap)}</p>` : ""}
    </div>`,

  compare: (s) => `
    <div class="sl-body">
      <h2>${rich(s.title)}</h2>
      <div class="sl-cols">
        ${s.cols.map((c) => `
          <div class="sl-col sl-t-${TONE[c.tone] || "principle"}">
            <div class="sl-col-head"><b>${esc(c.head)}</b>
              ${c.head_en ? `<span class="sl-en-sm">${esc(c.head_en)}</span>` : ""}</div>
            ${c.term ? `<div class="sl-col-term">${esc(c.term)}</div>` : ""}
            <div class="sl-col-body">${rich(c.body)}</div>
            ${c.why ? `<div class="sl-col-why">${rich(c.why)}</div>` : ""}
          </div>`).join("")}
      </div>
      ${s.hook ? `<p class="sl-hook"><span>记法</span>${rich(s.hook)}</p>` : ""}
    </div>`,

  numbers: (s) => `
    <div class="sl-body">
      <h2>${rich(s.title)}</h2>
      ${s.hint ? `<p class="sl-hint">${rich(s.hint)}</p>` : ""}
      <table class="sl-numtable">
        ${s.rows.map((r) => `<tr class="${r.flag ? "flag" : ""}">
          <td class="v">${esc(r.v)}</td><td>${rich(r.k)}</td></tr>`).join("")}
      </table>
      ${s.aside ? `<p class="sl-aside">${rich(s.aside)}</p>` : ""}
    </div>`,

  // 自测片：答案默认藏起来。先想，再翻——顺序反了就退化成阅读。
  check: (s, i) => `
    <div class="sl-body sl-check">
      <div class="sl-check-tag">自测${s.tier ? ` · 第 ${s.tier} 层` : ""}</div>
      <h2 class="sl-q">${rich(s.q)}</h2>
      <button class="vv-btn vv-btn--primary sl-reveal" data-reveal="${i}">想好了，看答案</button>
      <div class="sl-answer" data-answer="${i}" hidden>
        <p class="sl-a">${rich(s.a)}</p>
        ${s.why ? `<div class="sl-why">${rich(s.why)}</div>` : ""}
      </div>
    </div>`,

  recap: (s) => `
    <div class="sl-body">
      <h2>${rich(s.title)}</h2>
      ${s.hint ? `<p class="sl-hint">${rich(s.hint)}</p>` : ""}
      <table class="sl-recap">
        ${s.items.map((it, idx) => {
          if (typeof it === "string") {
            return `<tr>
              <td class="n">${idx + 1}</td>
              <td class="en"></td>
              <td class="cn">${rich(it)}</td>
              <td class="g"></td></tr>`;
          }
          // support legacy {v,k} shape: v=label, k=explanation
          const n = it.n ?? (it.v ?? (idx + 1));
          const en = it.en || "";
          const cn = it.cn || it.k || "";
          const g = it.g || "";
          return `<tr>
            <td class="n">${n}</td>
            <td class="en">${esc(en)}</td>
            <td class="cn">${rich(cn)}</td>
            <td class="g">${esc(g)}</td></tr>`;
        }).join("")}
      </table>
    </div>`,


  outro: (s) => `
    <div class="sl-cover">
      <h1>${rich(s.title)}</h1>
      ${s.lede ? `<p class="sl-lede">${rich(s.lede)}</p>` : ""}
      <div class="sl-actions">
        ${(s.actions || []).map((a) =>
          `<a class="vv-btn ${a.primary ? "vv-btn--primary" : "vv-btn--secondary"}" href="${esc(a.href)}">${esc(a.label)}</a>`).join("")}
      </div>
      ${s.honest ? `<p class="sl-honest">${rich(s.honest)}</p>` : ""}
    </div>`,
};


/**
 * 卡组目录 —— 导航栏「讲义」直接点进来时看到的页面。
 *
 * 之前这里是一句「缺 ?deck= 参数」。导航栏里的一等项点进去看到报错，
 * 是纯静态实走时发现的：能用 ≠ 可用。
 * 现在列出全部卡组，并显示每组的进度（进度按卡组存在 localStorage，见 renderSlides）。
 */
async function renderDeckIndex(root) {
  let decks = [];
  try {
    decks = await fetch(`assets/decks.json?t=${Date.now()}`).then((r) => r.json());
  } catch {
    root.innerHTML = `<p class="sl-err">卡组清单读取失败。<a href="index.html">回路线</a></p>`;
    return;
  }
  // 板块中文名取自清册（＝ course.json 的唯一权威），不再在这里存第二份表
  const BP = Object.fromEntries(Object.entries(CTX.blueprint).map(([k, v]) => [k, v.label]));
  root.innerHTML = `
    <div class="sl-index">
      <h1>讲义</h1>
      <p class="sl-index-lede">按主题编排的幻灯片，每几张概念后插一张自测。
        第一遍学与考前过用它；查细节用<a href="docs/">讲解</a>。</p>
      <div class="sl-index-grid">
        ${decks.map((d) => {
          const done = Number(localStorage.getItem(deckKey(d.id))) || 0;
          const pct = d.n ? Math.round((done / (d.n - 1)) * 100) : 0;
          return `<a class="sl-index-card" href="slides.html?deck=${esc(d.id)}">
            <span class="sl-index-bp">${esc(BP[d.blueprint] || d.blueprint || "")}</span>
            <b>${esc(d.title)}</b>
            ${d.title_en ? `<span class="sl-index-en">${esc(d.title_en)}</span>` : ""}
            <span class="sl-index-meta">${d.n || "?"} 张 · 自测 ${d.checks || 0} · 约 ${d.minutes || "?"} 分钟</span>
            ${done > 0
              ? `<span class="sl-index-prog"><i style="width:${Math.min(100, pct)}%"></i></span>
                 <span class="sl-index-meta">已看到第 ${done + 1} 张</span>`
              : ""}
          </a>`;
        }).join("")}
      </div>
    </div>`;
}

/* ─────────────── 播放器 ─────────────── */

export async function renderSlides(root, deckId) {
  let deck;
  try {
    deck = await fetch(`assets/decks/${deckId}.json?t=${Date.now()}`).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  } catch {
    root.innerHTML = `<p class="sl-err">没找到这个卡组：<code>${esc(deckId)}</code>。<a href="index.html">回路线</a></p>`;
    return;
  }

  const slides = deck.slides || [];
  const KEY = deckKey(deck.id);

  // 解析优先次序：URL Hash (#14) > URL 参数 (?slide=14) > LocalStorage > 0
  const urlParams = new URLSearchParams(location.search);
  const hashNum = parseInt(location.hash.replace("#", ""), 10);
  const paramNum = parseInt(urlParams.get("slide") || urlParams.get("page") || "", 10);

  let i = 0;
  if (!isNaN(hashNum) && hashNum >= 1 && hashNum <= slides.length) {
    i = hashNum - 1;
  } else if (!isNaN(paramNum) && paramNum >= 1 && paramNum <= slides.length) {
    i = paramNum - 1;
  } else {
    i = Math.min(Number(localStorage.getItem(KEY)) || 0, slides.length - 1);
  }

  root.innerHTML = `
    <div class="sl-wrap">
      <div class="sl-bar"><div class="sl-bar-fill"></div></div>
      <div class="sl-top">
        <a href="index.html" class="sl-back">← ${esc(deck.title)}</a>
        <div class="sl-jump-wrap">
          <select class="sl-jump-select" title="直接跳转到指定页">
            ${slides.map((s, n) => {
              const text = s.title || s.cn || s.en || s.q || `Slide ${n + 1}`;
              const cleanText = text.replace(/<[^>]+>/g, "");
              return `<option value="${n}">${n + 1} / ${slides.length} · ${esc(cleanText)}</option>`;
            }).join("")}
          </select>
          <button class="vv-btn vv-btn--ghost sl-fullscreen" title="全屏(F)">⤢</button>
        </div>
      </div>
      <div class="sl-stage" tabindex="0"></div>
      <div class="sl-foot">
        <button class="vv-btn vv-btn--ghost vv-btn--sm" data-nav="-1">← 上一张</button>
        <div class="sl-dots"></div>
        <button class="vv-btn vv-btn--secondary vv-btn--sm" data-nav="1">下一张 →</button>
      </div>
    </div>`;

  const stage = root.querySelector(".sl-stage");
  const fill = root.querySelector(".sl-bar-fill");
  const jumpSelect = root.querySelector(".sl-jump-select");
  const dots = root.querySelector(".sl-dots");

  dots.innerHTML = slides.map((s, n) =>
    `<button class="sl-dot ${s.type === "check" ? "is-check" : ""}" data-go="${n}" title="${esc(s.title || s.en || s.q || "")}"></button>`).join("");

  function draw() {
    const s = slides[i];
    const fn = renderers[s.type] || renderers.concept;
    stage.innerHTML = `<div class="sl-slide sl-type-${esc(s.type)}">${fn(s, i)}</div>`;
    fill.style.width = `${((i + 1) / slides.length) * 100}%`;
    if (jumpSelect) jumpSelect.value = String(i);
    dots.querySelectorAll(".sl-dot").forEach((d, n) => d.classList.toggle("on", n === i));
    localStorage.setItem(KEY, String(i));
    history.replaceState(null, "", `#${i + 1}`);

    const rev = stage.querySelector("[data-reveal]");
    if (rev) {
      rev.onclick = () => {
        stage.querySelector("[data-answer]").hidden = false;
        rev.remove();
      };
    }
    stage.focus({ preventScroll: true });
    stage.scrollTop = 0;
  }

  const go = (d) => { i = Math.max(0, Math.min(slides.length - 1, i + d)); draw(); };
  root.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => go(Number(b.dataset.nav))));
  dots.onclick = (e) => { const b = e.target.closest("[data-go]"); if (b) { i = Number(b.dataset.go); draw(); } };
  if (jumpSelect) jumpSelect.onchange = (e) => { i = Number(e.target.value); draw(); };

  window.addEventListener("hashchange", () => {
    const h = parseInt(location.hash.replace("#", ""), 10);
    if (!isNaN(h) && h >= 1 && h <= slides.length && h - 1 !== i) {
      i = h - 1;
      draw();
    }
  });

  // Fullscreen toggle
  const fsBtn = root.querySelector('.sl-fullscreen');
  const wrapEl = root.querySelector('.sl-wrap');
  function updateFsButton() {
    if (!fsBtn) return;
    const on = !!document.fullscreenElement;
    fsBtn.textContent = on ? '⤢' : '⤢';
    fsBtn.title = on ? '退出全屏 (Esc 或 F)' : '全屏 (F)';
  }
  if (fsBtn) {
    fsBtn.onclick = () => {
      if (!document.fullscreenElement) {
        wrapEl.requestFullscreen?.().catch((e) => console.warn('FS failed', e));
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    };
    document.addEventListener('fullscreenchange', updateFsButton);
    // keyboard shortcut F to toggle
    document.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fsBtn.click(); } });
    updateFsButton();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "Escape") location.href = "index.html";
    else if (e.key === "Enter") stage.querySelector("[data-reveal]")?.click();
  });

  // 手机左右滑。阈值 50px 且横向位移必须大于纵向——否则上下滚动会被误判成翻页。
  let x0 = null, y0 = null;
  stage.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    x0 = y0 = null;
  }, { passive: true });

  draw();
}

const el = document.getElementById("slides");
if (el) {
  const deckId = new URLSearchParams(location.search).get("deck");
  // 先拿课程上下文再渲染：进度键依赖它，晚一步就会从 0 张开始
  loadCtx().then(() => (deckId ? renderSlides(el, deckId) : renderDeckIndex(el)));
}
