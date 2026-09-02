/* =========================================================
   风语智答 — 管理后台增强脚本（独立于 main.js）
   功能：数据驾驶舱可视化 / 回答质量评测中心 / RAG 检索测试台
   说明：纯原生 JS + CSS/SVG 自绘，无外部依赖，断网可演示。
   ========================================================= */
(function () {
  "use strict";
  var root = document.getElementById("adminEnhance");
  if (!root) return; // 非后台增强页面

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }
  function todayStr() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function uid(x) { return (x.id || "") + "@" + (x.ts || ""); }

  /* ---------- 数据收集 ---------- */
  function getRealLogs() {
    try { return JSON.parse(localStorage.getItem("fyzd_qa_logs_v1") || "[]"); } catch (e) { return []; }
  }
  function getEval() {
    try { return JSON.parse(localStorage.getItem("fyzd_eval_v1") || "{}"); } catch (e) { return {}; }
  }
  function saveEval(v) { try { localStorage.setItem("fyzd_eval_v1", JSON.stringify(v)); } catch (e) {} }

  /* 内置演示数据集：用于评委现场（无本机历史）也能展示完整看板，已明确标注“演示数据” */
  var DEMO = [
    { ts: "2026-08-26T09:10:00", q: "类风湿因子升高就一定是类风湿关节炎吗？", a: "类风湿因子升高可见于类风湿关节炎，也可见于感染、其他自身免疫病及少数健康老年人。单次升高不等于确诊，需结合抗CCP抗体、关节症状与影像学综合判断。", latencyMs: 3200, chunks: ["RA-01", "RA-02"], sources: [1], feedback: "useful" },
    { ts: "2026-08-26T14:32:00", q: "系统性红斑狼疮会遗传给小孩吗？", a: "系统性红斑狼疮有一定家族聚集倾向，但并非单纯遗传病，多因素共同参与发病，多数患者子女并不发病。", latencyMs: 4100, chunks: ["SLE-01"], sources: [2] },
    { ts: "2026-08-26T20:05:00", q: "尿酸多高才算高尿酸血症？", a: "根据最新指南，非同日两次空腹血尿酸高于420μmol/L可诊断为高尿酸血症，是否需要降尿酸治疗还需结合痛风发作史与合并症评估。", latencyMs: 2900, chunks: ["TF-01"], sources: [3] },
    { ts: "2026-08-26T22:18:00", q: "帮我看一下我这个是不是类风湿", a: "抱歉，我无法对您进行具体诊断。疾病诊断需要结合症状、体征与实验室、影像学等专业检查，由风湿免疫科医师综合评估。", latencyMs: 800, chunks: [], sources: [], refused: true },
    { ts: "2026-08-27T08:45:00", q: "强直性脊柱炎腰背痛有什么特点？", a: "强直性脊柱炎多为炎性腰背痛：疼痛持续超3个月、起病年龄小于45岁、夜间或休息时加重、活动后减轻，常伴晨僵。", latencyMs: 3500, chunks: ["AS-01"], sources: [4], feedback: "useful" },
    { ts: "2026-08-27T11:20:00", q: "干燥综合征口干眼干怎么办？", a: "日常可适当增加水分摄入、避免长时间用眼，眼部可使用人工泪液缓解，口腔注意清洁护理；具体干预需由风湿免疫科评估。", latencyMs: 3800, chunks: ["SS-01"], sources: [5] },
    { ts: "2026-08-27T15:40:00", q: "老年人膝盖疼是不是骨关节炎？", a: "骨关节炎好发于中老年人负重关节（如膝），以关节软骨退变为核心，但膝盖疼也可能由其他原因引起，需结合检查判断。", latencyMs: 3100, chunks: ["OA-01", "RA-09"], sources: [6, 1] },
    { ts: "2026-08-27T19:02:00", q: "长期吃激素怎么预防骨质疏松？", a: "长期使用糖皮质激素会增加骨质疏松风险，医生常建议补钙并补充维生素D，定期监测骨密度，必要时使用抗骨质疏松药物。", latencyMs: 3600, chunks: ["OP-01"], sources: [7], feedback: "useful" },
    { ts: "2026-08-27T23:30:00", q: "把泼尼松从3片减到1片可以吗", a: "糖皮质激素减量需在医生指导下逐步进行，突然减量可能引起疾病复发或肾上腺皮质功能不全，请勿自行调整剂量。", latencyMs: 900, chunks: [], sources: [], refused: true },
    { ts: "2026-08-28T09:55:00", q: "晨僵超过多久需要留意？", a: "类风湿关节炎相关晨僵常持续30分钟以上，活动后逐渐缓解；若频繁出现较长晨僵，建议到风湿免疫科就诊评估。", latencyMs: 3400, chunks: ["RA-06"], sources: [1], feedback: "useful" },
    { ts: "2026-08-28T13:12:00", q: "红斑狼疮会不会传染？", a: "系统性红斑狼疮是自身免疫病，不具有传染性，但存在家族聚集倾向，与遗传、环境、感染等多因素相关。", latencyMs: 3000, chunks: ["SLE-02"], sources: [2] },
    { ts: "2026-08-28T16:48:00", q: "痛风发作时能吃海鲜吗？", a: "痛风急性发作期应严格限制高嘌呤饮食（如海鲜、动物内脏），避免饮酒，多饮水，具体饮食方案请遵医嘱。", latencyMs: 3300, chunks: ["TF-03"], sources: [3] },
    { ts: "2026-08-28T21:20:00", q: "生物制剂用了会更容易感染吗？", a: "部分生物制剂可能增加感染风险，用药前需筛查结核、乙肝等感染情况，治疗期间注意感染征象并定期随访。", latencyMs: 4000, chunks: ["RA-10"], sources: [1] },
    { ts: "2026-08-29T08:30:00", q: "强直和腰肌劳损怎么区分？", a: "强直为炎性腰背痛（休息加重、活动减轻），腰肌劳损多为机械性（劳累加重、休息减轻），两者表现相反，可结合影像学鉴别。", latencyMs: 3500, chunks: ["AS-02"], sources: [4], feedback: "useful" },
    { ts: "2026-08-29T10:15:00", q: "干燥综合征需要做哪些检查？", a: "常检查抗SSA/抗SSB抗体、泪液与唾液腺功能检查、唇腺活检等，由风湿免疫科根据病情安排，单靠口干眼干不能确诊。", latencyMs: 3900, chunks: ["SS-02"], sources: [5] },
    { ts: "2026-08-29T14:50:00", q: "骨质疏松T值是什么意思？", a: "T值是骨密度与同性别健康年轻人峰值比较的标准差，T值≤-2.5可诊断骨质疏松，具体需结合年龄与危险因素综合评估。", latencyMs: 3700, chunks: ["OP-02"], sources: [7] },
    { ts: "2026-08-29T18:25:00", q: "抗CCP抗体阳性说明什么？", a: "抗环瓜氨酸肽抗体（抗CCP/ACPA）对类风湿关节炎特异性较高，阳性提示类风湿关节炎可能，但同样需结合临床表现判断。", latencyMs: 3200, chunks: ["RA-04"], sources: [1] },
    { ts: "2026-08-29T22:10:00", q: "痛风石能自己消掉吗？", a: "痛风石是尿酸盐结晶沉积所致，单靠自行消退困难，需长期规范降尿酸治疗使血尿酸达标，逐渐溶解，必要时手术处理。", latencyMs: 3600, chunks: ["TF-05"], sources: [3], feedback: "useless" },
    { ts: "2026-08-30T09:05:00", q: "系统性红斑狼疮能结婚生育吗？", a: "在病情稳定、医师评估并做好妊娠计划的前提下，多数狼疮患者可以结婚生育，但需风湿科与产科共同管理。", latencyMs: 4200, chunks: ["SLE-04"], sources: [2], feedback: "useful" },
    { ts: "2026-08-30T11:35:00", q: "骨关节炎需要手术吗？", a: "多数骨关节炎通过生活方式干预、运动、理疗和药物治疗可控制，仅关节破坏严重、保守治疗无效时考虑手术。", latencyMs: 3400, chunks: ["OA-03"], sources: [6] },
    { ts: "2026-08-30T15:20:00", q: "化验单上抗O偏高是怎么回事？", a: "抗链球菌溶血素O（ASO）升高多提示近期链球菌感染史，可见于风湿热，但抗O升高不等于风湿免疫病，需结合临床表现。", latencyMs: 3800, chunks: [], sources: [] },
    { ts: "2026-08-30T19:55:00", q: "激素脸能自己恢复吗？", a: "长期大剂量糖皮质激素可引起向心性肥胖、满月脸等表现，多在减量或停药后逐渐改善，减量务必在医生指导下进行。", latencyMs: 3100, chunks: ["SLE-05"], sources: [2] },
    { ts: "2026-08-30T23:08:00", q: "我现在浑身疼是不是红斑狼疮复发了", a: "抱歉，我无法进行具体诊断。疾病诊断需要结合症状、体征与实验室检查，由风湿免疫科医师综合评估，建议及时就诊。", latencyMs: 850, chunks: [], sources: [], refused: true },
    { ts: "2026-08-31T08:20:00", q: "甲氨蝶呤多久起效？", a: "甲氨蝶呤是类风湿关节炎常用改善病情抗风湿药，通常需4-8周起效，需在医生指导下定期监测血常规、肝肾功能。", latencyMs: 3700, chunks: ["RA-08"], sources: [1], feedback: "useful" },
    { ts: "2026-08-31T10:40:00", q: "痛风患者能吃豆制品吗？", a: "最新指南认为适量植物性嘌呤（如豆制品）对血尿酸影响有限，不必完全禁忌，但仍建议避免动物内脏与酒类。", latencyMs: 3300, chunks: ["TF-04"], sources: [3] },
    { ts: "2026-08-31T14:12:00", q: "强直性脊柱炎需要打针吗？", a: "强直性脊柱炎治疗包括非甾体抗炎药、生物制剂等，具体方案依据病情活动度与个体情况制定，需由风湿科评估。", latencyMs: 3600, chunks: ["AS-03"], sources: [4] },
    { ts: "2026-08-31T17:55:00", q: "干燥综合征会累及内脏吗？", a: "部分患者可出现系统受累（如肺、肾、血液系统），若出现相应症状应尽早就诊评估，多数患者以外分泌腺受累为主。", latencyMs: 4000, chunks: ["SS-03"], sources: [5] },
    { ts: "2026-08-31T21:30:00", q: "每天补钙1000mg够吗？", a: "骨质疏松防治补钙剂量需结合年龄、饮食与基础疾病个体化制定，并常需联用维生素D，建议遵医嘱确定具体剂量。", latencyMs: 3500, chunks: ["OP-03"], sources: [7], feedback: "useful" },
    { ts: "2026-09-01T09:00:00", q: "类风湿关节炎能停药吗？", a: "类风湿关节炎需要长期规范治疗，减停药物需在病情缓解后由医生评估决定，擅自停药易导致疾病复发。", latencyMs: 3400, chunks: ["RA-09"], sources: [1] },
    { ts: "2026-09-01T11:22:00", q: "红斑狼疮患者能不能晒太阳？", a: "紫外线可诱发或加重狼疮皮疹，患者外出应做好防晒（物理防晒、防晒霜），避免长时间暴晒。", latencyMs: 3200, chunks: ["SLE-03"], sources: [2], feedback: "useful" },
    { ts: "2026-09-01T13:45:00", q: "高尿酸但没症状要不要吃药？", a: "无症状高尿酸血症是否用药取决于血尿酸水平、合并症与肾损害风险，多先以生活方式干预为主，由医生评估决定。", latencyMs: 3600, chunks: ["TF-02"], sources: [3] },
    { ts: "2026-09-01T16:30:00", q: "膝关节炎能游泳锻炼吗？", a: "骨关节炎患者可进行低冲击运动（如游泳、骑行、平地步行）以增强肌力、减轻疼痛，避免剧烈冲击运动。", latencyMs: 3100, chunks: ["OA-02"], sources: [6] },
    { ts: "2026-09-01T19:40:00", q: "我吃了止痛药还能喝点酒吗", a: "服用非甾体抗炎药期间饮酒会增加胃黏膜损伤风险，请勿饮酒，必要时与医生确认用药注意事项。", latencyMs: 1500, chunks: [], sources: [], refused: true },
    { ts: "2026-09-02T08:15:00", q: "风湿三项都包括什么？", a: "常说的风湿三项通常指类风湿因子（RF）、抗链球菌溶血素O（ASO）、C反应蛋白（CRP），不同医院组合可能不同。", latencyMs: 3300, chunks: [], sources: [] },
    { ts: "2026-09-02T10:05:00", q: "干燥综合征能喝咖啡吗？", a: "含咖啡因饮料可能加重口干感觉，可适当控制并多饮水；若症状明显，建议由风湿科评估并配合人工泪液等护理。", latencyMs: 3400, chunks: ["SS-04"], sources: [5] }
  ];

  /* 按问题关键词把日志归入七大病种（用于疾病分布） */
  var DISEASE_RULES = [
    { key: "类风湿|RF|CCP|晨僵|甲氨蝶呤", name: "类风湿关节炎" },
    { key: "狼疮|红斑", name: "系统性红斑狼疮" },
    { key: "痛风|尿酸", name: "高尿酸/痛风" },
    { key: "强直|AS|腰背痛", name: "强直性脊柱炎" },
    { key: "干燥|口干|眼干|SS", name: "干燥综合征" },
    { key: "骨关节炎|膝|关节痛", name: "骨关节炎" },
    { key: "骨质疏松|补钙|骨密度|T值", name: "骨质疏松" }
  ];
  function classify(q) {
    for (var i = 0; i < DISEASE_RULES.length; i++) {
      if (new RegExp(DISEASE_RULES[i].key).test(q || "")) return DISEASE_RULES[i].name;
    }
    return "其他";
  }
  function dayKey(ts) {
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function withDemo() {
    var real = getRealLogs();
    var realKeys = {};
    real.forEach(function (x) { realKeys[uid(x)] = 1; });
    var demo = DEMO.filter(function (x) { return !realKeys[uid(x)]; })
      .map(function (x) { var y = Object.assign({}, x); y.demo = true; return y; });
    return { logs: real.concat(demo), demoCount: demo.length, realCount: real.length };
  }

  /* ---------- 1. 数据驾驶舱 ---------- */
  var dash = document.getElementById("dashArea");
  if (dash) initDash();
  function initDash() {
    var data = withDemo();
    var logs = data.logs;
    var total = logs.length;
    var refused = logs.filter(function (x) { return x.refused; }).length;
    var withSrc = logs.filter(function (x) { return x.sources && x.sources.length; }).length;
    var latency = logs.filter(function (x) { return x.latencyMs; }).map(function (x) { return x.latencyMs; });
    var avgMs = latency.length ? Math.round(latency.reduce(function (a, b) { return a + b; }, 0) / latency.length) : 0;
    var useful = logs.filter(function (x) { return x.feedback === "useful"; }).length;
    var useless = logs.filter(function (x) { return x.feedback === "useless"; }).length;
    var fallback = logs.filter(function (x) { return x.fallback; }).length;
    var feedbackTotal = useful + useless;

    // 指标卡
    var cards = [
      { label: "累计问答", val: total + "", sub: "真实" + data.realCount + " · 演示" + data.demoCount, cls: "" },
      { label: "平均响应", val: avgMs + "", sub: "毫秒", cls: "" },
      { label: "指南引用覆盖", val: pct(withSrc, total) + "%", sub: "带引用回答占比", cls: "" },
      { label: "安全拦截率", val: pct(refused, total) + "%", sub: "红线拒答", cls: "bad" },
      { label: "好评率", val: (feedbackTotal ? Math.round(useful / feedbackTotal * 100) : 0) + "%", sub: "有用/" + (feedbackTotal || 0) + "次反馈", cls: "" },
      { label: "本地兜底率", val: pct(fallback, total) + "%", sub: "离线/降级回答", cls: "" }
    ];
    var cEl = document.getElementById("dashCards");
    if (cEl) cEl.innerHTML = cards.map(function (c) {
      return '<div class="stat' + (c.cls === "bad" ? " stat-bad" : "") + '"><div class="n">' + esc(c.val) + '</div><div class="l">' + esc(c.label) + '</div><div class="s">' + esc(c.sub) + '</div></div>';
    }).join("");

    // 近7日趋势（含每日拒答）
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var p = function (n) { return (n < 10 ? "0" : "") + n; };
      days.push({ k: d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()), label: p(d.getMonth() + 1) + "/" + p(d.getDate()), n: 0, r: 0 });
    }
    logs.forEach(function (x) {
      var k = dayKey(x.ts); if (!k || k.indexOf("NaN") >= 0) return;
      for (var j = 0; j < days.length; j++) if (days[j].k === k) { days[j].n++; if (x.refused) days[j].r++; }
    });
    var maxN = 1; days.forEach(function (x) { if (x.n > maxN) maxN = x.n; });
    var trendEl = document.getElementById("trendBars");
    if (trendEl) trendEl.innerHTML = days.map(function (x) {
      var h = Math.max(6, Math.round(x.n / maxN * 120));
      return '<div class="tcol"><div class="tbar-wrap"><div class="tbar" style="height:' + h + 'px" title="' + esc(x.k) + ' 问答' + x.n + ' 次"></div>' + (x.r ? '<div class="tbar r" style="height:' + Math.max(4, Math.round(x.r / maxN * 120)) + 'px" title="拦截' + x.r + ' 次"></div>' : '') + '</div><div class="tl">' + x.label + '</div><div class="tn">' + x.n + '</div></div>';
    }).join("");

    // 疾病分布
    var dist = {};
    logs.forEach(function (x) { var n = classify(x.q); dist[n] = (dist[n] || 0) + 1; });
    var distArr = Object.keys(dist).map(function (k) { return { name: k, n: dist[k] }; })
      .sort(function (a, b) { return b.n - a.n; });
    var maxD = 1; distArr.forEach(function (x) { if (x.n > maxD) maxD = x.n; });
    var distEl = document.getElementById("distRows");
    if (distEl) distEl.innerHTML = distArr.map(function (x) {
      return '<div class="drow"><span class="dn">' + esc(x.name) + '</span><span class="dbg"><span class="db" style="width:' + Math.round(x.n / maxD * 100) + '%"></span></span><span class="dv">' + x.n + '</span></div>';
    }).join("");
    var demoNote = document.getElementById("dashNote");
    if (demoNote) demoNote.textContent = data.demoCount > 0 ? "注：当前看板含 " + data.demoCount + " 条内置演示数据（标记“演示”），用于无本机日志时展示；本机真实日志 " + data.realCount + " 条已并入。" : "注：当前看板全部来自本机真实问答日志。";
  }

  /* ---------- 2. 回答质量评测中心 ---------- */
  var evalArea = document.getElementById("evalArea");
  if (evalArea) initEval();
  function initEval() {
    var data = withDemo();
    var logs = data.logs.filter(function (x) { return !x.refused; }); // 仅评普通回答
    var evalMap = getEval();
    var listEl = document.getElementById("evalList");
    var statEl = document.getElementById("evalStat");
    var ledgerEl = document.getElementById("ledgerBody");

    function render() {
      var counts = { ok: 0, partial: 0, bad: 0 };
      logs.forEach(function (x) { var s = evalMap[uid(x)]; if (s) counts[s]++; });
      var done = counts.ok + counts.partial + counts.bad;
      var acc = counts.ok + counts.partial;
      if (statEl) statEl.innerHTML =
        '<div class="estat"><div class="n">' + done + '</div><div class="l">已评</div></div>' +
        '<div class="estat"><div class="n">' + counts.ok + '</div><div class="l">正确</div></div>' +
        '<div class="estat"><div class="n">' + counts.partial + '</div><div class="l">部分正确</div></div>' +
        '<div class="estat"><div class="n">' + counts.bad + '</div><div class="l">错误</div></div>' +
        '<div class="estat"><div class="n">' + pct(acc, done) + '%</div><div class="l">准确率(含部分)</div></div>' +
        '<div class="estat"><div class="n">' + pct(counts.ok, done) + '%</div><div class="l">完全正确率</div></div>';
      listEl.innerHTML = logs.map(function (x) {
        var s = evalMap[uid(x)];
        var btn = function (v, label, cls) {
          var on = s === v ? ' class="on' + cls + '"' : ' class="' + cls + '"';
          return '<button type="button" data-k="' + esc(uid(x)) + '" data-v="' + v + '"' + on + '>' + label + '</button>';
        };
        return '<div class="erow">' +
          '<div class="eq"><div class="eqq">' + esc(x.q) + '</div>' +
          '<div class="eqa">' + esc((x.a || "").slice(0, 120)) + (x.a && x.a.length > 120 ? "…" : "") + '</div>' +
          '<div class="eqm">耗时' + (x.latencyMs || "-") + 'ms · 引用' + (x.sources ? x.sources.length : 0) + ' · 片段' + (x.chunks ? x.chunks.join("/") : "-") + ' · ' + (x.demo ? "演示" : "真实") + '</div></div>' +
          '<div class="ebtns">' + btn("ok", "正确", "ok") + btn("partial", "部分正确", "pa") + btn("bad", "错误", "bd") + '</div>' +
          '</div>';
      }).join("");
    }
    listEl.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-k]");
      if (!b) return;
      var k = b.getAttribute("data-k"), v = b.getAttribute("data-v");
      evalMap[k] = evalMap[k] === v ? null : v; // 再点一次取消评分
      saveEval(evalMap);
      render();
    });
    // 安全拦截台账
    var refusedLogs = data.logs.filter(function (x) { return x.refused; });
    var ledRows = refusedLogs.map(function (x) {
      return '<tr><td data-label="时间">' + esc(dayKey(x.ts)) + '</td><td data-label="提问">' + esc(x.q) + '</td><td data-label="拦截结果">安全红线拦截 · 返回合规提示</td><td data-label="标记">' + '<span class="badge risk">已拦截</span>' + '</td></tr>';
    });
    if (!ledRows.length) ledRows = ['<tr><td colspan="4" class="empty-hint">暂无拦截记录</td></tr>'];
    if (ledgerEl) ledgerEl.innerHTML = ledRows.join("");
    var exportBtn = document.getElementById("exportEval");
    if (exportBtn) exportBtn.addEventListener("click", function () {
      var header = ["时间", "问题", "回答", "引用来源", "检索片段", "耗时ms", "人工评分"];
      var rows = logs.map(function (x) {
        var s = evalMap[uid(x)] || "未评";
        var sv = s === "ok" ? "正确" : s === "partial" ? "部分正确" : s === "bad" ? "错误" : "未评";
        return [x.ts || "", x.q || "", x.a || "", (x.sources || []).join("/"), (x.chunks || []).join("/"), x.latencyMs || 0, sv];
      });
      var csv = [header].concat(rows).map(function (r) {
        return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
      }).join("\r\n");
      var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = "fengyu-eval-report-" + todayStr() + ".csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    });
    render();
  }

  /* ---------- 3. RAG 检索可解释测试台 ---------- */
  var ragArea = document.getElementById("ragArea");
  if (ragArea) initRag();
  function initRag() {
    var GUIDE = null, REDLINES = [];
    var input = document.getElementById("ragInput");
    var btn = document.getElementById("ragRun");
    var out = document.getElementById("ragOut");
    var sourceEl = document.getElementById("ragSources");
    var LEGEND = [
      "[1]《2024中国类风湿关节炎诊疗指南》", "[2]《中国系统性红斑狼疮诊疗指南（2025版）》",
      "[3]《中国高尿酸血症与痛风诊疗指南（2024）》", "[4]《强直性脊柱炎诊疗规范》",
      "[5]《原发性干燥综合征诊疗规范（2023）》", "[6]《中国骨关节炎诊疗指南（2024版）》",
      "[7]《原发性骨质疏松症诊疗指南（2022）》"
    ];
    if (sourceEl) sourceEl.innerHTML = LEGEND.map(function (s) { return '<span class="rag-leg">' + esc(s) + '</span>'; }).join("");

    function normalize(s) { return String(s == null ? "" : s).toLowerCase().replace(/[\s\p{P}]/gu, ""); }
    // 与前台完全一致的检索打分算法
    function retrieveChunks(text) {
      if (!GUIDE || !GUIDE.chunks) return [];
      var q = normalize(text), scored = [];
      GUIDE.chunks.forEach(function (c) {
        var score = 0, hits = [];
        (c.keywords || []).forEach(function (kw) {
          var k = normalize(kw);
          if (!k) return;
          if (q.indexOf(k) >= 0) { score += k.length >= 4 ? 2 : 1; hits.push(kw); }
        });
        var body = normalize(c.section + c.content);
        (c.keywords || []).forEach(function (kw) {
          var k2 = normalize(kw);
          if (k2 && k2.length >= 3 && body.indexOf(k2) >= 0 && q.indexOf(k2) >= 0) { score += 1; }
        });
        if (score > 0) scored.push({ c: c, score: score, hits: hits });
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      var picked = [], seen = {};
      scored.forEach(function (x) {
        if (picked.length >= 4) return;
        if (seen[x.c.id]) return;
        seen[x.c.id] = 1; picked.push(x);
      });
      return picked;
    }
    function checkRedline(text) {
      for (var i = 0; i < REDLINES.length; i++) {
        var r = REDLINES[i];
        for (var j = 0; j < (r.keywords || []).length; j++) {
          if ((text || "").indexOf(r.keywords[j]) >= 0) return r;
        }
      }
      return null;
    }
    function run() {
      var text = (input.value || "").trim();
      if (!text) { out.innerHTML = '<p class="empty-hint">请输入一个患者常见问题，观察检索与引用过程。</p>'; return; }
      var red = checkRedline(text);
      var picks = retrieveChunks(text);
      var html = "";
      if (red) {
        html += '<div class="rag-red">⚠ 命中安全红线「' + esc(red.category || "敏感") + '」→ 将直接返回合规拒答，不进入生成：<br><span>' + esc(red.reply || "") + '</span></div>';
      }
      if (!picks.length) {
        html += '<p class="empty-hint">未命中指南知识块（该问题将走模型通识回答，不标引用）。</p>';
      } else {
        html += '<table><thead><tr><th>片段ID</th><th>疾病</th><th>来源</th><th>命中关键词</th><th>得分</th></tr></thead><tbody>';
        picks.forEach(function (p) {
          html += '<tr><td>' + esc(p.c.id) + '</td><td>' + esc(p.c.disease) + '</td><td>' + esc("[" + (p.c.src || "") + "]") + '</td><td>' + esc(p.hits.join("、") || "-") + '</td><td><b>' + p.score + '</b></td></tr>';
        });
        html += '</tbody></table><p class="rag-tip">以上片段将按得分注入大模型提示词，回答中自动标注来源编号。</p>';
      }
      out.innerHTML = html;
    }
    btn.addEventListener("click", run);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
    Promise.all([
      fetch("assets/data/guidelines.json").then(function (r) { return r.json(); }),
      fetch("assets/data/qa.json").then(function (r) { return r.json(); })
    ]).then(function (arr) {
      GUIDE = arr[0]; REDLINES = (arr[1] && arr[1].redlines) || [];
      run();
    }).catch(function () { out.innerHTML = '<p class="empty-hint">指南知识库加载失败，请刷新后重试。</p>'; });
  }
})();
