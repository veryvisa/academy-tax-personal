/**
 * FSRS 间隔重复调度器 —— 自实现，零依赖。
 *
 * 版本：**FSRS-5**（19 参数）。诚实交代两点：
 *   1. 上游已有 FSRS-6（21 参数，decay 变成可学习参数）。我实现 FSRS-5 而不是 6，
 *      是因为 5 的参数化我有把握、能逐条验证；凭记忆写 6 的参数化有写错的实质风险，
 *      而一个悄悄算错间隔的调度器比一个老一代但正确的调度器坏得多。
 *      → 升 6 之前必须对着 open-spaced-repetition 上游逐参数核对（见 §复核点）。
 *   2. FSRS 的个性化优化器需约 1000 次复习记录才优于默认参数。
 *      单人从零开始，很长一段时间吃的是**群体默认参数**，不是「为你定制」。
 *      这不影响选 FSRS（默认参数也强于 SM-2），但别对早期个性化抱期待。
 *   3. w[17]/w[18]（FSRS-5 的同日复习短期记忆参数）**未实现**：本实现里同日重复
 *      复习（elapsed=0 → R=1）稳定性增益为 0，即同日再答不改调度。对「当天错了
 *      当场再过一遍」的场景这是保守而无害的行为，但与上游完整实现有差异，升级时补。
 *
 * 为什么不装 ts-fsrs：调度核心是约 150 行纯函数；论坛 CSP 禁外部资源、要求依赖
 * vendored；vendor 一个包和自己写一份，后者可读、可测、可钉死。
 *
 * 模型三变量：
 *   D 难度   1–10，越大越难
 *   S 稳定性 天，R 掉到 90% 所需时间
 *   R 可提取性 当下能想起来的概率
 */

// FSRS-5 默认参数（群体拟合值）
export const DEFAULT_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 0.2345679…

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };
export const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };

const clampD = (d) => Math.min(Math.max(d, 1), 10);
const clampS = (s) => Math.max(s, 0.01);

/** 可提取性：距上次复习 t 天后还记得的概率。R(0)=1，R(S)=0.9。 */
export function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(elapsedDays, 0)) / stability, DECAY);
}

/**
 * 间隔上限，默认 100 年（同 Anki 惯例）。
 * ⚠️ 这不是装饰性的钳制：不封顶时,连续 40 次 Easy 会把稳定性推到
 * `now + days*86400000` 超出 JS Date 可表示范围(±约 27 万年),
 * `new Date(...).toISOString()` 直接抛 RangeError。测试实际打出来过。
 */
export const MAX_INTERVAL_DAYS = 36500;

/**
 * 由稳定性反推达到目标保留率所需的间隔（天）。
 * @param {number} [maxDays] 上限。传考期剩余天数即可做到「永不排到考试之后」。
 */
export function intervalFor(stability, desiredRetention, maxDays = MAX_INTERVAL_DAYS) {
  const raw = (stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1);
  const cap = Math.min(maxDays, MAX_INTERVAL_DAYS);
  if (!Number.isFinite(raw)) return cap;
  return Math.min(cap, Math.max(1, Math.round(raw)));
}

const initialStability = (w, g) => clampS(w[g - 1]);
const initialDifficulty = (w, g) => clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);

function nextDifficulty(w, d, g) {
  const delta = -w[6] * (g - 3);
  const damped = d + delta * ((10 - d) / 9); // 线性阻尼：越接近 10 越难再涨
  const reverted = w[7] * initialDifficulty(w, Rating.Easy) + (1 - w[7]) * damped;
  return clampD(reverted);
}

function stabilityOnRecall(w, d, s, r, g) {
  const hardPenalty = g === Rating.Hard ? w[15] : 1;
  const easyBonus = g === Rating.Easy ? w[16] : 1;
  const growth =
    Math.exp(w[8]) *
    (11 - d) *
    Math.pow(s, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return clampS(s * (1 + growth));
}

function stabilityOnLapse(w, d, s, r) {
  const long =
    w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  // 遗忘后的稳定性不该超过遗忘前 —— 上游同款钳制
  return clampS(Math.min(long, s));
}

/** 新卡：一张还没被复习过的卡。 */
export function newCard(cardId) {
  return {
    cardId,
    difficulty: 0,
    stability: 0,
    state: State.New,
    reps: 0,
    lapses: 0,
    streak: 0, // 连对次数 —— 三次律用（见 applyThreeStrikes）
    due: null,
    lastReview: null,
    elapsedDays: 0,
    scheduledDays: 0,
  };
}

/**
 * 复习一张卡，返回新状态。纯函数：不改入参。
 * @param {object} card
 * @param {1|2|3|4} rating
 * @param {Date} now
 * @param {{w?: number[], desiredRetention?: number}} opts
 */
export function review(card, rating, now = new Date(), opts = {}) {
  const w = opts.w || DEFAULT_W;
  const desiredRetention = opts.desiredRetention ?? 0.9;
  // 考期约束：排到考试之后的复习对备考没有意义。
  // 通用 SRS 应用没有这个概念——它们假设你要永远记住；我们只需要记到考完。
  const maxDays = opts.examDate
    ? Math.max(1, Math.ceil((new Date(opts.examDate) - now) / 86400000))
    : (opts.maximumInterval ?? MAX_INTERVAL_DAYS);
  const g = rating;
  if (!Object.values(Rating).includes(g)) throw new Error(`非法评分 ${rating}`);

  const last = card.lastReview ? new Date(card.lastReview) : null;
  const elapsedDays = last ? Math.max(0, (now - last) / 86400000) : 0;

  let d, s;
  if (card.state === State.New || card.stability <= 0) {
    d = initialDifficulty(w, g);
    s = initialStability(w, g);
  } else {
    const r = retrievability(elapsedDays, card.stability);
    d = nextDifficulty(w, card.difficulty, g);
    s = g === Rating.Again
      ? stabilityOnLapse(w, card.difficulty, card.stability, r)
      : stabilityOnRecall(w, card.difficulty, card.stability, r, g);
  }

  const failed = g === Rating.Again;
  const scheduledDays = intervalFor(s, desiredRetention, maxDays);

  return {
    ...card,
    difficulty: d,
    stability: s,
    state: failed
      ? State.Relearning
      : card.state === State.New
        ? State.Learning
        : State.Review,
    reps: card.reps + 1,
    lapses: card.lapses + (failed ? 1 : 0),
    streak: failed ? 0 : card.streak + 1,
    elapsedDays,
    scheduledDays,
    lastReview: now.toISOString(),
    due: new Date(now.getTime() + scheduledDays * 86400000).toISOString(),
  };
}

/** 四个评分各自会排到几天后 —— 界面上按钮下方显示「1天 / 3天 / 8天 / 20天」用。 */
export function previewIntervals(card, now = new Date(), opts = {}) {
  const out = {};
  for (const [name, g] of Object.entries(Rating)) {
    out[name] = review(card, g, now, opts).scheduledDays;
  }
  return out;
}

/**
 * 三次律 —— 项目已定的业务纪律，凌驾于算法之上（不让算法吃掉纪律）。
 * 连对 3 次出库（不再进错题队列）；任何时候再错 streak 归零、自动打回。
 * 与 FSRS 并存而非替代：FSRS 管「什么时候再见」，三次律管「还算不算错题」。
 * ⚠️ 执法点在 buildQueue 的错题两桶——判据只写在这里而不接进队列，等于没有。
 *    （终审 2026-07-28 实抓：此前 inWeakPool 无任何调用方，一张高信心错过的卡
 *    连对再多次也永远排队首。）
 */
export const inWeakPool = (card) => (card.streak || 0) < 3;

export function applyThreeStrikes(card) {
  return { ...card, inWeakPool: inWeakPool(card) };
}

/**
 * 排今天的队列。
 * 顺序即优先级，理由写在下面——这是产品判断，不是算法：
 *   1. 高信心错题：答错且当时很确定 = 最危险的洞（会在客户面前犯的那种错）
 *   2. 到期错题：普通 lapse
 *   3. 到期复习（连对 3 次出库的卡回到这里，只按 FSRS 正常到期）
 *   4. 新卡（按传入顺序；要按考纲缺口优先，由调用方在传入前排序——卡状态里没有板块信息）
 */
export function buildQueue({ cards, now = new Date(), newLimit = 10, reviewLimit = 40 }) {
  const t = now.getTime();
  const isDue = (c) => c.due && new Date(c.due).getTime() <= t;

  // 错题两桶都受三次律约束：连对 3 次出库，之后只按普通到期走
  const highConfidenceWrong = cards.filter(
    (c) => isDue(c) && c.lastWrongCertainty === 3 && inWeakPool(c));
  const seen = new Set(highConfidenceWrong.map((c) => c.cardId));
  const lapsed = cards.filter(
    (c) => isDue(c) && c.lapses > 0 && inWeakPool(c) && !seen.has(c.cardId));
  lapsed.forEach((c) => seen.add(c.cardId));
  const due = cards.filter((c) => isDue(c) && !seen.has(c.cardId));
  const fresh = cards.filter((c) => c.state === State.New);

  return [
    ...highConfidenceWrong,
    ...lapsed,
    ...due,
  ].slice(0, reviewLimit).concat(fresh.slice(0, newLimit));
}

/**
 * 目标保留率随考期调整。
 * 依据（闪卡草案 §4.7 深研）：最优间隔随目标保留期变化——
 * 目标保留 7 天→最优间隔约 1 天；35 天→11 天；70 天→21 天；1 年→21 天。
 * FSRS 默认「无限期维持 90%」的目标函数，和一个**定死日期的考试**并不对齐。
 */
export function retentionForExam(daysUntilExam) {
  if (daysUntilExam == null) return 0.9;
  if (daysUntilExam <= 14) return 0.95; // 冲刺期：宁可多复习也别在考前忘
  if (daysUntilExam <= 60) return 0.92;
  if (daysUntilExam <= 180) return 0.9;
  return 0.87; // 还早：省复习量，把时间花在新内容上
}
