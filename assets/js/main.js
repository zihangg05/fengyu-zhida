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

    var API_URL = window.LAB_API_URL || "/api/interpret";
    var busy = false;

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
          return fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: dataUrl }),
          });
        })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) throw new Error(j.error || ("服务异常 " + r.status));
            return j;
          });
        })
        .then(function (data) { setStatus(""); renderMetrics(data); })
        .catch(function (err) {
          if (titleEl) titleEl.textContent = "指标解读（演示示例）";
          var msg = err && err.message ? err.message : "未知错误";
          if (/Failed to fetch|NetworkError|Load failed|网络/i.test(msg)) {
            // 多为后端未部署 / LAB_API_URL 未指向可用服务 / 跨域被拦
            setStatus(
              "AI 解读后端暂不可达（LAB_API_URL 未指向可用服务，或后端尚未部署）。已显示演示示例，部署后端并刷新后重试。",
              "error"
            );
          } else {
            setStatus("AI 解读暂不可用：" + msg + "。已显示演示示例，请稍后重试。", "error");
          }
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
  function initExportCsv() {
    var btn = document.getElementById("exportCsv");
    if (!btn) return;
    btn.addEventListener("click", function () {
      showToast("日志导出成功，CSV 文件已生成");
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

    function answer(text) {
      if (pending) return;
      pending = true;

      // 先做红线拦截：命中则渲染「安全提示」拒答气泡
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

      var typing = addMsg("ai", "正在查询科普资料…");
      setTimeout(function () {
        var res = findAnswer(text);
        typing.querySelector(".bubble").innerHTML = esc(res.a) + citeHTML(res.src);
        pending = false;
      }, 360);
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

  /* ---------- 启动 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initActiveNav();
    initModals();
    initLabReader();
    initExportCsv();
    initImmuneHotspots();
    initModelViewer();
    initQA();
  });

  // 暴露给内联调用（如发送按钮跳转）
  window.FYZD = {
    openModal: openModal,
    closeModal: closeModal,
    showToast: showToast
  };
})();
