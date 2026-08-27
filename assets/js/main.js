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
    if (!btn || !fileInput || !state1 || !state2) return;

    var cfg = window.DOUBAO_CONFIG || {};
    var busy = false;

    // 从模型输出中稳健提取 JSON（兼容 markdown 代码围栏、前后多余文字）
    function extractJSON(text) {
      if (!text) return null;
      // 尝试直接解析
      try { return JSON.parse(text); } catch (e) {}
      // 去除 ```json ... ``` 围栏
      var m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
      // 提取第一个 { 到最后一个 }
      var start = text.indexOf("{");
      var end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
      }
      return null;
    }

    // 前端直连豆包视觉大模型解读化验单
    function callVisionModel(dataUrl) {
      var apiKey = localStorage.getItem("doubao_api_key") || (cfg.defaultKeyB64 ? atob(cfg.defaultKeyB64) : "");
      var systemPrompt =
        "你是风湿免疫病化验单解读助手。请仔细识别图片中的所有检验指标，返回严格的JSON格式，不要输出任何其他文字。" +
        "JSON格式：{\"metrics\":[{\"name\":\"指标全称\",\"value\":\"检测值含单位\",\"range\":\"参考范围\",\"status\":\"high或low或normal或unknown\",\"note\":\"该指标异常的简要科普说明，正常则留空\"}],\"summary\":\"整体情况的一句话总结\",\"disclaimer\":\"本解读仅供科普参考，不能替代医师面诊与诊断。\"}" +
        "status判断：高于参考范围为high，低于为low，在范围内为normal，无法判断为unknown。只识别图片中实际存在的指标，不要编造。";
      return fetch(cfg.apiUrl || "https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: cfg.visionModel || "doubao-1-5-vision-pro-32k-250115",
          temperature: 0.1,
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "请解读这张化验单，返回JSON。" },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
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
      if (!metrics.length) {
        metricsEl.innerHTML =
          '<div class="metric"><div class="note">未能从图片中识别出明确指标，建议上传清晰、完整的化验单，或咨询专科医师。</div></div>';
      } else {
        metricsEl.innerHTML = metrics.map(function (m) {
          var cls = statusClassOf(m.status);
          var val = esc(m.value || "") + " " + statusTextOf(m.status);
          var range = m.range ? "参考范围：" + esc(m.range) : "";
          return '<div class="metric">' +
            '<div class="row"><span class="name">' + esc(m.name || "指标") + '</span>' +
            '<span class="val ' + cls + '">' + val + '</span></div>' +
            (range ? '<div class="range">' + range + '</div>' : '') +
            '<div class="note">' + esc(m.note || "") + '</div>' +
            '</div>';
        }).join("");
      }
      if (disclaimerEl) {
        disclaimerEl.textContent =
          (data && data.disclaimer) || "本解读仅供科普参考，不能替代医师面诊与诊断。";
      }
      if (titleEl) titleEl.textContent = "指标解读";
    }

    // 客户端压缩：限制最长边，减少上传体积与视觉模型成本
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
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error("图片读取失败"));
        };
        img.src = url;
      });
    }

    function handleFile(file) {
      if (!file) return;
      if (!/^image\//.test(file.type)) { setStatus("请选择图片文件（JPG / PNG）", "error"); return; }
      if (busy) return;
      busy = true;
      setStatus("正在分析化验单…");
      showReport();
      if (preview) { preview.src = URL.createObjectURL(file); preview.hidden = false; }
      if (placeholder) placeholder.hidden = true;
      if (titleEl) titleEl.textContent = "指标解读（分析中…）";

      fileToResizedDataURL(file, 1280, 0.85)
        .then(function (dataUrl) {
          return callVisionModel(dataUrl);
        })
        .then(function (data) { setStatus(""); renderMetrics(data); })
        .catch(function (err) {
          // 静默演示模式：视觉模型不可用时不弹错误，直接展示演示解读
          if (titleEl) titleEl.textContent = "指标解读（演示示例）";
          setStatus("演示模式：AI 解读服务暂不可用，以上为示例解读，仅供参考。", "demo");
        })
        .then(function () { busy = false; });
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
      fileInput.value = ""; // 允许重复选择同一文件
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

    /* —— 拉取数据并首次渲染 —— */
    fetch("assets/data/admin.json")
      .then(function (r) { return r.json(); })
      .then(function (d) { DATA = d; renderAll(); })
      .catch(function () {
        kbBody.innerHTML = '<tr><td colspan="6" style="color:var(--danger);">知识库数据加载失败，请刷新重试。</td></tr>';
        showToast("数据加载失败");
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
    var pending = false;

    fetch("assets/data/qa.json")
      .then(function (r) { return r.json(); })
      .then(function (d) { DATA = d; })
      .catch(function () {
        DATA = { fallback: "科普知识库加载失败，请刷新页面后重试。", pairs: [] };
      });

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
      return s.toLowerCase().replace(/[\s\p{P}]/gu, "");
    }

    // 红线问题优先拦截：命中则返回拒答文案（不进入科普匹配）
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

    // 豆包大模型系统提示词（精简版，含强制引用标注规则）
    var DOUBAO_SYSTEM_PROMPT =
      "你是风语智答风湿免疫病科普助手。仅做健康科普，不诊断、不开药、不给剂量、不建议停药。遇诊断/用药/急症请求，礼貌拒绝并建议就医。回答通俗易懂，纯文本，段落空行分隔。" +
      "【引用标注强制要求】每个涉及疾病知识的段落末尾必须标注来源编号，用方括号包裹，如[1]、[2]、[3]，不得遗漏。来源对应：[1]《类风湿关节炎诊疗指南（科普版）》中华医学会风湿病学分会；[2]《自身抗体检测临床意义专家共识》；[3]患者教育手册：读懂化验单。通用知识标注最相关的来源。" +
      "末尾附：以上内容仅为科普参考，不能替代医师面诊，具体诊疗请遵医嘱。";

    // 等待期间轮播的科普小知识
    var FUN_FACTS = [
      "类风湿关节炎患者中约 70%-80% 会出现类风湿因子升高",
      "晨僵持续超过 30 分钟是类风湿关节炎的典型表现之一",
      "系统性红斑狼疮因面颊部蝶形红斑而得名，形似蝴蝶",
      "痛风最常发作于大脚趾第一跖趾关节，红肿热痛剧烈",
      "干燥综合征患者常需反复饮水，部分人吃干粮需用水送服",
      "强直性脊柱炎多见于年轻男性，腰背痛夜间加重、活动后缓解",
      "人体免疫系统有时会\"认错人\"攻击自身组织，这就是自身免疫病",
      "高尿酸血症患者中只有约 10% 会发展为痛风",
      "规范使用激素能快速控制炎症，自行停药可能导致病情反跳",
      "风湿免疫病患者补钙和维生素D有助于预防激素相关骨质疏松",
    ];

    // 把回答中的 [1][2][3] 渲染为可点击的引用按钮
    function renderReplyWithCitations(text) {
      var html = esc(text).replace(/\n/g, "<br>");
      html = html.replace(/\[(\d+)\]/g, function (match, num) {
        return (
          '<button type="button" class="cite" data-modal="sourceModal" aria-haspopup="dialog">[' +
          num +
          "]</button>"
        );
      });
      return html;
    }

    // 渲染本地规则匹配的兜底回答（API 不可用时使用）
    function renderFallback(typing, text) {
      var res = findAnswer(text);
      typing.querySelector(".bubble").innerHTML = esc(res.a) + citeHTML(res.src);
    }

    function answer(text) {
      if (pending) return;
      pending = true;

      // 先做红线拦截：命中则渲染「安全提示」拒答气泡（不调用大模型）
      var refused = matchRedline(text);
      if (refused) {
        var typingR = addMsg("ai", "正在判断提问是否可以回答…");
        typingR.classList.add("refused");
        setTimeout(function () {
          typingR.querySelector(".bubble").innerHTML =
            '<span class="refuse-tag">安全提示</span>' + esc(refused);
          pending = false;
        }, 320);
        return;
      }

      var typing = addMsg("ai", "正在思考…");
      var cfg = window.DOUBAO_CONFIG || {};
      // 优先用用户自定义 Key，否则用内置的 base64 编码默认 Key
      var apiKey = localStorage.getItem("doubao_api_key") || (cfg.defaultKeyB64 ? atob(cfg.defaultKeyB64) : "");

      var bubble = typing.querySelector(".bubble");

      // —— 等待期间轮播科普小知识 ——
      var factEl = document.createElement("span");
      factEl.style.cssText = "display:block;color:var(--muted);font-size:13px;margin-top:8px;";
      bubble.appendChild(factEl);
      var factIdx = Math.floor(Math.random() * FUN_FACTS.length);
      factEl.textContent = "💡 " + FUN_FACTS[factIdx];
      var factTimer = setInterval(function () {
        factIdx = (factIdx + 1) % FUN_FACTS.length;
        factEl.textContent = "💡 " + FUN_FACTS[factIdx];
      }, 2800);
      var factCleared = false;
      function clearFact() {
        if (factCleared) return;
        factCleared = true;
        clearInterval(factTimer);
        if (factEl && factEl.parentNode) factEl.parentNode.removeChild(factEl);
      }

      // 直接调用豆包大模型 API（流式输出，逐字显示减少等待感）；失败则降级到本地规则科普库
      fetch(cfg.apiUrl || "https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: cfg.model || "",
          temperature: 0.3,
          stream: true,
          messages: [
            { role: "system", content: DOUBAO_SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
        }),
      })
        .then(function (response) {
          if (!response.ok) throw new Error("服务异常 " + response.status);
          if (!response.body) throw new Error("不支持流式响应");

          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = "";
          var fullReply = "";

          function readChunk() {
            reader.read().then(function (chunk) {
              if (chunk.done) {
                clearFact();
                pending = false;
                if (!fullReply) renderFallback(typing, text);
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
                  var delta =
                    json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
                  if (delta) {
                    clearFact();
                    fullReply += delta;
                    bubble.innerHTML = renderReplyWithCitations(fullReply);
                  }
                } catch (e) { /* 忽略单条解析错误 */ }
              });

              readChunk();
            }).catch(function () {
              clearFact();
              if (!fullReply) renderFallback(typing, text);
              pending = false;
            });
          }
          readChunk();
        })
        .catch(function () {
          // 静默降级：网络异常 / 密钥错误 / 调用失败时，回退本地规则匹配
          clearFact();
          renderFallback(typing, text);
          pending = false;
        });
    }

    function send() {
      var text = input.value.trim();
      if (!text) return;
      addMsg("user", esc(text));
      input.value = "";
      input.style.height = "auto";
      answer(text);
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
