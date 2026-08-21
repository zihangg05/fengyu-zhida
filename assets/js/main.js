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

  /* ---------- 启动 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initActiveNav();
    initModals();
    initLabUpload();
    initExportCsv();
  });

  // 暴露给内联调用（如发送按钮跳转）
  window.FYZD = {
    openModal: openModal,
    closeModal: closeModal,
    showToast: showToast
  };
})();
