/**
 * 学习数据的**便携层** —— 导出 / 导入 / 合并 / 校验，外加题目内容指纹。
 *
 * 零依赖、框架无关、浏览器与 node 同一份（同 ADR-001 的内核纪律）。
 *
 * 为什么单独立一个模块而不是塞进 app.js：
 *   ① 合并逻辑是**会错的东西**（去重键、时序、派生态覆盖方向），必须能在 node 里测；
 *   ② 导出格式是跨进程契约（浏览器写、Python 读），契约该有唯一定义处；
 *   ③ 接后端时服务端也要用同一套合并规则，否则同步会造出两份不一样的历史。
 *
 * ## 一条硬规则：attempts 只追加
 *
 * `attempts` 是原始事实，永不 UPDATE、永不 DELETE。
 * 推论是本文件存在的真正理由：**当时没记下来的字段，事后永远补不回来。**
 * 所以字段该在用户开始学之前就定好，而不是等分析时才发现少了。
 */

/* ─────────────── 内容指纹 ─────────────── */

/**
 * 32 位确定性哈希（FNV-1a 变体，按 UTF-16 码元推进）。
 *
 * ⚠️ **Python 侧 `bin/attempt_analysis.py` 有一份等价实现，两者必须永远一致**
 * ——不然「这条作答是对着哪个版本的题答的」就会静默判错，而判错的方向是最糟的那个：
 * 题改过了却认为没改，于是把新旧两版的作答混在一起算难度。
 * 有跨语言测试钉住（test/core.test.mjs 直接 spawn python3 比对）。
 */
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * 一道题的内容指纹 —— 只覆盖**影响作答的部分**。
 *
 * 进指纹：题干、每个选项的文本与对错。
 * 不进指纹：`why_wrong`、`answer_note`、tags、来源。
 *
 * 这个取舍是有意的：改一句解析措辞不该让几周的作答历史作废（那会让人不敢改解析），
 * 但改题干或改选项就是换了一道题，旧作答的难度与干扰项数据必须失效。
 */
export function qhash(q) {
  if (!q) return "";
  const parts = [String(q.stem || "")];
  for (const o of q.options || []) {
    parts.push(String(o.key || ""), String(o.text || ""), o.correct ? "1" : "0");
  }
  return hash32(parts.join(""));
}

/** 整个题库的指纹＋规模。用来一眼看出「导出时的题库」和「分析时的题库」是不是同一份。 */
export function bankFingerprint(questions) {
  const list = [...(questions || [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { n: list.length, hash: hash32(list.map((q) => q.id + ":" + qhash(q)).join("|")) };
}

/* ─────────────── 导出 ─────────────── */

/**
 * 格式版本。**改字段语义就要 +1**，因为下游 Python 分析器按它决定怎么读。
 * v1：初版（attempts 只有 cardId/mode/chosen/correct/certainty/blueprint/cardType/fedBack/at）
 * v2：补 latencyMs / shownOrder / posChosen / qhash / sessionId，并新增 events 日志
 */
export const EXPORT_VERSION = 2;

export function buildExport({ course = "bc-level1", attempts = [], events = [], reviews = {}, prefs = {}, decks = {}, bank = null, now = new Date() } = {}) {
  return {
    format: "vv-learn-export",
    version: EXPORT_VERSION,
    course,                     // v2 optional extension: legacy exports belong to bc-level1
    exportedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    bank,                       // {n, hash}：分析时对得上才敢把作答按题聚合
    prefs,
    decks,                      // 讲义进度：{deckId: 看到第几张}
    counts: { attempts: attempts.length, events: events.length, reviews: Object.keys(reviews).length },
    attempts,
    events,
    reviews,
  };
}

/**
 * 校验一份导出件能不能安全导入 / 分析。
 *
 * 分两级：errors 拒绝，warnings 放行但要说出来。
 * 「版本比我新」是 warning 不是 error —— 拒绝一份只是多了字段的文件，
 * 代价是用户白学的那几周，而多余字段本身无害。
 */
export function validateExport(obj, { course = null } = {}) {
  const errors = [], warnings = [];
  if (!obj || typeof obj !== "object") return { ok: false, errors: ["不是 JSON 对象"], warnings };
  if (course && (obj.course ?? "bc-level1") !== course) {
    errors.push(`课程不一致：导出件为 ${obj.course ?? "bc-level1（旧导出）"}，当前为 ${course}`);
  }
  if (obj.format !== "vv-learn-export") errors.push(`format 不是 vv-learn-export（读到 ${JSON.stringify(obj.format)}）`);
  if (!Array.isArray(obj.attempts)) errors.push("attempts 必须是数组");
  if (obj.events != null && !Array.isArray(obj.events)) errors.push("events 必须是数组或缺省");
  if (obj.reviews != null && (typeof obj.reviews !== "object" || Array.isArray(obj.reviews))) {
    errors.push("reviews 必须是对象");
  }
  if (typeof obj.version !== "number") errors.push("version 缺失");
  else if (obj.version > EXPORT_VERSION) warnings.push(`导出件版本 v${obj.version} 比本机 v${EXPORT_VERSION} 新，多出的字段会原样保留但不参与计算`);

  if (Array.isArray(obj.attempts)) {
    const bad = obj.attempts.filter((a) => !a || !a.cardId || !a.at).length;
    if (bad) errors.push(`${bad} 条作答缺 cardId 或 at —— 缺了就无法去重，会重复计数`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/* ─────────────── 合并 ─────────────── */

const attemptKey = (a) => `${a.cardId}|${a.at}`;
const eventKey = (e) => `${e.kind}|${e.cardId}|${e.at}`;
const byAt = (x, y) => (String(x.at) < String(y.at) ? -1 : String(x.at) > String(y.at) ? 1 : 0);

/**
 * 合并两份学习数据。**永不丢记录，永不改记录**。
 *
 *   attempts / events —— 追加型：并集去重，按时间排序
 *   reviews          —— 派生型：同一张卡取 lastReview 更新的那份
 *   prefs / decks    —— 标量：incoming 覆盖（导入的意图就是「用这份」）
 *
 * 去重键用 `cardId|at`（毫秒级 ISO）。同一张卡同一毫秒答两次在物理上不可能，
 * 所以这个键既不会误合、也不会漏合。
 */
export function mergeLearningData(local, incoming) {
  const la = local?.attempts || [], ia = incoming?.attempts || [];
  const seenA = new Set(la.map(attemptKey));
  const addedAttempts = ia.filter((a) => !seenA.has(attemptKey(a)));
  const attempts = [...la, ...addedAttempts].sort(byAt);

  const le = local?.events || [], ie = incoming?.events || [];
  const seenE = new Set(le.map(eventKey));
  const addedEvents = ie.filter((e) => !seenE.has(eventKey(e)));
  const events = [...le, ...addedEvents].sort(byAt);

  const reviews = { ...(local?.reviews || {}) };
  let newerReviews = 0;
  for (const [id, card] of Object.entries(incoming?.reviews || {})) {
    const mine = reviews[id];
    if (!mine || String(card?.lastReview || "") > String(mine.lastReview || "")) {
      reviews[id] = card;
      newerReviews++;
    }
  }

  return {
    attempts, events, reviews,
    prefs: { ...(local?.prefs || {}), ...(incoming?.prefs || {}) },
    decks: { ...(local?.decks || {}), ...(incoming?.decks || {}) },
    stats: {
      attemptsAdded: addedAttempts.length,
      attemptsSkipped: ia.length - addedAttempts.length,
      eventsAdded: addedEvents.length,
      reviewsUpdated: newerReviews,
    },
  };
}

/** 一句话概览，给导出按钮旁边显示「你要导出的是什么」。 */
export function summarize(data) {
  const at = data?.attempts || [];
  const days = new Set(at.map((a) => String(a.at).slice(0, 10)));
  return {
    attempts: at.length,
    items: new Set(at.map((a) => a.cardId)).size,
    days: days.size,
    first: at.length ? String(at[0].at).slice(0, 10) : null,
    last: at.length ? String(at[at.length - 1].at).slice(0, 10) : null,
    events: (data?.events || []).length,
  };
}
