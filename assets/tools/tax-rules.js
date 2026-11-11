/* 自动生成，勿手改：python3 courses/tax-personal/tools/build_rules.py
 * 源：docs/numbers.json（2026 已核）＋ research/calculator-extra-numbers-*.jsonl，共 89 个数，每个带官方 URL */
(function (root) {
  var R = {
"acesg-rate-low": {
"label": "附加 CESG：家庭调整后净收入不超过 58,523，首 500 供款",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 20
},
"acesg-rate-mid": {
"label": "附加 CESG：家庭调整后净收入 58,523 至 117,045，首 500 供款",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 10
},
"bc-bpa-max": {
"label": "BC 最高基本个人额",
"url": "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html",
"value": 13216
},
"bc-bracket-1-rate": {
"label": "British Columbia 第1税阶边际税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 5.6
},
"bc-bracket-1-threshold": {
"label": "British Columbia 第1税阶上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 50363
},
"bc-bracket-2-rate": {
"label": "British Columbia 第2税阶边际税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 7.7
},
"bc-bracket-2-threshold": {
"label": "British Columbia 第2税阶上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 100728
},
"bc-bracket-3-rate": {
"label": "British Columbia 第3税阶边际税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 10.5
},
"bc-bracket-3-threshold": {
"label": "British Columbia 第3税阶上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 115648
},
"bc-bracket-4-rate": {
"label": "British Columbia 第4税阶边际税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 12.29
},
"bc-bracket-4-threshold": {
"label": "British Columbia 第4税阶上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 140430
},
"bc-bracket-5-rate": {
"label": "British Columbia 第5税阶边际税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 14.7
},
"bc-bracket-5-threshold": {
"label": "British Columbia 第5税阶上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 190405
},
"bc-bracket-6-rate": {
"label": "British Columbia 第6税阶边际税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 16.8
},
"bc-bracket-6-threshold": {
"label": "British Columbia 第6税阶上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 265545
},
"bc-bracket-7-rate": {
"label": "British Columbia 第7税阶边际税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 20.5
},
"bc-medical-floor-cap": {
"label": "BC医疗净收入3%比较金额",
"url": "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/basic",
"value": 2748
},
"bc-tax-reduction-max": {
"label": "BC省税减免最高额",
"url": "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/basic",
"value": 690
},
"bc-tax-reduction-rate": {
"label": "BC省税减免递减率",
"url": "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/basic",
"value": 3.56
},
"bc-tax-reduction-start": {
"label": "BC省税减免递减起点",
"url": "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/basic",
"value": 25570
},
"bc-tax-reduction-zero": {
"label": "BC省税减免归零净收入",
"url": "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/basic",
"value": 44952
},
"bpa-max": {
"label": "联邦基本个人额上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 16452
},
"bpa-min": {
"label": "联邦基本个人额下限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 14829
},
"ccb-base-6to17": {
"label": "儿童福利 CCB 基础额（6–17 岁，福利年 7 月起）",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 6883
},
"ccb-base-phaseout-four": {
"label": "CCB 四个以上孩子第二段基础扣减额",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 10260
},
"ccb-base-phaseout-one": {
"label": "CCB 一个孩子第二段基础扣减额",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 3123
},
"ccb-base-phaseout-three": {
"label": "CCB 三个孩子第二段基础扣减额",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 8476
},
"ccb-base-phaseout-two": {
"label": "CCB 两个孩子第二段基础扣减额",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 6022
},
"ccb-base-under6": {
"label": "儿童福利 CCB 基础额（6 岁以下，福利年 7 月起）",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 8157
},
"ccb-phaseout-first": {
"label": "CCB 第一递减门槛",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 38237
},
"ccb-phaseout-second": {
"label": "CCB 第二递减门槛",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 82847
},
"ccb-rate-first-1": {
"label": "CCB 第一递减段扣减率：1 个孩子",
"url": "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
"value": 7
},
"ccb-rate-first-2": {
"label": "CCB 第一递减段扣减率：2 个孩子",
"url": "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
"value": 13.5
},
"ccb-rate-first-3": {
"label": "CCB 第一递减段扣减率：3 个孩子",
"url": "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
"value": 19
},
"ccb-rate-first-4": {
"label": "CCB 第一递减段扣减率：4 个及以上",
"url": "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
"value": 23
},
"ccb-rate-second-1": {
"label": "CCB 第二递减段扣减率：1 个孩子",
"url": "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
"value": 3.2
},
"ccb-rate-second-2": {
"label": "CCB 第二递减段扣减率：2 个孩子",
"url": "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
"value": 5.7
},
"ccb-rate-second-3": {
"label": "CCB 第二递减段扣减率：3 个孩子",
"url": "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
"value": 8
},
"ccb-rate-second-4": {
"label": "CCB 第二递减段扣减率：4 个及以上",
"url": "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
"value": 9.5
},
"cesg-additional-contribution": {
"label": "附加CESG年度匹配供款基数",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 500
},
"cesg-annual-max-carry": {
"label": "CESG 有结转时单年上限",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 1000
},
"cesg-basic-annual": {
"label": "CESG基本年度额上限",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 500
},
"cesg-basic-contribution": {
"label": "基本CESG年度匹配供款基数",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 2500
},
"cesg-basic-rate": {
"label": "基本 CESG 匹配率（首 2,500 供款）",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 20
},
"cesg-income-high": {
"label": "CESG附加补助中档上限",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 117045
},
"cesg-income-low": {
"label": "CESG附加补助低档上限",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 58523
},
"cesg-lifetime": {
"label": "CESG终身上限",
"url": "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
"value": 7200
},
"cg-inclusion": {
"label": "资本利得纳入率",
"url": "https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-38.html",
"value": 50
},
"childcare-dtc-limit": {
"label": "托儿费DTC合格孩子年度上限",
"url": "https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-63.html",
"value": 11000
},
"childcare-earned-income-fraction": {
"label": "托儿费扣除上限之一：申报人当年赚取收入的 2/3",
"url": "https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-63.html",
"value": 0.6666666666666666
},
"childcare-other-limit": {
"label": "托儿费其他合格孩子年度上限",
"url": "https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-63.html",
"value": 5000
},
"childcare-under7-limit": {
"label": "托儿费未满7岁年度上限",
"url": "https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-63.html",
"value": 8000
},
"cpp-base-max": {
"label": "CPP基础段雇员全年上限",
"url": "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html",
"value": 3519.45
},
"cpp-base-rate": {
"label": "CPP基础段雇员费率",
"url": "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html",
"value": 4.95
},
"cpp-employee-max": {
"label": "CPP 基础段雇员年度供款上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html",
"value": 4230.45
},
"cpp-exemption": {
"label": "CPP年度基本豁免",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html",
"value": 3500
},
"cpp-first-enhancement-rate": {
"label": "CPP第一增强段雇员费率",
"url": "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html",
"value": 1
},
"cpp-rate": {
"label": "CPP 基础段雇员供款率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html",
"value": 5.95
},
"cpp-ympe": {
"label": "CPP 年度最高可供款收入 YMPE",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html",
"value": 74600
},
"cpp2-employee-max": {
"label": "CPP2 雇员年度供款上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/making-deductions/second-additional-cpp-contribution-rates-maximums.html",
"value": 416
},
"cpp2-rate": {
"label": "CPP2雇员与雇主各自费率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/making-deductions/second-additional-cpp-contribution-rates-maximums.html",
"value": 4
},
"cpp2-yampe": {
"label": "CPP2 第二层上限 YAMPE",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/making-deductions/second-additional-cpp-contribution-rates-maximums.html",
"value": 85000
},
"ei-employee-max": {
"label": "EI 雇员年度保费上限（魁省外）",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html",
"value": 1123.07
},
"ei-mie": {
"label": "EI 最高可保收入 MIE",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html",
"value": 68900
},
"ei-rate": {
"label": "EI 雇员费率（魁省外）",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html",
"value": 1.63
},
"employment-amount": {
"label": "Canada employment amount 上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 1501
},
"federal-first-threshold": {
"label": "联邦第二档起点",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 58523
},
"federal-lowest-rate": {
"label": "联邦最低个人税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 14
},
"federal-rate-2": {
"label": "联邦第2税阶税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 20.5
},
"federal-rate-3": {
"label": "联邦第3税阶税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 26
},
"federal-rate-4": {
"label": "联邦第4税阶税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 29
},
"federal-rate-5": {
"label": "联邦第5税阶税率",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 33
},
"federal-second-threshold": {
"label": "联邦第三档（26%）起点",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 117045
},
"federal-third-threshold": {
"label": "联邦第四档（29%）起点",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 181440
},
"federal-top-threshold": {
"label": "联邦最高档（33%）起点",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
"value": 258482
},
"hbp-max": {
"label": "HBP合格提取上限",
"url": "https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-146.01.html",
"value": 60000
},
"medical-threshold": {
"label": "医疗费用抵免净收入3%比较用金额上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html",
"value": 2890
},
"rrsp-earned-percent": {
"label": "RRSP上年赚取收入比例",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/contributing-a-rrsp-prpp/contributions-affect-your-rrsp-prpp-deduction-limit.html",
"value": 18
},
"rrsp-excess-cushion": {
"label": "RRSP成年人不可扣除免罚缓冲",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/contributing-a-rrsp-prpp/what-happens-you-over-your-rrsp-prpp-deduction-limit.html",
"value": 2000
},
"rrsp-limit": {
"label": "RRSP 年度供款上限",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html",
"value": 33810
},
"rrsp-withhold-rate-1": {
"label": "RRSP 居民提款预扣率：不超过 5,000（魁省外）",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/making-withdrawals/tax-rates-on-withdrawals.html",
"value": 10
},
"rrsp-withhold-rate-2": {
"label": "RRSP 居民提款预扣率：超过 5,000 至 15,000（魁省外）",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/making-withdrawals/tax-rates-on-withdrawals.html",
"value": 20
},
"rrsp-withhold-rate-3": {
"label": "RRSP 居民提款预扣率：超过 15,000（魁省外）",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/making-withdrawals/tax-rates-on-withdrawals.html",
"value": 30
},
"rrsp-withholding-first-cap": {
"label": "RRSP居民提款第一预扣档上界",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/making-withdrawals/tax-rates-on-withdrawals.html",
"value": 5000
},
"rrsp-withholding-second-cap": {
"label": "RRSP居民提款第二预扣档上界",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/making-withdrawals/tax-rates-on-withdrawals.html",
"value": 15000
},
"t1135-cost-threshold": {
"label": "T1135指定境外财产合计成本额门槛",
"url": "https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-233.3.html",
"value": 100000
},
"t1135-detailed-threshold": {
"label": "T1135详细申报成本额分界",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/information-been-moved/foreign-reporting/form-t1135-reporting-2015-later-tax-years.html",
"value": 250000
},
"tfsa-excess-rate": {
"label": "TFSA 超额部分每月税率（按当月最高超额）",
"url": "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4466/tax-free-savings-account-tfsa-guide-individuals.html",
"value": 1
},
"tfsa-limit": {
"history": {
"2009": 5000,
"2010": 5000,
"2011": 5000,
"2012": 5000,
"2013": 5500,
"2014": 5500,
"2015": 10000,
"2016": 5500,
"2017": 5500,
"2018": 5500,
"2019": 6000,
"2020": 6000,
"2021": 6000,
"2022": 6000,
"2023": 6500,
"2024": 7000,
"2025": 7000,
"2026": 7000
},
"label": "TFSA 年度供款额度",
"url": "https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html",
"value": 7000
}
};
  if (typeof module === 'object' && module.exports) module.exports = R; else root.TAX_RULES = R;
})(typeof self !== 'undefined' ? self : this);
