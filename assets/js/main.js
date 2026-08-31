/* =========================================================
   风语智答 — 共享交互脚本（原生 JS，无依赖）
   功能：移动端导航、当前页高亮、弹窗开关、化验单状态切换、
        免疫机制热区、CSV 导出 Toast、拒答跳转
   ========================================================= */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  /* ---------- 1. 移动端导航菜单 ---------- */
  function initNav() {
    var toggle = document.querySelector(".nav-toggle");
    var menu = document.querySelector(".nav-menu");
    if (!toggle || !menu) return;

    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // 点击菜单项后收起（移动端）
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- 2. 当前页导航高亮 ---------- */
  function initActiveNav() {
    var path = location.pathname.split("/").pop() || "index.html";
    if (path === "" ) path = "index.html";
    document.querySelectorAll(".nav-menu a").forEach(function (a) {
      var href = a.getAttribute("href");
      if (href === path || (path === "index.html" && href === "index.html")) {
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      }
    });
  }

  /* ---------- 3. 弹窗 ---------- */
  function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var closeBtn = m.querySelector(".modal-close");
    if (closeBtn) closeBtn.focus();
  }
  function closeModal(m) {
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  function initModals() {
    // 打开：事件委托，覆盖静态与动态生成的 data-modal 触发器
    document.addEventListener("click", function (e) {
      var trigger = e.target.closest("[data-modal]");
      if (trigger) {
        e.preventDefault();
        openModal(trigger.getAttribute("data-modal"));
      }
    });
    // 关闭：按钮 / 背景 / ESC
    document.querySelectorAll(".modal").forEach(function (m) {
      m.addEventListener("click", function (e) {
        if (e.target === m || e.target.closest(".modal-close")) closeModal(m);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal.open").forEach(closeModal);
      }
    });
  }

  /* ---------- 4. 化验单上传 + AI 解读（页 2） ---------- */
  function initLabReader() {
    var btn = document.getElementById("uploadBtn");
    var fileInput = document.getElementById("labFile");
    var card = document.getElementById("uploadCard");
    var state1 = document.getElementById("uploadState");
    var state2 = document.getElementById("reportState");
    var statusEl = document.getElementById("labStatus");
    var preview = document.getElementById("labPreview");
    var placeholder = document.getElementById("labFigurePlaceholder");
    var metricsEl = document.getElementById("labMetrics");
    var summaryEl = document.getElementById("labSummary");
    var disclaimerEl = document.getElementById("labDisclaimer");
    var titleEl = document.getElementById("labResultTitle");
    var criticalBanner = document.getElementById("criticalBanner");
    var criticalText = document.getElementById("criticalText");
    var sampleBtn = document.getElementById("sampleBtn");
    if (!btn || !fileInput || !state1 || !state2) return;

    var cfg = window.DOUBAO_CONFIG || {};
    var busy = false;
    var INDICATORS = [];

    // 加载风湿免疫指标科普映射库（指标名归一化 + 审核过的通俗解读）
    fetch("assets/data/lab-indicators.json")
      .then(function (r) { return r.json(); })
      .then(function (d) { INDICATORS = d.indicators || []; })
      .catch(function () { INDICATORS = []; });

    // 指标名归一化：把模型识别出的名称匹配到字典条目
    function matchIndicator(name) {
      if (!name || !INDICATORS.length) return null;
      var norm = function (s) { return String(s || "").toLowerCase().replace(/[\s\(\)（）\-\/\\,，。.%:：]/gu, ""); };
      var target = norm(name);
      if (!target) return null;
      var best = null, bestLen = 0;
      INDICATORS.forEach(function (ind) {
        (ind.keys || []).forEach(function (k) {
          var nk = norm(k);
          if (!nk) return;
          if ((target.indexOf(nk) >= 0 || nk.indexOf(target) >= 0) && nk.length > bestLen) {
            best = ind; bestLen = nk.length;
          }
        });
      });
      return best;
    }

    // 危急值/高度异常判定：结合重点指标与数值阈值
    var CRITICAL_KEYS = ["血小板", "PLT", "白细胞", "WBC", "血红蛋白", "HGB", "肌酐", "尿蛋白", "ANCA", "抗dsDNA", "抗双链DNA", "抗中性粒细胞"];
    function numOf(v) {
      var m = String(v || "").match(/-?\d+(\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    }
    function isCritical(m, ind) {
      if (m.status === "normal" || m.status === "unknown") return false;
      var name = m.name || "";
      var n = numOf(m.value);
      // 数值型危急阈值
      if (/血小板|PLT/i.test(name) && n !== null && n < 50) return true;
      if (/白细胞|WBC/i.test(name) && n !== null && (n < 3 || n > 20)) return true;
      if (/血红蛋白|HGB/i.test(name) && n !== null && n < 70) return true;
      if (/肌酐|Cr/i.test(name) && n !== null && n > 177) return true;
      // 重点免疫指标显著异常
      var hitKey = CRITICAL_KEYS.some(function (k) { return name.indexOf(k) >= 0; });
      return hitKey;
    }

    function extractJSON(text) {
      if (!text) return null;
      try { return JSON.parse(text); } catch (e) {}
      var m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
      var start = text.indexOf("{");
      var end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
      }
      return null;
    }

    function callVisionModel(dataUrl) {
      var apiKey = localStorage.getItem("doubao_api_key") || (cfg.visionKeyB64 ? atob(cfg.visionKeyB64) : (cfg.defaultKeyB64 ? atob(cfg.defaultKeyB64) : ""));
      var systemPrompt =
        "你是风湿免疫病化验单解读助手。请仔细识别图片中的所有检验指标，返回严格的JSON格式，不要输出任何其他文字。" +
        "JSON格式：{\"metrics\":[{\"name\":\"指标全称\",\"value\":\"检测值含单位\",\"range\":\"参考范围\",\"status\":\"high或low或normal或unknown\",\"note\":\"该指标异常的简要科普说明，正常则留空\"}],\"summary\":\"整体情况的一句话总结\",\"disclaimer\":\"本解读仅供科普参考，不能替代医师面诊与诊断。\"}" +
        "status判断：高于参考范围为high，低于为low，在范围内为normal，无法判断为unknown。只识别图片中实际存在的指标，不要编造。";
      return fetch(cfg.apiUrl || "https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({
          model: cfg.visionModel || "doubao-1-5-vision-pro-32k-250115",
          temperature: 0.1,
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: [
              { type: "text", text: "请解读这张化验单，返回JSON。" },
              { type: "image_url", image_url: { url: dataUrl } },
            ]},
          ],
        }),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) throw new Error((j.error && j.error.message) || ("服务异常 " + r.status));
            var content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            var data = extractJSON(content);
            if (!data) throw new Error("模型返回格式异常");
            return data;
          });
        });
    }

    function setStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.hidden = !msg;
      statusEl.textContent = msg || "";
      statusEl.className = "lab-status" + (kind ? " " + kind : "");
    }
    function showReport() {
      state1.hidden = true;
      state2.hidden = false;
      state2.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function statusClassOf(s) {
      return s === "low" ? "low" : s === "normal" ? "ok" : s === "unknown" ? "unknown" : "high";
    }
    function statusTextOf(s) {
      return s === "low" ? "偏低 ↓" : s === "normal" ? "正常" : s === "unknown" ? "未知" : "偏高 ↑";
    }

    function renderMetrics(data) {
      var metrics = (data && data.metrics) || [];
      if (summaryEl) {
        if (data && data.summary) { summaryEl.textContent = data.summary; summaryEl.hidden = false; }
        else summaryEl.hidden = true;
      }
      var criticalNames = [];
      if (!metrics.length) {
        metricsEl.innerHTML =
          '<div class="metric"><div class="note">未能从图片中识别出明确指标，建议上传清晰、完整的化验单，或咨询专科医师。</div></div>';
      } else {
        metricsEl.innerHTML = metrics.map(function (m) {
          var cls = statusClassOf(m.status);
          var ind = matchIndicator(m.name);
          var canonical = ind ? ind.name : (m.name || "指标");
          var val = esc(m.value || "") + " " + statusTextOf(m.status);
          var range = m.range ? "参考范围：" + esc(m.range) : (ind && ind.normal ? "参考范围：" + esc(ind.normal) : "");
          // 优先采用指标字典中经审核的科普解释，其次用模型生成的 note
          var notes = [];
          if (ind && ind.meaning) notes.push(ind.meaning);
          if (m.status === "high" && ind && ind.high) notes.push(ind.high);
          if (m.status === "low" && ind && ind.low) notes.push(ind.low);
          if (!ind && m.note) notes.push(m.note);
          if (ind && ind.myth) notes.push("💡 " + ind.myth);
          var crit = isCritical(m, ind);
          if (crit) { criticalNames.push(canonical); cls = "high"; }
          return '<div class="metric">' +
            '<div class="row"><span class="name">' + esc(canonical) + '</span>' +
            '<span class="val ' + cls + (crit ? " metric-critical" : "") + '">' + val + '</span></div>' +
            (range ? '<div class="range">' + range + '</div>' : '') +
            '<div class="note">' + notes.map(esc).join("<br>") + '</div>' +
            '</div>';
        }).join("");
      }
      // 危急值横幅
      if (criticalBanner) {
        if (criticalNames.length) {
          criticalBanner.classList.add("show");
          if (criticalText) criticalText.textContent = "「" + criticalNames.join("、") + "」明显异常，请尽快携带化验单到风湿免疫科就诊评估，以下解读不能替代医师诊断。";
        } else {
          criticalBanner.classList.remove("show");
        }
      }
      if (disclaimerEl) {
        disclaimerEl.textContent =
          (data && data.disclaimer) || "本解读仅供科普参考，不能替代医师面诊与诊断。";
      }
      if (titleEl) titleEl.textContent = "指标解读";
    }

    function fileToResizedDataURL(file, maxDim, quality) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var tw = Math.max(1, Math.round(w * scale));
          var th = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement("canvas");
          canvas.width = tw; canvas.height = th;
          canvas.getContext("2d").drawImage(img, 0, 0, tw, th);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("图片读取失败")); };
        img.src = url;
      });
    }

    function analyzeDataUrl(dataUrl, isSample) {
      setStatus("正在识别化验单指标…");
      showReport();
      if (preview) { preview.src = dataUrl; preview.hidden = false; }
      if (placeholder) placeholder.hidden = true;
      if (titleEl) titleEl.textContent = "指标解读（分析中…）";
      callVisionModel(dataUrl)
        .then(function (data) { setStatus(""); renderMetrics(data); })
        .catch(function () {
          if (isSample) { renderMetrics(buildSampleResult()); setStatus(""); if (titleEl) titleEl.textContent = "指标解读（示例）"; }
          else {
            if (titleEl) titleEl.textContent = "指标解读（演示示例）";
            setStatus("AI 解读服务暂不可用，请稍后重试或检查网络 / API 配置。", "error");
          }
        })
        .then(function () { busy = false; });
    }

    function handleFile(file) {
      if (!file) return;
      if (!/^image\//.test(file.type)) { setStatus("请选择图片文件（JPG / PNG）", "error"); return; }
      if (busy) return;
      busy = true;
      fileToResizedDataURL(file, 1280, 0.85).then(function (dataUrl) { analyzeDataUrl(dataUrl, false); });
    }

    // 内置示例化验单（canvas 生成，供无图体验与演示）
    function buildSampleResult() {
      return {
        summary: "示例报告提示炎症指标升高、类风湿因子与抗CCP阳性，建议到风湿免疫科结合关节症状进一步评估。",
        disclaimer: "本解读为内置示例，仅供功能演示，不能替代医师面诊与诊断。",
        metrics: [
          { name: "类风湿因子", value: "86 IU/mL", range: "0~20 IU/mL", status: "high", note: "" },
          { name: "抗CCP抗体", value: "阳性（++）", range: "阴性", status: "high", note: "" },
          { name: "C反应蛋白", value: "28 mg/L", range: "0~8 mg/L", status: "high", note: "" },
          { name: "血沉", value: "42 mm/h", range: "男0~15/女0~20", status: "high", note: "" },
          { name: "血尿酸", value: "352 μmol/L", range: "149~420 μmol/L", status: "normal", note: "" }
        ]
      };
    }
    function makeSampleImage() {
      return new Promise(function (resolve) {
        var cv = document.createElement("canvas");
        cv.width = 560; cv.height = 400;
        var x = cv.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, 560, 400);
        x.fillStyle = "#111"; x.font = "bold 20px sans-serif";
        x.fillText("风湿免疫检验报告单（示例）", 130, 38);
        x.font = "15px sans-serif";
        var rows = [
          ["项目", "结果", "参考范围"],
          ["类风湿因子 RF", "86 IU/mL ↑", "0~20"],
          ["抗CCP抗体", "阳性(++) ↑", "阴性"],
          ["C反应蛋白 CRP", "28 mg/L ↑", "0~8"],
          ["血沉 ESR", "42 mm/h ↑", "0~20"],
          ["血尿酸 UA", "352 μmol/L", "149~420"]
        ];
        rows.forEach(function (r, i) {
          var y = 80 + i * 48;
          x.fillText(r[0], 40, y); x.fillText(r[1], 260, y); x.fillText(r[2], 410, y);
        });
        resolve(cv.toDataURL("image/jpeg", 0.9));
      });
    }

    btn.addEventListener("click", function () { fileInput.click(); });
    if (card) {
      card.addEventListener("click", function (e) { if (e.target === btn) return; fileInput.click(); });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
      });
    }
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      handleFile(f);
      fileInput.value = "";
    });
    if (sampleBtn) sampleBtn.addEventListener("click", function () {
      if (busy) return;
      busy = true;
      makeSampleImage().then(function (url) { analyzeDataUrl(url, true); });
    });
  }

  /* ---------- 5. CSV 导出 Toast（页 4） ---------- */
  var toastTimer = null;
  function showToast(msg) {
    var t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove("show");
    }, 3000);
  }
  /* ---------- 5. 管理后台：数据驱动 + 真交互（页 4） ---------- */
  function initAdmin() {
    var kbBody = document.getElementById("kbBody");
    if (!kbBody) return; // 非后台页

    var DATA = { knowledge: [], logs: [] };
    var kbSearch = document.getElementById("kbSearch");
    var logRisk = document.getElementById("logRisk");
    var kbEmpty = document.getElementById("kbEmpty");
    var logEmpty = document.getElementById("logEmpty");

    function statusBadge(s) {
      if (s === "pending") return '<span class="badge warn">待审核</span>';
      return '<span class="badge ok">已发布</span>';
    }
    function riskBadge(r) {
      if (r === "high") return '<span class="badge risk">高风险</span>';
      return '<span class="badge ok">正常</span>';
    }
    function todayStr() {
      var d = new Date();
      var p = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    }

    /* —— 渲染：概览统计（自动计算） —— */
    function renderStats() {
      var k = DATA.knowledge, l = DATA.logs;
      var published = k.filter(function (x) { return x.status === "published"; }).length;
      var pending = k.filter(function (x) { return x.status === "pending"; }).length;
      var risk = l.filter(function (x) { return x.risk === "high"; }).length;
      var map = { total: k.length, published: published, pending: pending, risk: risk };
      document.querySelectorAll("[data-stat]").forEach(function (el) {
        el.textContent = map[el.getAttribute("data-stat")];
      });
    }

    /* —— 渲染：知识库表格（支持搜索） —— */
    function renderKnowledge() {
      var q = (kbSearch && kbSearch.value || "").trim().toLowerCase();
      var rows = DATA.knowledge.filter(function (x) {
        if (!q) return true;
        return (x.title + " " + x.category).toLowerCase().indexOf(q) >= 0;
      });
      if (kbEmpty) kbEmpty.hidden = rows.length > 0;
      kbBody.innerHTML = rows.map(function (x) {
        return "<tr>" +
          '<td data-label="编号">' + esc(x.id) + "</td>" +
          '<td data-label="分类">' + esc(x.category) + "</td>" +
          '<td data-label="科普标题">' + esc(x.title) + "</td>" +
          '<td data-label="更新时间">' + esc(x.updated) + "</td>" +
          '<td data-label="状态">' + statusBadge(x.status) + "</td>" +
          '<td data-label="操作"><button class="link-btn kb-edit" type="button" data-id="' + esc(x.id) + '">编辑</button></td>' +
          "</tr>";
      }).join("");
    }

    /* —— 渲染：对话日志（支持风险筛选） —— */
    function renderLogs() {
      var r = (logRisk && logRisk.value) || "all";
      var rows = DATA.logs.filter(function (x) { return r === "all" || x.risk === r; });
      if (logEmpty) logEmpty.hidden = rows.length > 0;
      document.getElementById("logBody").innerHTML = rows.map(function (x) {
        return "<tr>" +
          '<td data-label="日志ID">' + esc(x.id) + "</td>" +
          '<td data-label="提问摘要">' + esc(x.question) + "</td>" +
          '<td data-label="回复摘要">' + esc(x.answer) + "</td>" +
          '<td data-label="时间">' + esc(x.time) + "</td>" +
          '<td data-label="风险标记">' + riskBadge(x.risk) + "</td>" +
          "</tr>";
      }).join("");
    }

    function renderAll() { renderStats(); renderKnowledge(); renderLogs(); }

    /* —— 编辑：打开弹窗并回填 —— */
    document.addEventListener("click", function (e) {
      var b = e.target.closest(".kb-edit");
      if (!b) return;
      var id = b.getAttribute("data-id");
      var item = DATA.knowledge.filter(function (x) { return x.id === id; })[0];
      if (!item) return;
      document.getElementById("editId").value = item.id;
      document.getElementById("editCategory").value = item.category;
      document.getElementById("editTitleInput").value = item.title;
      document.getElementById("editContent").value = item.content;
      document.getElementById("editStatus").value = item.status;
      openModal("editModal");
    });

    var editForm = document.getElementById("editForm");
    editForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var id = document.getElementById("editId").value;
      var item = DATA.knowledge.filter(function (x) { return x.id === id; })[0];
      if (!item) return;
      item.category = document.getElementById("editCategory").value.trim() || item.category;
      item.title = document.getElementById("editTitleInput").value.trim() || item.title;
      item.content = document.getElementById("editContent").value.trim();
      item.status = document.getElementById("editStatus").value;
      item.updated = todayStr();
      renderAll();
      closeModal(document.getElementById("editModal"));
      showToast("已保存修改：" + item.title);
    });

    /* —— 新增：创建条目 —— */
    var addForm = document.getElementById("addForm");
    addForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var maxNum = DATA.knowledge.reduce(function (m, x) {
        var n = parseInt(String(x.id).replace(/\D/g, ""), 10);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
      var item = {
        id: "K" + ("00" + (maxNum + 1)).slice(-3),
        category: document.getElementById("addCategory").value.trim() || "未分类",
        title: document.getElementById("addTitleInput").value.trim() || "未命名条目",
        content: document.getElementById("addContent").value.trim(),
        updated: todayStr(),
        status: document.getElementById("addStatus").value
      };
      DATA.knowledge.unshift(item);
      addForm.reset();
      renderAll();
      closeModal(document.getElementById("addModal"));
      showToast("已新增条目：" + item.title);
    });

    /* —— 弹窗内「取消」按钮 —— */
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) {
        var m = e.target.closest(".modal");
        if (m) closeModal(m);
      }
    });

    /* —— 搜索 / 筛选 —— */
    if (kbSearch) kbSearch.addEventListener("input", renderKnowledge);
    if (logRisk) logRisk.addEventListener("change", renderLogs);

    /* —— 导出 CSV（真实下载） —— */
    var exportBtn = document.getElementById("exportCsv");
    exportBtn.addEventListener("click", function () {
      var header = ["编号", "分类", "科普标题", "更新时间", "状态"];
      var rows = DATA.knowledge.map(function (x) {
        return [x.id, x.category, x.title, x.updated, x.status === "pending" ? "待审核" : "已发布"];
      });
      var csv = [header].concat(rows).map(function (r) {
        return r.map(function (c) {
          var s = String(c == null ? "" : c);
          return '"' + s.replace(/"/g, '""') + '"';
        }).join(",");
      }).join("\r\n");
      var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "fengyu-knowledge-" + todayStr() + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("已导出 " + DATA.knowledge.length + " 条知识库为 CSV");
    });

    /* —— 合并前端真实问答日志（localStorage）到日志表格 —— */
    function mergeRealLogs() {
      var real = [];
      try { real = JSON.parse(localStorage.getItem("fyzd_qa_logs_v1") || "[]"); } catch (e) { real = []; }
      var mapped = real.map(function (lg) {
        var t = lg.ts ? new Date(lg.ts) : new Date();
        var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
        var time = t.getFullYear() + "-" + p2(t.getMonth() + 1) + "-" + p2(t.getDate()) + " " + p2(t.getHours()) + ":" + p2(t.getMinutes());
        return {
          id: lg.id || "-",
          question: lg.q || "",
          answer: (lg.a || "(生成中/已拒答)").slice(0, 60),
          time: time,
          risk: lg.refused ? "high" : "normal",
          raw: lg
        };
      });
      DATA.logs = mapped.concat(DATA.logs || []);
    }

    /* —— 导出真实问答日志 CSV（字段对齐 EULAR 式验证评分表） —— */
    var exportLogsBtn = document.getElementById("exportLogs");
    if (exportLogsBtn) exportLogsBtn.addEventListener("click", function () {
      var real = [];
      try { real = JSON.parse(localStorage.getItem("fyzd_qa_logs_v1") || "[]"); } catch (e) { real = []; }
      var header = ["时间", "会话ID", "问题", "回答", "引用来源", "检索片段", "耗时ms", "是否拒答", "是否本地兜底", "用户反馈"];
      var rows = real.map(function (lg) {
        return [lg.ts || "", lg.sessionId || "", lg.q || "", lg.a || "",
          (lg.sources || []).join("/"), (lg.chunks || []).join("/"),
          lg.latencyMs || 0, lg.refused ? "是" : "否", lg.fallback ? "是" : "否",
          lg.feedback === "useful" ? "有用" : lg.feedback === "useless" ? "没用" : ""];
      });
      var csv = [header].concat(rows).map(function (r) {
        return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
      }).join("\r\n");
      var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "fengyu-qa-logs-" + todayStr() + ".csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("已导出 " + real.length + " 条真实问答日志");
    });

    /* —— 拉取数据并首次渲染 —— */
    fetch("assets/data/admin.json")
      .then(function (r) { return r.json(); })
      .then(function (d) { DATA = d; mergeRealLogs(); renderAll(); })
      .catch(function () {
        DATA = { knowledge: [], logs: [] };
        mergeRealLogs();
        renderAll();
        showToast("演示知识库未加载，已展示本机真实问答日志");
      });
  }

  /* ---------- 6. 免疫动画热区联动（页 3） ---------- */
  /* 悬停 / 键盘聚焦 / 点击热区时，为动画舞台加上对应高亮类，
     SVG 中相应解剖层点亮并浮现标注；移开后平滑恢复。
     点击行为本身仍由 data-modal 弹窗逻辑（initModals）负责。 */
  function initImmuneHotspots() {
    var stage = document.querySelector(".demo-stage");
    if (!stage) return;
    stage.querySelectorAll(".hotspot").forEach(function (h) {
      var cls = h.classList.contains("synovium") ? "hl-synovium" : "hl-cartilage";
      function on()  { stage.classList.add(cls); }
      function off() { stage.classList.remove(cls); }
      h.addEventListener("pointerenter", on);
      h.addEventListener("pointerleave", off);
      h.addEventListener("focus", on);
      h.addEventListener("blur", off);
      h.addEventListener("click", on); // 触屏点击后保持高亮，强化区域关联
    });

    // —— 3D 结构热区联动 AI 实时讲解（与问答共用同一文本模型）——
    var AI_TOPIC = {
      synovium: "请用通俗易懂的语言，向患者讲解类风湿关节炎中“关节滑膜”的免疫机制：正常滑膜的作用、滑膜炎如何发生、滑膜增生与血管翳如何逐步侵蚀软骨和骨（约200字，分2-3段，不做诊断）。",
      cartilage: "请用通俗易懂的语言，向患者讲解关节软骨与骨组织在类风湿关节炎中是如何被炎症破坏的：软骨的正常作用、为什么软骨修复能力有限、血管翳侵蚀后会出现哪些关节变化、患者应如何配合治疗保护关节（约200字，分2-3段，不做诊断）。"
    };
    document.querySelectorAll("[data-ai]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var topic = btn.getAttribute("data-ai");
        var target = document.getElementById(topic === "synovium" ? "aiSynovium" : "aiCartilage");
        if (!target) return;
        target.hidden = false;
        target.innerHTML = '<span class="ai-explain-loading">AI 正在结合指南生成讲解…</span>';
        btn.disabled = true;
        var cfg = window.DOUBAO_CONFIG || {};
        var apiKey = localStorage.getItem("doubao_api_key") || (cfg.defaultKeyB64 ? atob(cfg.defaultKeyB64) : "");
        var full = "";
        fetch(cfg.apiUrl || "https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
          body: JSON.stringify({
            model: cfg.model || "", temperature: 0.4, stream: true,
            messages: [
              { role: "system", content: "你是风语智答风湿免疫科普助手，讲解通俗、准确，不诊断、不开药，末尾提示仅供科普。" },
              { role: "user", content: AI_TOPIC[topic] || "请通俗讲解该结构。" }
            ]
          })
        }).then(function (resp) {
          if (!resp.ok || !resp.body) throw new Error("err");
          var reader = resp.body.getReader(), decoder = new TextDecoder(), buf = "";
          function read() {
            reader.read().then(function (chunk) {
              if (chunk.done) { btn.disabled = false; return; }
              buf += decoder.decode(chunk.value, { stream: true });
              var lines = buf.split("\n"); buf = lines.pop() || "";
              lines.forEach(function (line) {
                line = line.trim();
                if (line.indexOf("data:") !== 0) return;
                var d = line.slice(5).trim();
                if (d === "[DONE]") return;
                try {
                  var j = JSON.parse(d);
                  var delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
                  if (delta) { full += delta; target.innerHTML = esc(full).replace(/\n/g, "<br>"); }
                } catch (e) {}
              });
              read();
            }).catch(finish);
          }
          read();
        }).catch(finish);
        function finish() {
          btn.disabled = false;
          if (!full) target.innerHTML = '<span class="ai-explain-loading">讲解服务暂时不可用，请先阅读上方静态科普内容。</span>';
        }
      });
    });
  }

  /* ---------- 3D 模型加载指示 / 容错 ---------- */
  function initModelViewer() {
    var mv = document.querySelector("model-viewer.joint-model");
    if (!mv) return;
    var stage = mv.closest(".model-stage") || mv.parentElement;
    if (!stage) return;
    var overlay = document.createElement("div");
    overlay.className = "model-loading";
    overlay.innerHTML =
      '<span class="spin" aria-hidden="true"></span>正在加载 3D 模型，稍候即可拖动旋转…';
    stage.appendChild(overlay);

    var dismiss = function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    if (mv.loaded) { dismiss(); return; }
    mv.addEventListener("load", dismiss, { once: true });
    mv.addEventListener("error", function () {
      overlay.classList.add("is-error");
      overlay.innerHTML = "3D 模型加载失败，请检查网络后刷新重试。";
    }, { once: true });
  }

  /* ---------- 首页问答：前端规则匹配（无后端） ---------- */
  function initQA() {
    var form = document.getElementById("qa-form");
    if (!form) return;
    var chat = document.querySelector(".chat");
    var input = document.getElementById("qa-input");
    if (!chat || !input) return;

    var DATA = null;
    var GUIDE = null;
    var pending = false;

    // —— 多轮对话：保留最近 6 轮（12 条消息）——
    var HISTORY_KEEP = 6;
    var history = [];
    var lastQuestion = null;        // 供“重新生成”使用
    var lastChunks = [];            // 最近一次检索命中的指南片段
    var lastLogId = null;           // 最近一条问答日志 id（用于反馈）
    var sessionId = "s" + Date.now();
    var LS_HISTORY = "fyzd_chat_history_v1";
    var LS_LOGS = "fyzd_qa_logs_v1";

    fetch("assets/data/qa.json")
      .then(function (r) { return r.json(); })
      .then(function (d) { DATA = d; })
      .catch(function () {
        DATA = { fallback: "科普知识库加载失败，请刷新页面后重试。", pairs: [], redlines: [] };
      });

    // 加载指南锚定知识库（轻量 RAG 的知识层）
    fetch("assets/data/guidelines.json")
      .then(function (r) { return r.json(); })
      .then(function (g) { GUIDE = g; })
      .catch(function () { GUIDE = { chunks: [] }; });

    function addMsg(role, html) {
      var m = document.createElement("div");
      m.className = "msg " + role;
      m.innerHTML =
        '<div class="avatar">' + (role === "ai" ? "AI" : "我") + "</div>" +
        '<div class="bubble">' + html + "</div>";
      chat.appendChild(m);
      chat.scrollTop = chat.scrollHeight;
      return m;
    }

    function normalize(s) {
      return String(s == null ? "" : s).toLowerCase().replace(/[\s\p{P}]/gu, "");
    }

    // 红线问题优先拦截：命中则返回拒答文案（不进入检索与生成）
    function matchRedline(text) {
      if (!DATA || !DATA.redlines) return null;
      var q = normalize(text);
      var hit = null;
      (DATA.redlines || []).some(function (rl) {
        var matched = (rl.keywords || []).some(function (kw) {
          var k = normalize(kw);
          return k && q.indexOf(k) >= 0;
        });
        if (matched) { hit = rl.reply; return true; }
        return false;
      });
      return hit;
    }

    function findAnswer(text) {
      if (!DATA || !DATA.pairs) return { a: (DATA && DATA.fallback) || "", src: [] };
      var q = normalize(text);
      var best = null, bestScore = 0;
      DATA.pairs.forEach(function (p) {
        var score = 0;
        (p.keywords || []).forEach(function (kw) {
          var k = normalize(kw);
          if (k && q.indexOf(k) >= 0) score++;
        });
        if (score > bestScore) { bestScore = score; best = p; }
      });
      if (bestScore > 0) return { a: best.a, src: best.src || [] };
      return { a: DATA.fallback, src: [] };
    }

    function citeHTML(src) {
      if (!src || !src.length) return "";
      return " " + src.map(function (n) {
        return '<button type="button" class="cite" data-modal="sourceModal" aria-haspopup="dialog">[' + n + "]</button>";
      }).join(" ");
    }

    // —— 轻量 RAG 检索：关键词重叠打分，取 Top-K 指南片段 ——
    function retrieveChunks(text) {
      if (!GUIDE || !GUIDE.chunks) return [];
      var q = normalize(text);
      var scored = GUIDE.chunks.map(function (c) {
        var score = 0;
        (c.keywords || []).forEach(function (kw) {
          var k = normalize(kw);
          if (!k) return;
          if (q.indexOf(k) >= 0) score += k.length >= 4 ? 2 : 1;
        });
        // 片段内容中的医学名词命中也计分（语义泛化的简化实现）
        var body = normalize(c.section + c.content);
        for (var i = 0; i < (c.keywords || []).length; i++) {
          var k2 = normalize(c.keywords[i]);
          if (k2 && k2.length >= 3 && body.indexOf(k2) >= 0 && q.indexOf(k2) >= 0) score += 1;
        }
        return { c: c, score: score };
      }).filter(function (x) { return x.score > 0; })
        .sort(function (a, b) { return b.score - a.score; });
      var picked = [], seen = {};
      scored.forEach(function (x) {
        if (picked.length >= 4) return;
        if (seen[x.c.id]) return;
        seen[x.c.id] = 1;
        picked.push(x.c);
      });
      return picked;
    }

    // 话题切换检测：与上一轮用户问题的检索结果几乎不重叠时，给出非阻断提示
    function detectTopicSwitch(text, chunks) {
      var hint = document.getElementById("topicHint");
      if (!hint || history.length < 2) { if (hint) hint.hidden = true; return; }
      var prevUser = null;
      for (var i = history.length - 1; i >= 0; i--) {
        if (history[i].role === "user") { prevUser = history[i].content; break; }
      }
      if (!prevUser) { hint.hidden = true; return; }
      var prevChunks = retrieveChunks(prevUser).map(function (c) { return c.disease; });
      var curDisease = chunks.map(function (c) { return c.disease; });
      var overlap = curDisease.some(function (d) { return prevChunks.indexOf(d) >= 0; });
      if (curDisease.length && prevChunks.length && !overlap) {
        hint.textContent = "已检测到新话题，为您重新检索对应指南";
        hint.hidden = false;
        setTimeout(function () { hint.hidden = true; }, 4000);
      } else {
        hint.hidden = true;
      }
    }

    var SOURCE_LEGEND =
      "[1]《2018中国类风湿关节炎诊疗指南》中华医学会风湿病学分会；" +
      "[2]《2020中国系统性红斑狼疮诊疗指南》中华医学会风湿病学分会等；" +
      "[3]《中国高尿酸血症与痛风诊疗指南(2019)》中华医学会内分泌学分会；" +
      "[4]《痛风及高尿酸血症基层诊疗指南（实践版·2019）》中华医学会全科医学分会等。";

    // 依据检索结果动态组装系统提示词（系统约束 + 知识片段 + 用户问题 三段式）
    function buildSystemPrompt(chunks) {
      var base =
        "你是风语智答风湿免疫病科普助手。仅做健康科普，不诊断、不开药、不给具体剂量、不建议自行停药；遇诊断/处方/急症请求，礼貌拒绝并建议到风湿免疫科就诊。回答通俗易懂，把专业术语解释清楚，用纯文本、段落空行分隔，分点时不要使用markdown符号。";
      var citeRule =
        "【引用标注强制要求】每个涉及疾病知识的段落末尾，用方括号标注支撑该段内容的来源编号，如[1][3]，不得遗漏。来源对应：" + SOURCE_LEGEND;
      var tail = "回答末尾另起一段写：以上内容仅为科普参考，不能替代医师面诊，具体诊疗请遵医嘱。";
      if (chunks && chunks.length) {
        var block = chunks.map(function (c, i) {
          return "片段" + (i + 1) + "（来源[" + c.src + "]，" + c.section + "）：" + c.content;
        }).join("\n");
        return base +
          "\n【以下是检索到的权威指南知识片段，涉及其中疾病的结论请严格以片段为准并按要求标注来源编号】\n" +
          block + "\n" + citeRule +
          "\n对于片段没有覆盖的对比性、背景性内容（例如与其他常见疾病的区别、一般性原理），可用医学界公认通识谨慎补充，但不得编造片段中没有的具体数据或结论，也不要为补充的通识内容标注来源编号；只有当问题与风湿免疫健康科普完全无关、或要求诊断/开药/急症处理时，才礼貌说明无法替代医师处理并建议线下就医。" + tail;
      }
      return base + "\n本次未检索到高度匹配的指南片段，请依据风湿免疫病公认通识谨慎作答，不要编造来源编号或具体指南数据；没有把握或问题超出科普范围时，建议到风湿免疫科线下就诊。" + tail;
    }

    // 等待期间轮播的科普小知识
    var FUN_FACTS = [
      "类风湿关节炎患者中约 70%-80% 会出现类风湿因子升高",
      "晨僵持续超过 30 分钟是类风湿关节炎的典型表现之一",
      "系统性红斑狼疮因面颊部蝶形红斑而得名，形似蝴蝶",
      "痛风最常发作于大脚趾第一跖趾关节，红肿热痛剧烈",
      "干燥综合征患者常需反复饮水，部分人吃干粮需用水送服",
      "强直性脊柱炎多见于年轻男性，腰背痛夜间加重、活动后缓解",
      "人体免疫系统有时会\"认错人\"攻击自身组织，这就是自身免疫病",
      "规范使用激素能快速控制炎症，自行停药可能导致病情反跳",
      "风湿免疫病患者补钙和维生素D有助于预防激素相关骨质疏松",
      "血尿酸长期控制达标，痛风石可逐渐溶解缩小",
    ];

    // 把回答中的 [1][2] 渲染为可点击的引用按钮
    function renderReplyWithCitations(text) {
      var html = esc(text).replace(/\n/g, "<br>");
      html = html.replace(/\[(\d+)\]/g, function (match, num) {
        return '<button type="button" class="cite" data-modal="sourceModal" aria-haspopup="dialog">[' + num + "]</button>";
      });
      return html;
    }

    function renderFallback(typing, text) {
      var res = findAnswer(text);
      typing.querySelector(".bubble").innerHTML = esc(res.a) + citeHTML(res.src);
      attachActionBar(typing, res.a, false);
    }

    // —— 问答日志（localStorage），供管理后台与验证研究使用 ——
    function saveLog(entry) {
      try {
        var logs = JSON.parse(localStorage.getItem(LS_LOGS) || "[]");
        entry.id = "L" + Date.now() + Math.floor(Math.random() * 100);
        logs.unshift(entry);
        localStorage.setItem(LS_LOGS, JSON.stringify(logs.slice(0, 500)));
        lastLogId = entry.id;
        return entry.id;
      } catch (e) { return null; }
    }
    function updateLastLog(patch) {
      try {
        var logs = JSON.parse(localStorage.getItem(LS_LOGS) || "[]");
        for (var i = 0; i < logs.length; i++) {
          if (logs[i].id === lastLogId) { Object.assign(logs[i], patch); break; }
        }
        localStorage.setItem(LS_LOGS, JSON.stringify(logs));
      } catch (e) {}
    }

    // —— 回答操作条：复制 / 重新生成 / 有用 / 没用 ——
    function attachActionBar(msgEl, plainText, isStream) {
      var bubble = msgEl.querySelector(".bubble");
      if (!bubble || bubble.querySelector(".msg-actions")) return;
      var bar = document.createElement("div");
      bar.className = "msg-actions";
      bar.innerHTML =
        '<button type="button" class="act" data-act="copy" title="复制回答">复制</button>' +
        '<button type="button" class="act" data-act="regen" title="重新生成">重新生成</button>' +
        '<button type="button" class="act" data-act="up" title="回答有帮助">👍 有用</button>' +
        '<button type="button" class="act" data-act="down" title="回答没帮助">👎 没用</button>';
      bubble.appendChild(bar);
      bar.addEventListener("click", function (e) {
        var btn = e.target.closest(".act");
        if (!btn) return;
        var act = btn.getAttribute("data-act");
        if (act === "copy") {
          var t = plainText || bubble.innerText;
          if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {});
          btn.textContent = "已复制"; setTimeout(function () { btn.textContent = "复制"; }, 1500);
        } else if (act === "regen") {
          if (pending || !lastQuestion) return;
          // 移除最后一条 AI 回答与对应历史，重新生成
          var lastAi = chat.querySelector(".msg.ai:last-of-type");
          if (lastAi) lastAi.parentNode.removeChild(lastAi);
          if (history.length && history[history.length - 1].role === "assistant") history.pop();
          answer(lastQuestion, true);
        } else if (act === "up" || act === "down") {
          updateLastLog({ feedback: act === "up" ? "useful" : "useless" });
          bar.querySelectorAll(".act").forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          showToast(act === "up" ? "感谢反馈，很高兴对您有帮助" : "感谢反馈，我们会持续改进");
        }
      });
    }

    // 填充来源弹窗中“本次检索片段”
    function fillRetrievedModal() {
      var box = document.getElementById("retrievedChunks");
      var list = document.getElementById("retrievedList");
      if (!box || !list) return;
      if (!lastChunks.length) { box.hidden = true; return; }
      box.hidden = false;
      var srcTitle = { 1: "2018中国类风湿关节炎诊疗指南", 2: "2020中国系统性红斑狼疮诊疗指南", 3: "中国高尿酸血症与痛风诊疗指南(2019)", 4: "痛风及高尿酸血症基层诊疗指南（实践版·2019）" };
      list.innerHTML = lastChunks.map(function (c) {
        return '<div class="retrieved-item"><span class="ri-src">[' + c.src + '] ' + esc(srcTitle[c.src] || "") + " · " + esc(c.section) + '</span><div class="ri-text">' + esc(c.content) + "</div></div>";
      }).join("");
    }
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest('.cite[data-modal="sourceModal"]')) fillRetrievedModal();
    });

    function answer(text, isRegen) {
      if (pending) return;
      pending = true;
      var startedAt = Date.now();

      // 1) 红线拦截：命中则渲染「安全提示」拒答气泡（不调用大模型）
      var refused = matchRedline(text);
      if (refused) {
        var typingR = addMsg("ai", "正在判断提问是否可以回答…");
        typingR.classList.add("refused");
        setTimeout(function () {
          typingR.querySelector(".bubble").innerHTML =
            '<span class="refuse-tag">安全提示</span>' + esc(refused);
          history.push({ role: "user", content: text });
          history.push({ role: "assistant", content: refused });
          persistHistory();
          saveLog({ ts: new Date().toISOString(), sessionId: sessionId, q: text, a: refused, refused: true, chunks: [], sources: [] });
          pending = false;
        }, 320);
        return;
      }

      // 2) 轻量 RAG 检索
      var chunks = retrieveChunks(text);
      lastChunks = chunks;
      lastQuestion = text;
      detectTopicSwitch(text, chunks);

      // 两阶段等待提示
      var typing = addMsg("ai", "🔍 正在检索指南知识库…");
      var cfg = window.DOUBAO_CONFIG || {};
      var apiKey = localStorage.getItem("doubao_api_key") || (cfg.defaultKeyB64 ? atob(cfg.defaultKeyB64) : "");
      var bubble = typing.querySelector(".bubble");

      var stageTimer = setTimeout(function () {
        bubble.innerHTML = '💡 正在组织科普回答…<span class="thinking-fact"></span>';
        var factEl = bubble.querySelector(".thinking-fact");
        factEl.style.cssText = "display:block;color:var(--muted);font-size:13px;margin-top:8px;";
        var factIdx = Math.floor(Math.random() * FUN_FACTS.length);
        factEl.textContent = "💡 " + FUN_FACTS[factIdx];
        factTimer = setInterval(function () {
          factIdx = (factIdx + 1) % FUN_FACTS.length;
          factEl.textContent = "💡 " + FUN_FACTS[factIdx];
        }, 2800);
      }, 650);
      var factTimer = null;
      function clearFact() {
        clearTimeout(stageTimer);
        if (factTimer) { clearInterval(factTimer); factTimer = null; }
      }

      // 3) 组装多轮消息（系统约束+知识片段 / 最近6轮历史 / 当前问题）
      var messages = [{ role: "system", content: buildSystemPrompt(chunks) }];
      history.slice(-HISTORY_KEEP * 2).forEach(function (m) { messages.push({ role: m.role, content: m.content }); });
      messages.push({ role: "user", content: text });

      var sources = chunks.map(function (c) { return c.src; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      var logId = saveLog({ ts: new Date().toISOString(), sessionId: sessionId, q: text, a: "", streaming: true, chunks: chunks.map(function (c) { return c.id; }), sources: sources, latencyMs: 0, feedback: null });

      fetch(cfg.apiUrl || "https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({ model: cfg.model || "", temperature: 0.3, stream: true, messages: messages }),
      })
        .then(function (response) {
          if (!response.ok) throw new Error("服务异常 " + response.status);
          if (!response.body) throw new Error("不支持流式响应");
          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = "", fullReply = "";
          function readChunk() {
            reader.read().then(function (chunk) {
              if (chunk.done) {
                clearFact(); pending = false;
                if (!fullReply) { renderFallback(typing, text); finishTurn(text, "", sources, chunks, startedAt, true); return; }
                attachActionBar(typing, fullReply, true);
                finishTurn(text, fullReply, sources, chunks, startedAt, false);
                return;
              }
              buffer += decoder.decode(chunk.value, { stream: true });
              var lines = buffer.split("\n");
              buffer = lines.pop() || "";
              lines.forEach(function (line) {
                line = line.trim();
                if (!line || line.indexOf("data:") !== 0) return;
                var data = line.slice(5).trim();
                if (data === "[DONE]") return;
                try {
                  var json = JSON.parse(data);
                  var delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
                  if (delta) {
                    clearFact();
                    fullReply += delta;
                    bubble.innerHTML = renderReplyWithCitations(fullReply);
                  }
                } catch (e) {}
              });
              readChunk();
            }).catch(function () {
              clearFact(); pending = false;
              if (!fullReply) { renderFallback(typing, text); finishTurn(text, "", sources, chunks, startedAt, true); }
              else { attachActionBar(typing, fullReply, true); finishTurn(text, fullReply, sources, chunks, startedAt, false); }
            });
          }
          readChunk();
        })
        .catch(function () {
          clearFact();
          renderFallback(typing, text);
          var fb = findAnswer(text);
          finishTurn(text, fb.a, sources, chunks, startedAt, true);
          pending = false;
        });
    }

    // 一轮结束：写入多轮历史、持久化、更新日志
    function finishTurn(text, reply, sources, chunks, startedAt, isFallback) {
      history.push({ role: "user", content: text });
      if (reply) history.push({ role: "assistant", content: reply });
      persistHistory();
      try {
        var logs = JSON.parse(localStorage.getItem(LS_LOGS) || "[]");
        for (var i = 0; i < logs.length; i++) {
          if (logs[i].id === lastLogId) {
            logs[i].a = reply.slice(0, 2000);
            logs[i].latencyMs = Date.now() - startedAt;
            logs[i].fallback = !!isFallback;
            logs[i].streaming = false;
            break;
          }
        }
        localStorage.setItem(LS_LOGS, JSON.stringify(logs));
      } catch (e) {}
    }

    // —— 会话持久化（刷新不丢失）——
    function persistHistory() {
      try { localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(-HISTORY_KEEP * 2))); } catch (e) {}
    }
    function restoreHistory() {
      try {
        var saved = JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
        if (!saved.length) return;
        saved.forEach(function (m) {
          var el = addMsg(m.role === "assistant" ? "ai" : "user", m.role === "assistant" ? renderReplyWithCitations(m.content) : esc(m.content));
          if (m.role === "assistant") attachActionBar(el, m.content, false);
        });
        history = saved;
      } catch (e) {}
    }
    restoreHistory();

    function send() {
      var text = input.value.trim();
      if (!text) return;
      addMsg("user", esc(text));
      input.value = "";
      input.style.height = "auto";
      answer(text, false);
    }

    form.addEventListener("submit", function (e) { e.preventDefault(); send(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    document.querySelectorAll(".qa-suggest .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        input.value = c.getAttribute("data-q") || c.textContent;
        send();
      });
    });

    // 清空对话
    var clearBtn = document.getElementById("clearChatBtn");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      history = [];
      localStorage.removeItem(LS_HISTORY);
      var msgs = chat.querySelectorAll(".msg");
      for (var i = 1; i < msgs.length; i++) msgs[i].parentNode.removeChild(msgs[i]);
      showToast("对话已清空");
    });

    // 语音输入（浏览器原生 Web Speech API，不支持时隐藏按钮）
    var voiceBtn = document.getElementById("voiceBtn");
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR && voiceBtn) voiceBtn.style.display = "none";
    if (SR && voiceBtn) {
      var recog = new SR();
      recog.lang = "zh-CN";
      recog.interimResults = false;
      var listening = false;
      voiceBtn.addEventListener("click", function () {
        if (listening) { recog.stop(); return; }
        try { recog.start(); listening = true; voiceBtn.classList.add("listening"); voiceBtn.textContent = "●"; } catch (e) {}
      });
      recog.onresult = function (ev) {
        var said = ev.results[0][0].transcript;
        input.value = said;
        input.focus();
      };
      recog.onend = function () { listening = false; voiceBtn.classList.remove("listening"); voiceBtn.textContent = "🎤"; };
      recog.onerror = function () { listening = false; voiceBtn.classList.remove("listening"); voiceBtn.textContent = "🎤"; };
    }
  }

  /* ---------- 豆包 API Key 配置弹窗 ---------- */
  function initDoubaoConfig() {
    var modal = document.getElementById("configModal");
    var input = document.getElementById("doubaoKeyInput");
    var saveBtn = document.getElementById("saveConfigBtn");
    var statusEl = document.getElementById("configStatus");
    if (!modal || !input || !saveBtn) return;

    function refreshStatus() {
      var key = localStorage.getItem("doubao_api_key") || "";
      if (statusEl) {
        if (key) {
          statusEl.textContent = "当前使用自定义 Key：" + key.slice(0, 12) + "…" + key.slice(-4);
          statusEl.style.color = "var(--success, #2a9d5c)";
        } else {
          statusEl.textContent = "当前使用内置默认 Key（可在下方替换为自己的 Key）";
          statusEl.style.color = "var(--muted)";
        }
      }
      input.value = key || "";
    }

    // 打开弹窗时回填当前 Key
    document.addEventListener("click", function (e) {
      var trigger = e.target.closest('[data-modal="configModal"]');
      if (trigger) refreshStatus();
    });

    saveBtn.addEventListener("click", function () {
      var val = input.value.trim();
      if (!val) {
        localStorage.removeItem("doubao_api_key");
        if (statusEl) { statusEl.textContent = "已清除 API Key"; statusEl.style.color = "var(--muted)"; }
      } else if (val.indexOf("ark-") !== 0) {
        if (statusEl) { statusEl.textContent = "API Key 格式不正确，应以 ark- 开头"; statusEl.style.color = "var(--danger, #d9534f)"; }
        return;
      } else {
        localStorage.setItem("doubao_api_key", val);
        if (statusEl) { statusEl.textContent = "保存成功！可以关闭弹窗开始提问。"; statusEl.style.color = "var(--success, #2a9d5c)"; }
      }
    });
  }

  /* ---------- 启动 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initActiveNav();
    initModals();
    initLabReader();
    initAdmin();
    initImmuneHotspots();
    initModelViewer();
    initQA();
    initDoubaoConfig();
  });

  // 暴露给内联调用（如发送按钮跳转）
  window.FYZD = {
    openModal: openModal,
    closeModal: closeModal,
    showToast: showToast
  };
})();
