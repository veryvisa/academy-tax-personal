/* 个税计算器 · 纯计算层（无 DOM）。常量只从 TAX_RULES 读（tax-rules.js 由 tools/build_rules.py 从已核数字库生成），
 * 这里不手写任何税务数字。浏览器里挂 window.TaxCalc；node 里 require 本文件（测试用）。
 * 所有结果是 2026 税年的示意测算，不是 CRA 的实际核定；省份只支持 BC（安省附加税与医疗保费未入库，不算）。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./tax-rules.js"));
  else root.TaxCalc = factory(root.TAX_RULES);
})(typeof self !== "undefined" ? self : this, function (R) {
  "use strict";
  const V = (k) => { if (!(k in R)) throw new Error("规则缺失：" + k); return R[k].value; };
  const U = (k) => R[k].url;
  const r2 = (x) => { const y = x * 100; return (y < 0 ? -Math.round(-y + 1e-7) : Math.round(y + 1e-7)) / 100; };  // 四舍五入到分（半分进位，抵消浮点误差）
  const trunc2 = (x) => Math.floor(x * 100 + 1e-7) / 100;  // CRA 官方 CCB 算例对「收入超出部分×比率」按分截断
  const pc = (k) => V(k) / 100;

  // ── 税率表 ─────────────────────────────────────────────
  function fedBrackets() {
    return [[V("federal-first-threshold"), pc("federal-lowest-rate")], [V("federal-second-threshold"), pc("federal-rate-2")],
      [V("federal-third-threshold"), pc("federal-rate-3")], [V("federal-top-threshold"), pc("federal-rate-4")], [Infinity, pc("federal-rate-5")]];
  }
  function bcBrackets() {
    return [1, 2, 3, 4, 5, 6].map((i) => [V("bc-bracket-" + i + "-threshold"), pc("bc-bracket-" + i + "-rate")]).concat([[Infinity, pc("bc-bracket-7-rate")]]);
  }
  function bracketTax(income, br) {
    let tax = 0, lo = 0;
    for (const [hi, rate] of br) {
      if (income > lo) tax += (Math.min(income, hi) - lo) * rate;
      lo = hi;
    }
    return tax;
  }
  function fedBPA(netIncome) {
    const lo = V("federal-third-threshold"), hi = V("federal-top-threshold"), mx = V("bpa-max"), mn = V("bpa-min");
    if (netIncome <= lo) return mx;
    if (netIncome >= hi) return mn;
    return mx - (mx - mn) * (netIncome - lo) / (hi - lo);
  }
  /** 联邦税：税阶税额 − 14% × (基本个人额 + 其他抵免基数)，不低于 0。o.fedCredits＝其他抵免基数数组；o.netIncome 缺省＝应税收入 */
  function fedTax(ti, o) {
    o = o || {}; ti = Math.max(0, ti);
    const ni = o.netIncome == null ? ti : o.netIncome;
    const base = (o.noBpa ? 0 : fedBPA(ni)) + (o.fedCredits || []).reduce((a, b) => a + b, 0);
    return Math.max(0, bracketTax(ti, fedBrackets()) - pc("federal-lowest-rate") * base);
  }
  /** BC 税：税阶税额 − 5.6% × (基本个人额 + 其他) 后不低于 0，再减 BC 税减免（也不使税额为负） */
  function bcTax(ti, o) {
    o = o || {}; ti = Math.max(0, ti);
    const ni = o.netIncome == null ? ti : o.netIncome;
    const base = (o.noBpa ? 0 : V("bc-bpa-max")) + (o.bcCredits || []).reduce((a, b) => a + b, 0);
    const t = Math.max(0, bracketTax(ti, bcBrackets()) - pc("bc-bracket-1-rate") * base);
    return Math.max(0, t - bcReduction(ni));
  }
  function bcReduction(ni) {
    const mx = V("bc-tax-reduction-max"), st = V("bc-tax-reduction-start");
    return ni <= st ? mx : Math.max(0, mx - pc("bc-tax-reduction-rate") * (ni - st));
  }
  function tax(ti, prov, o) {
    if (prov && prov !== "BC") throw new Error("目前只支持 BC");
    const fed = fedTax(ti, o), pv = bcTax(ti, o);
    return { fed: r2(fed), prov: r2(pv), total: r2(fed + pv) };
  }
  /** 多收入 extra 的边际税：tax(base+extra) − tax(base) */
  function marginal(base, extra, prov, o) {
    return r2(tax(base + extra, prov, o).total - tax(base, prov, o).total);
  }

  // ── 1 RRSP 个人额度 ───────────────────────────────────
  function rrspRoom(o) {
    const earned = Math.max(0, o.earned || 0);
    const add = Math.min(earned * pc("rrsp-earned-percent"), V("rrsp-limit"));
    const room = Math.max(0, add - (o.pa || 0) + (o.carry || 0));
    const contrib = o.contrib || 0, cushion = V("rrsp-excess-cushion");
    const left = Math.max(0, room - contrib);
    const over = Math.max(0, contrib - room);
    const taxableOver = Math.max(0, over - cushion);
    return { added: r2(add), room: r2(room), left: r2(left), over: r2(over), cushion, taxableOver: r2(taxableOver), monthlyPenalty: r2(taxableOver * 0.01) };
  }

  // ── 2 RRSP 预扣与最终税 ─────────────────────────────────
  function withholdRate(w) {
    return w <= V("rrsp-withholding-first-cap") ? pc("rrsp-withhold-rate-1") : w <= V("rrsp-withholding-second-cap") ? pc("rrsp-withhold-rate-2") : pc("rrsp-withhold-rate-3");
  }
  function rrspWithdraw(o) {
    const w = Math.max(0, o.amount || 0), rate = withholdRate(w);
    const withheld = r2(w * rate);
    const finalTax = marginal(o.otherIncome || 0, w, "BC");
    return { rate, withheld, finalTax, balance: r2(finalTax - withheld), net: r2(w - finalTax) };
  }

  // ── 3 HBP 未还款的后果 ───────────────────────────────
  function hbpShortfall(o) {
    // 所得税法 146.01(3)–(5)：指定的还款减少 HBP 余额；当年应还而没还的部分并入当年收入，同时也从余额里扣掉
    const req = Math.max(0, o.required || 0), paid = Math.max(0, o.paid || 0), bal = Math.max(0, o.balance || 0);
    const short = Math.max(0, req - paid);
    const extraTax = short ? marginal(o.otherIncome || 0, short, "BC") : 0;
    return { short: r2(short), extraTax, balanceAfter: r2(Math.max(0, bal - Math.max(paid, req))) };
  }

  // ── 4 托儿费 ──────────────────────────────────────────
  function childcare(o) {
    const lim = { u7: V("childcare-under7-limit"), other: V("childcare-other-limit"), dtc: V("childcare-dtc-limit") };
    let kids = 0;
    const rows = (o.kids || []).map((k) => { const cap = lim[k.cat]; const a = Math.min(Math.max(0, k.expense || 0), cap); kids += a; return { cat: k.cat, cap, allowed: a }; });
    const earnCap = V("childcare-earned-income-fraction") * Math.max(0, o.lowerEarned || 0);
    const deduction = Math.min(kids, earnCap);
    // 比较：由低收入方（默认）还是高收入方申报，各省多少税。受限于「申报人赚取收入的 2/3」，高收入方一般额度更大，但规则要求低收入方申报（例外：对方在学、住院、入狱等）
    const capHigh = V("childcare-earned-income-fraction") * Math.max(0, o.higherEarned || 0);
    const dHigh = Math.min(kids, capHigh);
    const saveLow = deduction ? r2(tax(o.lowerTaxable || 0, "BC").total - tax(Math.max(0, (o.lowerTaxable || 0) - deduction), "BC").total) : 0;
    const saveHigh = dHigh ? r2(tax(o.higherTaxable || 0, "BC").total - tax(Math.max(0, (o.higherTaxable || 0) - dHigh), "BC").total) : 0;
    return { rows, kidsTotal: r2(kids), earnCap: r2(earnCap), deduction: r2(deduction), binding: kids <= earnCap ? "按每个孩子的年度上限" : "按赚取收入的 2/3", saveLow, saveHigh, deductionIfHigh: r2(dHigh) };
  }

  // ── 5 医疗费 ──────────────────────────────────────────
  function medical(o) {
    const net = Math.max(0, (o.expense || 0) - (o.reimbursed || 0));
    const ni = Math.max(0, o.netIncome || 0);
    const fThr = Math.min(0.03 * ni, V("medical-threshold")), bThr = Math.min(0.03 * ni, V("bc-medical-floor-cap"));
    const fAmt = Math.max(0, net - fThr), bAmt = Math.max(0, net - bThr);
    const fCredit = r2(fAmt * pc("federal-lowest-rate")), bCredit = r2(bAmt * pc("bc-bracket-1-rate"));
    return { net: r2(net), fedThreshold: r2(fThr), bcThreshold: r2(bThr), fedAmount: r2(fAmt), bcAmount: r2(bAmt), fedCredit: fCredit, bcCredit: bCredit, total: r2(fCredit + bCredit), cap: r2(fAmt) };
  }

  // ── 6 扣除 vs 抵免 ────────────────────────────────────
  function creditVsDeduction(o) {
    const amt = Math.max(0, o.amount || 0), ti = Math.max(0, o.taxable || 0);
    const t0 = tax(ti, "BC").total;
    const dedSave = r2(t0 - tax(Math.max(0, ti - amt), "BC").total);
    // 抵免：联邦 14% ＋ BC 5.6%，但不能把税抵成负数（不可退抵免）
    const t = tax(ti, "BC");
    const fedSave = Math.min(t.fed, amt * pc("federal-lowest-rate")), bcSave = Math.min(t.prov, amt * pc("bc-bracket-1-rate"));
    const credSave = r2(fedSave + bcSave);
    return { taxBefore: t0, deductionSaves: dedSave, creditSaves: credSave, marginalNote: r2(dedSave / (amt || 1) * 100) };
  }

  // ── 7 投资亏损 ────────────────────────────────────────
  function capitalLoss(o) {
    const inc = pc("cg-inclusion");
    const gains = Math.max(0, o.gains || 0), losses = Math.max(0, o.losses || 0);
    const net = gains - losses;
    const taxableGain = net > 0 ? net * inc : 0;
    const newNetLoss = net < 0 ? -net * inc : 0;
    const carry = Math.max(0, o.carry || 0);
    const applied = Math.min(carry, taxableGain);
    return { net: r2(net), taxableGain: r2(taxableGain), newNetLoss: r2(newNetLoss), applied: r2(applied), taxableAfter: r2(taxableGain - applied), carryOut: r2(carry - applied + newNetLoss), againstSalary: 0 };
  }

  // ── 8 ACB（同类证券加权平均成本）───────────────────────
  function acb(lines) {
    let qty = 0, cost = 0;
    const out = [], buys = [];
    const ev = lines.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (const e of ev) {
      if (e.type === "buy") {
        qty += e.qty; cost += e.qty * e.price + (e.fee || 0); buys.push(e);
        out.push({ date: e.date, type: "buy", qty, acb: r2(cost), avg: qty ? cost / qty : 0 });
      } else {
        if (e.qty > qty + 1e-9) throw new Error(e.date + " 卖出 " + e.qty + " 股，但当时只持有 " + qty);
        const avg = cost / qty, proceeds = e.qty * e.price - (e.fee || 0), basis = avg * e.qty, gain = proceeds - basis;
        cost -= basis; qty -= e.qty;
        let warn = "";
        if (gain < 0) {
          const d = Date.parse(e.date), D = 30 * 864e5;
          if (ev.some((b) => b.type === "buy" && Math.abs(Date.parse(b.date) - d) <= D && b.date !== e.date)) warn = "亏损卖出前后 30 天内有买入，可能触发表面亏损，需另行核对";
        }
        out.push({ date: e.date, type: "sell", qty: e.qty, proceeds: r2(proceeds), basis: r2(basis), gain: r2(gain), warn, remainQty: qty, remainAcb: r2(cost) });
      }
    }
    return { rows: out, qty, acb: r2(cost), totalGain: r2(out.filter((x) => x.type === "sell").reduce((s, x) => s + x.gain, 0)) };
  }
  function parseTx(text) {
    const rows = [];
    String(text || "").split(/\n/).forEach((l, i) => {
      l = l.trim(); if (!l) return;
      const p = l.split(/[\s,，]+/);
      const m = p[0] && p[0].match(/^\d{4}-\d{2}-\d{2}$/);
      const t = { buy: "buy", 买: "buy", 买入: "buy", sell: "sell", 卖: "sell", 卖出: "sell" }[p[1]];
      if (!m || !t || p.length < 4 || isNaN(+p[2]) || isNaN(+p[3])) throw new Error("第 " + (i + 1) + " 行格式不对：日期 买入/卖出 数量 单价 [手续费]");
      rows.push({ date: p[0], type: t, qty: +p[2], price: +p[3], fee: p[4] ? +p[4] : 0 });
    });
    return rows;
  }

  // ── 9 出租房出售：折旧收回与资本利得分开 ───────────────────
  function rentalSale(o) {
    const cost = o.cost || 0, claimed = o.claimedCca || 0, net = (o.proceeds || 0) - (o.outlays || 0);
    const ucc = cost - claimed;
    const recapture = Math.max(0, Math.min(net, cost) - ucc);
    const gain = Math.max(0, net - cost);
    const terminalLoss = o.lastInClass ? Math.max(0, ucc - net) : 0;
    const taxableGain = gain * pc("cg-inclusion");
    const incomeAdd = recapture + taxableGain - terminalLoss;
    return { ucc: r2(ucc), recapture: r2(recapture), gain: r2(gain), taxableGain: r2(taxableGain), terminalLoss: r2(terminalLoss), incomeAdd: r2(incomeAdd), tax: o.otherIncome == null ? null : marginal(o.otherIncome, Math.max(0, incomeAdd), "BC") };
  }

  // ── 10/11 多雇主 CPP / EI ──────────────────────────────
  function payrollOne(income) {
    const cpp = Math.max(0, Math.min(income, V("cpp-ympe")) - V("cpp-exemption")) * pc("cpp-rate");
    const cpp2 = Math.max(0, Math.min(income, V("cpp2-yampe")) - V("cpp-ympe")) * pc("cpp2-rate");
    const ei = Math.min(income, V("ei-mie")) * pc("ei-rate");
    return { cpp: r2(cpp), cpp2: r2(cpp2), ei: r2(ei) };
  }
  function payrollOverpay(rows) {
    const s = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
    const cpp = s("cpp"), cpp2 = s("cpp2"), ei = s("ei");
    const o = { cpp: Math.max(0, cpp - V("cpp-employee-max")), cpp2: Math.max(0, cpp2 - V("cpp2-employee-max")), ei: Math.max(0, ei - V("ei-employee-max")) };
    const expected = rows.map((r) => payrollOne(r.income || 0));
    return { cpp: r2(cpp), cpp2: r2(cpp2), ei: r2(ei), over: { cpp: r2(o.cpp), cpp2: r2(o.cpp2), ei: r2(o.ei) }, refund: r2(o.cpp + o.cpp2 + o.ei), caps: { cpp: V("cpp-employee-max"), cpp2: V("cpp2-employee-max"), ei: V("ei-employee-max") }, expected };
  }
  function t4Settle(rows) {
    const income = rows.reduce((a, r) => a + (r.income || 0), 0), withheld = rows.reduce((a, r) => a + (r.tax || 0), 0);
    const po = payrollOverpay(rows);
    const cppPaid = Math.min(po.cpp, V("cpp-employee-max")), cpp2Paid = Math.min(po.cpp2, V("cpp2-employee-max")), eiPaid = Math.min(po.ei, V("ei-employee-max"));
    const baseShare = V("cpp-base-rate") / V("cpp-rate");
    const cppBase = cppPaid * baseShare, enhanced = cppPaid - cppBase + cpp2Paid;
    const ti = Math.max(0, income - enhanced);
    const t = tax(ti, "BC", {
      netIncome: ti,
      fedCredits: [Math.min(V("employment-amount"), income), cppBase, eiPaid],
      bcCredits: [cppBase, eiPaid],
    });
    return { income: r2(income), enhancedDeduction: r2(enhanced), taxable: r2(ti), fed: t.fed, prov: t.prov, tax: t.total, withheld: r2(withheld), balance: r2(t.total - withheld), payroll: po };
  }

  // ── 12 CCB ───────────────────────────────────────────
  function ccb(afni, ages) {
    const n = ages.length;
    if (!n) return 0;
    const max = ages.reduce((s, a) => s + (a < 6 ? V("ccb-base-under6") : a < 18 ? V("ccb-base-6to17") : 0), 0);
    const k = Math.min(n, 4);
    const t1 = V("ccb-phaseout-first"), t2 = V("ccb-phaseout-second");
    const base2 = [V("ccb-base-phaseout-one"), V("ccb-base-phaseout-two"), V("ccb-base-phaseout-three"), V("ccb-base-phaseout-four")][k - 1];
    let red = 0;
    if (afni > t2) red = base2 + trunc2((afni - t2) * pc("ccb-rate-second-" + k));
    else if (afni > t1) red = trunc2((afni - t1) * pc("ccb-rate-first-" + k));
    return r2(Math.max(0, max - red));
  }

  // ── 13 RESP 当年补助 ─────────────────────────────────
  function cesgYear(o) {
    const c = Math.max(0, o.contrib || 0), life = Math.max(0, V("cesg-lifetime") - (o.received || 0));
    const cap = Math.min(V("cesg-basic-annual") + Math.max(0, o.unusedRoom || 0), V("cesg-annual-max-carry"));
    const basic = Math.min(r2(Math.min(c, V("cesg-basic-contribution") + Math.max(0, o.unusedRoom || 0) / pc("cesg-basic-rate")) * pc("cesg-basic-rate")), cap, life);
    const tier = o.afni <= V("cesg-income-low") ? "low" : o.afni <= V("cesg-income-high") ? "mid" : "high";
    const rate = tier === "low" ? pc("acesg-rate-low") : tier === "mid" ? pc("acesg-rate-mid") : 0;
    const extra = Math.min(r2(Math.min(c, V("cesg-additional-contribution")) * rate), Math.max(0, life - basic));
    const toMax = Math.max(0, (V("cesg-basic-annual") + Math.max(0, o.unusedRoom || 0)) / pc("cesg-basic-rate"));
    return { basic: r2(basic), extra: r2(extra), total: r2(basic + extra), tier, contribForMaxBasic: r2(Math.min(toMax, V("cesg-annual-max-carry") / pc("cesg-basic-rate"))) };
  }

  // ── 14 TFSA 额度 ─────────────────────────────────────
  function tfsaRoom(o) {
    const H = R["tfsa-limit"].history, thisYear = o.thisYear || 2026;
    const from = Math.max(2009, o.firstYear || 2009);
    let room = 0;
    const rows = [];
    for (let y = from; y <= thisYear; y++) {
      const added = H[y] != null ? H[y] : 0;
      const back = y > from ? (o.withdrawals && o.withdrawals[y - 1]) || 0 : 0;  // 去年取出的，今年 1 月 1 日加回
      room += added + back;
      const c = (o.contributions && o.contributions[y]) || 0;
      rows.push({ year: y, added, back, roomStart: r2(room), contrib: c, excess: r2(Math.max(0, c - room)) });
      room -= c;
    }
    const last = rows[rows.length - 1];
    const excess = last.excess;
    const sameYearWd = (o.withdrawals && o.withdrawals[thisYear]) || 0;
    return { rows, available: r2(Math.max(0, room)), roomStartThisYear: last.roomStart, excess, monthlyTax: r2(excess * pc("tfsa-excess-rate")), sameYearWd, nextJan: r2(Math.max(0, room) + sameYearWd + (H[thisYear + 1] || 0)), nextLimitKnown: H[thisYear + 1] != null };
  }
  function monthsTax(excess, months) { return r2(excess * pc("tfsa-excess-rate") * months); }

  // ── 15 T1135 筛查 ────────────────────────────────────
  function t1135(o) {
    const cost = Math.max(0, o.cost || 0), thr = V("t1135-cost-threshold"), det = V("t1135-detailed-threshold");
    return { required: cost > thr, detailed: cost >= det, cost, threshold: thr, detailedThreshold: det };
  }

  // ── 16 RRSP 抵扣 × 家庭福利 ─────────────────────────────
  function rrspBenefits(o) {
    const mine = Math.max(0, o.income || 0), sp = Math.max(0, o.spouse || 0), d = Math.max(0, o.deduct || 0), ages = o.ages || [];
    const taxSave = r2(tax(mine, "BC").total - tax(Math.max(0, mine - d), "BC").total);
    const ccb0 = ccb(mine + sp, ages), ccb1 = ccb(mine + sp - d, ages);
    return { taxSave, ccbChange: r2(ccb1 - ccb0), ccb0, ccb1, total: r2(taxSave + ccb1 - ccb0) };
  }

  return { V, U, R, fedBrackets, bcBrackets, bracketTax, fedBPA, fedTax, bcTax, bcReduction, tax, marginal, rrspRoom, withholdRate, rrspWithdraw, hbpShortfall, childcare, medical, creditVsDeduction, capitalLoss, acb, parseTx, rentalSale, payrollOne, payrollOverpay, t4Settle, ccb, cesgYear, tfsaRoom, monthsTax, t1135, rrspBenefits };
});
