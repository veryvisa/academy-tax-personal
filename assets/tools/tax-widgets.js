/* 个税计算器 · 界面层。页面里放 <div data-tax-widget="名字"></div> 即挂载。
 * 计算全部走 TaxCalc（tax-calc.js），常量全部走 TAX_RULES（tax-rules.js，由已核数字库生成）。结果都在浏览器里算，不上传。 */
(function () {
  "use strict";
  const C = window.TaxCalc, R = window.TAX_RULES;
  if (!C || !R) return;
  const $ = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(x).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("en-CA");
  const pct = (x) => (Math.round(x * 10000) / 100) + "%";
  const note = (h) => `<p class="tc-note">${h}</p>`;
  const kpi = (items) => `<div class="tc-kpis">${items.map(([a, b, c]) => `<div><small>${a}</small><b>${b}</b>${c ? `<span>${c}</span>` : ""}</div>`).join("")}</div>`;
  const list = (items) => `<ul class="tc-list">${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const NS = (n) => (n == null || isNaN(n) ? 0 : n);

  function field(label, name, value, type, extra, hint) {
    type = type || "number";
    const h = hint ? `<em>${hint}</em>` : "";
    if (type === "select") return `<label class="tc-f"><span>${label}</span><select name="${name}">${extra.map(([v, t]) => `<option value="${v}"${String(v) === String(value) ? " selected" : ""}>${t}</option>`).join("")}</select>${h}</label>`;
    if (type === "check") return `<label class="tc-f tc-check"><input type="checkbox" name="${name}"${value ? " checked" : ""}><span>${label}</span></label>`;
    if (type === "area") return `<label class="tc-f tc-wide"><span>${label}</span><textarea name="${name}" rows="${extra || 6}">${esc(value)}</textarea>${h}</label>`;
    return `<label class="tc-f"><span>${label}</span><input type="${type}" name="${name}" value="${value}" inputmode="decimal" step="any" min="0"${extra ? " " + extra : ""}>${h}</label>`;
  }
  function mount(root, html, run, uses, extraNote) {
    const f = $("form", { class: "tc-form", novalidate: "" }, html);
    const out = $("div", { class: "tc-out", "aria-live": "polite" });
    const foot = $("div", { class: "tc-foot" });
    const seen = {};
    const links = (uses || []).concat(["federal-lowest-rate"]).filter((k) => R[k] && !seen[R[k].url] && (seen[R[k].url] = 1))
      .map((k) => `<a href="${R[k].url}" target="_blank" rel="noopener">${esc(R[k].label)}</a>`);
    foot.innerHTML = `<p><b>数字来源与适用税年：</b>2026 税年（2027 年春报）。数字取自本站已核数字库，逐项官方出处：${links.join("、")}。` +
      `${extraNote || ""}结果是示意测算，不是 CRA 的核定；只算联邦＋BC，不含安省附加税与医疗保费、其他抵免与扣除。</p>`;
    root.append(f, out, foot);
    const read = () => { const o = {}; for (const el of f.elements) { if (!el.name) continue; o[el.name] = el.type === "checkbox" ? el.checked : el.type === "number" ? (el.value === "" ? 0 : +el.value) : el.value; } return o; };
    const go = () => { try { out.innerHTML = run(read()) || ""; } catch (e) { out.innerHTML = `<p class="tc-err">算不出来：${esc(e.message)}</p>`; } };
    f.addEventListener("input", go); f.addEventListener("change", go); f.addEventListener("submit", (e) => { e.preventDefault(); go(); });
    go();
  }

  const W = {};

  W["rrsp-room"] = (root) => mount(root,
    field("上一年（2025）的赚取收入", "earned", 100000, "number", "", "工资、自雇净收入、租金净收入等；不含 RRSP 提款、投资收入") +
    field("上一年底的未用额度（评税通知书上的结转）", "carry", 0) +
    field("上一年的养老金调整额 PA（T4 框 52）", "pa", 0) +
    field("今年（2026）已经存入 RRSP 的金额", "contrib", 0),
    (o) => {
      const r = C.rrspRoom(o);
      return kpi([["2026 年新增额度", money(r.added), `18% × 赚取收入，封顶 ${money0(C.V("rrsp-limit"))}`], ["今年能抵扣的总额度", money(r.room), "新增 − PA ＋ 结转"], ["还能再存", money(r.left)]]) +
        (r.over > 0 ? `<p class="tc-warn">已超出额度 ${money(r.over)}。成年人有 ${money0(r.cushion)} 的免罚缓冲：${r.taxableOver > 0 ? `超出缓冲的 ${money(r.taxableOver)} 每月被罚约 ${money(r.monthlyPenalty)}（按 1%/月，直到取出或额度追上）` : "你在缓冲内，暂不罚税，但这部分也不能抵扣"}。</p>` : "") +
        note("公告里的年度上限只是封顶，不是你的额度：你的额度以评税通知书（NOA）上的「RRSP 扣除限额」为准，这里用来估算和核对。");
    }, ["rrsp-limit", "rrsp-earned-percent", "rrsp-excess-cushion"]);

  W["rrsp-withdraw"] = (root) => mount(root,
    field("今年准备从 RRSP 取出（加元）", "amount", 10000) +
    field("今年其他应税收入（不含这笔提款）", "otherIncome", 50000),
    (o) => {
      const r = C.rrspWithdraw(o);
      return kpi([["银行先扣的预扣税", money(r.withheld), `按 ${pct(r.rate)} 预扣（魁省以外）`], ["报税时这笔提款实际增加的税", money(r.finalTax), "联邦＋BC，按你的收入档"], [r.balance >= 0 ? "报税时还要补" : "报税时可退回", money(Math.abs(r.balance))]]) +
        list([`取 ${money(o.amount)}，到手 ${money(o.amount - r.withheld)}；报税后真正留在手里的约 ${money(r.net)}。`, "预扣率只看「这一次取多少」，与你的税率档无关；预扣是预缴，不是最终税。"]) +
        note("分几次小额取出，每次的预扣率可能更低，但最终税是全年收入合并算的，总税不会因此变少。");
    }, ["rrsp-withhold-rate-1", "rrsp-withhold-rate-2", "rrsp-withhold-rate-3", "rrsp-withholding-first-cap", "rrsp-withholding-second-cap"]);

  W["hbp"] = (root) => mount(root,
    field("CRA 评税通知书上，今年「应还」的 HBP 金额", "required", 4000, "number", "", "不要自己推起算年：以 NOA 上的数为准") +
    field("今年你实际存入、并指定为 HBP 还款的金额", "paid", 2500, "number", "", "要在报税时指定，普通 RRSP 供款不会自动算还款") +
    field("当前 HBP 余额（NOA）", "balance", 60000) +
    field("今年其他应税收入", "otherIncome", 80000),
    (o) => {
      const r = C.hbpShortfall(o);
      return r.short > 0
        ? kpi([["今年还差", money(r.short), "这部分被并入今年收入"], ["多交的税（估）", money(r.extraTax), "联邦＋BC，按你的收入档"], ["还款后余额", money(r.balanceAfter)]]) +
          note("没还够的部分不是「顺延」：它要加进当年收入报税，而且这部分提款的 HBP 余额也随之清掉（不再享受免税提款的待遇）。")
        : kpi([["今年还差", money(0)], ["还款后余额", money(r.balanceAfter)]]) + note("今年的应还额已经还够。要多还也可以，余额会下降。");
    }, ["hbp-max"], `HBP 单次提取上限 ${money0(C.V("hbp-max"))}（来源：<a href="${R["hbp-max"].url}" target="_blank" rel="noopener">所得税法 146.01</a>）。`);

  const catOpts = [["u7", "未满 7 岁（年末）"], ["other", "7–16 岁"], ["dtc", "有残障税务抵免资格"]];
  W["childcare"] = (root) => mount(root,
    [1, 2, 3].map((i) => field(`孩子 ${i} 类别`, "c" + i, i === 1 ? "u7" : "other", "select", catOpts) + field(`孩子 ${i} 全年托儿费（0=没有）`, "e" + i, i === 1 ? 12000 : 0)).join("") +
    field("收入较低一方的赚取收入", "lowerEarned", 60000) + field("收入较低一方的应税收入", "lowerTaxable", 55000) +
    field("收入较高一方的赚取收入", "higherEarned", 120000) + field("收入较高一方的应税收入", "higherTaxable", 115000),
    (o) => {
      const kids = [1, 2, 3].filter((i) => o["e" + i] > 0).map((i) => ({ cat: o["c" + i], expense: o["e" + i] }));
      const r = C.childcare({ kids, lowerEarned: o.lowerEarned, higherEarned: o.higherEarned, lowerTaxable: o.lowerTaxable, higherTaxable: o.higherTaxable });
      return kpi([["各孩子上限内合计", money(r.kidsTotal), "未满 7 岁、7–16 岁、残障各有年度上限"], ["赚取收入 2/3 的上限", money(r.earnCap), "申报人收入较低一方"], ["本年可扣除", money(r.deduction), r.binding]]) +
        list([`由收入较低一方申报：扣除 ${money(r.deduction)}，约省税 ${money(r.saveLow)}。`, `若假设由收入较高一方申报：可扣 ${money(r.deductionIfHigh)}，约省税 ${money(r.saveHigh)}——但规则要求托儿费一般由收入较低一方申报，对方在学、住院、入狱、分居等才有例外，这一行只用来看差距，不是让你自己选。`]) +
        note("不在此计：寄宿学校与夏令营的周数上限、孩子由谁照看的资格细节。");
    }, ["childcare-under7-limit", "childcare-other-limit", "childcare-dtc-limit", "childcare-earned-income-fraction"]);

  W["medical"] = (root) => mount(root,
    field("全年医疗费用合计", "expense", 5000) + field("其中已获保险或其他方报销的", "reimbursed", 0) + field("申报人的净收入", "netIncome", 50000),
    (o) => {
      const r = C.medical(o);
      return kpi([["可申报净额", money(r.net), "费用 − 已报销的"], ["联邦门槛（3% 与定额孰低）", money(r.fedThreshold)], ["BC 门槛", money(r.bcThreshold)], ["联邦抵免", money(r.fedCredit)], ["BC 抵免", money(r.bcCredit)], ["合计省税", money(r.total)]]) +
        note("已被保险报销的部分不能再报；家庭成员的费用一般可合并到一人名下申报，12 个月期间的选择与例外请人工复核。");
    }, ["medical-threshold", "bc-medical-floor-cap", "bc-bracket-1-rate"]);

  W["credits"] = (root) => mount(root,
    field("这一笔金额", "amount", 1000) + field("你的应税收入", "taxable", 80000),
    (o) => {
      const r = C.creditVsDeduction(o);
      return kpi([["作为「扣除」", money(r.deductionSaves), "按你的边际税率省税"], ["作为「不可退抵免」", money(r.creditSaves), "联邦 14% ＋ BC 5.6%（只抵到税为 0）"], ["不报时的税", money(r.taxBefore)]]) +
        note("扣除是先减收入再算税，高收入者省得多；不可退抵免是算出税再抵扣，每人按最低税率档，且不会变成退款。金额「可申报」不等于「同额退款」。");
    }, ["federal-lowest-rate", "bc-bracket-1-rate"]);

  W["capital-loss"] = (root) => mount(root,
    field("本年卖出的资本利得合计", "gains", 10000) + field("本年卖出的资本亏损合计", "losses", 4000) + field("以前年度结转的净资本亏损（已是应税金额）", "carry", 2000),
    (o) => {
      const r = C.capitalLoss(o);
      return kpi([["本年净额", money(r.net)], ["应税资本利得（50%）", money(r.taxableGain)], ["用上结转的亏损", money(r.applied)], ["计入收入的应税利得", money(r.taxableAfter)], ["结转到明年的净资本亏损", money(r.carryOut)]]) +
        note("股票亏损只能冲资本利得，不能直接冲工资收入；今年用不完的净亏损可往前 3 年或无限期往后结转。资本利得纳入率 50%。");
    }, ["cg-inclusion"]);

  W["acb"] = (root) => mount(root,
    field("交易流水（每行：日期 买入/卖出 数量 单价 [手续费]）", "tx", "2024-01-10 买入 100 10 10\n2024-03-10 买入 100 12 10\n2024-06-01 卖出 50 15 10", "area", 8, "同一只证券；买卖按日期排序，成本用加权平均。别漏了所有账户与再投资的股息买入。"),
    (o) => {
      const r = C.acb(C.parseTx(o.tx));
      const rows = r.rows.map((x) => x.type === "buy"
        ? `<tr><td>${x.date}</td><td>买入</td><td class="tc-n">${x.qty}</td><td class="tc-n">${money(x.acb)}</td><td class="tc-n">${money(x.avg)}</td><td></td></tr>`
        : `<tr><td>${x.date}</td><td>卖出</td><td class="tc-n">${x.qty}</td><td class="tc-n">${money(x.remainAcb)}</td><td class="tc-n">${x.remainQty ? money(x.remainAcb / x.remainQty) : "—"}</td><td>${money(x.gain)}${x.warn ? `<br><span class="tc-warn">${x.warn}</span>` : ""}</td></tr>`).join("");
      return kpi([["持有数量", String(r.qty)], ["剩余总成本 ACB", money(r.acb)], ["已卖出的累计盈亏", money(r.totalGain)]]) +
        `<div class="tc-scroll"><table class="tc-table"><thead><tr><th>日期</th><th>动作</th><th>数量</th><th>总成本</th><th>每股均价</th><th>盈亏</th></tr></thead><tbody>${rows}</tbody></table></div>` +
        note("T5008 上的成本栏可能为空或不完整，要用你自己的完整流水重建。外币要换成加元（交易当日汇率）；表面亏损的 30 天规则这里只做提醒，不自动调整。");
    }, ["cg-inclusion"]);

  W["rental-cca"] = (root) => mount(root,
    field("出租房建筑物的原始成本", "cost", 400000) + field("历年累计已申报的折旧（CCA）", "claimedCca", 60000) +
    field("卖出价（建筑物部分）", "proceeds", 500000) + field("卖出费用（中介费等）", "outlays", 20000) +
    field("该折旧类别里是最后一项资产吗", "lastInClass", false, "check") + field("卖出当年其他应税收入（估税用）", "otherIncome", 80000),
    (o) => {
      const r = C.rentalSale(o);
      return kpi([["未折旧资本成本 UCC", money(r.ucc)], ["折旧收回（算普通收入）", money(r.recapture), "100% 计入"], ["资本利得", money(r.gain), `其中应税 ${money(r.taxableGain)}（50%）`], ["终结损失", money(r.terminalLoss)], ["合计加进收入", money(r.incomeAdd)], ["估算多交的税", r.tax == null ? "—" : money(r.tax)]]) +
        note("多报折旧当年省了税，卖出时按「折旧收回」补回；它与资本利得是两种收入，不能合并成一种。土地不能折旧，要把卖价分摊成建筑物与土地两块再算。");
    }, ["cg-inclusion"]);

  const payRows = (n) => Array.from({ length: n }, (_, i) =>
    field(`雇主 ${i + 1} 年收入（T4 框 14）`, "i" + i, i < 2 ? 60000 : 0) + field("已扣所得税（框 22）", "t" + i, i < 2 ? 12000 : 0) + field("已扣 CPP（框 16）", "p" + i, i < 2 ? 3361.75 : 0) + field("已扣 CPP2（框 16A）", "q" + i, 0) + field("已扣 EI（框 18）", "e" + i, i < 2 ? 978 : 0)).join("");
  const readRows = (o, n) => Array.from({ length: n }, (_, i) => ({ income: NS(o["i" + i]), tax: NS(o["t" + i]), cpp: NS(o["p" + i]), cpp2: NS(o["q" + i]), ei: NS(o["e" + i]) })).filter((r) => r.income || r.cpp || r.ei || r.tax);

  W["t4"] = (root) => mount(root, payRows(3),
    (o) => {
      const s = C.t4Settle(readRows(o, 3));
      return kpi([["全年总收入", money(s.income)], ["增强 CPP 扣除", money(s.enhancedDeduction)], ["应税收入", money(s.taxable)], ["年度所得税", money(s.tax), `联邦 ${money(s.fed)}＋BC ${money(s.prov)}`], ["已预扣", money(s.withheld)], [s.balance >= 0 ? "所得税结算：补" : "所得税结算：退", money(Math.abs(s.balance))]]) +
        kpi([["CPP/EI 超缴将退回", money(s.payroll.refund), "与所得税结算分开，报税时在各自行退"]]) +
        note("换工作后新公司从头扣 CPP/EI、各扣各的所得税，合并后税额可能高于预扣总和。这里只含基本个人额、雇佣额、CPP/EI 抵免与增强 CPP 扣除。");
    }, ["cpp-employee-max", "ei-employee-max", "employment-amount", "bpa-max", "bc-bpa-max"]);

  W["cpp-overpay"] = (root) => mount(root, payRows(3),
    (o) => {
      const p = C.payrollOverpay(readRows(o, 3));
      return kpi([["CPP 合计 / 上限", money(p.cpp), `上限 ${money(p.caps.cpp)}`], ["超缴 CPP", money(p.over.cpp)], ["CPP2 合计 / 上限", money(p.cpp2), `上限 ${money(p.caps.cpp2)}`], ["超缴 CPP2", money(p.over.cpp2)], ["EI 合计 / 上限", money(p.ei), `上限 ${money(p.caps.ei)}`], ["超缴 EI", money(p.over.ei)], ["合计可在报税时拿回", money(p.refund)]]) +
        `<p class="tc-note">按每份收入核对「应扣」：${p.expected.map((e, i) => `雇主 ${i + 1}：CPP ${money(e.cpp)}、CPP2 ${money(e.cpp2)}、EI ${money(e.ei)}`).join("；")}。</p>` +
        note("每个雇主各自按全额上限扣，不知道你别处已扣多少，所以全年超缴由报税时一次退回，不用等雇主。");
    }, ["cpp-employee-max", "cpp-ympe", "cpp-exemption", "cpp-rate", "cpp2-yampe", "cpp2-rate", "cpp2-employee-max", "ei-mie", "ei-rate", "ei-employee-max"]);

  W["ccb"] = (root) => mount(root,
    field("家庭调整后净收入 AFNI（夫妻合计，不含 UCCB 等）", "afni", 60000) +
    [1, 2, 3, 4].map((i) => field(`孩子 ${i} 年龄（留空=没有）`, "a" + i, i === 1 ? 3 : i === 2 ? 4 : "", "number", 'min="0" max="17"')).join(""),
    (o) => {
      const ages = [1, 2, 3, 4].map((i) => o["a" + i]).filter((a, idx) => String(root.querySelector(`[name=a${idx + 1}]`).value).trim() !== "");
      const v = C.ccb(o.afni, ages);
      return kpi([["全年 CCB", money(v), "2026-07 至 2027-06 福利期（按 2025 年收入）"], ["每月约", money(v / 12)], ["孩子人数", String(ages.length)]]) +
        note("没有改变收入也会变：福利期按「上一年」的家庭收入，夫妻任一方的收入变化、RRSP 抵扣、分居、孩子年龄跨 6 岁都会改变结果。计算按 CRA 官方算例方式对「超出部分×比率」按分截断。不含儿童残障福利与 BC 省福利。");
    }, ["ccb-base-under6", "ccb-base-6to17", "ccb-phaseout-first", "ccb-phaseout-second", "ccb-rate-first-1", "ccb-rate-second-1"]);

  W["resp"] = (root) => mount(root,
    field("今年准备给这个孩子存入 RESP（加元）", "contrib", 2500) + field("以前年度累计未领的补助额度（不超过 CESG 年度基数的累积）", "unusedRoom", 0, "number", "", "例如以前有一年没存，就多出 500") +
    field("该孩子至今已领 CESG 合计", "received", 0) + field("家庭调整后净收入 AFNI", "afni", 90000),
    (o) => {
      const r = C.cesgYear(o);
      const tierName = { low: "低收入档", mid: "中档", high: "高收入档（无附加补助）" }[r.tier];
      return kpi([["基础补助（20%）", money(r.basic)], ["附加补助", money(r.extra), tierName], ["今年补助合计", money(r.total)], ["拿满基础补助要存", money(r.contribForMaxBasic), "含结转，单年补助上限"]]) +
        note("基础补助看供款额与结转，附加补助只看你的家庭收入档，二者独立计算；终身补助总额有上限，这里已扣除你已领的部分。教育补助的更多规则见 RESP 专课。");
    }, ["cesg-basic-rate", "cesg-lifetime", "cesg-basic-contribution", "cesg-additional-contribution", "cesg-income-low", "cesg-income-high", "acesg-rate-low", "acesg-rate-mid", "cesg-annual-max-carry"]);

  W["tfsa-room"] = (root) => mount(root,
    field("从哪一年起有资格存 TFSA（满 18 岁且是税务居民的第一个日历年，最早 2009）", "firstYear", 2020, "number", 'min="2009" max="2026" step="1"') +
    field("历年存入（格式 年份:金额，逗号隔开）", "contrib", "2020:6000", "text") +
    field("历年取出（格式 年份:金额，逗号隔开；所有银行合计）", "wd", "2024:10000", "text"),
    (o) => {
      const parse = (s) => { const h = {}; String(s || "").split(/[,，;\s]+/).forEach((p) => { const m = p.match(/^(\d{4})[:：=](\d+(?:\.\d+)?)$/); if (m) h[+m[1]] = (h[+m[1]] || 0) + +m[2]; }); return h; };
      const r = C.tfsaRoom({ firstYear: o.firstYear, contributions: parse(o.contrib), withdrawals: parse(o.wd) });
      const rows = r.rows.map((x) => `<tr><td>${x.year}</td><td class="tc-n">${money0(x.added)}</td><td class="tc-n">${x.back ? money0(x.back) : "—"}</td><td class="tc-n">${money0(x.roomStart)}</td><td class="tc-n">${x.contrib ? money0(x.contrib) : "—"}</td></tr>`).join("");
      return kpi([["今年初的可用额度", money(r.roomStartThisYear)], ["现在还能存", money(r.available)], ["超额（需处理）", money(r.excess)], ["超额每月税（约）", money(r.monthlyTax), "按每月最高超额 1%"]]) +
        (r.sameYearWd ? `<p class="tc-warn">你今年取出的 ${money(r.sameYearWd)} 要到明年 1 月 1 日才加回额度，今年再存回去会算新的供款、可能超额。</p>` : "") +
        `<div class="tc-scroll"><table class="tc-table"><thead><tr><th>年份</th><th>当年新增</th><th>去年取出加回</th><th>年初可用</th><th>存入</th></tr></thead><tbody>${rows}</tbody></table></div>` +
        note("额度按「所有银行账户合计」算，不是单家余额；以 CRA My Account 上的 TFSA 额度为准，这里用来演算与核对。从别家取出再存入另一家同年内不会恢复额度。");
    }, ["tfsa-limit", "tfsa-excess-rate"]);

  W["t1135"] = (root) => mount(root,
    field("在任何时点，你持有的「指定境外财产」合计成本（折成加元，按成本不是市值）", "cost", 120000, "number", "", "含境外银行账户、境外股票、境外出租房等；自用房、自用车、境外退休账户中符合豁免的部分不算") ,
    (o) => {
      const r = C.t1135({ cost: o.cost });
      return kpi([["合计成本", money(r.cost)], ["要报 T1135 吗", r.required ? "要" : "不用", `门槛：成本超过 ${money0(r.threshold)}`], ["报哪种格式", !r.required ? "—" : r.detailed ? "详细申报" : "可用简化申报", `成本 ${money0(r.detailedThreshold)} 以上用详细`]]) +
        note("「国内资产没卖、收益已报」不构成豁免：看的是持有的合计成本。入籍或成为税务居民当年的豁免、豁免财产的范围等需人工核对 CRA 说明。");
    }, ["t1135-cost-threshold", "t1135-detailed-threshold"]);

  W["rrsp-benefits"] = (root) => mount(root,
    field("本人净收入", "income", 80000) + field("配偶净收入", "spouse", 60000) + field("今年 RRSP 抵扣额", "deduct", 5000) +
    [1, 2, 3, 4].map((i) => field(`孩子 ${i} 年龄（留空=没有）`, "a" + i, i === 1 ? 3 : i === 2 ? 5 : "", "number", 'min="0" max="17"')).join(""),
    (o) => {
      const ages = [1, 2, 3, 4].map((i) => o["a" + i]).filter((a, idx) => String(root.querySelector(`[name=a${idx + 1}]`).value).trim() !== "");
      const r = C.rrspBenefits({ income: o.income, spouse: o.spouse, deduct: o.deduct, ages });
      return kpi([["所得税节省", money(r.taxSave), "联邦＋BC，抵扣者本人"], ["CCB 变化", (r.ccbChange >= 0 ? "+" : "") + money(r.ccbChange), `${money(r.ccb0)} → ${money(r.ccb1)}`], ["合计效果", money(r.total)]]) +
        note("RRSP 抵扣降低家庭净收入，所以不只省所得税，还会让按收入递减的 CCB 增加。这里不含 BC 家庭福利、杂货福利与教育补助的联动。");
    }, ["ccb-phaseout-first", "ccb-phaseout-second"]);

  function init() {
    document.querySelectorAll("[data-tax-widget]").forEach((el) => {
      if (el.dataset.mounted) return; el.dataset.mounted = "1";
      const f = W[el.dataset.taxWidget];
      if (f) f(el); else el.innerHTML = '<p class="tc-err">未知的计算器</p>';
      el.classList.add("tc");
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
