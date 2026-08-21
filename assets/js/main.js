/* =========================================================
   风语智答 — 共享交互脚本（原生 JS，无依赖）
   功能：移动端导航、当前页高亮、弹窗开关、化验单状态切换、
        免疫机制热区、CSV 导出 Toast、拒答跳转
   ========================================================= */
(function () {
  "use strict";

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
    // 打开：任何带 data-modal 的元素
    document.querySelectorAll("[data-modal]").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.preventDefault();
        openModal(trigger.getAttribute("data-modal"));
      });
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

  /* ---------- 4. 化验单上传状态切换（页 2） ---------- */
  function initLabUpload() {
    var btn = document.getElementById("uploadBtn");
    var state1 = document.getElementById("uploadState");
    var state2 = document.getElementById("reportState");
    if (!btn || !state1 || !state2) return;
    var card = document.getElementById("uploadCard");
    var trigger = function () {
      state1.hidden = true;
      state2.hidden = false;
      state2.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    btn.addEventListener("click", trigger);
    if (card) {
      card.addEventListener("click", function (e) {
        if (e.target === btn) return; // 避免重复触发
        trigger();
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trigger(); }
      });
    }
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

  /* ---------- 启动 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initActiveNav();
    initModals();
    initLabUpload();
    initExportCsv();
    initImmuneHotspots();
    initModelViewer();
  });

  // 暴露给内联调用（如发送按钮跳转）
  window.FYZD = {
    openModal: openModal,
    closeModal: closeModal,
    showToast: showToast
  };
})();
