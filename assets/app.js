/**
 * 学习站应用层 —— 练习 / 模考 / 进度。零依赖，原生 ES module。
 *
 * 存储：现在落 localStorage，**schema 与 D1 生产表完全一致**——
 * `attempts` 只追加不修改（原始事实），`reviews` 由 attempts 可重放重建（派生态）。
 * 所以接后端时是换一个 store 实现，不是重写业务逻辑。
 *
 * 一条不可关闭的规则：**答完立刻给正确答案与每个错项的理由**。
 * 依据：无反馈的选择题会把错误知识固化（干扰项侵入率 5%→12%，一周后仍在）。
 * 反馈把它翻转过来。所以练习模式下没有「不看解析」这个选项。
 * 模考模式过程中不给反馈（保真），但交卷后必须逐题走完。
 */
import { Rating, newCard, review, previewIntervals, buildQueue, retentionForExam } from "./fsrs.mjs";
import { qhash, bankFingerprint, buildExport, validateExport, mergeLearningData, summarize } from "./learning-data.mjs";

const EXAM_DATE = "2026-12-15"; // 目标考期；进度页可改

/* ─────────────── 课程隔离 ───────────────
 *
 * 一个站两门课（bc-level1 / llqp），两套学习记录**必须互不干扰**。
 *
 * 为什么「题 id 前缀不同」不算隔离：进度页按 `attempts` 的长度报「累计作答」，
 * 按 `reviews` 的条数报「已掌握」，FSRS 队列按到期时间排——这些都是**整表统计**，
 * 不看 id 长什么样。两门课共用一张表，学 LLQP 会让 BC 的「今天该复习几张」凭空变大，
 * 而且没有任何提示。所以隔离必须落在**键名**上。
 *
 * 旧记录不能丢：2026-09-05 之前所有记录都写在无前缀的 `vv.attempts` 等键上，
 * 而那些记录全是 bc-level1 的。首次打开 bc-level1 时把它们**复制**（不是移动）
 * 到带课程名的键下。留着原件是有意的：万一这次改动出问题，回滚代码就能回到原状。
 */
const LEGACY_KEYS = { attempts: "vv.attempts", reviews: "vv.reviews", prefs: "vv.prefs",
                      events: "vv.events", deck: "vv.deck." };
const keysFor = (c) => ({
  attempts: `vv.${c}.attempts`, reviews: `vv.${c}.reviews`,
  prefs: `vv.${c}.prefs`, events: `vv.${c}.events`, deck: `vv.${c}.deck.`,
});
let COURSE_KEY = "bc-level1";
let KEY = keysFor(COURSE_KEY);

/** 把无前缀的旧记录搬进 bc-level1 的命名空间。只搬一次，且**不删原件**。 */
function migrateLegacy(legacyKeys = LEGACY_KEYS) {
  try {
    for (const f of ["attempts", "reviews", "prefs", "events"]) {
      if (localStorage.getItem(KEY[f]) === null && localStorage.getItem(legacyKeys[f]) !== null) {
        localStorage.setItem(KEY[f], localStorage.getItem(legacyKeys[f]));
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(legacyKeys.deck) || k.startsWith("vv.bc-level1.")) continue;
      const nk = KEY.deck + k.slice(legacyKeys.deck.length);
      if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k));
    }
    return true;
  } catch { /* 隐私模式下 localStorage 会抛。学习照常，只是记不住 */ return false; }
}

function setCourse(c) {
  COURSE_KEY = c || "bc-level1";
  KEY = keysFor(COURSE_KEY);
  if (COURSE_KEY === "bc-level1") migrateLegacy();
  if (COURSE_KEY === "tax-personal") {
    try {
      const marker = "vv.tax-personal.legacy-tax-migrated";
      if (localStorage.getItem(marker) === null && migrateLegacy(keysFor("tax"))) {
        localStorage.setItem(marker, "1");
      }
    } catch { /* 无持久存储时仍可学习 */ }
  }
}

/* ─────────────── 存储 ─────────────── */
const load = (k, dflt) => { try { return JSON.parse(localStorage.getItem(k)) ?? dflt; } catch { return dflt; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

/**
 * 学习会话 id —— 同一个标签页内的一段连续学习。
 *
 * 用 sessionStorage 而不是 localStorage：关掉标签页就该算新一段。
 * 它让「一段学习里越到后面越错」这类疲劳效应可分析——那是单人数据里
 * 少数几个真能算出来的东西之一，而它必须在作答那一刻就记下，事后拼不出来。
 */
const SESSION_ID = (() => {
  try {
    let s = sessionStorage.getItem("vv.sid");
    if (!s) { s = new Date().toISOString().slice(0, 19) + "-" + Math.random().toString(36).slice(2, 7); sessionStorage.setItem("vv.sid", s); }
    return s;
  } catch { return "nosession"; }
})();

/**
 * 本地永远是主副本，服务端是同步副本。
 *
 * 理由不是偷懒，是这个产品的使用场景：在地铁上、在等位时刷卡，网络时有时无。
 * 「先写本地、再尽力同步」意味着断网也能继续学，回到网络自动补齐；
 * 反过来做（先写服务端）会在最需要用的时候卡住。
 * 同步失败一律吞掉——它不该打断学习。
 */
let SESSION = { loggedIn: false };

const store = {
  attempts: () => load(KEY.attempts, []),
  reviews: () => load(KEY.reviews, {}),
  prefs: () => load(KEY.prefs, { examDate: EXAM_DATE }),
  /** append-only：永不 UPDATE、永不 DELETE。换调度算法时能整段重放。 */
  pushAttempt(a) {
    const rec = { ...a, at: new Date().toISOString() };
    const all = this.attempts();
    all.push(rec);
    save(KEY.attempts, all);
    if (SESSION.loggedIn) {
      fetch("/api/attempts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(rec),
      }).catch(() => {});
    }
  },
  events: () => load(KEY.events, []),
  /**
   * 第二条只追加的日志：作答之外的行为事件。
   *
   * 为什么不塞进 attempts：attempts 的语义是「一次作答」，进度页拿它的长度当作答数。
   * 往里混别的 kind 会让所有既有消费点悄悄算错。分开是为了别改坏已经对的东西。
   *
   * 现在只记一种：`rate` —— 看完解析后按「以后多久再见」的那一下。
   * 它带 `noteMs`＝从答完到评分之间的毫秒数，也就是**解析实际停留了多久**。
   * 记它的理由：本系统最大的一条主张是「答完必须看每个错项为什么错」，
   * 但这条主张此前没有任何执法点——0.3 秒点掉评分和读完解析，记录里长得一模一样。
   */
  pushEvent(e) {
    const rec = { ...e, sessionId: SESSION_ID, at: new Date().toISOString() };
    const all = this.events();
    all.push(rec);
    save(KEY.events, all);
  },
  /** 讲义进度散落在 vv.<课>.deck.<id> 上，导出时要一起带走。 */
  decks() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY.deck)) out[k.slice(KEY.deck.length)] = Number(localStorage.getItem(k)) || 0;
    }
    return out;
  },
  putReview(cardId, card) {
    const r = this.reviews();
    r[cardId] = card;
    save(KEY.reviews, r);
    if (SESSION.loggedIn) {
      fetch("/api/reviews", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, card }),
      }).catch(() => {});
    }
  },
  reset() { [KEY.attempts, KEY.reviews, KEY.events].forEach((k) => localStorage.removeItem(k)); },
};

/** 登录后把服务端记录并回本地：换设备时不至于从零开始。 */
async function hydrateFromServer() {
  if (!SESSION.loggedIn) return;
  try {
    const remote = await fetch("/api/state").then((r) => (r.ok ? r.json() : null));
    if (!remote) return;
    const seen = new Set(store.attempts().map((a) => a.cardId + "|" + a.at));
    const merged = [...store.attempts(), ...remote.attempts.filter((a) => !seen.has(a.cardId + "|" + a.at))];
    merged.sort((x, y) => (x.at < y.at ? -1 : 1));
    save(KEY.attempts, merged);
    // reviews 是派生态：服务端更新的覆盖本地更旧的
    const local = store.reviews();
    for (const [id, card] of Object.entries(remote.reviews || {})) {
      if (!local[id] || (card.lastReview || "") > (local[id].lastReview || "")) local[id] = card;
    }
    save(KEY.reviews, local);
  } catch { /* 同步失败不该打断学习 */ }
}

/** 页眉右上角显示登录态。未登录时给一个入口，不挡任何内容。 */
function renderAuth() {
  const nav = document.querySelector(".vv-header nav");
  if (!nav || document.getElementById("vv-auth")) return;
  const el = document.createElement("span");
  el.id = "vv-auth";
  el.className = "auth";
  if (SESSION.loggedIn) {
    el.innerHTML = `<span title="学习记录已跨设备同步">${esc(SESSION.username)}</span><a href="/auth/logout">退出</a>`;
  } else if (SESSION.available) {
    el.innerHTML = `<a href="/auth/login?next=${encodeURIComponent(location.pathname)}">用论坛账号登录</a>`;
  } else {
    // 没有后端：本地学习模式。说清楚记录存在哪，而不是给一个点不动的登录按钮。
    el.innerHTML = `<span class="auth-local" title="没有连接后端，学习记录存在这台设备的浏览器里">本地模式</span>`;
  }
  nav.after(el);
}

/* ─────────────── 数据 ─────────────── */
let QUESTIONS = [];
let MANIFEST = { blueprint: {} };
let DECKS = [];
let BANK = { n: 0, hash: "" };   // 题库指纹，随每条作答落盘
let QHASH = new Map();           // id → 该题当下的内容指纹
const BP_LABEL = (k) => MANIFEST.blueprint?.[k]?.label || k;

/**
 * 板块权重。**从 manifest 推，不写死。**
 *
 * 原来这里是一行字面量 `{industry:30, auto:30, …}`，与 `course.json` 一字不差，
 * 所以它看起来无害——直到加第二门课：LLQP 的板块是 life/as/seg/ethics，
 * 而这一行会让练习页的板块筛选栏、进度页的板块表、模考的抽题配额
 * **同时**去找一批根本不存在的板块，页面不报错，只是全部显示 0。
 * weight 为 0 的桶（bc 的 `other`、LLQP 的 `tax` 与两个 kb 桶）不进这张表：
 * 它们不是考纲板块，只是内容的归置处。
 */
let WEIGHTS = {};
const recomputeWeights = () => {
  WEIGHTS = Object.fromEntries(Object.entries(MANIFEST.blueprint || {})
    .filter(([, v]) => v && v.weight).map(([k, v]) => [k, v.weight]));
};

/** 这门课的模考形态：`full` ＝ 全部板块合成一张卷；`module` ＝ 每个板块一场独立考试。 */
const examMode = () => MANIFEST.exam_mode || "full";
/** 一个板块有没有能力组件（CISRO 的 c1–c4）。有的话练习与抽卷都要按它切。 */
const componentsOf = (bp) => {
  const c = MANIFEST.blueprint?.[bp]?.components;
  return c && Object.keys(c).length ? c : null;
};
/** 一道题挂在哪几个组件上。库里两种写法都有（字符串 / 数组），在这里合流。 */
const qComps = (q) => (Array.isArray(q?.component) ? q.component : q?.component ? [q.component] : []);

/**
 * 真考的每题节奏（秒）。**从 manifest 的考试规格算，不写死 72。**
 *
 * 72 秒是照 bc-level1「100 题 / 120 分钟」定的。那个尺寸一换（LLQP 是
 * 每场 35 题 / 75 分钟 ≈ 129 秒），写死的 72 不会报错，只会安静地把
 * 「答题节奏」整块指标判反——而一个判反了的指标比没有指标更贵。
 */
function examPace() {
  const ex = MANIFEST.exam || {};
  const mins = Number(ex.minutes) || 0;
  let n = Number(ex.questions) || 0;   // full 卷：course.json 直接给题数
  if (!n) {                            // module 卷：取各模块的卷面题数（取最大的那个）
    n = Math.max(0, ...Object.values(MANIFEST.blueprint || {})
      .map((v) => Number(v.questions_drawn) || Number(v.questions_scored) || 0));
  }
  if (!mins || !n) return null;
  return { perQ: (mins * 60) / n, n, mins };
}

async function boot() {
  const base = location.pathname.includes("/docs/") ? "../assets/" : "assets/";
  [QUESTIONS, MANIFEST, DECKS] = await Promise.all([
    fetch(base + "questions.json").then((r) => r.json()),
    fetch(base + "manifest.json").then((r) => r.json()),
    fetch(base + "decks.json").then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  // 指纹在这里算一次就够：题库是构建期产物，运行期不变。
  BANK = bankFingerprint(QUESTIONS);
  QHASH = new Map(QUESTIONS.map((q) => [q.id, qhash(q)]));
  // 课程身份来自清册本身，不靠页面里塞一个全局变量——那样两处会分叉，
  // 而分叉的表现是「记录写进了另一门课的键」，用户看到的是记录凭空消失。
  setCourse(MANIFEST.course);
  recomputeWeights();
  // 身份是可选的：拿不到（纯静态托管、没登录、接口不在）就当未登录继续跑。
  // 内容与练习都不该因为身份服务缺席而不可用。
  // 身份是可选的，而且要分清两种「没登录」：
  //   ① 有后端但没登录 → 显示登录入口
  //   ② 根本没有后端（纯静态本地学习）→ **不显示**登录入口
  // 纯静态实走时发现：不分这两种，本地用户会看到一个点了 404 的按钮。
  SESSION = await fetch("/api/me")
    .then((r) => (r.ok ? r.json().then((j) => ({ ...j, available: true }))
                       : { loggedIn: false, available: false }))
    .catch(() => ({ loggedIn: false, available: false }));
  renderAuth();
  await hydrateFromServer();
  if (document.getElementById("drill")) renderDrill();
  if (document.getElementById("exam")) renderExam();
  if (document.getElementById("progress")) renderProgress();
  if (document.getElementById("plan")) renderPlan();
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/**
 * 题干与解析里允许 **粗体**、`代码` 与 <br>，其余按纯文本转义。
 *
 * ⚠️ 必须与 slides.js 的 rich() 保持一致。曾经不一致过：slides.js 认 <br>、
 * app.js 不认，于是同一条 answer_note 在讲义里正常换行、在练习页显示成字面的
 * 「<br>」。35/110 道题的解析里有 <br>，全部受影响——浏览器实测才看见。
 */
const rich = (s) => esc(s)
  .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
  .replace(/&lt;b&gt;/gi, "<b>")
  .replace(/&lt;\/b&gt;/gi, "</b>")
  .replace(/&lt;i&gt;/gi, "<i>")
  .replace(/&lt;\/i&gt;/gi, "</i>")
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>")
  .replace(/`(.+?)`/g, "<code>$1</code>");
const shuffle = (a, seed = Date.now()) => {
  const r = [...a]; let s = seed;
  for (let i = r.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

/**
 * 选项渲染期洗牌 —— 位置偏斜的执法点。
 * 题库数据里正确答案的位置分布是偏的（终审实测 a15/b23/c12/d1——
 * 会考试的人做十题就学会「别选 d」）。数据层保持可读的编排顺序，
 * 偏斜在唯一的消费端（渲染）消掉：每次会话每题一个确定性乱序，
 * 同一题在「作答→看解析」之间顺序不变。显示字母=位置；o.key 仍是稳定主键。
 */
let SESSION_SEED = (Date.now() % 233280) || 1;
const idHash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 233280, 7);
const withShuffledOpts = (q) => ({ ...q, _opts: shuffle(q.options || [], (idHash(q.id) + SESSION_SEED) % 233280 || 1) });

/**
 * 题目 → 对应讲解页（学习闭环：错了不只看解析，还能回读整章）。
 *
 * 三条规则，从窄到宽。**都以清册里真有这一篇为准**，凑不出就返回 null——
 * 宁可不给链接，也不给一个点下去 404 的链接。
 */
function sourceLink(q) {
  const src = q && q.source;
  if (!src || !MANIFEST.docs) return null;
  const has = (slug) => MANIFEST.docs.some((d) => d.slug === slug);
  if (src.doc === "FOI" && /^ch\d+$/.test(src.chapter || "")) {
    if (has("foi-" + src.chapter)) return "docs/foi-" + src.chapter + ".html";
  }
  if (src.doc === "ICBC 学习指南" || src.doc === "Autoplan Supplement") {
    if (has("guide-autoplan-basics")) return "docs/guide-autoplan-basics.html";
  }
  // 按模块 + 章号前缀反查（LLQP：`life-ch11-recommending` ← blueprint life / chapter ch11）。
  // 不建 E311→life 这类映射表：那张表会与 course.json 分叉，而清册里已经有 module 字段了。
  if (q.blueprint && /^ch[\d]+/.test(src.chapter || "")) {
    const pre = `${q.blueprint}-${src.chapter}`;
    const hit = MANIFEST.docs.find((d) => d.slug === pre || d.slug.startsWith(pre + "-"));
    if (hit) return "docs/" + hit.slug + ".html";
  }
  return null;
}

function cardStateOf(id) {
  return store.reviews()[id] || newCard(id);
}


/* ─────────────── 今天学什么 ───────────────
 * 这是我自己加的，用户没提。理由：
 * 打开站点看见一个菜单，得先决定「今天干嘛」——决定疲劳是学习习惯的头号杀手，
 * 而且它每天都要付一次。把决定挪到构建期（我来定规则），用户只需要点「开始」。
 *
 * 规则按「先还债、再打地基、最后开新坑」排，与 FSRS 队列同一个哲学：
 *   1. 到期复习（欠的债，不还会利滚利）
 *   2. 高信心错题（最危险的洞）
 *   3. 没过的讲义（地基）
 *   4. 缺口最大的板块练习（按考纲权重算缺口，不按感觉）
 */
function renderPlan() {
  const root = document.getElementById("plan");
  const prefs = store.prefs();
  const daysLeft = Math.ceil((new Date(prefs.examDate) - new Date()) / 86400000);
  // 自撰练习课（税务两课）没有考试：首页不许出现「N 天到考试」「考纲 N%」（2026-09-13 线上实见，默认考期 +93 天）
  const selfPractice = MANIFEST.blueprint_policy?.kind === "self_authored_practice";
  const reviews = store.reviews();
  const attempts = store.attempts();
  const now = Date.now();
  const practice = drillQuestions();
  const passMark = Number(MANIFEST.exam?.pass_mark) || 70;

  const cards = practice.map((q) => reviews[q.id]).filter(Boolean);
  const due = cards.filter((c) => c.due && new Date(c.due).getTime() <= now);
  const highConfWrong = due.filter((c) => c.lastWrongCertainty === 3 && (c.streak || 0) < 3);
  const untouched = practice.filter((q) => !reviews[q.id]);

  // 板块缺口：按考纲权重算「应练多少」与「已练多少」的差，不按题数
  const seenBy = {}, totalBy = {};
  for (const q of practice) {
    totalBy[q.blueprint] = (totalBy[q.blueprint] || 0) + 1;
    if (reviews[q.id]) seenBy[q.blueprint] = (seenBy[q.blueprint] || 0) + 1;
  }
  const gaps = Object.entries(WEIGHTS).map(([bp, w]) => {
    const total = totalBy[bp] || 0, seen = seenBy[bp] || 0;
    return { bp, w, total, seen, cover: total ? seen / total : 0, gap: w * (1 - (total ? seen / total : 0)) };
  }).sort((a, b) => b.gap - a.gap);
  const weakest = gaps.find((g) => g.total > 0);

  // 正确率最低的板块（至少答过 5 题才算数——3 题算不出正确率，只会误导）
  const byBp = {};
  for (const a of attempts) {
    const q = QUESTIONS.find((x) => x.id === a.cardId);
    if (!q || a.correct == null) continue;
    (byBp[q.blueprint] ||= { n: 0, ok: 0 });
    byBp[q.blueprint].n++; if (a.correct) byBp[q.blueprint].ok++;
  }
  const weakRate = Object.entries(byBp).filter(([, v]) => v.n >= 5)
    .map(([bp, v]) => ({ bp, rate: v.ok / v.n, n: v.n })).sort((a, b) => a.rate - b.rate)[0];

  const items = [];
  if (highConfWrong.length) {
    items.push({ icon: "!", tone: "danger", title: `清 ${highConfWrong.length} 张高信心错题`,
      note: "你当时很确定，但答错了 —— 这是最危险的一类洞，优先级高于普通复习。",
      href: "drill.html", cta: "去清" });
  }
  if (due.length) {
    items.push({ icon: "↻", tone: "accent", title: `复习 ${due.length} 张到期卡片`,
      note: `按 FSRS 排的，今天不做明天会堆更多。约 ${Math.ceil(due.length * 0.4)} 分钟。`,
      href: "drill.html", cta: "开始" });
  }
  const deckDone = DECKS.filter((d) => Number(localStorage.getItem(KEY.deck + d.id) || 0) >= d.n - 1);
  const deckTodo = DECKS.find((d) => !deckDone.includes(d));
  if (deckTodo) {
    const at = Number(localStorage.getItem(KEY.deck + deckTodo.id) || 0);
    items.push({ icon: "▤", tone: "ok", title: (at ? "接着过" : "过一遍") + `《${deckTodo.title}》讲义`,
      note: at ? `上次看到第 ${at + 1} / ${deckTodo.n} 张。` :
        `${deckTodo.n} 张，含 ${deckTodo.checks} 道自测，约 ${deckTodo.minutes || 15} 分钟。`,
      href: `slides.html?deck=${deckTodo.id}`, cta: at ? "继续" : "开始" });
  }
  if (weakRate && weakRate.rate < passMark / 100) {
    items.push({ icon: "▼", tone: "warn", title: `补 ${BP_LABEL(weakRate.bp)}：正确率 ${Math.round(weakRate.rate * 100)}%`,
      note: `已答 ${weakRate.n} 题，低于 ${passMark}% 及格线。这是目前最该补的板块。`,
      href: `drill.html?bp=${weakRate.bp}`, cta: "去练" });
  } else if (weakest && weakest.cover < 0.9) {
    items.push({ icon: "＋", tone: "accent", title: `练 ${BP_LABEL(weakest.bp)}（${selfPractice ? "练习配比" : "考纲"} ${weakest.w}%）`,
      note: `这个板块你只碰过 ${weakest.seen}/${weakest.total} 题，是按${selfPractice ? "练习配比" : "考纲权重"}算缺口最大的一块。`,
      href: `drill.html?bp=${weakest.bp}`, cta: "去练" });
  }
  if (!items.length) {
    items.push({ icon: "✓", tone: "ok", title: "今天没有到期的复习",
      note: `${untouched.length} 道题还没碰过。想加量就直接开练，不想加量就休息——间隔重复靠的是坚持，不是单日强度。`,
      href: "drill.html", cta: "随便练点" });
  }

  root.innerHTML = `
    <div class="plan-head">
      <div><h2>今天学什么</h2>
        <p class="sub">不用自己想 —— 按「先还债、再打地基、最后开新坑」排好了。</p></div>
      ${selfPractice ? "" : `<div class="plan-days"><b>${daysLeft > 0 ? daysLeft : 0}</b><span>天到考试</span></div>`}
    </div>
    <div class="plan-list">
      ${items.slice(0, 3).map((it, i) => `
        <a class="plan-item t-${it.tone}" href="${it.href}">
          <span class="plan-n">${i + 1}</span>
          <span class="plan-ico">${it.icon}</span>
          <span class="plan-b"><b>${esc(it.title)}</b><span>${esc(it.note)}</span></span>
          <span class="plan-cta">${esc(it.cta)} →</span>
        </a>`).join("")}
    </div>`;
}

/* ─────────────── 练习 ─────────────── */
function drillQuestions() {
  return QUESTIONS.filter((q) => examMode() === "module" ? q.pool === "drill" : (q.pool || "drill") !== "exam");
}

function renderDrill() {
  const root = document.getElementById("drill");
  const params = new URLSearchParams(location.search);
  let filterBp = params.get("bp") || "all";
  let filterType = params.get("type") || "all";
  // 能力组件筛选（LLQP）。真考按组件配额出题，所以「练某个组件」是一个真实的意图，
  // 不是花活：A&S 的 c3「落实推荐」现在只有 3 道题，不按组件筛就永远撞不到它。
  let filterComp = params.get("comp") || "all";
  const filterTag = params.get("tag") || "";
  let queue = [], idx = 0, answered = null, certainty = null;
  // 计时状态。shownAt→作答＝思考用时；answeredAt→评分＝解析停留时长。
  let shownIdx = -1, shownAt = 0, answeredAt = 0, answeredCorrect = null;

  function pool() {
    // 只练习池。模考专属题永远不在这里出现——它们的全部价值就在于「你没见过」。
    let p = drillQuestions();
    if (filterBp !== "all") p = p.filter((q) => q.blueprint === filterBp);
    if (filterComp !== "all") p = p.filter((q) => qComps(q).includes(filterComp));
    if (filterType !== "all") {
      // 中英术语两个方向合成一个筛选项——用户想的是「练术语」，不是「练 en2cn」
      const want = filterType === "bilingual" ? ["en2cn", "cn2en"] : [filterType];
      p = p.filter((q) => want.includes(q.card_type));
    }
    // tag 过滤让讲义卡组能把人直接送到「这一讲的题」（slides 的 outro 就是这么跳的）
    if (filterTag) p = p.filter((q) => (q.tags || []).includes(filterTag));
    return p;
  }

  function buildSession() {
    const p = pool();
    const reviews = store.reviews();
    const cards = p.map((q) => ({ ...cardStateOf(q.id), cardId: q.id }));
    const q = buildQueue({ cards, newLimit: 20, reviewLimit: 30 });
    const ids = new Set(q.map((c) => c.cardId));
    // 队列可能为空（全部没到期）——那就随机给一轮，别让人对着空屏幕
    queue = q.length ? p.filter((x) => ids.has(x.id)) : shuffle(p).slice(0, 15);
    queue = shuffle(queue).map(withShuffledOpts);
    idx = 0; answered = null; certainty = null;
    shownIdx = -1; answeredAt = 0; answeredCorrect = null;
    draw();
  }

  function controls() {
    const available = drillQuestions();
    const bps = ["all", ...Object.keys(examMode() === "study_only" ? MANIFEST.blueprint : WEIGHTS)];
    const types = [["all", "全部题型"], ["except", "找例外"],
                   ["match", "编号配对"], ["mcq", "常规单选"], ["scenario", "情景判断与计算"],
                   ["discriminate", "辨析"], ["bilingual", "中英术语"]];
    const bpLabel = examMode() === "module" ? "模块" : "板块";
    // 组件那一行只在「选定了某个模块 **且** 这个模块真的分组件」时出现。
    // 选「全部」时不出：不同模块的 c1 含义不同（LLQP 的 Ethics c1 与 Life c1 完全是两回事），
    // 跨模块合并会算出一个没有意义的数。
    const comps = filterBp !== "all" ? componentsOf(filterBp) : null;
    const inBp = comps ? available.filter((q) => q.blueprint === filterBp) : [];
    const compRow = comps ? `<div class="ctrl-row"><span>能力组件</span>${
      [["all", "全部组件", inBp.length],
       ...Object.entries(comps).map(([c, meta]) => [c, `${c} · ${Array.isArray(meta) ? meta[0] : c}`,
         inBp.filter((q) => qComps(q).includes(c)).length])]
        .map(([c, l, n]) =>
          `<button class="chip${c === filterComp ? " on" : ""}" data-comp="${c}" title="${esc(l)}">${
            esc(String(l).slice(0, 22))}<i>${n}</i></button>`).join("")}</div>` : "";
    return `<div class="ctrl">
      <div class="ctrl-row"><span>${bpLabel}</span>${bps.map((b) =>
        `<button class="chip${b === filterBp ? " on" : ""}" data-bp="${b}">${
          b === "all" ? "全部" : esc(BP_LABEL(b))}<i>${
          b === "all" ? available.length : available.filter((q) => q.blueprint === b).length}</i></button>`).join("")}</div>
      ${compRow}
      <div class="ctrl-row"><span>题型</span>${types.map(([t, l]) =>
        `<button class="chip${t === filterType ? " on" : ""}" data-type="${t}">${esc(l)}<i>${
          t === "all" ? available.length
          : t === "bilingual" ? available.filter((q) => q.card_type === "en2cn" || q.card_type === "cn2en").length
          : available.filter((q) => q.card_type === t).length}</i></button>`).join("")}</div>
    </div>`;
  }

  function draw() {
    if (!queue.length) {
      root.innerHTML = `<div class="pad">${controls()}
        <div class="vv-callout"><span class="vv-callout__icon">◎</span>
        <div>这个筛选下暂时没有题。换个板块，或把题型切回「全部」。</div></div></div>`;
      wire(); return;
    }
    if (idx >= queue.length) { drawDone(); return; }

    // 首次看见这道题的时刻。draw() 还会因为「报信心」「看解析」被重复调用，
    // 所以计时只在换题时重置——latencyMs 的语义是「从看见到点下答案」，
    // 含读题、思考、报信心的全部时间。真考每题 72 秒，这个数才有对照物。
    if (shownIdx !== idx) { shownIdx = idx; shownAt = Date.now(); }

    const q = queue[idx];
    const opts = q._opts || q.options || [];
    const done = answered !== null;
    const chosen = answered;
    const correctKey = opts.find((o) => o.correct)?.key;

    root.innerHTML = `<div class="pad">
      ${controls()}
      <div class="q-head">
        <span class="vv-badge vv-badge--accent">${esc(BP_LABEL(q.blueprint))}</span>
        <span class="vv-badge">${q.card_type === "except" ? "找例外" : q.card_type === "scenario" ? "情景" : q.card_type === "discriminate" ? "辨析" : "单选"}</span>
        <span class="vv-fact vv-fact--${q.fact_layer === "principle" ? "principle" : q.fact_layer === "current_number" ? "current" : "textbook"}">${
          q.fact_layer === "principle" ? "原理层" : q.fact_layer === "current_number" ? "现行数字" : "教材数字"}</span>
        <span class="q-pos">${idx + 1} / ${queue.length}</span>
      </div>
      <p class="q-stem">${rich(q.stem)}</p>
      ${!done ? `<div class="cbm"><span>作答前先报信心：</span>
        ${[[1, "不太确定"], [2, "大概吧"], [3, "很确定"]].map(([v, l]) =>
          `<button class="chip${certainty === v ? " on" : ""}" data-cert="${v}">${l}</button>`).join("")}</div>` : ""}
      <div class="opts">${opts.map((o, oi) => {
        let cls = "vv-opt";
        if (done) {
          if (o.key === correctKey) cls += " vv-opt--correct";
          else if (o.key === chosen) cls += " vv-opt--wrong";
        }
        return `<button class="${cls}" data-opt="${o.key}"${done ? " disabled" : ""}>
          <span class="vv-opt__key">${"ABCD"[oi] || o.key.toUpperCase()}</span>
          <span>${rich(o.text)}${done && o.why_wrong ? `<span class="vv-opt__why">${rich(o.why_wrong)}</span>` : ""}
          ${done && o.key === correctKey ? '<span class="vv-opt__why">✓ 正确答案</span>' : ""}</span></button>`;
      }).join("")}</div>
      ${done ? `<div class="vv-callout vv-callout--info note"><span class="vv-callout__icon">✎</span>
        <div>${rich(q.answer_note || "")}
        <div class="src">来源：${esc(q.source?.doc || "")} ${esc(q.source?.chapter || "")}${
          q.source?.anchor ? " · " + esc(q.source.anchor) : ""}${
          sourceLink(q) ? ` · <a href="${sourceLink(q)}">回读这一章 →</a>` : ""}</div></div></div>
        <div class="rate"><span>这题以后多久再见？</span>${
          [[Rating.Again, "忘了"], [Rating.Hard, "困难"], [Rating.Good, "还行"], [Rating.Easy, "简单"]]
            .map(([g, l]) => `<button class="vv-btn ${g === Rating.Good ? "vv-btn--primary" : "vv-btn--secondary"} vv-btn--sm" data-rate="${g}">${l}<i>${previewOf(q.id, g)}</i></button>`).join("")}
        </div>` : ""}
    </div>`;
    wire();
  }

  function previewOf(id, g) {
    const p = previewIntervals(cardStateOf(id), new Date(),
      { examDate: store.prefs().examDate, desiredRetention: retentionForExam(daysLeft()) });
    const name = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" }[g];
    const d = p[name];
    return d >= 30 ? `${Math.round(d / 30)} 月` : `${d} 天`;
  }

  function drawDone() {
    const s = sessionStats();
    root.innerHTML = `<div class="pad done">
      <h2>这一轮做完了</h2>
      <p class="big">${s.correct} / ${s.total} 正确 · ${Math.round(100 * s.correct / Math.max(s.total, 1))}%</p>
      ${s.highConfWrong ? `<div class="vv-callout vv-callout--danger"><span class="vv-callout__icon">⚠︎</span>
        <div><b>其中 ${s.highConfWrong} 题你答错了，而且当时很确定。</b>
        这是最危险的一类洞——在考卷上是一分之差，在客户面前是天壤之别。
        它们已经排到你队列的最前面。</div></div>` : ""}
      <div class="row"><button class="vv-btn vv-btn--primary" id="again">再来一轮</button>
      <a class="vv-btn vv-btn--secondary" href="${examMode() === "study_only" ? "index.html" : "progress.html"}">${examMode() === "study_only" ? "回课程" : "看进度"}</a></div></div>`;
    document.getElementById("again").onclick = buildSession;
  }

  function sessionStats() {
    const at = store.attempts().slice(-queue.length);
    return {
      total: at.length,
      correct: at.filter((a) => a.correct).length,
      highConfWrong: at.filter((a) => !a.correct && a.certainty === 3).length,
    };
  }

  function daysLeft() {
    return Math.ceil((new Date(store.prefs().examDate) - new Date()) / 86400000);
  }

  function wire() {
    // 换模块必须把组件筛选归位：c3 在 Life 有 19 道题、在 A&S 只有 3 道，
    // 不归位就会跳进一个「这个筛选下暂时没有题」的空屏，而人会以为是站坏了。
    root.querySelectorAll("[data-bp]").forEach((b) => b.onclick = () => { filterBp = b.dataset.bp; filterComp = "all"; buildSession(); });
    root.querySelectorAll("[data-comp]").forEach((b) => b.onclick = () => { filterComp = b.dataset.comp; buildSession(); });
    root.querySelectorAll("[data-type]").forEach((b) => b.onclick = () => { filterType = b.dataset.type; buildSession(); });
    root.querySelectorAll("[data-cert]").forEach((b) => b.onclick = () => { certainty = +b.dataset.cert; draw(); });
    root.querySelectorAll("[data-opt]").forEach((b) => b.onclick = () => {
      const q = queue[idx];
      answered = b.dataset.opt;
      answeredAt = Date.now();
      const ok = q.options.find((o) => o.key === answered)?.correct === true;
      answeredCorrect = ok ? 1 : 0;
      // 渲染期洗过牌，所以「他看到的顺序」和题库里的顺序不是一回事。
      // 不记下来，位置偏好（老是选第二个）就永远算不出来——那是事后补不回的信息。
      const shown = (q._opts || q.options || []).map((o) => o.key);
      store.pushAttempt({
        cardId: q.id, mode: "drill", chosen: answered, correct: ok ? 1 : 0,
        certainty, blueprint: q.blueprint, cardType: q.card_type, fedBack: 1,
        latencyMs: Math.max(0, answeredAt - shownAt),
        shownOrder: shown.join(""), posChosen: shown.indexOf(answered),
        qhash: QHASH.get(q.id) || "", sessionId: SESSION_ID, queuePos: idx,
      });
      draw();
    });
    root.querySelectorAll("[data-rate]").forEach((b) => b.onclick = () => {
      const q = queue[idx];
      // 解析停留时长。答错却只停留两秒＝正在给自己种错误记忆，
      // 而这正是本系统「必须看解析」那条主张的唯一执法点。
      store.pushEvent({ kind: "rate", cardId: q.id, rating: +b.dataset.rate,
        noteMs: answeredAt ? Math.max(0, Date.now() - answeredAt) : null,
        correct: answeredCorrect });
      const next = review(cardStateOf(q.id), +b.dataset.rate, new Date(),
        { examDate: store.prefs().examDate, desiredRetention: retentionForExam(daysLeft()) });
      const at = store.attempts();
      const last = at.filter((a) => a.cardId === q.id).at(-1);
      // 语义＝「最近一次答错时的信心」。每次答错都覆盖（低信心错要把旧的 3 冲掉，
      // 否则一次高信心错会把这张卡永远钉成最高危）；答对不清——
      // 出库判据是三次律（buildQueue 里 streak≥3），不是这里。
      if (last && !last.correct) next.lastWrongCertainty = last.certainty ?? null;
      store.putReview(q.id, next);
      idx++; answered = null; certainty = null; answeredAt = 0; answeredCorrect = null;
      draw();
    });
  }

  buildSession();
}

/* ─────────────── 模考 ───────────────
 *
 * 两种形态，一个函数：
 *   full   —— 一张卷考完全部板块（bc-level1：100 题 / 120 分钟 / 70%）
 *   module —— 每个板块一场独立考试（LLQP：四场，各 75 分钟 / 60%，按 CISRO 能力组件配额抽题）
 *
 * 为什么不拆成两个渲染函数：抽卷、计时、交卷、逐题走一遍是同一套；
 * 真正不同的只有「抽多少题、按什么配额、及格线怎么报」。拆开会得到两份
 * 各自漂移的作答记录写入点，而 `bin/attempt_analysis.py --contract` 抓到过的
 * 恰恰就是这类分叉（模考写 answerOrder、分析器读 queuePos）。
 * 所以 `store.pushAttempt` 全站只有两个调用点：练习一个、模考一个。
 */
/** Largest remainder: exact total, stable ties in registry order. */
function allocateQuota(weights, total) {
  const positive = Object.entries(weights).filter(([, v]) => Number(v) > 0);
  const denominator = positive.reduce((a, [, v]) => a + Number(v), 0);
  if (!denominator || total <= 0) return {};
  const raw = Object.fromEntries(positive.map(([k, v]) => [k, Number(v) * total / denominator]));
  const out = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.floor(v)]));
  const left = total - Object.values(out).reduce((a, b) => a + b, 0);
  Object.keys(raw).sort((a, b) => (raw[b] - out[b]) - (raw[a] - out[a]))
    .slice(0, left).forEach(k => out[k]++);
  return out;
}

function renderExam() {
  const root = document.getElementById("exam");
  if (MANIFEST.status === "study_only" || examMode() === "study_only") {
    root.innerHTML = '<h2>本课仅开放学习与练习</h2><p>官方考试规格待核，未启用计时、及格线或模考。请使用<a href="drill.html">逐题练习</a>。</p>';
    return;
  }
  let paper = [], answers = {}, started = null, submitted = false, tick = null;
  /**
   * 每题的作答行为。模考是整卷一屏，没有「这题渲染了」这个时刻，
   * 所以用时只能近似：**两次「首答」之间的间隔**。它会把中途跳回去改答案、
   * 发呆、翻上一题的时间都算进当前这题——用来抓离群值够用，用来说「这题正好几秒」不够。
   * 近似归近似，`changes`（改了几次）是精确的，而它才是「题目有歧义」的直接证据。
   */
  let meta = {}, answeredSeq = 0, lastActionAt = 0, paperId = "", repeated = 0;
  // module 模式专有：考哪一场、哪几道不计分、哪个组件抽不满
  let picked = null, pilots = new Set(), shortfall = [];

  const MODULE = examMode() === "module";
  let EXAM = MANIFEST.exam || {};
  const SETS = MANIFEST.exam_sets || {};
  let pickedSet = null, paperWeights = WEIGHTS;
  const SELF_SPEC = EXAM.spec_status === "self_authored";
  const REVIEW_POOL = EXAM.pool_policy === "review";
  const SELF_WEIGHTS = MANIFEST.blueprint_policy?.kind === "self_authored_practice";
  const PASS = Number(EXAM.pass_mark) || 70;
  const GATE = Number(EXAM.self_gate) || PASS + 10;

  // 真考 100 题 / 2 小时。题库不够时按比例缩，并且**明说**它缩了。
  const REAL_N = Number(EXAM.questions) || 100, REAL_MIN = Number(EXAM.minutes) || 120;

  /** 这一场的规格：卷面几题、计分几题、多少分钟。module 模式下随选中的模块变。 */
  function spec() {
    if (pickedSet) { const s = SETS[pickedSet]; return {drawn:s.questions, scored:s.questions, mins:s.minutes}; }
    if (!MODULE) return { drawn: REAL_N, scored: REAL_N, mins: REAL_MIN };
    const b = MANIFEST.blueprint[picked] || {};
    const drawn = Number(b.questions_drawn) || Number(b.questions_scored) || 0;
    return { drawn, scored: Number(b.questions_scored) || drawn, mins: REAL_MIN };
  }

  /**
   * 组件配额 ＝ 卷面题数 × 组件权重，**最大余数法**凑整。
   *
   * ⚠️ 这个算法在 producer 侧也有一份（`python3 bin/llqp_lint.py --quota`，
   * 它按同一口径判「池子够不够 2×配额」）。两份必须给出同一个数——
   * 判据在 `gates/llqp_site.py` 里：拿 llqp_lint 的输出与本函数的输出逐格比对。
   * 不比对的话，lint 说「c3 池够了」而抽卷时照样抽不满，谁也不会发现是两套算法。
   */
  function quotaFor(bp) {
    const comps = componentsOf(bp);
    if (!comps) return null;
    const n = spec().drawn;
    const raw = {}, out = {};
    for (const [c, meta2] of Object.entries(comps)) {
      raw[c] = (Number(Array.isArray(meta2) ? meta2[1] : meta2) / 100) * n;
      out[c] = Math.floor(raw[c]);
    }
    let left = n - Object.values(out).reduce((x, y) => x + y, 0);
    for (const c of Object.keys(raw).sort((x, y) => (raw[y] - out[y]) - (raw[x] - out[x]))) {
      if (left-- <= 0) break;
      out[c]++;
    }
    return out;
  }

  // 模考只从模考池抽。与练习池不重叠是这个功能成立的前提——
  // 共用题库时会撞到刚做过的原题，分数被「我见过」抬高，而模考的唯一用途
  // 就是估计真考表现，一个系统性高估的估计器等于没有。
  const EXAM_POOL = () => QUESTIONS.filter((q) =>
    (!MODULE || q.blueprint === picked) &&
    (MODULE || Number(paperWeights[q.blueprint]) > 0) &&
    (REVIEW_POOL || (MODULE ? q.pool === "exam" : ["exam", "both"].includes(q.pool || "drill"))) &&
    (REVIEW_POOL || !store.attempts().some((a) => a.mode !== "exam" && a.cardId === q.id)));
  const POOL_SEPARATED = () => EXAM_POOL().every((q) => q.pool === "exam");
  /**
   * 上一张卷考过的题号。**抽题要避开它们。**
   *
   * 为什么这件事非做不可：模考的唯一用途是估计真考表现，而
   * `course.json` 的 `self_gate` 要求「模考稳定 ≥ 某个分数」——稳定意味着要考很多次。
   * 池子只有 1 倍卷面需求时，第二张卷就是第一张卷；哪怕扩到 2 倍，
   * 随机抽两次的期望重叠仍有 50%。两次考同一批题，测的是**对这张卷的记忆**，
   * 不是准备度，而分数照样会涨——一个系统性高估的估计器比没有估计器更危险。
   *
   * 池 ≥ 2×需求（`gates/question_lint.py` 的 exam-pool-2x / `bin/llqp_lint.py`
   * 的 component-pool）**加上**这里的避重，才能保证第二张卷与第一张零重叠。
   * 缺任何一半，那条判据都是假的。
   *
   * 只避开**最近一张**卷，不是全部历史：避得太狠会在池子见底时无题可抽，
   * 那时要么出残卷、要么静默重复，两个都比「隔一张卷再见」糟。
   * module 模式按模块分开算——考完 Life 再考 A&S，不该被 Life 那张卷限制。
   */
  function lastPaperIds() {
    let ex = store.attempts().filter((a) => a.mode === "exam" && a.paperId);
    if (MODULE || pickedSet) ex = ex.filter((a) => String(a.paperId).startsWith((picked || pickedSet) + "#"));
    if (!ex.length) return new Set();
    const last = ex[ex.length - 1].paperId;
    return new Set(ex.filter((a) => a.paperId === last).map((a) => a.cardId));
  }

  function buildPaper() {
    const src = EXAM_POOL();
    const seen = lastPaperIds();
    const sp = spec();
    const chosen = [];
    shortfall = [];
    const comps = MODULE ? componentsOf(picked) : null;
    if (comps) {
      // 按能力组件配额抽。**某个组件抽不满就据实少抽，绝不拿别的组件顶替**——
      // 顶替出来的分数会让人以为这个组件已经够了，而它恰恰是最该补的那一块。
      const quota = quotaFor(picked);
      for (const [c, want] of Object.entries(quota)) {
        const all = shuffle(src.filter((q) => qComps(q).includes(c) && !chosen.some((x) => x.id === q.id)));
        const avail = [...all.filter((q) => !seen.has(q.id)), ...all.filter((q) => seen.has(q.id))];
        const take = avail.slice(0, want);
        chosen.push(...take);
        if (take.length < want) shortfall.push({ c, want, got: take.length, pool: all.length });
      }
    } else {
      const quota = allocateQuota(MODULE ? {[picked]:100} : paperWeights, sp.drawn);
      for (const [bp, want] of Object.entries(quota)) {
        const all = shuffle(src.filter((q) => q.blueprint === bp));
        const avail = [...all.filter((q) => !seen.has(q.id)), ...all.filter((q) => seen.has(q.id))];
        const take = avail.slice(0, want);
        chosen.push(...take);
        if (take.length < want) shortfall.push({c: bp, want, got: take.length, pool: all.length});
      }
    }
    paper = shuffle(chosen).map(withShuffledOpts);
    repeated = paper.filter((q) => seen.has(q.id)).length;

    // 不计分题（pilot）。真考每场都塞几道正在试的新题，考生分辨不出哪几道——
    // 所以「每题都当计分题答」本身就是要练的东西。
    // ⚠️ 只有抽满了才designate：卷子本来就短的时候再扣掉 5 道，
    // 得到的是一个更小的分母和更大的方差，那不是仿真，是自找噪音。
    pilots = new Set();
    if (MODULE && paper.length >= sp.drawn && sp.drawn > sp.scored) {
      for (const q of shuffle(paper).slice(0, sp.drawn - sp.scored)) pilots.add(q.id);
    }

    answers = {}; submitted = false;
    started = Date.now();
    meta = {}; answeredSeq = 0; lastActionAt = started;
    paperId = (MODULE || pickedSet ? (picked || pickedSet) + "#" : "") + SESSION_ID + "#" + new Date(started).toISOString().slice(11, 19);
    const budget = Math.round(paper.length * perQ());
    clearInterval(tick);
    tick = setInterval(() => {
      if (submitted) return clearInterval(tick);
      const el = document.getElementById("clock");
      if (!el) return;
      const left = budget - Math.floor((Date.now() - started) / 1000);
      if (left <= 0) { grade(); return; }
      el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
      el.className = left < 300 ? "clock low" : "clock";
    }, 1000);
    draw();
  }

  /** 每题几秒。**照这一场自己的规格算**，不是照 bc-level1 的 72 秒。 */
  function perQ() {
    const sp = spec();
    return sp.drawn ? (sp.mins * 60) / sp.drawn : 60;
  }

  /* ── module 模式：先选考哪一场 ───────────────────────────────────────────── */
  function drawSetPicker() {
    root.innerHTML = `<div class="pad"><h2>选择自测</h2>
      <p class="sub">题数、时长与目标分数为本站自设。官方考试规格尚未核实；两类自测分别计分。</p>
      <div class="grid">${Object.entries(SETS).map(([k,v]) => `<a href="#" class="vv-card vv-card--link" data-set="${k}">
        <b>${esc(v.label)}</b><p>${v.questions} 题 · ${v.minutes} 分钟</p></a>`).join("")}</div></div>`;
    root.querySelectorAll("[data-set]").forEach(b => b.onclick = e => {
      e.preventDefault(); pickedSet = b.dataset.set; paperWeights = SETS[pickedSet].weights; buildPaper();
    });
  }

  function drawPicker() {
    const cards = Object.entries(MANIFEST.blueprint)
      .filter(([, v]) => v.questions_drawn || v.questions_scored)
      .map(([bp, v]) => {
        picked = bp;
        const eligible = EXAM_POOL();
        const pool = eligible.length;
        const quota = quotaFor(bp) || {};
        const gaps = Object.entries(quota).filter(([c, want]) =>
          eligible.filter((q) => qComps(q).includes(c)).length < want);
        picked = null;
        const drawn = Number(v.questions_drawn) || Number(v.questions_scored);
        return `<a class="vv-card vv-card--link" href="#" data-mod="${bp}">
          <p class="vv-card__title">${esc(v.label)}</p>
          <p class="vv-card__meta">${drawn} 题（计分 ${v.questions_scored}）· ${EXAM.minutes} 分钟 · ${PASS}% ${SELF_SPEC ? "自设参考线" : "及格"}
          <br>题池 ${pool} 题${pool < drawn * 2 ? `（不足卷面 2 倍，第二张卷会撞到原题）` : ""}
          ${gaps.length ? `<br><span style="color:var(--vv-danger)">⚠ ${gaps.length} 个组件抽不满：${
            gaps.map(([c, w]) => `${c} 差 ${w - eligible.filter((q) => qComps(q).includes(c)).length} 道`).join("、")}</span>` : ""}
          </p></a>`;
      }).join("");
    root.innerHTML = `<div class="pad">
      <h2>${SELF_SPEC ? "模块复习自测" : "模块考"}</h2>
      <p class="sub">${SELF_SPEC ? esc(EXAM.note || "本站自设模块自测，分别计分。") : `${esc(EXAM.name || "")}是<b>四场独立的考试</b>：单独报名、单独判分、单独补考。这里按模块分别考，避免总分掩盖某一模块的不足。`}</p>
      <div class="grid">${cards}</div>
      <div class="vv-callout vv-callout--warn" style="margin-top:20px">
        <span class="vv-callout__icon">⚠︎</span>
        <div><b>本地模考未经等值校准，倾向于高估你的水平。</b>
        ${SELF_SPEC ? `本地自设参考线 ${PASS}%，复习目标 ${GATE}%；允许复习已练题，分数仅用于查漏。` : `及格线是 ${PASS}%，本项目的自设报名线是<b>稳定 ≥${GATE}%</b>。这个目标不保证正式考试结果。`}</div>
      </div>
    </div>`;
    root.querySelectorAll("[data-mod]").forEach((b) => b.onclick = (e) => {
      e.preventDefault(); picked = b.dataset.mod; buildPaper();
    });
  }

  function draw() {
    // 模考池为空时，给一句人话而不是一张 0 题的白卷
    if (!paper.length) {
      root.innerHTML = `<div class="pad"><div class="vv-callout vv-callout--warn">
        <span class="vv-callout__icon">⚠︎</span>
        <div><b>${MODULE ? esc(BP_LABEL(picked)) + " 这一场还没有题。" : "模考池还没有题。"}</b>${
          MODULE ? "题池填上之前，先去<a href=\"drill.html\">练习</a>。"
                 : "模考题与练习题是分开的两个池子——模考只用你没在练习里见过的题，否则分数会被「刚做过」抬高。题池填上之前，先去<a href=\"drill.html\">练习</a>。"}
        </div></div>${MODULE || pickedSet ? '<button class="vv-btn vv-btn--secondary" id="back">← 换一场</button>' : ""}</div>`;
      const bk = document.getElementById("back");
      if (bk) bk.onclick = () => { picked = null; pickedSet = null; if (Object.keys(SETS).length) drawSetPicker(); else drawPicker(); };
      return;
    }
    const sp = spec();
    const budget = Math.round(paper.length * perQ());
    // 标题与免责随实际卷长自适应。题库从 51 涨到 205 之后，「缩比模考」
    // 与「题量不足 100 题」都成了假话——**界面说假话比不说更糟**，
    // 尤其在一个自己承认会高估的功能上。
    const isFull = paper.length >= sp.drawn;
    const shortNote = isFull ? "" : `本卷只有 ${paper.length} 题，不足这一场的 ${sp.drawn} 题；`;
    // 题池是否分离，决定了这段免责怎么写。写死任何一种都会在另一种情况下变成假话。
    const overlap = paper.filter((q) => (q.pool || "drill") === "both").length;
    const poolNote = REVIEW_POOL
      ? "本卷是<b>复习自测</b>，允许出现已练题；分数仅用于本次查漏；"
      : !POOL_SEPARATED()
      ? `<b>本场没有独立的模考题池</b>，这 ${paper.length} 题在练习页也会出现，你可能已经做过——这部分分数偏高；`
      : overlap
        ? `本卷有 ${overlap} 题同时也在练习池里，你可能见过，这部分会高估；`
        : "本卷全部来自<b>模考专属题池</b>，练习不会提前暴露本卷原题；更早模考的记忆仍可能影响分数；";
    // ⚠️ 上面那句只管**练习池**的污染。第二次模考起还有另一种虚高：上一张卷的原题。
    // 这句话此前没有，于是界面在一个自己承认会高估的功能上又说了一次假话。
    const repeatNote = repeated
      ? `<b>本卷有 ${repeated} 题在上一张卷里考过</b>，这部分分数偏高——题池不够两套时会这样；`
      : "本卷与上一张卷<b>没有重题</b>；";
    const gapNote = shortfall.length
      ? `<div class="vv-callout vv-callout--danger"><span class="vv-callout__icon">✕</span>
         <div><b>有 ${shortfall.length} 个板块或能力组件抽不满配额，本卷是残卷。</b>
         ${shortfall.map((g) => `<code>${g.c}</code> 该抽 ${g.want} 道，池里只有 ${g.pool} 道`).join("；")}。
         <u>缺口没有拿别的组件顶替</u>——顶替出来的分数会让你以为这一块已经够了。
         这几个组件要先补题，再拿这一场的分数当参考。</div></div>`
      : "";
    const pilotNote = pilots.size
      ? `其中 <b>${pilots.size} 道不计分</b>（真考也有，考的时候分辨不出是哪几道），交卷后才告诉你；`
      : (MODULE ? "本卷全部计分（抽不满卷面题数时不再扣不计分题，否则分母更小、分数更飘）；" : "");
    root.innerHTML = `<div class="pad">
      <div class="exam-bar">
        <div><b>${MODULE ? esc(BP_LABEL(picked)) : (pickedSet ? esc(SETS[pickedSet].label) : (isFull ? "全长模考" : "缩比模考"))}</b> · ${paper.length} 题 · ${Math.round(budget / 60)} 分钟
        <span class="hint">（${SELF_SPEC ? "本地自设" : "考试规格"} ${sp.drawn} 题 ${sp.mins} 分钟，每题 ${Math.round(perQ())} 秒，本卷按同样节奏计时）</span></div>
        <span id="clock" class="clock">--:--</span>
      </div>
      ${SELF_WEIGHTS ? `<p class="sub">板块配比为本地练习配置，未核为官方考试权重。</p>` : ""}
      ${gapNote}
      <div class="vv-callout vv-callout--warn">
        <span class="vv-callout__icon">⚠︎</span>
        <div><b>这份模考未经等值校准，倾向于高估你的水平。</b>
        本地题库用于查漏与熟悉流程；${shortNote}${pilotNote}${poolNote}${repeatNote}
        把它当「查漏工具」，别当「通过预测器」。<u>过程中不给反馈，交卷后逐题走完。</u></div>
      </div>
      ${paper.map((q, i) => `<div class="exam-q">
        <p class="q-stem"><span class="q-no">${i + 1}</span>${rich(q.stem)}</p>
        <div class="opts">${(q._opts || q.options).map((o, oi) => `
          <button class="vv-opt${answers[q.id] === o.key ? " sel" : ""}" data-q="${q.id}" data-o="${o.key}">
            <span class="vv-opt__key">${"ABCD"[oi] || o.key.toUpperCase()}</span><span>${rich(o.text)}</span></button>`).join("")}</div>
      </div>`).join("")}
      <button class="vv-btn vv-btn--primary" id="submit">交卷（已答 ${Object.keys(answers).length}/${paper.length}）</button>
    </div>`;
    root.querySelectorAll("[data-q]").forEach((b) => b.onclick = () => {
      const qid = b.dataset.q, now = Date.now();
      const m = (meta[qid] = meta[qid] || { changes: -1, order: null, dwellMs: null });
      m.changes++;                       // 首次选＝0 次改动，之后每次点都算一次改动
      if (m.order === null) {            // 首答才计时：改答案的时间不该算成这题的思考时间
        m.order = answeredSeq++;
        m.dwellMs = now - lastActionAt;
        lastActionAt = now;
      }
      answers[qid] = b.dataset.o;
      const el = document.getElementById("submit");
      el.textContent = `交卷（已答 ${Object.keys(answers).length}/${paper.length}）`;
      root.querySelectorAll(`[data-q="${b.dataset.q}"]`).forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
    });
    document.getElementById("submit").onclick = grade;
  }

  function grade() {
    submitted = true; clearInterval(tick);
    const bySec = {};
    const isRight = (q) => q.options.find((o) => o.key === answers[q.id])?.correct === true;
    for (const q of paper) {
      const ok = isRight(q);
      const bucket = MODULE && componentsOf(picked) ? (qComps(q)[0] || "—") : q.blueprint;
      bySec[bucket] = bySec[bucket] || { n: 0, ok: 0 };
      bySec[bucket].n++; bySec[bucket].ok += ok ? 1 : 0;
      const m = meta[q.id] || {};
      const shown = (q._opts || q.options || []).map((o) => o.key);
      store.pushAttempt({
        cardId: q.id, mode: "exam", chosen: answers[q.id] || null,
        correct: ok ? 1 : 0, certainty: null, blueprint: q.blueprint,
        cardType: q.card_type, fedBack: 1,
        // ⚠️ 字段名必须叫 queuePos，和练习模式一致。
        // 2026-08-01 之前这里写的是 `answerOrder`，而 bin/attempt_analysis.py 读的是
        // `queuePos` —— 于是整场模考的位置数据被静默丢弃，疲劳效应永远算不出来。
        // 空对照抓不到它：合成样本是照着**分析器**的字段名造的，producer 那一侧从没被验过。
        // 判据现在挂在 bin/attempt_analysis.py --contract 上（写了没人读 / 读了没人写 都报错）。
        latencyMs: m.dwellMs ?? null, changes: m.changes ?? null, queuePos: m.order ?? null,
        shownOrder: shown.join(""), posChosen: answers[q.id] ? shown.indexOf(answers[q.id]) : -1,
        qhash: QHASH.get(q.id) || "", sessionId: SESSION_ID, paperId,
      });
    }
    // 计分只算非 pilot 题。真考就是这么算的，而分母写错会让「差一题及格」变成「过了」。
    const scoredQs = paper.filter((q) => !pilots.has(q.id));
    const correct = scoredQs.filter(isRight).length;
    const pct = Math.round((100 * correct) / Math.max(scoredQs.length, 1));
    const passed = pct >= PASS;
    const wrong = paper.filter((q) => !isRight(q));
    const secLabel = MODULE && componentsOf(picked) ? "能力组件" : "板块";
    const comps = MODULE ? componentsOf(picked) : null;
    const rows = MODULE && comps
      ? Object.entries(comps).map(([c, meta2]) => {
          const s = bySec[c];
          const w = Array.isArray(meta2) ? meta2[1] : "";
          const nm = Array.isArray(meta2) ? meta2[0] : c;
          if (!s) return `<tr><td>${c} · ${esc(String(nm).slice(0, 28))}</td><td class="n">${w}%</td><td class="n">—</td><td>本卷无此组件题目</td></tr>`;
          const p2 = Math.round((100 * s.ok) / s.n);
          return `<tr><td>${c} · ${esc(String(nm).slice(0, 28))}</td><td class="n">${w}%</td>
            <td class="n">${s.ok}/${s.n} · ${p2}%</td>
            <td>${p2 < PASS ? "⚠️ 弱项，优先补" : p2 < GATE ? "尚可" : "稳"}</td></tr>`;
        }).join("")
      : Object.entries(MODULE ? {[picked]:100} : paperWeights).map(([bp, w]) => {
          const s = bySec[bp];
          if (!s) return `<tr><td>${esc(BP_LABEL(bp))}</td><td class="n">${w}%</td><td class="n">—</td><td>本卷无此板块题目</td></tr>`;
          const p2 = Math.round((100 * s.ok) / s.n);
          return `<tr><td>${esc(BP_LABEL(bp))}</td><td class="n">${w}%</td>
            <td class="n">${s.ok}/${s.n} · ${p2}%</td>
            <td>${p2 < 60 ? "⚠️ 弱项，优先补" : p2 < 80 ? "尚可" : "稳"}</td></tr>`;
        }).join("");
    root.innerHTML = `<div class="pad">
      <h2>成绩${MODULE ? ` · ${esc(BP_LABEL(picked))}` : ""}</h2>
      <p class="big">${correct} / ${scoredQs.length} · ${pct}%${
        MODULE ? `　<span class="vv-badge ${passed ? "vv-badge--accent" : ""}">${passed ? "过线" : "没过线"}</span>` : ""}</p>
      ${pilots.size ? `<p class="sub">另有 ${pilots.size} 道不计分题（真考里你分辨不出是哪几道）：${
        paper.filter((q) => pilots.has(q.id)).filter(isRight).length} / ${pilots.size} 答对，不进上面的分数。</p>` : ""}
      <div class="vv-callout ${pct >= GATE ? "vv-callout--info" : "vv-callout--warn"}">
        <span class="vv-callout__icon">${pct >= GATE ? "◎" : "⚠︎"}</span>
        <div>${SELF_SPEC
          ? `本地自设参考线 ${PASS}%，复习目标 ≥${GATE}%。${pct >= GATE ? "本次达到复习目标。" : "请回读错题所指讲解，再练一次。"}这项分数用于查漏，不表示具备考试报名或实际执业资格。`
          : `官方及格线 ${PASS}%。<b>本项目的自设报名线是模考稳定 ≥${GATE}%</b>；自制题库未经等值校准，分数不能保证正式考试结果。${pct >= GATE ? `达到了自设线，但还要看${secLabel}是否均衡。` : "还没到自设线。"}`}</div>
      </div>
      ${shortfall.length ? `<div class="vv-callout vv-callout--danger"><span class="vv-callout__icon">✕</span>
        <div><b>这一场是残卷</b>：${shortfall.map((g) => `<code>${g.c}</code> ${g.got}/${g.want} 道`).join("、")}。
        分数不能当准备度看——缺的那几个组件在真考里照样占配额。</div></div>` : ""}
      <table class="cx"><tr><th>${secLabel}</th><th class="n">${SELF_WEIGHTS ? "练习配比" : (MODULE ? "考纲占比" : "考纲")}</th><th class="n">得分</th><th>判断</th></tr>
      ${rows}</table>
      ${MODULE ? '<p class="sub">上表按<b>全部卷面题</b>统计（含不计分题）——诊断要的是样本量，不是分数。</p>' : ""}
      <h3 style="margin-top:32px">逐题走一遍（${wrong.length} 题错）</h3>
      <p class="sub">「不给反馈」只对模考<b>过程</b>成立，不对整场成立。答错未看解析的记录会被单独标出来——
      那是在给自己种错误记忆。</p>
      ${wrong.map((q) => {
        const ck = q.options.find((o) => o.correct).key;
        return `<div class="exam-q rev">
          <p class="q-stem">${pilots.has(q.id) ? '<span class="vv-badge">不计分</span> ' : ""}${rich(q.stem)}</p>
          <div class="opts">${(q._opts || q.options).map((o, oi) => {
            let c = "vv-opt";
            if (o.key === ck) c += " vv-opt--correct";
            else if (o.key === answers[q.id]) c += " vv-opt--wrong";
            return `<div class="${c}"><span class="vv-opt__key">${"ABCD"[oi] || o.key.toUpperCase()}</span>
              <span>${rich(o.text)}${o.why_wrong ? `<span class="vv-opt__why">${rich(o.why_wrong)}</span>` : ""}</span></div>`;
          }).join("")}</div>
          <div class="vv-callout vv-callout--info note"><span class="vv-callout__icon">✎</span>
            <div>${rich(q.answer_note || "")}${
              sourceLink(q) ? `<div class="src"><a href="${sourceLink(q)}">回读这一章 →</a></div>` : ""}</div></div>
        </div>`;
      }).join("")}
      <div class="row"><button class="vv-btn vv-btn--primary" id="retry">再考一次</button>
      ${MODULE || pickedSet ? '<button class="vv-btn vv-btn--secondary" id="back2">← 换一场</button>' : ""}</div></div>`;
    document.getElementById("retry").onclick = buildPaper;
    const bk = document.getElementById("back2");
    if (bk) bk.onclick = () => { picked = null; pickedSet = null; if (Object.keys(SETS).length) drawSetPicker(); else drawPicker(); };
  }

  if (Object.keys(SETS).length) drawSetPicker();
  else if (MODULE) drawPicker(); else buildPaper();
}

/* ─────────────── 进度 ─────────────── */
function renderProgress() {
  const root = document.getElementById("progress");
  // Legacy tax records remain exportable, but another course must not inflate this dashboard.
  const ids = new Set(QUESTIONS.map(q => q.id));
  const at = store.attempts().filter(a => ids.has(a.cardId));
  const rv = Object.fromEntries(Object.entries(store.reviews()).filter(([id]) => ids.has(id)));
  const prefs = store.prefs();
  const daysLeft = Math.ceil((new Date(prefs.examDate) - new Date()) / 86400000);

  if (!at.length) {
    root.innerHTML = `<div class="pad"><h2>还没有记录</h2>
      <p class="sub">做几道题就会有数据了。这一页展示的是「你不知道自己不知道」的部分。</p>
      <a class="vv-btn vv-btn--primary" href="drill.html">去练习</a></div>`;
    return;
  }

  const bySec = {};
  for (const a of at) {
    const s = (bySec[a.blueprint] = bySec[a.blueprint] || { n: 0, ok: 0 });
    s.n++; s.ok += a.correct ? 1 : 0;
  }
  const byType = {};
  for (const a of at) {
    const s = (byType[a.cardType] = byType[a.cardType] || { n: 0, ok: 0 });
    s.n++; s.ok += a.correct ? 1 : 0;
  }
  // 信心校准曲线：各信心档的实际正确率。抓「自信地错」。
  const cal = { 1: { n: 0, ok: 0 }, 2: { n: 0, ok: 0 }, 3: { n: 0, ok: 0 } };
  for (const a of at) if (a.certainty) { cal[a.certainty].n++; cal[a.certainty].ok += a.correct ? 1 : 0; }

  const highConfWrong = at.filter((a) => !a.correct && a.certainty === 3);
  const wrongIds = [...new Set(at.filter((a) => !a.correct).map((a) => a.cardId))];
  const mastered = Object.values(rv).filter((c) => (c.streak || 0) >= 3).length;

  root.innerHTML = `<div class="pad">
    <div class="stat-row">
      <div class="stat"><b>${at.length}</b><span>累计作答</span></div>
      <div class="stat"><b>${Math.round((100 * at.filter((a) => a.correct).length) / at.length)}%</b><span>总正确率</span></div>
      <div class="stat"><b>${mastered}</b><span>已掌握（连对≥3）</span></div>
      <div class="stat"><b>${daysLeft}</b><span>天 · 距 ${prefs.examDate}</span></div>
    </div>

    ${highConfWrong.length ? `<div class="vv-callout vv-callout--danger">
      <span class="vv-callout__icon">⚠︎</span>
      <div><b>高信心错题 ${highConfWrong.length} 条。</b>
      这批是「你以为自己会、其实不会」的——对保险经纪来说最危险的一类洞，
      因为你会带着这个错误去跟客户说话。它们在队列里优先级最高。</div></div>` : ""}

    <section class="sec"><h2>${examMode() === "module" ? "模块" : "板块"}正确率 vs ${MANIFEST.blueprint_policy?.kind === "self_authored_practice" ? "练习配比" : "考纲权重"}</h2>
      <p class="sub">总分平均没有意义。term 90% + scenario 50% 与「平均 70%」在数学上一样，在考场上完全不同。</p>
      <table class="cx"><tr><th>${examMode() === "module" ? "模块" : "板块"}</th><th class="n">${MANIFEST.blueprint_policy?.kind === "self_authored_practice" ? "配比" : "考纲"}</th><th class="n">作答</th><th class="n">正确率</th><th>判断</th></tr>
      ${Object.entries(WEIGHTS).map(([bp, w]) => {
        const s = bySec[bp];
        if (!s) return `<tr><td>${esc(BP_LABEL(bp))}</td><td class="n">${w}%</td><td class="n">0</td><td class="n">—</td><td>还没练过</td></tr>`;
        const p = Math.round((100 * s.ok) / s.n);
        return `<tr><td>${esc(BP_LABEL(bp))}</td><td class="n">${w}%</td><td class="n">${s.n}</td>
          <td class="n">${p}%</td><td>${p < 60 ? "⚠️ 弱项" : p < 80 ? "尚可" : "稳"}</td></tr>`;
      }).join("")}</table></section>

    <section class="sec"><h2>题型正确率</h2>
      <p class="sub">真考约六成是「找例外」题。它的解法与正向题完全不同——要逐条判真伪，
      有一条拿不准就排除不掉。这一行低，就专项练它。</p>
      <table class="cx"><tr><th>题型</th><th class="n">作答</th><th class="n">正确率</th></tr>
      ${Object.entries(byType).map(([t, s]) => `<tr>
        <td>${t === "except" ? "找例外" : t === "scenario" ? "情景计算" : t === "discriminate" ? "辨析" : "常规单选"}</td>
        <td class="n">${s.n}</td><td class="n">${Math.round((100 * s.ok) / s.n)}%</td></tr>`).join("")}
      </table></section>

    <section class="sec"><h2>信心校准曲线</h2>
      <p class="sub">理想状态：「很确定」那一档接近 100%。它如果只有七八成，说明你的自我判断本身需要校准——
      这比某个知识点不会更值得担心。</p>
      <table class="cx"><tr><th>信心</th><th class="n">题数</th><th class="n">实际正确率</th><th>解读</th></tr>
      ${[[3, "很确定"], [2, "大概吧"], [1, "不太确定"]].map(([k, l]) => {
        const s = cal[k];
        if (!s.n) return `<tr><td>${l}</td><td class="n">0</td><td class="n">—</td><td>—</td></tr>`;
        const p = Math.round((100 * s.ok) / s.n);
        const note = k === 3 ? (p >= 90 ? "校准良好" : "⚠️ 自信过头，这一档最该警惕")
          : k === 1 ? (p >= 70 ? "其实你会，别被不确定感骗了" : "确实不熟，正常") : "";
        return `<tr><td>${l}</td><td class="n">${s.n}</td><td class="n">${p}%</td><td>${note}</td></tr>`;
      }).join("")}</table></section>

    <section class="sec"><h2>错题本（${wrongIds.length}）</h2>
      <p class="sub">三次律：连对 3 次才出库，任何时候再错立刻打回。</p>
      <ul class="wrong">${wrongIds.slice(0, 30).map((id) => {
        const q = QUESTIONS.find((x) => x.id === id);
        if (!q) return "";
        const c = rv[id] || {};
        const times = at.filter((a) => a.cardId === id && !a.correct).length;
        return `<li><a href="drill.html?bp=${q.blueprint}">${rich(q.stem.slice(0, 52))}…</a>
          <span class="meta">${esc(BP_LABEL(q.blueprint))} · 错 ${times} 次 · 连对 ${c.streak || 0}/3</span></li>`;
      }).join("")}</ul></section>

    ${paceSection(at, store.events())}

    <section class="sec"><h2>学习数据</h2>
      <p class="sub">记录存在这台设备的浏览器里。<b>换设备、清缓存、换浏览器都会丢</b>——
      所以导出不是「高级功能」，是这个形态下唯一的备份手段。<br>
      导出的是原始作答流水（含每题用时、你看到的选项顺序、答题时的题目版本），
      不只是统计结果——统计口径以后会变，原始记录不会。</p>
      <div class="row">
        <button class="vv-btn vv-btn--primary" id="export">导出学习数据</button>
        <button class="vv-btn vv-btn--secondary" id="import-btn">导入</button>
        <input type="file" id="import" accept="application/json,.json" hidden>
      </div>
      <p class="sub" id="io-msg" style="margin-top:10px">
        当前 ${at.length} 条作答 · 覆盖 ${new Set(at.map((a) => a.cardId)).size} 道题 ·
        ${new Set(at.map((a) => String(a.at).slice(0, 10))).size} 天
        ${at.length ? `（${String(at[0].at).slice(0, 10)} 至 ${String(at[at.length - 1].at).slice(0, 10)}）` : ""}
      </p>
    </section>

    <section class="sec"><h2>设置</h2>
      <label class="fld">目标考期 <input type="date" id="exam-date" value="${prefs.examDate}"></label>
      <p class="sub">考期决定复习强度：越临近，目标保留率越高、间隔越短，而且<b>永不把复习排到考试之后</b>。
      通用 SRS 应用没有这个概念——它们假设你要永远记住，我们只需要记到考完。</p>
      <button class="vv-btn vv-btn--ghost vv-btn--sm" id="reset">清空全部学习记录</button>
    </section>
  </div>`;

  document.getElementById("exam-date").onchange = (e) => {
    save(KEY.prefs, { ...prefs, examDate: e.target.value });
    renderProgress();
  };
  document.getElementById("reset").onclick = () => {
    if (confirm("清空所有作答与复习记录？这一步不可撤销。")) { store.reset(); renderProgress(); }
  };
  wireDataIO();
}

/* ─────────────── 节奏与解析停留 ───────────────
 * 这两块是新记的字段第一次派上用场，也是单人数据里少数几个**当场就成立**的指标：
 * 它们不需要跨人比较，只需要跟一个外部常数比（真考 72 秒/题）和跟常识比（读解析要几秒）。
 */
function paceSection(at, events) {
  // 超过 10 分钟的按「人离开了」剔除：那不是思考时间，把它算进中位数会污染全表
  const lat = at.map((a) => a.latencyMs).filter((x) => typeof x === "number" && x > 0 && x < 600000);
  const rated = events.filter((e) => e.kind === "rate" && typeof e.noteMs === "number");
  const wrongRated = rated.filter((e) => e.correct === 0);
  if (lat.length < 10 && wrongRated.length < 5) {
    return `<section class="sec"><h2>答题节奏</h2>
      <p class="sub">还没有足够的计时记录（已有 ${lat.length} 条，至少要 10 条才有中位数可言）。
      再练一轮就会出现——这一块比正确率更能预告你在考场上会不会做不完。</p></section>`;
  }
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const m = med(lat) / 1000;
  // ⚠️ 这个阈值原来写死成 72 秒 —— 那是照 bc-level1「100 题 / 120 分钟」定的。
  // LLQP 每场 35 题 / 75 分钟 ≈ 129 秒，沿用 72 会把一个节奏充裕的人判成
  // 「按这个速度做不完卷」，而它不会报错，只会一直显示一个反的结论。
  // 写死的阈值要问它当初是照什么尺寸定的，以及那个尺寸变了会不会有人知道。
  const pace = examPace();
  const budget = pace ? pace.perQ : 72;
  const over = lat.filter((x) => x > budget * 1000).length;
  const fast = wrongRated.filter((e) => e.noteMs < 3000).length;
  const paceLine = pace
    ? `${MANIFEST.exam?.spec_status === "self_authored" ? "本地自设" : "考试规格"} ${pace.n} 题 ${pace.mins} 分钟，<b>平均每题 ${Math.round(pace.perQ)} 秒</b>`
    : "按每题 72 秒的通用节奏";

  return `<section class="sec"><h2>答题节奏与解析停留</h2>
    <p class="sub">${paceLine}。中位数超过它，就不是知识问题是节奏问题——
    而节奏是可以单独练的（先按题型分：情景计算本来就该慢，术语题慢就是没记牢）。</p>
    <table class="cx"><tr><th>指标</th><th class="n">数值</th><th>怎么读</th></tr>
    ${lat.length >= 10 ? `<tr><td>每题用时中位数</td><td class="n">${m.toFixed(0)} 秒</td>
      <td>${m > budget ? "⚠️ 慢于真考节奏，按这个速度做不完卷" : m > budget * 0.7 ? "偏慢但在安全区" : "节奏充裕"}</td></tr>
    <tr><td>超过 ${Math.round(budget)} 秒的题</td><td class="n">${over} / ${lat.length}</td>
      <td>${over / lat.length > 0.3 ? "⚠️ 超三成，真考会被时间拖垮" : "正常，总有几道要多想"}</td></tr>` : ""}
    ${wrongRated.length >= 5 ? `<tr><td>答错后解析停留不足 3 秒</td><td class="n">${fast} / ${wrongRated.length}</td>
      <td>${fast / wrongRated.length > 0.25 ? "⚠️ 这是在给自己种错误记忆——错了不读解析，下次还错同一个选项" : "读了，很好"}</td></tr>` : ""}
    </table></section>`;
}

/* ─────────────── 导出 / 导入 ─────────────── */
function wireDataIO() {
  const msg = document.getElementById("io-msg");
  const btn = document.getElementById("export");
  if (!btn) return;

  btn.onclick = () => {
    const data = buildExport({
      course: COURSE_KEY,
      attempts: store.attempts(), events: store.events(), reviews: store.reviews(),
      prefs: store.prefs(), decks: store.decks(), bank: BANK,
    });
    const s = summarize(data);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vv-learn-${COURSE_KEY}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg.innerHTML = `已导出 <b>${s.attempts}</b> 条作答 · ${s.items} 道题 · ${s.events} 条行为事件。`;
  };

  const file = document.getElementById("import");
  document.getElementById("import-btn").onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const incoming = JSON.parse(await f.text());
      const v = validateExport(incoming, { course: COURSE_KEY });
      if (!v.ok) { msg.innerHTML = `⛔ 这份文件不能导入：${esc(v.errors.join("；"))}`; return; }
      // 导入是**合并**不是覆盖：手机上练的和电脑上练的都该留下。
      // 合并规则在 core/learning-data.mjs 里，有测试钉住，别在这里另写一份。
      const merged = mergeLearningData(
        { attempts: store.attempts(), events: store.events(), reviews: store.reviews(),
          prefs: store.prefs(), decks: store.decks() },
        incoming);
      save(KEY.attempts, merged.attempts);
      save(KEY.events, merged.events);
      save(KEY.reviews, merged.reviews);
      save(KEY.prefs, merged.prefs);
      for (const [id, n] of Object.entries(merged.decks)) localStorage.setItem(KEY.deck + id, String(n));
      const st = merged.stats;
      const drift = incoming.bank?.hash && BANK.hash && incoming.bank.hash !== BANK.hash
        ? "<br>⚠️ 这份数据是对着另一个版本的题库答的。题目改过的那些，旧作答仍然保留，但分析时会按版本分开算。" : "";
      msg.innerHTML = `已并入 <b>${st.attemptsAdded}</b> 条新作答（重复跳过 ${st.attemptsSkipped} 条）、
        ${st.eventsAdded} 条行为事件，更新 ${st.reviewsUpdated} 张卡片的复习状态。`
        + (v.warnings.length ? "<br>" + esc(v.warnings.join("；")) : "") + drift;
      setTimeout(renderProgress, 1500);
    } catch (e) {
      msg.innerHTML = `⛔ 读不了这个文件：${esc(String(e.message || e))}`;
    }
  };
}

boot();
