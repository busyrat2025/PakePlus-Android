window.addEventListener("DOMContentLoaded",()=>{const t=document.createElement("script");t.src="https://www.googletagmanager.com/gtag/js?id=G-W5GKHM0893",t.async=!0,document.head.appendChild(t);const n=document.createElement("script");n.textContent="window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-W5GKHM0893');",document.body.appendChild(n)});/*!
 * Pake Userscript Loader — 注入式 Userscript 管理器
 * 构建时间：2026-11-25T14:58:12.438Z
 * 说明：本文件由 esbuild 打包，供 PakePlus custom_js 注入使用。
 */
"use strict";
(() => {
  // src/storage.ts
  var DB_NAME = "pake-userscript-loader";
  var DB_VERSION = 1;
  var DB_STORE = "kv";
  var LS_PREFIX = "__pake_kv__:";
  var GM_PREFIX = "__pake_gm__:";
  var dbPromise = null;
  var idbBroken = false;
  function openDb() {
    if (idbBroken) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      let settled = false;
      const done = (db) => {
        if (settled) return;
        settled = true;
        if (!db) idbBroken = true;
        resolve(db);
      };
      const timer = setTimeout(() => done(null), 3e3);
      try {
        if (typeof indexedDB === "undefined" || !indexedDB) {
          clearTimeout(timer);
          done(null);
          return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = () => {
          clearTimeout(timer);
          done(req.result);
        };
        req.onerror = () => {
          clearTimeout(timer);
          done(null);
        };
        req.onblocked = () => {
          clearTimeout(timer);
          done(null);
        };
      } catch {
        clearTimeout(timer);
        done(null);
      }
    });
    return dbPromise;
  }
  function lsGet(key) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw == null ? void 0 : JSON.parse(raw);
    } catch {
      return void 0;
    }
  }
  function lsSet(key, value) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch {
    }
  }
  async function kvGet(key) {
    const db = await openDb();
    if (!db) return lsGet(key);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(lsGet(key));
      } catch {
        resolve(lsGet(key));
      }
    });
  }
  async function kvSet(key, value) {
    const db = await openDb();
    if (!db) {
      lsSet(key, value);
      return;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          lsSet(key, value);
          resolve();
        };
        tx.onabort = () => {
          lsSet(key, value);
          resolve();
        };
      } catch {
        lsSet(key, value);
        resolve();
      }
    });
  }
  function gmKey(scriptId, key) {
    return GM_PREFIX + scriptId + ":" + key;
  }
  var memoryStore = /* @__PURE__ */ new Map();
  function gmGet(scriptId, key, fallback) {
    const full = gmKey(scriptId, key);
    if (memoryStore.has(full)) return memoryStore.get(full);
    try {
      const raw = localStorage.getItem(full);
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && "v" in parsed ? parsed.v : fallback;
    } catch {
      return fallback;
    }
  }
  function gmSet(scriptId, key, value) {
    const full = gmKey(scriptId, key);
    memoryStore.set(full, value);
    try {
      localStorage.setItem(full, JSON.stringify({ v: value }));
    } catch {
    }
  }
  function gmDelete(scriptId, key) {
    const full = gmKey(scriptId, key);
    memoryStore.delete(full);
    try {
      localStorage.removeItem(full);
    } catch {
    }
  }
  function gmListKeys(scriptId) {
    const prefix = GM_PREFIX + scriptId + ":";
    const out = /* @__PURE__ */ new Set();
    for (const full of memoryStore.keys()) {
      if (full.startsWith(prefix)) out.add(full.slice(prefix.length));
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const full = localStorage.key(i);
        if (full && full.startsWith(prefix)) out.add(full.slice(prefix.length));
      }
    } catch {
    }
    return [...out];
  }
  function gmClearScript(scriptId) {
    const keys = gmListKeys(scriptId);
    for (const k of keys) gmDelete(scriptId, k);
    return keys.length;
  }

  // src/config.ts
  var CONFIG_KEY = "config";
  var DEFAULT_CONFIG = {
    // 留空表示只用内嵌脚本。填了以后才会去请求远程 Manifest。
    manifestUrl: "",
    channel: "stable",
    autoUpdate: false,
    updateIntervalHours: 24,
    enabled: true,
    showFab: true,
    // 字幕脚本要访问第三方字幕站，多数站点不给 CORS 头。
    // 留空 = 直连；填了模板（含 {url}）后，直连失败会自动改走中继。
    corsProxy: "",
    verifySignature: false
  };
  function normalizeConfig(raw) {
    const v = raw && typeof raw === "object" ? raw : {};
    const str = (x, fallback) => typeof x === "string" ? x.trim() : fallback;
    const bool = (x, fallback) => typeof x === "boolean" ? x : fallback;
    const num = (x, fallback, min, max) => {
      const n = Number(x);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    const channel = v.channel === "beta" ? "beta" : "stable";
    return {
      manifestUrl: str(v.manifestUrl, DEFAULT_CONFIG.manifestUrl),
      channel,
      autoUpdate: bool(v.autoUpdate, DEFAULT_CONFIG.autoUpdate),
      updateIntervalHours: num(v.updateIntervalHours, DEFAULT_CONFIG.updateIntervalHours, 1, 720),
      enabled: bool(v.enabled, DEFAULT_CONFIG.enabled),
      showFab: bool(v.showFab, DEFAULT_CONFIG.showFab),
      corsProxy: str(v.corsProxy, DEFAULT_CONFIG.corsProxy),
      verifySignature: bool(v.verifySignature, DEFAULT_CONFIG.verifySignature)
    };
  }
  async function loadConfig() {
    const stored = await kvGet(CONFIG_KEY);
    return normalizeConfig(stored);
  }
  async function saveConfig(config) {
    const normalized = normalizeConfig(config);
    await kvSet(CONFIG_KEY, normalized);
    return normalized;
  }
  function isAcceptableManifestUrl(url) {
    if (!url) return true;
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }

  // src/generated-builtins.ts
  var BUILTIN_SCRIPTS = [
    {
      id: "magnet-longpress-speed",
      fileName: "missav-longpress-speed.user.js",
      source: '// ==UserScript==\n// @name         MissAV 长按倍速快进（2×/3×/4×/5×）\n// @namespace    magnet-longpress-speed\n// @version      1.6.0\n// @description  全站通用：任意含 <video> 的网页可长按画面倍速 2×/3×/4×/5×（圆弧盘可放左/右、滑动切档、松手还原），右滑快进 / 左滑倒退 10 秒 ~ 5 分钟。没视频的页面不弹任何 UI。兼容手机 touch / iframe 播放器，带诊断面板。不接触视频流。\n// @author       magnet\n// @match        *://missav.ai/*\n// @match        *://*.missav.ai/*\n// @match        *://missav.ws/*\n// @match        *://*.missav.ws/*\n// @match        *://missav.com/*\n// @match        *://*.missav.com/*\n// @match        *://*/*\n// @allFrames\n// @grant        GM_setValue\n// @grant        GM_getValue\n// @grant        GM_registerMenuCommand\n// @run-at       document-idle\n// ==/UserScript==\n\n/*\n * 独立脚本，只做画面上的手势（长按倍速 / 右滑快进 / 左滑倒退）。可与「网页视频外挂字幕」\n * 脚本同时安装：两者用不同的 class 前缀（mvspeed- / mvsub-）、不同的 GM 存储键、\n * UI 一个在左下一个在右下，互不干扰。不需要跑 magnet 服务端，不发任何网络请求。\n *\n * 安装：Tampermonkey / Violentmonkey → 新建脚本 → 粘贴本文件 → 保存。\n *\n * 用法：\n *   按住视频画面约 0.22 秒 → 半透明圆弧倍速盘从一侧滑入（默认右侧，面板里可改左侧），\n *   当前档位大字高亮；手指不松就一直快进（没有固定时长上限），上下滑动只改档位、\n *   绝不中断加速；在盘里上下滑动到哪个刻度就实时切到哪一档（2× / 3× / 4× / 5×），\n *   在画面区仍是上滑升档 / 下滑降档（每 45px 一档）。松手立刻恢复按下前的速度。\n *   在画面上快速「右滑 / 左滑」（横向位移为主、超过 24px）→ 半透明玻璃快进卡片，\n *   右滑快进、左滑倒退；滑得越远跳得越多，跨度 10 秒 ~ 5 分钟，松手才真正跳转；\n *   滑动时实时显示「⏩ +01:30 / 02:15 → 03:45」或「⏪ −01:30 / 02:15 → 00:45」，\n *   滑回起点再松手则取消。跨度按指数曲线分布，短滑能精细控制，滑满约 75% 屏宽到 5 分钟。\n *   长按倍速与横滑快进互斥：先长按就只倍速调档；方向在触发那一刻锁定，中途滑回不会反向。\n *   可勾「按越久越快」自动逐档升到 5×。\n *   Alt+1 开关手势 · Alt+2/3/4/5 直接切档 · Alt+6 切换加速盘左/右；油猴菜单里也有开关。\n *\n * 1.6.0：全站通用。去掉 siteOk() 的 missav 域名硬闸门，改成「页面里真的出现 <video>\n * 才激活」的延迟启动——通配 @match 在任意网站都会注入，所以顶层无视频页面绝不建面板、\n * 不挂菜单、不挂手势监听、不起 MutationObserver，只留一个 2.5s 的低频探测；视频常是\n * 点播放后才异步插入的，探测到就补齐整套运行时。iframe 沿用 owner 认领避免重复注入。\n * missav 上的行为完全不变，@name 刻意不改（改了油猴会当成新脚本重复安装）。\n *\n * 1.5.1：修复全屏时倍速盘上的锁按钮漏显示——圆盘隐藏靠 translateX(105%)，百分比位移\n * 相对圆盘自身宽度计算，而圆盘宽高只在第一次长按时才赋值，从未长按过时它是 0×0、\n * 位移量为 0，绝对定位的锁按钮就从全屏元素的静态位置（往往在画面上方中间）漏了出来，\n * 长按一次后圆盘有了尺寸才跟着滑出屏幕。现在圆盘隐藏一律加 visibility:hidden 兜底，\n * 与几何无关。另外按需求整体移除「锁速」功能（🔓 按钮 / Alt+L / 面板勾选 / 守护定时器），\n * 松手一律恢复原速。\n *\n * 1.5.0：快进/倒退预览卡片改成与圆弧盘同系的半透明玻璃（浅色渐变 + backdrop blur +\n * 柔和内发光），不再是深色实心卡片；新增左滑倒退（−10 秒 ~ −5 分钟，可单独关闭）；\n * 圆弧倍速盘的左 / 右位置做成配置项（面板下拉、Alt+6、油猴菜单），左侧时圆弧、\n * 刻度线、高亮条、圆点、锁按钮、大字全部镜像。\n *\n * 1.4.0：横滑快进用「按下那一刻的 currentTime + 位移量」作为绝对目标时间，而不是\n * 在当前时间上累加——即使播放器自己也在拖进度条，最终也只跳一次、不会叠加两份。\n *\n * 1.2.0 UI：参考常见短视频播放器的长按快进面板——大圆弧玻璃刻度盘从侧边滑入，\n * 竖排档位各带一条横向刻度线，选中档位用大字「4X 快进 ▶▶」+ 贯穿高亮横条 +\n * 圆点滑块指示，外侧是锁按钮。所有样式内联，跨域 iframe 里也不会掉样式。\n *\n * 真机（手机）适配要点 —— 1.1.0 修复：\n *   1. 同时监听 pointer / touch / mouse 三套事件并归一化。手机上 <video> 经常被原生\n *      播放器或 WebView 接管，只监听 pointerdown 会完全收不到按下。\n *   2. 待判定阶段的手抖容差从 10px 放宽到 24px，避免手指按住时轻微移动就取消长按。\n *   3. 播放器盖在视频上的「整屏点击层」按面积判定为画面，不再因 class 里带\n *      control/btn/panel 就被误当成控件排除。\n *   4. 长按期间定时复查 playbackRate：部分 HLS 内核 / 播放器会把速度重置回 1×。\n *   5. @allFrames + 通配 @match 覆盖任意站点与第三方域的播放器 iframe；脚本只在\n *      含 <video> 的页面 / frame 里真正激活，普通网页连面板、菜单、手势监听都不挂。\n *   6. 面板状态栏实时显示诊断：是否找到 video、尺寸、收到过哪些按下事件、\n *      长按成功次数、最近一次被忽略的原因。真机没反应时打开左下角 ⏩ 面板看一眼\n *      就知道卡在哪一步，点「复制诊断」可把文本发出来。\n *\n * 为什么长按不会挡住播放器：热区层是 pointer-events:none，手势由 video 所在\n * document 的捕获监听按坐标判定，短按、进度条、全屏按钮等照常归播放器。底部\n * 控制栏区域、明确的按钮/滑块不触发手势；横向主导的右滑 / 左滑交给本脚本的\n * 快进 / 倒退预览，若播放器自带滑动 seek 可在面板里分别关掉。两次手势结束后\n * 都会吃掉紧跟着的那一次 click，避免误暂停。\n *\n * 边界：只找页面里的 <video>，长按期间临时调 <video>.playbackRate 并在松手时\n * 还原；横滑松手时只写一次 <video>.currentTime；不抓取、转发或修改任何视频流，\n * 不改播放器逻辑，不注入上游 HTML。\n * 退出路径做全了：pointercancel / touchcancel（只让这一套事件失效，不等于抬手）/\n * 失焦 / 切标签 / 切集换 video；60s 是巡检周期，手指还按着就自动续期。\n *\n * iOS 原生全屏播放下浏览器不允许 DOM 层盖在画面上，此时 HUD 不可见，但横滑快进/倒退\n * 仍然生效；若该原生播放器忽略 playbackRate，倍速无法生效（用网页全屏代替）。\n */\n\n(function () {\n  "use strict";\n\n  // ---------------------------------------------------------------------------\n  // 常量与纯函数（node 里 require 本文件可拿到 PURE 做离线自测）\n  // ---------------------------------------------------------------------------\n\n  const CONFIG_KEY = "mvspeed_config_v1";\n  const FRAME_DIAG_KEY = "mvspeed_frame_diag_v1";\n  const STEPS = [2, 3, 4, 5];\n  const DEFAULTS = {\n    enabled: true,\n    rate: 3,\n    delay: 220,       // 按下多久算长按；短于此一律当作播放器自己的点击\n    ramp: false,      // 可选：按得越久越快，自动逐档升到 5×\n    rampMs: 1800,\n    dragPx: 45,       // 上滑多少像素升一档\n    swipeSeek: true,  // 画面右滑快进\n    swipeBack: true,  // 画面左滑倒退（与右滑分开控制，播放器自带手势时可单独关）\n    dockSide: "right", // 圆弧倍速盘贴视频左缘还是右缘\n  };\n  const MAX_HOLD_MS = 60_000; // 巡检周期：只要还有手指按着就续期，不是长按上限\n  const HOLD_HARD_CAP_MS = 600_000; // 完全丢失抬起事件时的绝对兜底（10 分钟）\n  const CANCEL_GRACE_MS = 1000; // cancel 后等另一套事件接管的宽限期\n  const MOVE_TOLERANCE = 24;  // 待判定阶段允许的手抖（手机触摸必有轻微位移）\n  const SEEK_MIN = 10;          // 右滑刚触发时的最小快进秒数\n  const SEEK_MAX = 300;          // 5 分钟：滑满全程时的最大快进秒数\n  const SEEK_FULL_RATIO = 0.75;  // 滑过视频宽度的 75% 到达 5 分钟\n  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));\n\n  function clampRate(rate) {\n    // 缺值要回落默认 3×；不能让 Number(null)=0 把档位拖到 2×。\n    if (rate === null || rate === undefined || rate === "") return DEFAULTS.rate;\n    const n = Number(rate);\n    if (!Number.isFinite(n)) return DEFAULTS.rate;\n    return STEPS.reduce(\n      (best, step) => (Math.abs(step - n) < Math.abs(best - n) ? step : best),\n      STEPS[0],\n    );\n  }\n\n  function normalizeConfig(raw) {\n    const v = raw && typeof raw === "object" ? raw : {};\n    const num = (x, fallback) => {\n      const n = Number(x);\n      return Number.isFinite(n) && n > 0 ? n : fallback;\n    };\n    return {\n      enabled: v.enabled !== false,\n      rate: clampRate(v.rate),\n      delay: clamp(num(v.delay, DEFAULTS.delay), 80, 900),\n      ramp: v.ramp === true,\n      rampMs: clamp(num(v.rampMs, DEFAULTS.rampMs), 600, 8000),\n      dragPx: clamp(num(v.dragPx, DEFAULTS.dragPx), 20, 140),\n      swipeSeek: v.swipeSeek !== false,\n      swipeBack: v.swipeBack !== false,\n      dockSide: normalizeDockSide(v.dockSide),\n    };\n  }\n\n  /** 加速盘只认 "left" / "right"，其它值（含旧配置缺项）一律回落右侧。 */\n  function normalizeDockSide(side) {\n    return side === "left" ? "left" : "right";\n  }\n\n  /** 按住时上滑升档、下滑降档：每 dragPx 像素一档，始终钳在 2×..5×。 */\n  function rateForDrag(baseRate, startY, currentY, dragPx) {\n    const px = Number(dragPx) > 0 ? Number(dragPx) : DEFAULTS.dragPx;\n    const from = STEPS.indexOf(clampRate(baseRate));\n    const delta = (Number(startY) - Number(currentY)) / px;\n    const moved = Number.isFinite(delta) ? Math.round(delta) : 0;\n    return STEPS[clamp(from + moved, 0, STEPS.length - 1)];\n  }\n\n  /**\n   * 按下点是否落在「画面热区」。\n   * 手机上视频窗口可能很小，底部保留区按 12% / 至少 36px 计算即可；\n   * 太保守会把整个可点区域吃掉，导致长按看起来完全没反应。\n   */\n  function hotZoneHit(rect, x, y, guardBottom) {\n    if (!rect) return false;\n    const w = Number(rect.width) || 0;\n    const h = Number(rect.height) || 0;\n    if (w < 40 || h < 24) return false;\n    const left = Number(rect.left) || 0;\n    const top = Number(rect.top) || 0;\n    const guard = Math.max(36, h * 0.12, Number(guardBottom) || 0);\n    return x >= left && x <= left + w && y >= top && y <= top + h - guard;\n  }\n\n  /** 明确的控件不该触发长按。只匹配控件词，不用 player 这种泛词。 */\n  function isUIElement(info) {\n    if (!info) return false;\n    if (info.isContentEditable) return true;\n    const tag = String(info.tagName || "").toUpperCase();\n    if (/^(BUTTON|INPUT|SELECT|TEXTAREA|A|OPTION|LABEL|SUMMARY|PROGRESS)$/.test(tag)) return true;\n    if (/^(button|slider|menuitem|checkbox|tab|link)$/.test(String(info.role || "").toLowerCase())) return true;\n    const cls = String(info.className || "").toLowerCase();\n    return /(?:^|[\\s_-])(?:control|controls|progress|toolbar|btn|button|menu|slider|seek|setting|panel|popup|modal|vjs-|xg-|plyr|artplayer)/.test(cls);\n  }\n\n  /**\n   * 播放器常把一个覆盖整屏的 div 盖在 video 上处理点击，class 里往往带 control /\n   * panel 这类词。只要它覆盖了视频大部分面积，就应当作「画面」而不是「控件」，\n   * 否则真机上热区永远命中不了。\n   */\n  function isOverlayLayer(target, videoRect, info) {\n    // 整屏的 BUTTON / role=slider 依然是真控件，不能靠面积洗白。\n    if (info) {\n      const tag = String(info.tagName || "").toUpperCase();\n      if (/^(BUTTON|INPUT|SELECT|TEXTAREA|A|OPTION|LABEL|SUMMARY|PROGRESS)$/.test(tag)) return false;\n      if (/^(button|slider|menuitem|checkbox|tab|link)$/.test(String(info.role || "").toLowerCase())) return false;\n    }\n    if (!target || !target.getBoundingClientRect || !videoRect) return false;\n    let r = null;\n    try { r = target.getBoundingClientRect(); } catch (_) { return false; }\n    if (!r || !r.width || !r.height) return false;\n    const vw = Number(videoRect.width) || 1;\n    const vh = Number(videoRect.height) || 1;\n    if (r.width < vw * 0.6 || r.height < vh * 0.6) return false;\n    const cover = (r.width * r.height) / (vw * vh);\n    return cover >= 0.55;\n  }\n\n  /** 把 pointer / touch / mouse 事件统一成 {x,y,id,source,target,raw}。 */\n  function normalizePoint(e, source) {\n    if (!e) return null;\n    let p = null;\n    let id = null;\n    if (source === "touch") {\n      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);\n      if (!t) return null;\n      p = { x: t.clientX, y: t.clientY };\n      id = t.identifier;\n    } else if (source === "pointer") {\n      p = { x: e.clientX, y: e.clientY };\n      id = e.pointerId;\n    } else {\n      p = { x: e.clientX, y: e.clientY };\n      id = "mouse";\n    }\n    if (!Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) return null;\n    return {\n      x: Number(p.x), y: Number(p.y),\n      id: id == null ? source : id,\n      source,\n      target: e.target,\n      raw: e,\n    };\n  }\n\n  // ---------------------------------------------------------------------------\n  // 圆弧倍速盘的几何：纯函数，node 里可直接断言；side = "right"(默认) / "left"\n  // ---------------------------------------------------------------------------\n\n  /** 贴着视频可视矩形一侧的一段，宽约 44%、最多 360px，太窄的窗口也不至于挤没。 */\n  function dockGeometry(rect, cap, side) {\n    const w = Number(rect && rect.width) || 0;\n    const h = Number(rect && rect.height) || 0;\n    if (w < 40 || h < 24) return null;\n    const maxW = Number(cap) > 0 ? Number(cap) : 360;\n    const width = clamp(Math.min(w * 0.44, maxW, w - 20), 110, maxW);\n    const s = normalizeDockSide(side);\n    return {\n      left: (Number(rect.left) || 0) + (s === "left" ? 0 : w - width),\n      top: Number(rect.top) || 0,\n      width,\n      height: h,\n      side: s,\n    };\n  }\n\n  /** 圆盘进出方向：右侧从右滑入 / 左侧从左滑入。 */\n  function dockSlide(side, visible) {\n    if (visible) return "translateX(0)";\n    return normalizeDockSide(side) === "left" ? "translateX(-105%)" : "translateX(105%)";\n  }\n\n  /** 大字层贴在圆弧凸起的那一侧；左侧时整体镜像到盘的右半边。 */\n  function dockHudLeft(geom, side) {\n    if (!geom) return 0;\n    return geom.left + geom.width * (normalizeDockSide(side) === "left" ? 0.44 : 0.07);\n  }\n\n  /** 刻度中心 Y：集中在圆弧盘中间 68% 高度，首尾档位落在两端。 */\n  function dockCenters(geom, count) {\n    const n = Number(count) || 0;\n    if (!geom || n < 2) return [];\n    const usable = geom.height * 0.68;\n    const start = geom.top + (geom.height - usable) / 2;\n    const gap = usable / (n - 1);\n    return Array.from({ length: n }, (_, i) => start + i * gap);\n  }\n\n  /** 手指在圆弧盘里上下滑动：取最近的刻度中心，实时决定倍速档。 */\n  function rateFromDockY(y, geom, steps) {\n    const list = Array.isArray(steps) && steps.length ? steps : STEPS;\n    const centers = dockCenters(geom, list.length);\n    if (!centers.length) return list[0];\n    const cy = Number(y);\n    if (!Number.isFinite(cy)) return list[0];\n    let best = list[0];\n    let bestD = Infinity;\n    for (let i = 0; i < centers.length; i++) {\n      const d = Math.abs(cy - centers[i]);\n      if (d < bestD) { bestD = d; best = list[i]; }\n    }\n    return best;\n  }\n\n  /** 圆点在选中横条上的横向位置（%），随档位走；左侧盘镜像。 */\n  function dockKnobLeft(index, count, side) {\n    const i = clamp(Number(index) || 0, 0, Math.max(0, (Number(count) || 4) - 1));\n    const total = Math.max(1, (Number(count) || 4) - 1);\n    const base = 18 + (i / total) * 63;\n    return normalizeDockSide(side) === "left" ? Math.round((100 - base) * 100) / 100 : base;\n  }\n\n  // ---------------------------------------------------------------------------\n  // 横滑快进 / 倒退：位移 → 秒数。用指数曲线而不是线性，短滑能精细到十几秒，\n  // 长滑才快速放大到 5 分钟，避免「稍微一滑就跳几分钟」。\n  // ---------------------------------------------------------------------------\n\n  /** 只有「横向主导 + 向右 + 超过容差」才算快进手势。 */\n  function isSwipeSeekGesture(dx, dy, tolerance) {\n    const x = Number(dx);\n    const y = Math.abs(Number(dy)) || 0;\n    const tol = Number(tolerance) > 0 ? Number(tolerance) : MOVE_TOLERANCE;\n    return Number.isFinite(x) && x > tol && x > y * 1.2;\n  }\n\n  /** 左滑倒退：同样是横向主导，但方向相反；不与右滑判定重叠。 */\n  function isSwipeBackGesture(dx, dy, tolerance) {\n    const x = Number(dx);\n    const y = Math.abs(Number(dy)) || 0;\n    const tol = Number(tolerance) > 0 ? Number(tolerance) : MOVE_TOLERANCE;\n    return Number.isFinite(x) && x < -tol && -x > y * 1.2;\n  }\n\n  /** 返回 0 表示「滑回起点，松手不跳」；否则返回 10..300 的整数秒。 */\n  function seekSeconds(dx, width, tolerance) {\n    const d = Number(dx);\n    const w = Number(width);\n    const tol = Number(tolerance) > 0 ? Number(tolerance) : MOVE_TOLERANCE;\n    if (!Number.isFinite(d) || !Number.isFinite(w) || w <= 0 || d <= tol) return 0;\n    const full = Math.max(60, w * SEEK_FULL_RATIO);\n    const t = clamp((d - tol) / full, 0, 1);\n    return Math.round(SEEK_MIN * Math.pow(SEEK_MAX / SEEK_MIN, t));\n  }\n\n  /** 带方向的位移 → 带方向的秒数：-300..-10 / 0 / 10..300。 */\n  function seekSignedSeconds(dx, width, tolerance) {\n    const d = Number(dx);\n    if (!Number.isFinite(d) || d === 0) return 0;\n    const sign = d < 0 ? -1 : 1;\n    return sign * seekSeconds(Math.abs(d), width, tolerance);\n  }\n\n  /** 秒 → mm:ss 或 h:mm:ss；不用 padStart，兼容老 WebView。 */\n  function formatClock(sec) {\n    const n = Math.max(0, Math.round(Number(sec) || 0));\n    const h = Math.floor(n / 3600);\n    const m = Math.floor((n % 3600) / 60);\n    const s = n % 60;\n    const pad = (x) => (x < 10 ? "0" : "") + x;\n    return (h > 0 ? h + ":" : "") + pad(m) + ":" + pad(s);\n  }\n\n  /** 目标时间 = 按下时刻 + 位移量（负数即倒退），并钳到时长内（直播流 duration 无效时不钳）。 */\n  function seekTargetTime(base, delta, duration) {\n    const b = Number(base) || 0;\n    const d = Number(delta) || 0;\n    const dur = Number(duration);\n    const target = Math.max(0, b + d);\n    return Number.isFinite(dur) && dur > 0\n      ? clamp(target, 0, Math.max(0, dur - 0.25))\n      : target;\n  }\n\n  const PURE = {\n    clampRate, normalizeConfig, normalizeDockSide, rateForDrag, hotZoneHit, isUIElement,\n    isOverlayLayer, normalizePoint, dockGeometry, dockSlide, dockHudLeft, dockCenters,\n    rateFromDockY, dockKnobLeft, STEPS, DEFAULTS, MOVE_TOLERANCE,\n    seekSeconds, seekSignedSeconds, formatClock, seekTargetTime,\n    isSwipeSeekGesture, isSwipeBackGesture,\n    SEEK_MIN, SEEK_MAX, SEEK_FULL_RATIO,\n  };\n\n  if (typeof window === "undefined") {\n    if (typeof module !== "undefined" && module.exports) module.exports = PURE;\n    return;\n  }\n\n  // ---------------------------------------------------------------------------\n  // 全站闸门：通配 @match 会注入任意网页，只有真的出现 <video> 才激活整套 UI。\n  // 不再按域名白名单判断，missav 只是众多站点里的普通一个。\n  // ---------------------------------------------------------------------------\n\n  function inFrame() {\n    try { return window.top !== window; } catch (_) { return true; }\n  }\n\n  const FRAME = inFrame();\n  const FRAME_TAG = "f" + Math.random().toString(36).slice(2, 9);\n  const OWNER_ATTR = "data-mvspeed-owner";\n  const SITE_HOST = (() => {\n    try { return String(location.hostname || ""); } catch (_) { return ""; }\n  })();\n\n  // ---------------------------------------------------------------------------\n  // 本机配置（GM 存储在同脚本的所有 frame 间共享）\n  // ---------------------------------------------------------------------------\n\n  function storeGet(key, fallback) {\n    try {\n      let raw = "";\n      if (typeof GM_getValue === "function") raw = GM_getValue(key, "");\n      else raw = localStorage.getItem(key) || "";\n      return raw ? JSON.parse(raw) : fallback;\n    } catch (_) {\n      return fallback;\n    }\n  }\n\n  function storeSet(key, value) {\n    try {\n      if (typeof GM_setValue === "function") GM_setValue(key, JSON.stringify(value));\n      else localStorage.setItem(key, JSON.stringify(value));\n    } catch (_) { /* 隐私模式 / 配额满：配置只是便利，不影响播放 */ }\n  }\n\n  const S = {\n    cfg: normalizeConfig(storeGet(CONFIG_KEY, {})),\n    video: null,\n    vdoc: null,\n    holding: false,\n    pending: false,\n    // 横滑快进 / 倒退手势：与长按互斥，按下后横向主导时接管。\n    // seekDir 在触发那一刻锁定（右滑 +1 / 左滑 -1），中途滑回起点只减少位移、不会反向。\n    seeking: false,\n    seekDelta: 0,\n    seekDir: 0,\n    seekBaseTime: 0,\n    primarySource: null,\n    // 每套事件是否还有手指按着。移动端一次按压会同时发 pointer + touch，\n    // 浏览器接管滚动时只发 pointercancel —— 那不代表手指抬起，绝不能立刻 endHold。\n    downSources: { pointer: false, touch: false, mouse: false },\n    primaryCancelled: false,\n    graceTimer: 0,\n    holdStartedAt: 0,\n    lastGestureAt: 0,\n    savedTouchStyles: [],\n    ignoreUntil: 0,\n    inputId: null,\n    restoreRate: 1,\n    baseRate: 3,\n    rate: 3,\n    startX: 0,\n    startY: 0,\n    userAdjusted: false,\n    suppressClick: false,\n    suppressTimer: 0,\n    timer: 0,\n    rampTimer: 0,\n    rateGuardTimer: 0,\n    placeTimer: 0,\n    maxTimer: 0,\n    scanTimer: 0,\n    seekConfirmTimer: 0,\n    boundDoc: null,\n    boundList: [],\n    hot: null,\n    hud: null,\n    hudDoc: null,\n    rateEl: null,\n    rateBig: null,\n    rateSmall: null,\n    hintEl: null,\n    stepEls: [],\n    // 右侧圆弧倍速盘\n    dock: null,\n    dockArc: null,\n    dockScale: null,\n    dockStepEls: [],\n    dockBand: null,\n    dockKnob: null,\n    // 右滑快进预览卡片\n    seekHud: null,\n    seekHudBig: null,\n    seekHudSub: null,\n    seekHudBar: null,\n    panel: null,\n    els: {},\n    diag: {\n      pointerdown: 0, touchstart: 0, mousedown: 0, holds: 0, cancels: 0,\n      seeks: 0, backSeeks: 0,\n      lastEvent: "", lastReject: "",\n    },\n  };\n\n  const DOWN_NAME = { pointer: "pointerdown", touch: "touchstart", mouse: "mousedown" };\n  const UP_NAME = { pointer: "pointerup", touch: "touchend", mouse: "mouseup" };\n\n  function bumpDiag(name) {\n    const d = S.diag;\n    d.lastEvent = name;\n    if (name === "pointerdown") d.pointerdown++;\n    else if (name === "touchstart") d.touchstart++;\n    else if (name === "mousedown") d.mousedown++;\n    else if (name === "hold") d.holds++;\n    else if (name === "swipeSeek") d.seeks++;\n    else if (name === "swipeBack") d.backSeeks++;\n    else if (/cancel$/.test(name)) d.cancels++;\n  }\n\n  // —— 手势来源管理：cancel 只让「这一套」事件失效，不等于抬手 ——\n  function clearDownSources() {\n    S.downSources = { pointer: false, touch: false, mouse: false };\n  }\n\n  function anyDownSource() {\n    return !!(S.downSources.pointer || S.downSources.touch || S.downSources.mouse);\n  }\n\n  function firstDownSource() {\n    for (const k of ["pointer", "touch", "mouse"]) if (S.downSources[k]) return k;\n    return null;\n  }\n\n  function noteGesture() {\n    S.lastGestureAt = Date.now();\n  }\n\n  function cancelGrace() {\n    window.clearTimeout(S.graceTimer);\n    S.graceTimer = 0;\n  }\n\n  /** 所有事件源都 cancel 了：给一段宽限，期间任何 move/down/up 都能把手势救回来。 */\n  function scheduleGraceEnd(reason, onExpire) {\n    cancelGrace();\n    S.diag.lastReject = reason;\n    const done = typeof onExpire === "function" ? onExpire : endHold;\n    S.graceTimer = window.setTimeout(() => {\n      if ((S.holding || S.pending || S.seeking) && !anyDownSource()) done();\n    }, CANCEL_GRACE_MS);\n  }\n\n  // —— 竖滑调档时禁止浏览器把这次触摸接管成滚动 / 系统长按菜单 ——\n  const TOUCH_STYLE_PROPS = ["touchAction", "userSelect", "webkitUserSelect", "webkitTouchCallout"];\n\n  function lockTouchBehavior(targets) {\n    restoreTouchBehavior();\n    const seen = [];\n    for (const node of targets) {\n      if (!node || !node.style || seen.indexOf(node) >= 0) continue;\n      seen.push(node);\n      const saved = {};\n      for (const p of TOUCH_STYLE_PROPS) saved[p] = node.style[p];\n      S.savedTouchStyles.push([node, saved]);\n      try {\n        node.style.touchAction = "none";\n        node.style.userSelect = "none";\n        node.style.webkitUserSelect = "none";\n        node.style.webkitTouchCallout = "none";\n      } catch (_) { /* 老内核可能不认某个属性 */ }\n    }\n  }\n\n  function restoreTouchBehavior() {\n    for (const [node, saved] of S.savedTouchStyles) {\n      if (!node || !node.style) continue;\n      for (const p of TOUCH_STYLE_PROPS) {\n        try { node.style[p] = saved[p] == null ? "" : saved[p]; } catch (_) { /* ignore */ }\n      }\n    }\n    S.savedTouchStyles = [];\n  }\n\n  function reject(reason) {\n    S.diag.lastReject = reason;\n    updateStatus();\n  }\n\n  // ---------------------------------------------------------------------------\n  // 找 video：当前 document + 同源 iframe + shadow DOM\n  // ---------------------------------------------------------------------------\n\n  function docClaimedByOther(vdoc) {\n    try {\n      const root = vdoc.documentElement;\n      const owner = root && root.getAttribute && root.getAttribute(OWNER_ATTR);\n      return !!(owner && owner !== FRAME_TAG);\n    } catch (_) { return false; }\n  }\n\n  function claimDoc(vdoc) {\n    try {\n      const root = vdoc.documentElement;\n      if (root && root.setAttribute) root.setAttribute(OWNER_ATTR, FRAME_TAG);\n    } catch (_) { /* ignore */ }\n  }\n\n  /** 有些播放器把 <video> 藏在自定义元素的 shadow root 里。 */\n  function shadowVideos(rootDoc, out, depth) {\n    if ((depth || 0) >= 2 || out.length) return;\n    let all = [];\n    try { all = rootDoc.querySelectorAll("*"); } catch (_) { return; }\n    for (const host of all) {\n      const sr = host.shadowRoot;\n      if (!sr) continue;\n      try {\n        for (const v of sr.querySelectorAll("video")) out.push(v);\n      } catch (_) { /* ignore */ }\n      shadowVideos(sr, out, (depth || 0) + 1);\n      if (out.length) return;\n    }\n  }\n\n  function findVideoDeep(rootDoc, depth) {\n    const own = [];\n    try {\n      for (const v of rootDoc.querySelectorAll("video")) {\n        let r = null;\n        try { r = v.getBoundingClientRect(); } catch (_) { /* ignore */ }\n        if (r && r.width > 40 && r.height > 24) own.push(v);\n      }\n    } catch (_) { /* ignore */ }\n    if (!own.length) {\n      const hidden = [];\n      shadowVideos(rootDoc, hidden, 0);\n      own.push(...hidden);\n    }\n    if (own.length) {\n      own.sort((a, b) => {\n        let ra = { width: 0, height: 0 }, rb = { width: 0, height: 0 };\n        try { ra = a.getBoundingClientRect(); rb = b.getBoundingClientRect(); } catch (_) { /* ignore */ }\n        return rb.width * rb.height - ra.width * ra.height;\n      });\n      return { video: own[0], doc: rootDoc };\n    }\n    // 兜底：页面只有唯一一个 video 时，即使暂时尺寸为 0（还没布局）也认下来。\n    let any = [];\n    try { any = Array.from(rootDoc.querySelectorAll("video")); } catch (_) { /* ignore */ }\n    if (any.length === 1) return { video: any[0], doc: rootDoc };\n\n    if ((depth || 0) >= 3) return null;\n    let frames = [];\n    try { frames = rootDoc.querySelectorAll("iframe"); } catch (_) { /* ignore */ }\n    for (const frame of frames) {\n      let doc = null;\n      try { doc = frame.contentDocument; } catch (_) { /* 跨域，跳过 */ }\n      if (!doc || docClaimedByOther(doc)) continue; // 该 iframe 自己已注入实例\n      const found = findVideoDeep(doc, (depth || 0) + 1);\n      if (found) return found;\n    }\n    return null;\n  }\n\n  function scanVideo() {\n    const found = findVideoDeep(document, 0);\n    if (!found) {\n      endHold(); // video 消失了也别把倍速留在旧元素上\n      S.video = null;\n      S.vdoc = null;\n      updateStatus();\n      return;\n    }\n    if (found.video === S.video && found.doc === S.vdoc) return;\n    endHold(); // 切集 / 换内核：先把上一个 video 的倍速还回去\n    S.video = found.video;\n    S.vdoc = found.doc;\n    bindGesture(found.doc); // 事件挂在 video 所在的 document（可能是 iframe）\n    ensureLayers();\n    updateStatus();\n  }\n\n  // ---------------------------------------------------------------------------\n  // 视频上层：热区边框 + 倍速 HUD（都不接收指针事件）\n  // ---------------------------------------------------------------------------\n\n  function layerHost(vdoc) {\n    let host = vdoc.fullscreenElement || vdoc.webkitFullscreenElement || vdoc.documentElement;\n    if (host && host.tagName === "VIDEO") host = host.parentElement || vdoc.documentElement;\n    return host || vdoc.documentElement;\n  }\n\n  function ensureLayers() {\n    const vdoc = S.vdoc || document;\n    if (S.hud && S.seekHud && S.hudDoc === vdoc) return;\n    for (const el of [S.hot, S.hud, S.dock, S.seekHud]) if (el) el.remove();\n    const host = layerHost(vdoc);\n    const FONT = \'"PingFang SC","Microsoft YaHei",system-ui,sans-serif\';\n\n    // 1) 极淡热区边框：只做视觉提示，绝不拦截播放器点击。\n    const hot = vdoc.createElement("div");\n    hot.className = "mvspeed-hotzone";\n    hot.style.cssText =\n      "position:fixed;pointer-events:none;z-index:2147482900;display:none;box-sizing:border-box;" +\n      "border:1px solid rgba(255,255,255,.10);border-radius:6px;" +\n      "box-shadow:inset 0 0 70px rgba(255,255,255,.04)";\n    host.appendChild(hot);\n\n    // 2) 右侧半透明大圆弧倍速盘。常驻 DOM、靠 translateX 进出，transition 才会播动画。\n    //    全部内联样式：播放器在同源 / 跨域 iframe 里也不会掉样式。\n    //    隐藏态必须叠一层 visibility:hidden：translateX(105%) 是相对自身宽度的位移，\n    //    圆盘还没被 placeLayers 赋过宽高时它是 0×0，位移量归零，里面绝对定位的子元素\n    //    （曾经是锁按钮）就会从宿主元素的静态位置漏出来——全屏时往往正落在画面上方。\n    //    visibility 走 0s 延迟 .3s 的过渡：滑出动画播完才真正隐形，滑入不受影响。\n    const dock = vdoc.createElement("div");\n    dock.className = "mvspeed-dock";\n    dock.style.cssText =\n      "position:fixed;pointer-events:none;z-index:2147483100;display:block;box-sizing:border-box;" +\n      "transition:transform .26s cubic-bezier(.22,.85,.25,1),visibility 0s linear .3s;" +\n      "visibility:hidden;will-change:transform;font-family:" + FONT;\n    dock.style.transform = dockSlide(S.cfg.dockSide, false); // 按配置侧停在屏幕外，长按时再滑入\n    const arc = vdoc.createElement("div");\n    arc.className = "mvspeed-arc";\n    arc.style.cssText =\n      "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;" +\n      "border-radius:50% 0 0 50% / 50% 0 0 50%;" +\n      "background:linear-gradient(90deg," +\n      "rgba(238,243,250,0) 0%,rgba(235,241,249,.10) 16%," +\n      "rgba(226,235,246,.20) 46%,rgba(206,220,237,.28) 100%);" +\n      "backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);" +\n      "box-shadow:inset 0 0 70px rgba(255,255,255,.07)";\n    dock.appendChild(arc);\n\n    // 竖排刻度：每个档位一行 + 一条横向刻度线（对齐参考图）。\n    const scale = vdoc.createElement("div");\n    scale.className = "mvspeed-scale";\n    scale.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";\n    const dockStepEls = STEPS.map((n) => {\n      const row = vdoc.createElement("div");\n      row.className = "mvspeed-step";\n      row.style.cssText =\n        "position:absolute;left:12%;right:9%;height:44px;display:flex;align-items:center;gap:14px;";\n      const label = vdoc.createElement("span");\n      label.textContent = n + "X";\n      label.style.cssText =\n        "min-width:66px;font-size:26px;font-weight:600;color:rgba(255,255,255,.46);" +\n        "text-shadow:0 1px 8px rgba(0,0,0,.45);transition:opacity .18s,font-size .18s";\n      row.appendChild(label);\n      const line = vdoc.createElement("i");\n      line.style.cssText =\n        "flex:1;height:1px;border-radius:1px;" +\n        "background:linear-gradient(90deg,rgba(255,255,255,.34),rgba(255,255,255,.04))";\n      row.appendChild(line);\n      scale.appendChild(row);\n      return row;\n    });\n    dock.appendChild(scale);\n\n    // 选中档位的贯穿高亮横条 + 圆点滑块。\n    const band = vdoc.createElement("div");\n    band.className = "mvspeed-band";\n    band.style.cssText =\n      "position:absolute;left:-14%;right:0;height:80px;pointer-events:none;" +\n      "background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.20) 38%,rgba(255,255,255,.13));" +\n      "border-top:1px solid rgba(255,255,255,.20);border-bottom:1px solid rgba(255,255,255,.12)";\n    const knob = vdoc.createElement("div");\n    knob.className = "mvspeed-knob";\n    knob.style.cssText =\n      "position:absolute;top:50%;width:26px;height:26px;border-radius:50%;" +\n      "transform:translate(-50%,-50%);background:rgba(255,255,255,.32);border:2px solid #86b6ff;" +\n      "box-shadow:0 0 14px rgba(90,150,255,.75);transition:left .18s";\n    band.appendChild(knob);\n    dock.appendChild(band);\n\n    host.appendChild(dock);\n\n    // 3) 当前档位大字，叠在高亮条上：「4X 快进 ▶▶」。\n    const hud = vdoc.createElement("div");\n    hud.className = "mvspeed-hud";\n    hud.style.cssText =\n      "position:fixed;pointer-events:none;z-index:2147483200;display:none;" +\n      "color:#fff;white-space:nowrap;text-shadow:0 2px 14px rgba(0,0,0,.6);font-family:" + FONT;\n    // children[0] 直接是当前倍速大字；「快进 ▶▶」作兄弟节点同行显示。\n    const rateEl = vdoc.createElement("span");\n    rateEl.style.cssText = "display:inline-block;font-size:40px;font-weight:800;letter-spacing:.01em";\n    const rateSmall = vdoc.createElement("span");\n    rateSmall.style.cssText =\n      "display:inline-block;font-size:17px;font-weight:600;opacity:.94;margin-left:10px";\n    hud.appendChild(rateEl);\n    hud.appendChild(rateSmall);\n    const steps = vdoc.createElement("div");\n    steps.style.cssText = "display:none";\n    const stepEls = STEPS.map((n) => {\n      const el = vdoc.createElement("span");\n      el.textContent = n + "×";\n      steps.appendChild(el);\n      return el;\n    });\n    hud.appendChild(steps);\n    const hintEl = vdoc.createElement("div");\n    hintEl.style.cssText =\n      "font-size:11px;color:rgba(255,255,255,.78);margin-top:4px;text-shadow:0 1px 6px rgba(0,0,0,.6)";\n    hud.appendChild(hintEl);\n    host.appendChild(hud);\n\n    // 4) 横滑快进 / 倒退预览：与圆弧盘同系的半透明玻璃卡片（不是深色实心块）。\n    //    浅色渐变 + backdrop blur + 内发光 + 细白边，视频画面能透过来，松手前只预览不 seek。\n    const seekHud = vdoc.createElement("div");\n    seekHud.className = "mvspeed-seek-hud";\n    seekHud.style.cssText =\n      "position:fixed;pointer-events:none;z-index:2147483300;display:none;box-sizing:border-box;" +\n      "transform:translate(-50%,-50%);min-width:220px;max-width:min(86vw,360px);padding:14px 20px 16px;" +\n      "border-radius:18px;text-align:center;color:#fff;font-family:" + FONT +\n      ";background:linear-gradient(135deg," +\n      "rgba(238,243,250,.05) 0%,rgba(235,241,249,.16) 45%,rgba(206,220,237,.27) 100%);" +\n      "backdrop-filter:blur(8px) saturate(1.25);-webkit-backdrop-filter:blur(8px) saturate(1.25);" +\n      "border:1px solid rgba(255,255,255,.24);" +\n      "box-shadow:inset 0 0 46px rgba(255,255,255,.09),0 8px 30px rgba(0,0,0,.28);" +\n      "text-shadow:0 1px 10px rgba(0,0,0,.55)";\n    seekHud.style.display = "none";\n    const seekBig = vdoc.createElement("div");\n    seekBig.style.cssText =\n      "font-size:28px;font-weight:800;letter-spacing:.02em;white-space:nowrap;" +\n      "text-shadow:0 2px 16px rgba(0,0,0,.7),0 0 22px rgba(120,170,255,.4)";\n    seekHud.appendChild(seekBig);\n    const seekSub = vdoc.createElement("div");\n    seekSub.style.cssText =\n      "font-size:12px;color:rgba(255,255,255,.88);margin-top:6px;white-space:nowrap;" +\n      "text-shadow:0 1px 8px rgba(0,0,0,.65)";\n    seekHud.appendChild(seekSub);\n    const seekTrack = vdoc.createElement("div");\n    seekTrack.style.cssText =\n      "margin-top:11px;height:4px;border-radius:3px;overflow:hidden;" +\n      "background:rgba(255,255,255,.20);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)";\n    const seekBar = vdoc.createElement("div");\n    seekBar.style.cssText =\n      "height:100%;width:0;border-radius:3px;" +\n      "background:linear-gradient(90deg,#5b8cff,#a9c9ff);" +\n      "box-shadow:0 0 12px rgba(91,140,255,.75);transition:width .08s";\n    seekTrack.appendChild(seekBar);\n    seekHud.appendChild(seekTrack);\n    host.appendChild(seekHud);\n\n    Object.assign(S, {\n      hot, hud, rateEl, rateBig: rateEl, rateSmall, hintEl, stepEls, hudDoc: vdoc,\n      dock, dockArc: arc, dockScale: scale, dockStepEls,\n      dockBand: band, dockKnob: knob,\n      seekHud, seekHudBig: seekBig, seekHudSub: seekSub, seekHudBar: seekBar,\n    });\n    applyDockSide();\n  }\n\n  /** 左侧盘时把圆弧 / 刻度线 / 高亮条 / 圆点 / 大字整体镜像。 */\n  function applyDockSide() {\n    if (!S.dock || !S.dockArc || !S.dockStepEls || !S.dockBand) return;\n    const left = S.cfg.dockSide === "left";\n    const arc = S.dockArc;\n    arc.style.borderRadius = left\n      ? "0 50% 50% 0 / 0 50% 50% 0"\n      : "50% 0 0 50% / 50% 0 0 50%";\n    arc.style.background = (left ? "linear-gradient(270deg," : "linear-gradient(90deg,") +\n      "rgba(238,243,250,0) 0%,rgba(235,241,249,.10) 16%," +\n      "rgba(226,235,246,.20) 46%,rgba(206,220,237,.28) 100%)";\n    for (const row of S.dockStepEls) {\n      row.style.flexDirection = left ? "row-reverse" : "row";\n      row.style.left = left ? "9%" : "12%";\n      row.style.right = left ? "12%" : "9%";\n      const line = row.children && row.children[1];\n      if (line) {\n        line.style.background = (left ? "linear-gradient(270deg," : "linear-gradient(90deg,") +\n          "rgba(255,255,255,.34),rgba(255,255,255,.04))";\n      }\n    }\n    const band = S.dockBand;\n    band.style.left = left ? "0" : "-14%";\n    band.style.right = left ? "-14%" : "0";\n    band.style.background = (left ? "linear-gradient(270deg," : "linear-gradient(90deg,") +\n      "rgba(255,255,255,.05),rgba(255,255,255,.20) 38%,rgba(255,255,255,.13))";\n    if (S.hud) S.hud.style.textAlign = left ? "right" : "left";\n  }\n\n  /** 换侧时暂时禁掉位移动画：否则收起的圆盘会横穿整个画面从右滑到左。 */\n  function switchDockSide() {\n    if (!S.dock) { applyDockSide(); placeLayers(); return; }\n    S.dock.style.transition = "none";\n    applyDockSide();\n    placeLayers(); // 立刻写入新侧的收起位移\n    try { void S.dock.offsetWidth; } catch (_) { /* 强制一次样式回流 */ }\n    window.setTimeout(() => { if (S.dock) S.dock.style.transition = ""; }, 0);\n  }\n\n  function placeLayers() {\n    if (!S.video || !S.hud || !S.dock) return;\n    const vdoc = S.vdoc || document;\n    const host = layerHost(vdoc);\n    for (const el of [S.hot, S.dock, S.hud, S.seekHud]) {\n      if (el && el.parentNode !== host) host.appendChild(el);\n    }\n    const r = S.video.getBoundingClientRect();\n    const sized = r.width > 2 && r.height > 2;\n    const side = S.cfg.dockSide;\n    const visible = S.holding && sized;\n    const seekVisible = S.seeking && sized;\n    for (const el of [S.hot, S.hud]) el.style.display = visible ? "block" : "none";\n    // 隐藏时除了滑出屏幕，还要 visibility:hidden 兜底（见 ensureLayers 里的注释）：\n    // 滑出位移相对自身宽度，0×0 状态下位移量为 0，纯 transform 挡不住子元素漏显示。\n    // 显示时去掉 visibility 延迟（立刻可见、再滑入）；隐藏时回到 cssText 里的\n    // 「0s 延迟 .3s」，让 .26s 的滑出动画播完才真正隐形。\n    if (visible) {\n      S.dock.style.transition = "transform .26s cubic-bezier(.22,.85,.25,1),visibility 0s";\n      S.dock.style.visibility = "visible";\n    } else {\n      S.dock.style.transition = "";\n      S.dock.style.visibility = "hidden";\n    }\n    S.dock.style.transform = dockSlide(side, visible);\n    if (S.seekHud) {\n      S.seekHud.style.display = seekVisible ? "block" : "none";\n      if (seekVisible) {\n        S.seekHud.style.left = (r.left + r.width / 2) + "px";\n        S.seekHud.style.top = (r.top + r.height * 0.62) + "px";\n      }\n    }\n    if (!visible) return;\n\n    S.hot.style.left = r.left + "px";\n    S.hot.style.top = r.top + "px";\n    S.hot.style.width = r.width + "px";\n    S.hot.style.height = r.height + "px";\n\n    const g = dockGeometry(r, 360, side);\n    if (!g) return;\n    S.dock.style.left = g.left + "px";\n    S.dock.style.top = g.top + "px";\n    S.dock.style.width = g.width + "px";\n    S.dock.style.height = g.height + "px";\n\n    const centers = dockCenters(g, STEPS.length);\n    S.dockStepEls.forEach((row, i) => {\n      row.style.top = (centers[i] - g.top - 22) + "px";\n    });\n    const idx = Math.max(0, STEPS.indexOf(S.rate));\n    const bandTop = centers[idx] - g.top - 40;\n    S.dockBand.style.top = bandTop + "px";\n    S.dockKnob.style.left = dockKnobLeft(idx, STEPS.length, side) + "%";\n    S.hud.style.left = dockHudLeft(g, side) + "px";\n    S.hud.style.top = (centers[idx] - 25) + "px";\n  }\n\n  function formatRate(rate) {\n    const n = Number(rate);\n    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "1";\n  }\n\n  function updateHUD() {\n    if (!S.hud) return;\n    const idx = Math.max(0, STEPS.indexOf(S.rate));\n    S.rateBig.textContent = S.rate + "×";\n    S.rateSmall.textContent = "快进 ▶▶";\n    S.hintEl.textContent = "上下滑动切档 · 松手恢复 " + formatRate(S.restoreRate) + "×";\n    S.stepEls.forEach((el, i) => {\n      const on = STEPS[i] === S.rate;\n      el.style.background = on ? "#2f6bff" : "transparent";\n      el.style.color = on ? "#fff" : "#9aa4b2";\n      el.style.borderColor = on ? "#2f6bff" : "#394356";\n    });\n    // 选中档位的小刻度让位给大字，其余保持半透明刻度 + 横线。\n    S.dockStepEls.forEach((row, i) => {\n      const label = row.children && row.children[0];\n      const on = STEPS[i] === S.rate;\n      if (label) {\n        label.style.opacity = on ? "0" : "1";\n        label.style.fontSize = on ? "30px" : "26px";\n      }\n      row.style.opacity = on ? ".6" : "1";\n    });\n    placeLayers();\n  }\n\n  // ---------------------------------------------------------------------------\n  // 横滑快进 / 倒退生命周期：预览 → 松手一次性 seek（方向在触发时锁定）\n  // ---------------------------------------------------------------------------\n\n  function updateSeekHUD() {\n    if (!S.seekHud) return;\n    const delta = S.seekDelta;\n    const back = delta < 0;\n    const dur = Number(S.video && S.video.duration);\n    const hasDur = Number.isFinite(dur) && dur > 0;\n    const target = seekTargetTime(S.seekBaseTime, delta, dur);\n    S.seekHudBig.textContent = delta > 0 ? "⏩ +" + formatClock(delta)\n      : back ? "⏪ −" + formatClock(-delta) : "↩ 松手取消";\n    S.seekHudSub.textContent = delta !== 0\n      ? formatClock(S.seekBaseTime) + "  →  " + formatClock(target) +\n        (hasDur ? " / " + formatClock(dur) : "")\n      : "滑回起点或松手即可取消";\n    S.seekHudBar.style.width = (hasDur ? clamp((target / dur) * 100, 0, 100) : 0) + "%";\n    // 倒退用暖色区分，界面仍是与圆弧盘同系的半透明玻璃。\n    S.seekHudBar.style.background = back\n      ? "linear-gradient(90deg,#ffb45c,#ffd9a3)"\n      : "linear-gradient(90deg,#5b8cff,#a9c9ff)";\n    S.seekHudBar.style.boxShadow = back\n      ? "0 0 12px rgba(255,180,92,.75)"\n      : "0 0 12px rgba(91,140,255,.75)";\n    S.seekHudBig.style.textShadow = back\n      ? "0 2px 16px rgba(0,0,0,.7),0 0 22px rgba(255,180,92,.45)"\n      : "0 2px 16px rgba(0,0,0,.7),0 0 22px rgba(120,170,255,.4)";\n  }\n\n  function startSeek(info, dir) {\n    window.clearTimeout(S.timer);\n    S.timer = 0;\n    S.pending = false;\n    S.seeking = true;\n    S.seekDir = dir === -1 ? -1 : 1;\n    S.seekDelta = 0;\n    // base 在 onDown 就记好了：即使播放器自己也在拖动进度条，最终也是「按下时刻 + 位移量」，\n    // 不会把两份位移叠加到一起。\n    bumpDiag(S.seekDir < 0 ? "swipeBack" : "swipeSeek");\n    updateSeekHUD();\n    updateSeek(info);\n  }\n\n  function updateSeek(info) {\n    if (!S.seeking || !S.video || !S.seekDir) return;\n    let rect = null;\n    try { rect = S.video.getBoundingClientRect(); } catch (_) { /* ignore */ }\n    // 方向在触发时锁定：只接受与锁定方向一致的位移，滑回起点 / 越过起点都归零，\n    // 绝不会在中途翻成另一个方向的手势。\n    const raw = seekSignedSeconds(info.x - S.startX, rect ? rect.width : 0, MOVE_TOLERANCE);\n    const seconds = raw * S.seekDir > 0 ? raw : 0;\n    if (seconds === S.seekDelta) return; // 秒数没变就不重绘，touchmove 频率很高\n    S.seekDelta = seconds;\n    updateSeekHUD();\n    placeLayers();\n    updateStatus();\n  }\n\n  /** 松手才真正跳：只写一次 currentTime，避免边滑边 seek 把 HLS 拖崩。 */\n  function finishSeek() {\n    const delta = S.seekDelta;\n    const base = S.seekBaseTime;\n    const back = delta < 0;\n    const label = back ? "左滑倒退 −" : "右滑快进 +";\n    const name = back ? "左滑倒退" : "右滑快进";\n    let target = -1;\n    if (delta !== 0 && S.video) {\n      try {\n        target = seekTargetTime(base, delta, S.video.duration);\n        S.video.currentTime = target;\n        S.diag.lastReject = label + formatClock(Math.abs(delta)) + " → " + formatClock(target);\n      } catch (_) {\n        target = -1;\n        S.diag.lastReject = name + "失败：播放器内核拒绝写 currentTime";\n      }\n    } else {\n      S.diag.lastReject = (back ? "左滑倒退" : "右滑") + "已取消（滑回起点）";\n    }\n    endHold(); // 统一清理，并按 wasSeeking 吃掉随后合成的 click\n    // 有些播放器在自己的 pointerup / touchend handler 里还会再 seek 一次，\n    // 把刚跳的位置盖掉。短延时复查一次，只在我们写的目标被改动时才写回。\n    if (target >= 0) {\n      window.clearTimeout(S.seekConfirmTimer);\n      const v = S.video;\n      S.seekConfirmTimer = window.setTimeout(() => {\n        if (!v) return;\n        try {\n          if (Math.abs(Number(v.currentTime) - target) > 0.6) v.currentTime = target;\n        } catch (_) { /* ignore */ }\n      }, 140);\n    }\n  }\n\n  function cancelSeek() {\n    const back = S.seekDelta < 0;\n    S.seekDelta = 0;\n    S.diag.lastReject = (back ? "左滑倒退" : "右滑快进") + "已取消（手势被打断）";\n    endHold();\n  }\n\n  // ---------------------------------------------------------------------------\n  // 长按生命周期：进入 / 调档 / 还原\n  // ---------------------------------------------------------------------------\n\n  function clearTimers() {\n    window.clearTimeout(S.timer);\n    window.clearTimeout(S.maxTimer);\n    window.clearInterval(S.rampTimer);\n    window.clearInterval(S.rateGuardTimer);\n    window.clearInterval(S.placeTimer);\n    window.clearTimeout(S.seekConfirmTimer);\n    S.seekConfirmTimer = 0;\n    cancelGrace();\n    S.timer = S.maxTimer = S.rampTimer = S.rateGuardTimer = S.placeTimer = 0;\n  }\n\n  /** 手指不松就一直快进：只要还有一套事件认为按着，巡检到期就续期。 */\n  function armMaxTimer() {\n    window.clearTimeout(S.maxTimer);\n    S.maxTimer = window.setTimeout(() => {\n      if (!S.holding) return;\n      if (anyDownSource() && Date.now() - S.holdStartedAt < HOLD_HARD_CAP_MS) {\n        armMaxTimer();\n        return;\n      }\n      endHold();\n    }, MAX_HOLD_MS);\n  }\n\n  function applyRate(rate) {\n    S.rate = clampRate(rate);\n    if (S.video) {\n      try { S.video.playbackRate = S.rate; } catch (_) { /* 某些内核不允许 */ }\n    }\n    updateHUD();\n  }\n\n  function beginHold() {\n    if (!S.pending || !S.video) {\n      S.pending = false;\n      return;\n    }\n    S.timer = 0;\n    S.pending = false;\n    S.holding = true;\n    S.holdStartedAt = Date.now();\n    bumpDiag("hold");\n    ensureLayers();\n    placeLayers();\n    if (S.video.paused && typeof S.video.play === "function") {\n      // 暂停时长按也当作「快进跳过」；浏览器若拒绝自动播放就静默忽略。\n      try {\n        const p = S.video.play();\n        if (p && typeof p.catch === "function") p.catch(() => {});\n      } catch (_) { /* ignore */ }\n    }\n    applyRate(S.baseRate);\n    if (S.cfg.ramp) {\n      S.rampTimer = window.setInterval(() => {\n        if (!S.holding || S.userAdjusted) return;\n        if (S.rate < STEPS[STEPS.length - 1]) applyRate(S.rate + 1);\n      }, S.cfg.rampMs);\n    }\n    // 有些 HLS 内核 / 播放器会在内部把 playbackRate 重置回 1×，定时复查并写回。\n    S.rateGuardTimer = window.setInterval(() => {\n      if (!S.holding || !S.video) return;\n      try {\n        if (Math.abs(Number(S.video.playbackRate) - S.rate) > 0.01) S.video.playbackRate = S.rate;\n      } catch (_) { /* ignore */ }\n    }, 250);\n    S.placeTimer = window.setInterval(placeLayers, 250);\n    armMaxTimer();\n    updateStatus();\n  }\n\n  /** 手势结束后浏览器常合成一次 click，播放器会把它当成「点了一下」而暂停。 */\n  function suppressNextClick() {\n    S.ignoreUntil = Date.now() + 400;\n    S.suppressClick = true;\n    window.clearTimeout(S.suppressTimer);\n    S.suppressTimer = window.setTimeout(() => { S.suppressClick = false; }, 600);\n  }\n\n  function endHold() {\n    clearTimers();\n    const wasHolding = S.holding;\n    const wasSeeking = S.seeking;\n    S.pending = false;\n    S.holding = false;\n    S.seeking = false;\n    S.seekDelta = 0;\n    S.seekDir = 0;\n    S.inputId = null;\n    S.userAdjusted = false;\n    clearDownSources();\n    S.primaryCancelled = false;\n    restoreTouchBehavior();\n    if (wasHolding && S.video) {\n      try { S.video.playbackRate = S.restoreRate; } catch (_) { /* ignore */ }\n    }\n    if (wasHolding) {\n      // 只在真的结束了一次手势时设冷却：拦住同一次手势随后合成的 click/mousedown。\n      // 不能每次幂等调用（如 scanVideo 初次发现 video）都设，否则启动后第一次按下会被误拦。\n      suppressNextClick();\n    } else if (wasSeeking) {\n      suppressNextClick();\n    }\n    placeLayers();\n    updateStatus();\n  }\n\n  // ---------------------------------------------------------------------------\n  // 手势：三套事件归一化 + 捕获监听 + 坐标判定，绝不接管播放器自己的点击\n  // ---------------------------------------------------------------------------\n\n  function targetInfo(target) {\n    if (!target || !target.tagName) return null;\n    return {\n      tagName: target.tagName,\n      className: typeof target.className === "string" ? target.className : "",\n      role: (target.getAttribute && target.getAttribute("role")) || "",\n      isContentEditable: !!target.isContentEditable,\n    };\n  }\n\n  function isOurUI(target) {\n    return !!(target && target.closest && target.closest(\n      ".mvspeed-panel, .mvspeed-launch, .mvspeed-hud, .mvspeed-hotzone, .mvspeed-dock, .mvspeed-seek-hud",\n    ));\n  }\n\n  function onDown(e, source) {\n    if (!S.cfg.enabled || !S.video) return;\n    const info = normalizePoint(e, source);\n    if (!info) return;\n    noteGesture();\n    cancelGrace();\n    window.clearTimeout(S.seekConfirmTimer);\n    S.seekConfirmTimer = 0;\n    if (S.holding || S.pending) {\n      // 同一次按压里另一套事件也报了 down：登记为候选接管者。\n      // 之后 primary 被 pointercancel 时，就靠它继续维持长按与滑动调档。\n      S.downSources[source] = true;\n      return;\n    }\n    if (Date.now() < S.ignoreUntil && source !== S.primarySource) return;\n    bumpDiag(DOWN_NAME[source] || source + "down");\n    if (info.raw.pointerType === "mouse" && info.raw.button != null && info.raw.button !== 0) return;\n    if (isOurUI(info.target)) return reject("点在自己的面板上");\n    const rect = S.video.getBoundingClientRect();\n    const tInfo = targetInfo(info.target);\n    if (isUIElement(tInfo) && !isOverlayLayer(info.target, rect, tInfo)) {\n      return reject("按在播放器控件上");\n    }\n    if (!hotZoneHit(rect, info.x, info.y)) {\n      return reject("按下点不在画面热区（" + Math.round(info.x) + "," + Math.round(info.y) + "）");\n    }\n    // 真机关键修复：竖滑调档会被浏览器当成滚动 → pointercancel 打断长按。\n    // 手势期间临时禁掉按下的目标 / video / 根元素的 touch-action 与系统长按菜单，松手还原。\n    const vdoc = S.vdoc || document;\n    lockTouchBehavior([S.video, info.target, vdoc && vdoc.documentElement]);\n    S.restoreRate = Number(S.video.playbackRate) || 1;\n    S.baseRate = S.cfg.rate;\n    S.rate = S.baseRate;\n    S.startX = info.x;\n    S.startY = info.y;\n    // 横滑的基准时刻必须在按下时记：松手时用 base + 位移量，而不是当前时间 + 位移量。\n    S.seekBaseTime = Number(S.video.currentTime) || 0;\n    S.seeking = false;\n    S.seekDelta = 0;\n    S.seekDir = 0;\n    S.inputId = info.id;\n    clearDownSources();\n    S.downSources[source] = true;\n    S.primarySource = source;\n    S.primaryCancelled = false;\n    S.holdStartedAt = 0;\n    S.pending = true;\n    S.userAdjusted = false;\n    S.diag.lastReject = "";\n    S.timer = window.setTimeout(beginHold, S.cfg.delay);\n    updateStatus();\n  }\n\n  function onMove(e, source) {\n    if (!S.pending && !S.holding && !S.seeking) return;\n    // primary 被 cancel 后，允许仍按着的另一套事件接管这次手势。\n    if (S.primarySource && !S.downSources[S.primarySource]) {\n      const alt = firstDownSource();\n      if (alt) {\n        S.primarySource = alt;\n        S.primaryCancelled = false;\n        S.diag.lastReject = "cancel 后由 " + alt + " 接管（保持快进）";\n      }\n    }\n    if (!S.downSources[source] && S.primarySource !== source) return;\n    if (S.primarySource && S.downSources[S.primarySource] && source !== S.primarySource) return;\n    noteGesture();\n    cancelGrace();\n    // 待判定 + 快进中都阻止页面滚动 / 下拉刷新 / 系统长按菜单接管手势。\n    // 只对触摸类事件做，桌面鼠标的 pointermove 不碰，免得影响播放器自己的点击。\n    const touchLike = source === "touch" || (source === "pointer" && e.pointerType === "touch");\n    if (touchLike && typeof e.preventDefault === "function") {\n      try { e.preventDefault(); } catch (_) { /* ignore */ }\n    }\n    const info = normalizePoint(e, source);\n    if (!info) return;\n    if (S.seeking) {\n      updateSeek(info);\n      return;\n    }\n    if (S.pending) {\n      const dx = info.x - S.startX;\n      const dy = Math.abs(info.y - S.startY);\n      // 竖向滑动是长按倍速的调档手势，绝不取消；只有横向主导才让位给别的动作。\n      const horizontal = Math.abs(dx) > MOVE_TOLERANCE && Math.abs(dx) > dy * 1.2;\n      if (horizontal) {\n        window.clearTimeout(S.timer);\n        S.timer = 0;\n        S.pending = false;\n        if (dx > 0 && S.cfg.swipeSeek && isSwipeSeekGesture(dx, dy, MOVE_TOLERANCE)) {\n          startSeek(info, 1);\n        } else if (dx < 0 && S.cfg.swipeBack && isSwipeBackGesture(dx, dy, MOVE_TOLERANCE)) {\n          startSeek(info, -1);\n        } else {\n          // 两个方向各自可关：关掉后仍留给播放器自己的拖动 / 后退。\n          S.diag.lastReject = dx > 0 ? "右滑快进已关闭" : dx < 0 ? "左滑倒退已关闭" : "按下后横向拖动（判定为拖进度条）";\n          updateStatus();\n        }\n      }\n      return;\n    }\n    if (S.inputId != null && info.id != null && source !== "touch" && info.id !== S.inputId) return;\n    // 手指滑进圆弧盘就按「离哪个刻度最近」实时选档；在画面区仍是上滑升档。\n    const g = dockGeometry(S.video.getBoundingClientRect(), 360, S.cfg.dockSide);\n    const inDock = !!(g && info.x >= g.left && info.x <= g.left + g.width &&\n      info.y >= g.top && info.y <= g.top + g.height);\n    const next = inDock\n      ? rateFromDockY(info.y, g, STEPS)\n      : rateForDrag(S.baseRate, S.startY, info.y, S.cfg.dragPx);\n    if (next !== S.rate) {\n      S.userAdjusted = true; // 手动调过档就不再自动升档\n      applyRate(next);\n    }\n  }\n\n  function onUp(e, source) {\n    if (!S.pending && !S.holding && !S.seeking) return;\n    bumpDiag(UP_NAME[source] || source + "up");\n    noteGesture();\n    cancelGrace();\n    S.downSources[source] = false;\n    if (S.seeking) finishSeek();\n    else endHold();\n  }\n\n  function onCancel(e, source) {\n    if (!S.pending && !S.holding && !S.seeking) return;\n    bumpDiag(source + "cancel");\n    noteGesture();\n    S.downSources[source] = false;\n    if (S.seeking) {\n      // 和长按同一套兜底：还有别的事件源就继续预览，全没了给 1s 宽限，\n      // 宽限到期仍按当前位移量提交，避免浏览器接管手势时把这次快进/倒退吞掉。\n      if (!anyDownSource()) scheduleGraceEnd(source + "cancel（横滑预览等待收尾）", finishSeek);\n      else S.diag.lastReject = source + "cancel → 由 " + (firstDownSource() || "其它事件") + " 接管";\n      updateStatus();\n      return;\n    }\n    // 真机关键修复：浏览器把竖滑接管成滚动时会先发 pointercancel，但手指根本没抬。\n    // 旧版直接 endHold → 一移动加速就停。现在只让这一套事件失效：\n    // 有其它事件源还按着就交给它继续快进 + 调档；全没了才给 1s 宽限等抬起。\n    if (source === S.primarySource) {\n      const alt = firstDownSource();\n      if (alt) {\n        S.primarySource = alt;\n        S.primaryCancelled = false;\n        S.diag.lastReject = source + "cancel → 由 " + alt + " 接管（继续快进）";\n      } else {\n        S.primaryCancelled = true;\n        scheduleGraceEnd(source + "cancel（已忽略，保持快进等待抬起）");\n      }\n    } else if (!anyDownSource() && S.primaryCancelled) {\n      scheduleGraceEnd(source + "cancel（已忽略，保持快进等待抬起）");\n    } else {\n      S.diag.lastReject = source + "cancel（已忽略，不影响快进）";\n    }\n    updateStatus();\n  }\n\n  function onClickCapture(e) {\n    if (!S.suppressClick) return;\n    S.suppressClick = false;\n    window.clearTimeout(S.suppressTimer);\n    if (e && typeof e.preventDefault === "function") e.preventDefault();\n    if (e && typeof e.stopPropagation === "function") e.stopPropagation();\n  }\n\n  function onContextMenu(e) {\n    // 安卓/iOS 长按视频会弹系统菜单并打断手势，长按期间一律拦掉。\n    if ((S.holding || S.pending) && e && typeof e.preventDefault === "function") {\n      e.preventDefault();\n    }\n  }\n\n  function onKeyDown(e) {\n    if (!e.altKey) return;\n    const tag = String((e.target && e.target.tagName) || "").toLowerCase();\n    if (tag === "input" || tag === "textarea" || tag === "select") return;\n    const m = /^[1-6]$/.test(e.key) ? e.key : (/^Digit([1-6])$/.exec(e.code || "") || [])[1];\n    if (!m) return;\n    e.preventDefault();\n    const n = Number(m);\n    if (n === 1) toggleEnabled();\n    else if (n === 6) toggleDockSide();\n    else setRate(n);\n  }\n\n  const GESTURE_EVENTS = [\n    ["pointerdown", "pointer", "down"],\n    ["pointermove", "pointer", "move"],\n    ["pointerup", "pointer", "up"],\n    ["pointercancel", "pointer", "cancel"],\n    ["touchstart", "touch", "down"],\n    ["touchmove", "touch", "move"],\n    ["touchend", "touch", "up"],\n    ["touchcancel", "touch", "cancel"],\n    ["mousedown", "mouse", "down"],\n    ["mousemove", "mouse", "move"],\n    ["mouseup", "mouse", "up"],\n  ];\n\n  function gestureHandler(source, phase) {\n    return function (e) {\n      if (phase === "down") onDown(e, source);\n      else if (phase === "move") onMove(e, source);\n      else if (phase === "up") onUp(e, source);\n      else onCancel(e, source);\n    };\n  }\n\n  function unbindGesture() {\n    const d = S.boundDoc;\n    if (!d) return;\n    for (const [name, fn, opts] of S.boundList) {\n      try { d.removeEventListener(name, fn, opts); } catch (_) { /* ignore */ }\n    }\n    S.boundList = [];\n    S.boundDoc = null;\n  }\n\n  function bindGesture(vdoc) {\n    if (S.boundDoc === vdoc) return;\n    unbindGesture();\n    const add = (name, fn, opts) => {\n      try { vdoc.addEventListener(name, fn, opts); }\n      catch (_) { try { vdoc.addEventListener(name, fn, true); } catch (_) { /* ignore */ } }\n      S.boundList.push([name, fn, opts]);\n    };\n    for (const [name, source, phase] of GESTURE_EVENTS) {\n      const opts = source === "touch"\n        ? { capture: true, passive: false }\n        : { capture: true };\n      add(name, gestureHandler(source, phase), opts);\n    }\n    add("click", onClickCapture, { capture: true });\n    add("contextmenu", onContextMenu, { capture: true });\n    add("keydown", onKeyDown, { capture: true });\n    S.boundDoc = vdoc;\n  }\n\n  // ---------------------------------------------------------------------------\n  // 配置 / 状态 / 诊断\n  // ---------------------------------------------------------------------------\n\n  function saveConfig(patch) {\n    const oldSide = S.cfg.dockSide;\n    S.cfg = normalizeConfig({ ...S.cfg, ...patch });\n    storeSet(CONFIG_KEY, S.cfg);\n    if (S.cfg.dockSide !== oldSide) switchDockSide();\n    if (!S.cfg.enabled) endHold();\n    syncControls();\n    updateStatus();\n  }\n\n  function toggleEnabled() {\n    saveConfig({ enabled: !S.cfg.enabled });\n  }\n\n  function toggleSwipeSeek() {\n    saveConfig({ swipeSeek: !S.cfg.swipeSeek });\n  }\n\n  function toggleSwipeBack() {\n    saveConfig({ swipeBack: !S.cfg.swipeBack });\n  }\n\n  function toggleDockSide() {\n    saveConfig({ dockSide: S.cfg.dockSide === "left" ? "right" : "left" });\n  }\n\n  function setRate(rate) {\n    saveConfig({ rate: clampRate(rate) });\n  }\n\n  function diagText() {\n    const d = S.diag;\n    let r = null;\n    try { r = S.video && S.video.getBoundingClientRect(); } catch (_) { /* ignore */ }\n    const size = r && r.width > 0 ? Math.round(r.width) + "×" + Math.round(r.height) : "未找到 <video>";\n    const lines = [\n      "视频：" + size +\n        (S.video ? " · " + (FRAME ? "播放器 iframe 内" : "顶层页面") + " · 当前 " + formatRate(S.video.playbackRate) + "×" : " · 若在跨域 iframe，需油猴把脚本注入该 frame") +\n        (SITE_HOST ? " · 站点 " + SITE_HOST : ""),\n      "按下事件：pointer " + d.pointerdown + " / touch " + d.touchstart + " / mouse " + d.mousedown +\n        " · 长按成功 " + d.holds + " 次 · 右滑快进 " + d.seeks + " 次 · 左滑倒退 " + d.backSeeks +\n        " 次 · 已忽略 cancel " + d.cancels + " 次",\n      "状态：" + (S.holding ? "快进中 " + S.rate + "×" : S.seeking\n        ? (S.seekDir < 0 ? "左滑倒退预览 −" : "右滑快进预览 +") + formatClock(Math.abs(S.seekDelta))\n        : S.pending ? "待判定（" + S.cfg.delay + "ms）" : "空闲") +\n        " · 加速盘 " + (S.cfg.dockSide === "left" ? "左侧" : "右侧") +\n        (S.cfg.enabled ? "" : "（已关闭）") +\n        " · 最近事件 " + (d.lastEvent || "无"),\n    ];\n    if (d.lastReject) lines.push("最近忽略：" + d.lastReject);\n    return lines.join("\\n");\n  }\n\n  function updateStatus() {\n    const text = diagText();\n    if (S.els.status) {\n      let extra = "";\n      try {\n        const fd = storeGet(FRAME_DIAG_KEY, null);\n        if (fd && typeof fd === "object" && fd.text && Date.now() - Number(fd.time) < 15000) {\n          extra = "\\n子 frame：" + String(fd.text).split("\\n")[0];\n        }\n      } catch (_) { /* ignore */ }\n      S.els.status.textContent = text + extra;\n    } else if (FRAME) {\n      // iframe 实例不建面板，把诊断写给顶层面板显示。\n      try { storeSet(FRAME_DIAG_KEY, { tag: FRAME_TAG, time: Date.now(), text }); } catch (_) { /* ignore */ }\n    }\n  }\n\n  function syncControls() {\n    const e = S.els;\n    if (e.enabled) e.enabled.checked = !!S.cfg.enabled;\n    if (e.rate) e.rate.value = String(S.cfg.rate);\n    if (e.ramp) e.ramp.checked = !!S.cfg.ramp;\n    if (e.swipeSeek) e.swipeSeek.checked = !!S.cfg.swipeSeek;\n    if (e.swipeBack) e.swipeBack.checked = !!S.cfg.swipeBack;\n    if (e.dockSide) e.dockSide.value = S.cfg.dockSide;\n  }\n\n  // ---------------------------------------------------------------------------\n  // 面板 UI（左下角，避开字幕脚本右下角的「字」按钮）\n  // ---------------------------------------------------------------------------\n\n  const PANEL_CSS = `\n  .mvspeed-launch{position:fixed;left:18px;bottom:18px;z-index:2147483500;width:44px;height:44px;\n    border-radius:50%;border:1px solid #3b4453;background:#1c2230;color:#fff;font-size:18px;\n    cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.45)}\n  .mvspeed-launch:hover{background:#2b364a}\n  .mvspeed-panel{position:fixed;left:18px;bottom:70px;z-index:2147483500;width:min(340px,calc(100vw - 36px));\n    max-height:min(76vh,600px);overflow-y:auto;box-sizing:border-box;padding:12px;border-radius:12px;\n    background:#171c27;color:#e8edf5;border:1px solid #333c4d;box-shadow:0 12px 40px rgba(0,0,0,.6);\n    font:13px/1.5 "PingFang SC","Microsoft YaHei",system-ui,sans-serif}\n  .mvspeed-panel *{box-sizing:border-box}\n  .mvspeed-panel button,.mvspeed-panel select{font-family:inherit}\n  .mvspeed-head{display:flex;align-items:center;justify-content:center;margin-bottom:9px}\n  .mvspeed-title{font-weight:600}\n  .mvspeed-x{background:none;border:0;color:#9aa4b2;font-size:16px;cursor:pointer;padding:2px 6px;\n    margin-left:auto}\n  .mvspeed-status{font-size:11px;color:#aeb9c9;background:#111621;border-radius:6px;padding:7px 8px;\n    margin-bottom:9px;word-break:break-all;min-height:28px;white-space:pre-line;line-height:1.65}\n  .mvspeed-row{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}\n  .mvspeed-check{font-size:12px;color:#b9c2d0;display:flex;align-items:center;gap:4px}\n  .mvspeed-check input[type=checkbox]{accent-color:#2f6bff}\n  .mvspeed-select{background:#0f1420;border:1px solid #394356;border-radius:6px;color:#e8edf5;\n    padding:5px 8px;font-size:12px}\n  .mvspeed-btn{background:#24304a;border:1px solid #3b4c6b;border-radius:6px;color:#dce6f7;\n    padding:5px 9px;font-size:11px;cursor:pointer}\n  .mvspeed-hint{font-size:11px;color:#7d8899;line-height:1.6;margin:9px 0 0}\n  .mvspeed-sec{border-top:1px solid #2b3444;padding-top:9px;margin-top:9px}\n  `;\n\n  const PANEL_HTML = `\n  <div class="mvspeed-head"><span class="mvspeed-title">⏩ 倍速 · 滑动快进 / 倒退</span><button data-act="close" class="mvspeed-x">✕</button></div>\n  <div class="mvspeed-status" data-el="status"></div>\n  <div class="mvspeed-row">\n    <label class="mvspeed-check"><input type="checkbox" data-el="enabled" data-opt="enabled" /> 启用画面手势（总开关）</label>\n    <select class="mvspeed-select" data-el="rate" data-opt="rate">\n      <option value="2">2×</option><option value="3">3×</option>\n      <option value="4">4×</option><option value="5">5×</option>\n    </select>\n  </div>\n  <div class="mvspeed-row">\n    <label class="mvspeed-check"><input type="checkbox" data-el="ramp" data-opt="ramp" /> 按越久越快（自动升到 5×）</label>\n  </div>\n  <div class="mvspeed-row">\n    <label class="mvspeed-check"><input type="checkbox" data-el="swipeSeek" data-opt="swipeSeek" /> 右滑快进（+10 秒 ~ +5 分钟）</label>\n  </div>\n  <div class="mvspeed-row">\n    <label class="mvspeed-check"><input type="checkbox" data-el="swipeBack" data-opt="swipeBack" /> 左滑倒退（−10 秒 ~ −5 分钟）</label>\n  </div>\n  <div class="mvspeed-row">\n    <span class="mvspeed-check">加速盘位置</span>\n    <select class="mvspeed-select" data-el="dockSide" data-opt="dockSide">\n      <option value="right">右侧（默认）</option><option value="left">左侧</option>\n    </select>\n  </div>\n  <div class="mvspeed-row">\n    <button class="mvspeed-btn" data-act="diag">复制诊断</button>\n    <button class="mvspeed-btn" data-act="test">模拟一次长按</button>\n  </div>\n  <div class="mvspeed-sec">\n    <p class="mvspeed-hint">按住画面约 0.22 秒，半透明圆弧倍速盘从设定侧滑入；手指在盘里上下滑动到哪个刻度就实时切到 2×/3×/4×/5×，在画面区仍是上滑升档、下滑降档（每 45px 一档）。松手恢复按下前的速度。</p>\n    <p class="mvspeed-hint">快捷键：Alt+1 开关手势、Alt+2/3/4/5 直接切档、Alt+6 切换加速盘左 / 右。</p>\n    <p class="mvspeed-hint">在画面上快速右滑快进、左滑倒退：滑得越远跳得越多（10 秒起步，滑满约 75% 屏宽到 5 分钟），半透明玻璃卡片实时显示 ±秒数与目标时间，松手才跳一次；滑回起点可取消，方向在触发时锁定。</p>\n    <p class="mvspeed-hint">长按倍速与横滑互斥：先按住超过 0.22 秒就是倍速调档，之后横滑不会变成快进；先横滑则不会触发倍速。若播放器自带滑动 seek，可分别关掉「右滑快进」「左滑倒退」。</p>\n    <p class="mvspeed-hint">热区不拦截点击，播放器按钮 / 进度条 / 全屏照常可用；底部控制栏区域不参与手势。</p>\n    <p class="mvspeed-hint">真机没反应时看上方状态栏：显示「未找到 &lt;video&gt;」说明播放器在第三方 iframe；显示按下事件为 0 说明事件没进来。点「模拟一次长按」可绕过手势直接验证倍速是否生效。</p>\n    <p class="mvspeed-hint">设置只存在这台设备，不上传、不发任何网络请求；可与外挂字幕脚本同时安装。</p>\n  </div>\n  `;\n\n  function buildPanel() {\n    const style = document.createElement("style");\n    style.textContent = PANEL_CSS;\n    document.head.appendChild(style);\n\n    const launch = document.createElement("button");\n    launch.className = "mvspeed-launch";\n    launch.textContent = "⏩";\n    launch.title = "长按倍速设置（Alt+1 开关）";\n    document.documentElement.appendChild(launch);\n\n    const panel = document.createElement("div");\n    panel.className = "mvspeed-panel";\n    panel.style.display = "none";\n    panel.innerHTML = PANEL_HTML;\n    document.documentElement.appendChild(panel);\n    S.panel = panel;\n    for (const el of panel.querySelectorAll("[data-el]")) S.els[el.dataset.el] = el;\n\n    launch.addEventListener("click", () => togglePanel());\n    panel.addEventListener("click", (e) => {\n      const btn = e.target.closest && e.target.closest("[data-act]");\n      if (!btn) return;\n      const act = btn.dataset.act;\n      if (act === "close") togglePanel(false);\n      else if (act === "diag") copyDiag();\n      else if (act === "test") simulateHold();\n    });\n    panel.addEventListener("change", (e) => {\n      const el = e.target;\n      if (el.dataset && el.dataset.opt) {\n        const key = el.dataset.opt;\n        // 只有「默认倍速」下拉要走 clampRate，加速盘位置下拉是字符串 left/right。\n        const value = el.type === "checkbox" ? el.checked\n          : key === "rate" ? clampRate(el.value) : el.value;\n        saveConfig({ [key]: value });\n      }\n    });\n    syncControls();\n    updateStatus();\n  }\n\n  function copyDiag() {\n    const text = S.els.status ? S.els.status.textContent : diagText();\n    try {\n      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {\n        navigator.clipboard.writeText(text).catch(() => {});\n      }\n    } catch (_) { /* 权限受限时至少文本可见可长按复制 */ }\n    if (S.els.status) S.els.status.textContent = text + "\\n（已尝试复制，也可长按上方文字手动复制）";\n  }\n\n  /** 面板里的「模拟一次长按」：跳过手势判定，直接验证 playbackRate 能否被改。 */\n  function simulateHold() {\n    if (!S.video) {\n      reject("没有 <video>，无法模拟");\n      return;\n    }\n    endHold();\n    S.restoreRate = Number(S.video.playbackRate) || 1;\n    S.baseRate = S.cfg.rate;\n    S.pending = true;\n    S.holding = false;\n    beginHold();\n    window.setTimeout(() => {\n      if (S.holding) endHold();\n    }, 1600);\n  }\n\n  function togglePanel(force) {\n    if (!S.panel) return;\n    S.panel.style.display = typeof force === "boolean"\n      ? (force ? "block" : "none")\n      : (S.panel.style.display === "none" ? "block" : "none");\n  }\n\n  // ---------------------------------------------------------------------------\n  // 启动\n  // ---------------------------------------------------------------------------\n\n  /** 只在真的找到 <video> 之后才跑的整套运行时：面板、手势、观察器、菜单。 */\n  function startRuntime() {\n    if (!FRAME) buildPanel();\n    scanVideo();\n    const mo = new MutationObserver(() => {\n      window.clearTimeout(S.scanTimer);\n      S.scanTimer = window.setTimeout(scanVideo, 120);\n    });\n    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) { /* ignore */ }\n    window.setInterval(scanVideo, 2500);\n    window.setInterval(() => { if (!FRAME) updateStatus(); }, 1200);\n    const reflow = () => placeLayers();\n    window.addEventListener("resize", reflow, { passive: true });\n    document.addEventListener("fullscreenchange", reflow);\n    document.addEventListener("webkitfullscreenchange", reflow);\n    // 兜底退出：窗口失焦 / 切标签页时抬起事件可能永远不来。\n    window.addEventListener("blur", endHold);\n    document.addEventListener("visibilitychange", () => {\n      if (document.hidden) endHold();\n    });\n\n    if (typeof GM_registerMenuCommand === "function") {\n      GM_registerMenuCommand("倍速：开 / 关画面手势", () => toggleEnabled());\n      GM_registerMenuCommand("快进：开 / 关右滑快进", () => toggleSwipeSeek());\n      GM_registerMenuCommand("倒退：开 / 关左滑倒退", () => toggleSwipeBack());\n      GM_registerMenuCommand("倍速：加速盘切换左 / 右", () => toggleDockSide());\n      if (!FRAME) GM_registerMenuCommand("倍速：显示 / 隐藏诊断面板", () => {\n        if (!S.panel) buildPanel();\n        togglePanel();\n      });\n    }\n    updateStatus();\n  }\n\n  /**\n   * 全站注入后的低频探测：普通网页没有 <video>，就只保留这一个 2.5s 定时器，\n   * 不建面板、不注册菜单、不挂监听、不改 DOM（看不见也摸不着）。\n   * 播放器常常是点播放后才异步插入 video，探测到就补齐整套运行时。\n   */\n  function hasVisibleVideo(rootDoc) {\n    let list = [];\n    try { list = rootDoc.querySelectorAll("video"); } catch (_) { return false; }\n    for (const v of list) {\n      let r = null;\n      try { r = v.getBoundingClientRect(); } catch (_) { continue; }\n      if (r && r.width > 40 && r.height > 24) return true;\n    }\n    return false;\n  }\n\n  let ACTIVATED = false;\n  function probeVideo() {\n    if (ACTIVATED) return;\n    // 探测只做一次浅层 querySelector，绝不递归 iframe / 扫 shadow DOM：\n    // 大页面每 2.5s 全量遍历 DOM 会有明显开销。iframe 里的 video 由各自实例负责，\n    // 真正激活后的 scanVideo() 才会做完整的 findVideoDeep。\n    if (!hasVisibleVideo(document)) {\n      window.setTimeout(probeVideo, 2500);\n      return;\n    }\n    ACTIVATED = true;\n    startRuntime();\n  }\n\n  function boot() {\n    if (FRAME) claimDoc(document); // 告诉顶层实例：这个 iframe 由我自己接管\n    probeVideo();\n  }\n\n  boot();\n})();\n'
    },
    {
      id: "magnet-subtitle-userscript",
      fileName: "missav-subtitle.user.js",
      source: `// ==UserScript==
// @name         网页视频外挂字幕（MissAV 适配）
// @namespace    magnet-subtitle-userscript
// @version      1.0.1
// @description  全站通用：给任意网页里的 <video> 叠一层可校时的字幕。在线搜字幕 / 本地导入，支持实时校时、双语样式、记住匹配结果（下次打开自动挂回）。没视频的页面不弹任何 UI。只读取页面标题文本，不接触视频流。
// @author       magnet
// @match        *://*/*
// @allFrames
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api-shoulei-ssl.xunlei.com
// @connect      subtitlecat.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/*
 * 安装：Tampermonkey / Violentmonkey → 新建脚本 → 粘贴本文件 → 保存。
 * 首次在线搜索时浏览器会问一次「允许跨域请求」，选允许（脚本只向字幕站发请求，
 * 且用 anonymous 模式，不带任何站点 cookie）。
 *
 * 用法：打开任意含 <video> 的页面 → 右下角「字」按钮 → 关键词自动取自页面标题
 *   （番号站点会直接填番号；其它站点可手动改成想搜的片名）→ 搜索 → 试播。
 *   Alt+Z        显示/隐藏面板        Alt+S   显示/隐藏字幕
 *   Alt+← / Alt+→ 校时 ∓0.5s          字幕文件可直接拖进页面
 *
 * 1.0.1 全站：@match 改成全站通配（所有 http/https 页面）并加 @allFrames，任意网站的播放器都能用。
 * 因为通配会注入所有网页 / iframe，加了「页面里真的出现可见 <video> 才激活」的闸门：
 * 没有视频的页面不建面板、不挂快捷键 / 观察器 / 定时器，只留一个 2.5s 的低频探测。
 * 同源 / 跨域 iframe 用 document 上的 owner 标记协调，同一个播放器只会被一个实例接管。
 * 搜索、解析、校时、样式、缓存等功能代码一行未改；@name 刻意不变，避免油猴重复安装。
 *
 * 边界：脚本只做三件事——读取页面标题里的番号/片名文本、找到页面里的 <video>、把字幕
 * 画在画面上。不抓取、转发或修改任何视频流，不改动播放器逻辑，不注入上游 HTML，
 * 字幕文本一律用 textContent 渲染。在线搜索只请求公开的迅雷字幕 / SubtitleCat 接口。
 *
 * 通配 @match 已覆盖所有站点与新镜像域，不用再手工补域名；@allFrames 让第三方域的
 * 播放器 iframe 也能自己跑起来。同源 iframe 由 owner 标记避免重复接管，无需配置。
 *
 * 脚本完全独立，不需要跑 magnet 服务端，也不读写项目里的任何数据。
 *
 * 本文件不依赖任何外部库；字幕解析、相关性排序与缓存淘汰逻辑与 magnet 项目
 * web/src/lib/onlineSubtitle.ts、web/src/lib/subtitleCache.ts 保持一致。
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // 常量
  // ---------------------------------------------------------------------------

  const CACHE_KEY = "mvsub_matches_v1";
  const STYLE_KEY = "mvsub_style_v1";
  const CACHE_MAX_ENTRIES = 30;
  const CACHE_MAX_CHARS = 1_200_000;
  const CACHE_MAX_SINGLE = 300_000;
  const MIN_MATCH = 0.33;
  const THUNDER_SEARCH = "https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=";
  const SUBCAT_SEARCH = "https://subtitlecat.com/index.php?search=";
  const SUBCAT_BASE = "https://subtitlecat.com/";
  const DOWNLOAD_IDS = ["download_zh-CN", "download_zh", "download_zh-TW"];

  const STYLE_DEFAULTS = {
    zhSize: 30,
    enSize: 23,
    bottom: 10,
    opacity: 0,
    outline: true,
    inverted: false,
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // ---------------------------------------------------------------------------
  // 纯函数层：不碰 DOM / GM，便于 node 里直接跑断言
  // ---------------------------------------------------------------------------

  function stripExt(name) {
    return String(name || "").replace(
      /\\.(mp4|mkv|avi|mov|webm|wmv|flv|ts|m2ts|rmvb?|srt|ass|ssa|vtt)$/i,
      "",
    );
  }

  function normalizeName(name) {
    return stripExt(name)
      .toLowerCase()
      .replace(/[[【(（][^\\]】)）]{0,60}[\\]】)）]/g, " ")
      .replace(
        /\\b(2160p|1080p|720p|480p|4k|uhd|bluray|blu-ray|bdrip|webrip|web-dl|hdtv|remux|x26[45]|h\\.?26[45]|hevc|aac|dts|hdr|10bit)\\b/gi,
        " ",
      )
      .replace(/[._-]+/g, " ")
      .replace(/\\s+/g, " ")
      .trim();
  }

  // 番号（ABC-123 / ABCD-12345 / FC2-PPV-1234567）是最靠谱的搜索词。
  function codeOf(name) {
    const s = String(name || "").toUpperCase();
    const fc2 = s.match(/\\bFC2[-_ ]?PPV[-_ ]?(\\d{5,8})\\b/);
    if (fc2) return "FC2-PPV-" + fc2[1];
    const m = s.match(/(?:^|[^A-Z0-9])([A-Z]{2,8})[-_ ]?(\\d{2,6})(?=$|[^A-Z0-9])/);
    return m ? m[1] + "-" + m[2] : "";
  }

  function episodeOf(name) {
    let m = String(name).match(/\\bS(\\d{1,2})[ ._-]*E(\\d{1,3})\\b/i);
    if (m) return [Number(m[1]), Number(m[2])];
    m = String(name).match(/第\\s*(\\d{1,3})\\s*[集话]/);
    return m ? [null, Number(m[1])] : null;
  }

  // 二元组 Dice + 词重合。番号一致给满分，番号不一致直接出局（防串集）。
  function similarity(a, b) {
    const x = normalizeName(a);
    const y = normalizeName(b);
    if (!x || !y) return 0;
    const cx = codeOf(a);
    const cy = codeOf(b);
    if (cx && cy) return cx === cy ? 0.99 : 0;
    if (cy && !cx) return 0;
    const ex = episodeOf(a);
    const ey = episodeOf(b);
    if (ex && ey && (ex[1] !== ey[1] || (ex[0] !== null && ey[0] !== null && ex[0] !== ey[0]))) return 0;
    if (x === y) return 1;
    const grams = (text) => {
      const v = text.replace(/\\s/g, "");
      const out = new Set();
      for (let i = 0; i < v.length - 1; i++) out.add(v.slice(i, i + 2));
      return out;
    };
    const g1 = grams(x);
    const g2 = grams(y);
    let common = 0;
    g1.forEach((g) => {
      if (g2.has(g)) common++;
    });
    const dice = g1.size + g2.size ? (2 * common) / (g1.size + g2.size) : 0;
    const tx = new Set(x.split(" "));
    const ty = new Set(y.split(" "));
    const tokens = (2 * [...tx].filter((t) => ty.has(t)).length) / (tx.size + ty.size);
    return clamp(
      Math.max(dice * 0.78 + tokens * 0.22, x.includes(y) || y.includes(x) ? 0.79 : 0) +
        (ex && ey ? 0.05 : 0),
      0,
      1,
    );
  }

  function rankHits(hits, keyword) {
    const seen = new Set();
    const ranked = hits
      .map((hit) => ({ ...hit, match: similarity(hit.title, keyword) }))
      .filter((hit) => hit.match >= MIN_MATCH)
      .sort((a, b) => b.match - a.match || b.score - a.score)
      .filter((hit) => {
        const key = hit.source + ":" + hit.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    // 相关性过滤全军覆没时（字幕站标题写法千奇百怪）保留原始结果，别什么都不给。
    return ranked.length ? ranked : hits;
  }

  function guessKeyword(pageTitle) {
    return codeOf(pageTitle) || normalizeName(pageTitle);
  }

  // 页面标题里往往夹着站点后缀与中文副标题，逐个来源试番号，最后退回整串标题。
  function extractKeyword(titles) {
    const list = (titles || []).filter(Boolean).map((t) => String(t).trim());
    for (const t of list) {
      const code = codeOf(t);
      if (code) return { keyword: code, code };
    }
    for (const t of list) {
      const cleaned = normalizeName(
        t.replace(/\\s*[-|–—]\\s*(missav|miss av|jav)[^|]*$/i, ""),
      );
      if (cleaned) return { keyword: cleaned, code: "" };
    }
    return { keyword: "", code: "" };
  }

  function buildCacheKey(code, host, path) {
    if (code) return "code:" + code;
    return "page:" + host + (path || "/").replace(/\\/+$/, "");
  }

  function decodeBytes(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (view.length > 3e7) throw new Error("字幕文件过大");
    const buf = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    if (view[0] === 0xff && view[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
    if (view[0] === 0xfe && view[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch (_) {
      try {
        return new TextDecoder("gb18030").decode(buf);
      } catch (_) {
        return new TextDecoder("utf-8").decode(buf);
      }
    }
  }

  function parseClock(raw) {
    const m = String(raw ?? "")
      .trim()
      .match(/^(?:(\\d{1,3}):)?(\\d{1,2}):(\\d{1,2})[,.](\\d{1,3})$/);
    if (!m) return NaN;
    return (
      ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 +
      Number(m[4].padEnd(3, "0"))
    );
  }

  function decodeEntities(text) {
    const code = (n, radix) => {
      const v = parseInt(n, radix);
      return Number.isFinite(v) && v > 0 && v <= 0x10ffff ? String.fromCodePoint(v) : "";
    };
    return text
      .replace(/&(?:nbsp|#160|#xA0);/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => code(n, 16))
      .replace(/&#(\\d+);/g, (_, n) => code(n, 10));
  }

  function cleanTags(text) {
    return decodeEntities(
      text
        .replace(/<\\s*br\\s*\\/?\\s*>/gi, "\\n")
        .replace(/<[^>]*>/g, "")
        .replace(/\\{\\\\[^}]*\\}/g, "")
        .replace(/\\\\N|\\\\n/g, "\\n"),
    )
      .replace(/\\u00a0/g, " ")
      .trim();
  }

  function parseSRT(text) {
    return text
      .replace(/^\\uFEFF/, "")
      .replace(/\\r/g, "")
      .split(/\\n\\s*\\n/)
      .flatMap((block) => {
        const lines = block.trim().split("\\n");
        const i = lines.findIndex((line) => /-->/.test(line));
        if (i < 0) return [];
        const m = lines[i].match(
          /((?:\\d{1,3}:)?\\d{1,2}:\\d{1,2}[,.]\\d{1,3})\\s*-->\\s*((?:\\d{1,3}:)?\\d{1,2}:\\d{1,2}[,.]\\d{1,3})/,
        );
        if (!m) return [];
        const start = parseClock(m[1]);
        const end = parseClock(m[2]);
        if (!(end > start)) return [];
        const body = cleanTags(lines.slice(i + 1).join("\\n"));
        return body ? [{ start, end, text: body }] : [];
      });
  }

  function parseASS(text) {
    const lines = text.replace(/\\r/g, "").split("\\n");
    let inEvents = false;
    let format = null;
    const cues = [];
    for (const line of lines) {
      if (/^\\s*\\[Events\\]/i.test(line)) {
        inEvents = true;
        continue;
      }
      if (/^\\s*\\[.+\\]/.test(line)) {
        inEvents = false;
        continue;
      }
      if (!inEvents) continue;
      if (/^\\s*Format\\s*:/i.test(line)) {
        format = line
          .replace(/^\\s*Format\\s*:/i, "")
          .split(",")
          .map((x) => x.trim().toLowerCase());
      }
      if (!/^\\s*Dialogue\\s*:/i.test(line)) continue;
      const body = line.replace(/^\\s*Dialogue\\s*:/i, "");
      const cols = format || [
        "layer", "start", "end", "style", "name",
        "marginl", "marginr", "marginv", "effect", "text",
      ];
      const parts = body.split(",");
      if (parts.length < cols.length) continue;
      const fixed = parts.slice(0, cols.length - 1).concat([parts.slice(cols.length - 1).join(",")]);
      const start = parseClock(fixed[cols.indexOf("start")]);
      const end = parseClock(fixed[cols.indexOf("end")]);
      const body2 = cleanTags(fixed[cols.indexOf("text")] ?? "");
      if (!(end > start) || !body2) continue;
      cues.push({ start, end, text: body2 });
    }
    return cues;
  }

  // SAMI：一条的结束时间 = 同语言下一条 SYNC 的起点，多语言只取内容最全的那一路。
  function parseSMI(text) {
    const body = text
      .replace(/^\\uFEFF/, "")
      .replace(/<HEAD\\b[\\s\\S]*?<\\/HEAD\\s*>/i, "")
      .replace(/<!--[\\s\\S]*?-->/g, "")
      .replace(/\\r/g, "");
    const syncs = [...body.matchAll(/<\\s*SYNC\\b([^>]*)>/gi)];
    const byLang = new Map();
    for (let i = 0; i < syncs.length; i++) {
      const sync = syncs[i];
      const stamp = sync[1].match(/\\bStart\\s*=\\s*["']?(\\d+)/i);
      if (!stamp) continue;
      const start = Number(stamp[1]);
      const from = (sync.index ?? 0) + sync[0].length;
      const to = i + 1 < syncs.length ? (syncs[i + 1].index ?? body.length) : body.length;
      const segment = body.slice(from, to);
      const ps = [...segment.matchAll(/<\\s*P\\b([^>]*)>/gi)];
      const chunks = ps.length
        ? ps.map((p, j) => ({
            lang: (p[1].match(/\\bClass\\s*[=:]?\\s*["']?([\\w-]+)/i)?.[1] ?? "").toLowerCase(),
            text: cleanTags(
              segment.slice(
                (p.index ?? 0) + p[0].length,
                j + 1 < ps.length ? (ps[j + 1].index ?? segment.length) : segment.length,
              ),
            ),
          }))
        : [{ lang: "", text: cleanTags(segment) }];
      const appeared = new Set(chunks.map((c) => c.lang));
      for (const lang of byLang.keys()) {
        if (!appeared.has(lang)) byLang.get(lang).push({ start, text: "" });
      }
      for (const chunk of chunks) {
        const list = byLang.get(chunk.lang) ?? [];
        list.push({ start, text: chunk.text });
        byLang.set(chunk.lang, list);
      }
    }
    let best = [];
    for (const entries of byLang.values()) {
      const cues = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry.text) continue;
        const end = i + 1 < entries.length ? entries[i + 1].start : entry.start + 4000;
        if (end > entry.start) cues.push({ start: entry.start, end, text: entry.text });
      }
      if (cues.length > best.length) best = cues;
    }
    return best.sort((a, b) => a.start - b.start);
  }

  function detectSubtitleKind(text, format = "") {
    const head = text.replace(/^\\uFEFF/, "").slice(0, 8192);
    if (/<SAMI\\b/i.test(head) || /<\\s*SYNC\\b[^>]*\\bStart\\s*=/i.test(head)) return "smi";
    if (/^\\s*WEBVTT\\b/im.test(head)) return "vtt";
    if (/^\\s*\\[Script Info\\]/im.test(head) || /^\\s*\\[Events\\]/im.test(head) || /^\\s*Dialogue\\s*:/im.test(head)) return "ass";
    const ext = String(format).toLowerCase().replace(/^\\./, "");
    if (ext === "ass" || ext === "ssa") return "ass";
    if (ext === "smi" || ext === "sami") return "smi";
    if (ext === "vtt") return "vtt";
    return "srt";
  }

  function describeContent(text) {
    const head = text.replace(/^\\uFEFF/, "").slice(0, 512);
    if (!head.trim()) return "上游返回了空内容";
    if (/^\\s*(?:<!doctype html|<html\\b)/i.test(head)) return "上游返回的是网页而不是字幕";
    if (head.startsWith("Rar!") || head.startsWith("PK\\u0003\\u0004") || head.charCodeAt(0) === 0x1f) {
      return "上游给的是压缩包，本脚本不拆包，请换一条候选或改用本地导入";
    }
    return "未识别的字幕格式或内容为空";
  }

  function parseSubtitle(text, format) {
    const preferred = detectSubtitleKind(text, format);
    const parsers = { srt: parseSRT, vtt: parseSRT, ass: parseASS, smi: parseSMI };
    const order = [preferred, ...["ass", "smi", "srt"].filter((k) => k !== preferred)];
    let kind = preferred;
    let cues = [];
    for (const candidate of order) {
      cues = parsers[candidate](text);
      if (cues.length) {
        kind = candidate;
        break;
      }
    }
    return { kind, cues: cues.sort((a, b) => a.start - b.start), raw: text };
  }

  // 一行中文一行其它语言是常见排版，按行拆成两块分别给字号。
  function formatLines(text) {
    const zh = [];
    const en = [];
    for (const line of text.split("\\n").map((x) => x.trim()).filter(Boolean)) {
      if (/[\\u3400-\\u9fff]/.test(line)) zh.push(line);
      else en.push(line);
    }
    return [zh.join("\\n"), en.join("\\n")];
  }

  // 允许重叠 cue，最多取 3 条，异常字幕不该把画面盖满。
  function cueAt(cues, ms) {
    let lo = 0;
    let hi = cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= ms) lo = mid + 1;
      else hi = mid;
    }
    const hits = [];
    for (let i = lo - 1; i >= 0 && i >= lo - 16; i--) {
      if (cues[i].end >= ms) hits.unshift(cues[i].text);
      if (hits.length >= 3) break;
    }
    return hits.join("\\n");
  }

  function srtStamp(ms) {
    const n = Math.max(0, Math.round(ms));
    const h = Math.floor(n / 3600000);
    const m = Math.floor(n / 60000) % 60;
    const s = Math.floor(n / 1000) % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" +
      String(s).padStart(2, "0") + "," + String(n % 1000).padStart(3, "0");
  }

  function assStamp(ms) {
    const n = Math.max(0, Math.round(ms / 10));
    const h = Math.floor(n / 360000);
    const m = Math.floor(n / 6000) % 60;
    const s = Math.floor(n / 100) % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "." +
      String(n % 100).padStart(2, "0");
  }

  function shiftedSRT(cues, offsetSeconds) {
    return (
      cues
        .map((cue, i) => {
          const start = cue.start + offsetSeconds * 1000;
          const end = cue.end + offsetSeconds * 1000;
          if (end <= 0) return null;
          return (i + 1) + "\\n" + srtStamp(Math.max(0, start)) + " --> " +
            srtStamp(Math.max(0, end)) + "\\n" + cue.text;
        })
        .filter(Boolean)
        .join("\\n\\n") + "\\n"
    );
  }

  function shiftedASS(raw, offsetSeconds) {
    let inEvents = false;
    let cols = null;
    const delta = offsetSeconds * 1000;
    return raw
      .split(/(\\r?\\n)/)
      .map((segment) => {
        if (/^\\r?\\n$/.test(segment)) return segment;
        if (/^\\s*\\[Events\\]\\s*$/i.test(segment)) {
          inEvents = true;
          cols = null;
          return segment;
        }
        if (/^\\s*\\[[^\\]]+\\]\\s*$/i.test(segment)) {
          inEvents = false;
          return segment;
        }
        if (!inEvents) return segment;
        const fmt = segment.match(/^\\s*Format\\s*:(.*)$/i);
        if (fmt) {
          cols = fmt[1].split(",").map((x) => x.trim().toLowerCase());
          return segment;
        }
        const dlg = segment.match(/^(\\s*Dialogue\\s*:)(.*)$/i);
        if (!dlg) return segment;
        const columns = cols || [
          "layer", "start", "end", "style", "name",
          "marginl", "marginr", "marginv", "effect", "text",
        ];
        const startIdx = columns.indexOf("start");
        const endIdx = columns.indexOf("end");
        if (startIdx < 0 || endIdx < 0) return segment;
        const parts = dlg[2].split(",");
        if (parts.length < columns.length) return segment;
        const start = parseClock(parts[startIdx]);
        const end = parseClock(parts[endIdx]);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return segment;
        parts[startIdx] = assStamp(start + delta);
        parts[endIdx] = assStamp(Math.max(0, end + delta));
        return dlg[1] + parts.join(",");
      })
      .join("");
  }

  function exportText(parsed, offset, adjusted) {
    if (!adjusted) return parsed.raw;
    return parsed.kind === "ass"
      ? shiftedASS(parsed.raw, offset)
      : shiftedSRT(parsed.cues, offset);
  }

  function exportName(title, kind, adjusted) {
    const base = stripExt(title).replace(/\\.(srt|ass|ssa|smi|vtt)$/i, "");
    const ext = adjusted ? (kind === "ass" ? "ass" : "srt") : kind;
    return (base || "subtitle") + (adjusted ? ".adjusted." : ".") + ext;
  }

  // 外站地址逐条校验：只走 HTTPS，挡掉私网 / 本机，避免脚本变成任意请求出口。
  function safeSubtitleURL(raw, base) {
    try {
      const u = new URL(raw, base || SUBCAT_BASE);
      if (u.protocol === "http:") u.protocol = "https:";
      if (u.protocol !== "https:") return "";
      const h = u.hostname.toLowerCase();
      if (
        h === "localhost" || h === "::1" || h === "127.0.0.1" ||
        /^10\\./.test(h) || /^192\\.168\\./.test(h) ||
        /^172\\.(1[6-9]|2\\d|3[01])\\./.test(h) ||
        h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")
      ) return "";
      return u.toString();
    } catch (_) {
      return "";
    }
  }

  // 按最新使用时间保留，同时受条数与总字符两个上限约束。
  function pruneStore(store, maxEntries, maxChars, maxSingle) {
    const entries = Object.entries(store).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
    const out = {};
    let used = 0;
    let count = 0;
    for (const [k, value] of entries) {
      if (count >= maxEntries) break;
      const size = JSON.stringify(value).length;
      if (size > maxSingle || used + size > maxChars) continue;
      out[k] = value;
      used += size;
      count++;
    }
    return out;
  }

  const PURE = {
    stripExt, normalizeName, codeOf, episodeOf, similarity, rankHits,
    guessKeyword, extractKeyword, buildCacheKey, decodeBytes, parseClock,
    cleanTags, parseSRT, parseASS, parseSMI, detectSubtitleKind,
    parseSubtitle, describeContent, formatLines, cueAt, shiftedSRT,
    shiftedASS, exportText, exportName, safeSubtitleURL, pruneStore,
  };

  // node 里 require 本文件时只导出纯函数，不启动 UI（供离线自测）。
  if (typeof window === "undefined") {
    if (typeof module !== "undefined" && module.exports) module.exports = PURE;
    return;
  }

  // 全站 + @allFrames：每个 document 一个实例，用 document 上的 owner 标记协调，
  // 同一个 <video> 只被一个实例接管。原来基于 window.top.__MVSUB_BOOTED__ 的去重在
  // 「iframe 脚本先于顶层脚本执行」时会两边各起一份，这里换成和倍速脚本对称的机制。
  function inFrame() {
    try { return window.top !== window; } catch (_) { return true; }
  }
  const FRAME = inFrame();
  const FRAME_TAG = "f" + Math.random().toString(36).slice(2, 9);
  const OWNER_ATTR = "data-mvsub-owner";

  function docClaimedByOther(vdoc) {
    try {
      const root = vdoc.documentElement;
      const owner = root && root.getAttribute && root.getAttribute(OWNER_ATTR);
      return !!(owner && owner !== FRAME_TAG);
    } catch (_) { return false; }
  }

  function claimDoc(vdoc) {
    try {
      const root = vdoc.documentElement;
      if (root && root.setAttribute) root.setAttribute(OWNER_ATTR, FRAME_TAG);
    } catch (_) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // 存储（GM_setValue 优先，退回 localStorage）
  // ---------------------------------------------------------------------------

  function storeGet(key, fallback) {
    try {
      let raw = "";
      if (typeof GM_getValue === "function") raw = GM_getValue(key, "");
      else raw = localStorage.getItem(key) || "";
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try {
      const text = JSON.stringify(value);
      if (typeof GM_setValue === "function") GM_setValue(key, text);
      else localStorage.setItem(key, text);
    } catch (_) { /* 配额满 / 隐私模式：缓存只是加速，不影响播放 */ }
  }

  function loadMatches() {
    const v = storeGet(CACHE_KEY, {});
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  function getMatch(key) {
    if (!key) return null;
    const hit = loadMatches()[key];
    return hit && typeof hit.raw === "string" && typeof hit.title === "string" ? hit : null;
  }

  function saveMatch(key, entry) {
    if (!key || !entry.raw || entry.raw.length > CACHE_MAX_SINGLE) return;
    // 新条目前插：同一毫秒内连写多条时 savedAt 相同，稳定排序才能不误淘汰最新条目。
    const rest = loadMatches();
    delete rest[key];
    const next = { [key]: { ...entry, savedAt: Date.now() }, ...rest };
    storeSet(CACHE_KEY, pruneStore(next, CACHE_MAX_ENTRIES, CACHE_MAX_CHARS, CACHE_MAX_SINGLE));
  }

  function clearMatch(key) {
    if (!key) return;
    const store = loadMatches();
    if (!(key in store)) return;
    delete store[key];
    storeSet(CACHE_KEY, store);
  }

  function loadStyle() {
    const v = storeGet(STYLE_KEY, {});
    return { ...STYLE_DEFAULTS, ...(v && typeof v === "object" ? v : {}) };
  }

  // ---------------------------------------------------------------------------
  // 网络：GM_xmlhttpRequest 绕开 CORS，anonymous 不带任何 cookie
  // ---------------------------------------------------------------------------

  function request(url, responseType) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("缺少 GM_xmlhttpRequest 权限，请检查脚本 @grant"));
        return;
      }
      GM_xmlhttpRequest({
        method: "GET",
        url,
        responseType: responseType || "text",
        timeout: 15000,
        anonymous: true,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(res.response);
          else reject(new Error("上游返回 HTTP " + res.status));
        },
        onerror: () => reject(new Error("网络请求失败")),
        ontimeout: () => reject(new Error("请求超时")),
      });
    });
  }

  function parseThunder(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error("迅雷接口返回的不是 JSON");
    }
    if (data.code !== 0 || data.result !== "ok") {
      throw new Error("迅雷接口 code=" + data.code + " result=" + data.result);
    }
    const rows = Array.isArray(data.data) ? data.data : [];
    const seen = new Set();
    const hits = [];
    for (const x of rows) {
      const url = safeSubtitleURL(String(x.url || ""));
      if (!url) continue;
      const title = String(x.name || x.extra_name || "迅雷字幕").trim();
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        id: "xl:" + hits.length,
        title,
        source: "迅雷",
        format: String(x.ext || "").replace(/^\\./, ""),
        score: Number(x.score) || 0,
        mode: "direct",
        url,
      });
    }
    return hits;
  }

  function parseSubcatRows(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const base = new URL(SUBCAT_BASE);
    const seen = new Set();
    const hits = [];
    for (const tr of doc.querySelectorAll("tr")) {
      const td = tr.querySelector("td");
      const a = td && td.querySelector("a[href]");
      if (!a) continue;
      const title = (a.textContent || "").trim();
      const href = a.getAttribute("href") || "";
      if (!title || !href) continue;
      const url = safeSubtitleURL(href, SUBCAT_BASE);
      if (!url || new URL(url).hostname !== base.hostname) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        id: "sc:" + hits.length,
        title,
        source: "SubtitleCat",
        format: "srt",
        score: 0,
        mode: "detail",
        url,
      });
      if (hits.length >= 12) break;
    }
    return hits;
  }

  function subcatDownloadURL(html, pageURL) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const byId = {};
    for (const el of doc.querySelectorAll("[id]")) {
      const href = el.getAttribute("href");
      if (href) byId[el.id] = href;
    }
    for (const id of DOWNLOAD_IDS) {
      if (!byId[id]) continue;
      const url = safeSubtitleURL(byId[id], pageURL);
      if (url) return url;
    }
    return "";
  }

  async function downloadHit(hit) {
    let url = hit.url;
    if (hit.mode === "detail") {
      const html = await request(url, "text");
      url = subcatDownloadURL(html, url);
      if (!url) throw new Error("该条目没有可用的中文字幕下载链接");
    }
    const bytes = await request(url, "arraybuffer");
    // GM 各实现的 response 可能是跨 realm 的 ArrayBuffer，用构造函数转（instanceof 会失效）。
    let view;
    try {
      view = new Uint8Array(bytes);
    } catch (_) {
      view = new Uint8Array(0);
    }
    if (!view.length) throw new Error("上游返回了空内容");
    const text = decodeBytes(view);
    if (text.charCodeAt(0) === 0x1f || text.startsWith("PK\\u0003\\u0004")) {
      throw new Error("上游给的是压缩包，本脚本不拆包，请换一条候选或本地导入");
    }
    return text;
  }

  // ---------------------------------------------------------------------------
  // 运行时状态
  // ---------------------------------------------------------------------------

  const S = {
    video: null,
    videoDoc: document,
    overlay: null,
    zhEl: null,
    enEl: null,
    active: null,     // { title, source, format }
    parsed: null,      // { kind, cues, raw }
    offset: 0,
    enabled: true,
    fromCache: false,
    style: loadStyle(),
    hits: [],
    busy: false,
    key: "",
    keyword: "",
    code: "",
    raf: 0,
    frame: 0,
    lastText: "",
    saveTimer: 0,
    panel: null,
    els: {},
  };

  function setStatus(text, isError) {
    const el = S.els.status;
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "var(--mvsub-danger, #ff8a8a)" : "var(--mvsub-subtle, #9aa4b2)";
  }

  function refreshStatus() {
    if (!S.active) {
      setStatus(S.video ? "未加载字幕。搜字幕，或把 .srt / .ass 文件拖进页面。" : "还没找到页面里的 <video>…", false);
      return;
    }
    const bits = [
      (S.fromCache ? "已自动匹配（本机缓存）" : "外挂") + "：" + S.active.title,
      S.parsed.cues.length + " 条",
      S.enabled ? "" : "已隐藏",
      S.offset ? "偏移 " + (S.offset > 0 ? "+" : "") + S.offset.toFixed(1) + "s" : "",
    ].filter(Boolean);
    setStatus(bits.join(" · "), false);
  }

  function queueSave() {
    window.clearTimeout(S.saveTimer);
    S.saveTimer = window.setTimeout(() => {
      if (!S.key || !S.active || !S.parsed) return;
      saveMatch(S.key, {
        title: S.active.title,
        source: S.active.source,
        format: S.active.format,
        raw: S.parsed.raw,
        offset: S.offset,
        enabled: S.enabled,
      });
    }, 500);
  }

  // ---------------------------------------------------------------------------
  // 字幕浮层：跟随 video 的可视矩形，全屏时挂到全屏元素里
  // ---------------------------------------------------------------------------

  // 样式全部内联：浮层可能被移到同源 iframe / 全屏元素的 document 里，
  // 顶层 document 里的 <style> 不会跟过去，靠 class 会变成「一层看不见的字」。
  function ensureOverlay() {
    if (S.overlay) return;
    const ov = document.createElement("div");
    ov.className = "mvsub-overlay";
    ov.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483000;overflow:hidden;display:none;" +
      'font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;line-height:1.35;text-align:center';
    const cue = document.createElement("div");
    cue.className = "mvsub-cue";
    cue.style.cssText =
      "position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;" +
      "gap:0.15em;padding:0 6%;word-break:break-word";
    const zh = document.createElement("div");
    zh.style.cssText = "display:block;white-space:pre-wrap";
    const zhSpan = document.createElement("span");
    zhSpan.style.cssText =
      "display:inline;color:#fff;font-weight:600;padding:0.06em 0.35em;border-radius:0.2em";
    zh.appendChild(zhSpan);
    const en = document.createElement("div");
    en.style.cssText = "display:block;white-space:pre-wrap";
    const enSpan = document.createElement("span");
    enSpan.style.cssText =
      "display:inline;color:#f2f4f8;font-weight:400;padding:0.06em 0.35em;border-radius:0.2em";
    en.appendChild(enSpan);
    cue.appendChild(zh);
    cue.appendChild(en);
    ov.appendChild(cue);
    document.documentElement.appendChild(ov);
    S.overlay = ov;
    S.cueEl = cue;
    S.zhEl = zhSpan;
    S.enEl = enSpan;
    S.zhLine = zh;
    S.enLine = en;
  }

  function placeOverlay() {
    const ov = S.overlay;
    const v = S.video;
    if (!ov || !v) return;
    const vdoc = S.videoDoc || document;
    let host = vdoc.fullscreenElement || vdoc.webkitFullscreenElement || vdoc.documentElement;
    if (host && host.tagName === "VIDEO") host = host.parentElement || vdoc.documentElement;
    if (ov.parentNode !== host) host.appendChild(ov);
    const r = v.getBoundingClientRect();
    if (!S.parsed || !S.enabled || r.width < 2 || r.height < 2) {
      ov.style.display = "none";
      return;
    }
    ov.style.display = "block";
    ov.style.left = r.left + "px";
    ov.style.top = r.top + "px";
    ov.style.width = r.width + "px";
    ov.style.height = r.height + "px";
    const scale = clamp(r.width / 1000, 0.55, 1.7);
    S.cueEl.style.bottom = S.style.bottom + "%";
    S.zhEl.style.fontSize = Math.round(S.style.zhSize * scale) + "px";
    S.enEl.style.fontSize = Math.round(S.style.enSize * scale) + "px";
    const outline = S.style.outline
      ? "-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 2px 5px #000"
      : "0 2px 5px #000";
    S.zhEl.style.textShadow = outline;
    S.enEl.style.textShadow = outline;
    const bg = "rgba(0,0,0," + (S.style.opacity / 100).toFixed(2) + ")";
    S.zhEl.style.background = bg;
    S.enEl.style.background = bg;
    S.zhLine.style.order = S.style.inverted ? "2" : "1";
    S.enLine.style.order = S.style.inverted ? "1" : "2";
    S.cueEl.style.display = "flex";
    S.cueEl.style.flexDirection = "column";
    S.cueEl.style.alignItems = "center";
    S.cueEl.style.gap = "0.15em";
  }

  function renderCue() {
    if (!S.video || !S.parsed || !S.enabled) {
      if (S.overlay) S.overlay.style.display = "none";
      return;
    }
    const t = S.video.currentTime * 1000 - S.offset * 1000;
    const text = cueAt(S.parsed.cues, t);
    if (text === S.lastText) return;
    S.lastText = text;
    const [zh, en] = formatLines(text);
    S.zhEl.textContent = zh;
    S.enEl.textContent = en;
    S.zhLine.style.display = zh ? "block" : "none";
    S.enLine.style.display = en ? "block" : "none";
  }

  function tick() {
    renderCue();
    if (++S.frame % 5 === 0) placeOverlay();
    S.raf = window.requestAnimationFrame(tick);
  }

  function startTicking() {
    if (S.raf) return;
    S.frame = 0;
    S.raf = window.requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------
  // 找 video：当前 document + 同源 iframe
  // ---------------------------------------------------------------------------

  function videosIn(doc) {
    try {
      return [...doc.querySelectorAll("video")];
    } catch (_) {
      return [];
    }
  }

  function findVideoDeep(rootDoc, depth) {
    const own = videosIn(rootDoc).filter((v) => {
      const r = v.getBoundingClientRect();
      return r.width > 80 && r.height > 40;
    });
    if (own.length) {
      own.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      });
      return { video: own[0], doc: rootDoc };
    }
    if ((depth || 0) >= 3) return null;
    for (const frame of rootDoc.querySelectorAll("iframe")) {
      let child;
      try {
        child = frame.contentDocument;
      } catch (_) {
        continue;
      }
      if (!child || docClaimedByOther(child)) continue; // 那个 frame 已由自己的实例接管
      const found = findVideoDeep(child, (depth || 0) + 1);
      if (found) return found;
    }
    return null;
  }

  function pageTitles() {
    const out = [];
    const push = (v) => {
      if (v && !out.includes(v)) out.push(v);
    };
    push(document.title);
    for (const sel of ['meta[property="og:title"]', 'meta[name="title"]', "h1", "[class*=title]"]) {
      let nodes = [];
      try {
        nodes = document.querySelectorAll(sel);
      } catch (_) {
        continue; // 老浏览器不认某个选择器时，别让整段识别崩掉
      }
      for (const el of nodes) {
        push(sel.startsWith("meta") ? el.getAttribute("content") : (el.textContent || "").trim());
      }
    }
    return out.slice(0, 12);
  }

  function scanVideo() {
    const found = findVideoDeep(document, 0);
    if (!found) {
      if (S.video) {
        S.video = null;
        refreshStatus();
      }
      return;
    }
    if (found.video === S.video && found.doc === S.videoDoc) return;
    S.video = found.video;
    S.videoDoc = found.doc;
    ensureOverlay();
    const info = extractKeyword(pageTitles());
    S.keyword = info.keyword;
    S.code = info.code;
    S.key = buildCacheKey(info.code, location.hostname, location.pathname);
    if (S.els.q && !S.els.q.value) S.els.q.value = S.keyword;
    restoreForCurrentVideo();
  }

  // ---------------------------------------------------------------------------
  // 字幕生命周期
  // ---------------------------------------------------------------------------

  function applySubtitle(raw, title, source, format, opts) {
    const parsed = parseSubtitle(raw, format);
    if (!parsed.cues.length) throw new Error(describeContent(raw));
    S.active = { title, source, format };
    S.parsed = parsed;
    S.offset = opts && Number.isFinite(opts.offset) ? opts.offset : 0;
    S.enabled = !opts || opts.enabled !== false;
    S.fromCache = !!(opts && opts.fromCache);
    S.lastText = "";
    ensureOverlay();
    placeOverlay();
    startTicking();
    queueSave();
    refreshStatus();
    syncControls();
    setStatus(
      (S.fromCache ? "已自动匹配上次选中的字幕" : "已加载") +
        "「" + title + "」· " + parsed.cues.length + " 条" +
        (S.offset ? " · 沿用偏移 " + S.offset.toFixed(1) + "s" : ""),
      false,
    );
  }

  function restoreForCurrentVideo() {
    const hit = getMatch(S.key);
    if (!hit) {
      S.active = null;
      S.parsed = null;
      S.offset = 0;
      S.enabled = true;
      S.fromCache = false;
      refreshStatus();
      return;
    }
    try {
      applySubtitle(hit.raw, hit.title, hit.source || "本机缓存", hit.format || "", {
        offset: Number.isFinite(hit.offset) ? hit.offset : 0,
        enabled: hit.enabled !== false,
        fromCache: true,
      });
    } catch (_) {
      clearMatch(S.key); // 缓存坏了就别一直卡着
      refreshStatus();
    }
  }

  async function previewHit(hit) {
    if (S.busy) return;
    S.busy = true;
    setStatus("正在获取并解析：" + hit.title, false);
    try {
      const raw = await downloadHit(hit);
      applySubtitle(raw, hit.title, hit.source, hit.format, {});
    } catch (err) {
      setStatus("预览失败：" + (err && err.message ? err.message : "请求失败") + "，换一条候选试试", true);
    } finally {
      S.busy = false;
    }
  }

  async function loadLocalFile(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setStatus("文件太大了（超过 8MB）", true);
      return;
    }
    try {
      const raw = decodeBytes(new Uint8Array(await file.arrayBuffer()));
      applySubtitle(raw, file.name, "本地文件", file.name.split(".").pop(), {});
    } catch (err) {
      setStatus("读取失败：" + (err && err.message ? err.message : "未知错误"), true);
    }
  }

  function clearAll() {
    clearMatch(S.key);
    S.active = null;
    S.parsed = null;
    S.offset = 0;
    S.enabled = true;
    S.fromCache = false;
    S.lastText = "";
    if (S.overlay) S.overlay.style.display = "none";
    setStatus("已清除字幕与本机缓存，下次打开本片不会再自动匹配", false);
    syncControls();
  }

  function saveStyle() {
    storeSet(STYLE_KEY, S.style);
    placeOverlay();
  }

  function exportSubtitle(adjusted) {
    if (!S.active || !S.parsed) {
      setStatus("请先加载一条字幕", true);
      return;
    }
    const text = exportText(S.parsed, S.offset, adjusted);
    const name = exportName(S.active.title, S.parsed.kind, adjusted);
    const url = URL.createObjectURL(new Blob(["\\uFEFF", text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name.replace(/[\\\\/:*?"<>|]/g, "_");
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus("已发起下载：" + a.download, false);
  }

  // ---------------------------------------------------------------------------
  // 面板 UI
  // ---------------------------------------------------------------------------

  const PANEL_CSS = \`
  .mvsub-launch{position:fixed;right:18px;bottom:18px;z-index:2147483600;width:44px;height:44px;
    border-radius:50%;border:1px solid #3b4453;background:#1c2230;color:#fff;font-size:17px;
    font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.45);line-height:1}
  .mvsub-launch:hover{background:#2b3446}
  .mvsub-panel{position:fixed;right:18px;bottom:70px;z-index:2147483600;width:min(370px,calc(100vw - 36px));
    max-height:min(76vh,720px);overflow-y:auto;box-sizing:border-box;padding:12px;border-radius:12px;
    background:#171c27;color:#e8edf5;border:1px solid #333c4d;box-shadow:0 12px 40px rgba(0,0,0,.6);
    font:13px/1.5 "PingFang SC","Microsoft YaHei",system-ui,sans-serif}
  .mvsub-panel *{box-sizing:border-box}
  .mvsub-panel button{font-family:inherit}
  .mvsub-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
  .mvsub-title{font-size:14px;font-weight:700}
  .mvsub-x{border:0;background:transparent;color:#9aa4b2;font-size:16px;cursor:pointer;padding:2px 6px}
  .mvsub-status{font-size:11px;color:#9aa4b2;background:#111621;border-radius:6px;padding:7px 8px;
    margin-bottom:9px;word-break:break-all;min-height:28px}
  .mvsub-sec{border-top:1px solid #2b3444;padding-top:9px;margin-top:9px}
  .mvsub-row{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap}
  .mvsub-input{flex:1;min-width:0;background:#0f1420;border:1px solid #394356;border-radius:6px;
    color:#e8edf5;padding:6px 8px;font-size:12px;outline:none}
  .mvsub-input:focus{border-color:#5b8cff}
  .mvsub-btn{background:#2f6bff;border:1px solid #2f6bff;color:#fff;border-radius:6px;
    padding:6px 10px;font-size:12px;cursor:pointer;white-space:nowrap}
  .mvsub-btn:hover{background:#4b80ff}
  .mvsub-btn-sm{background:#232c3c;border-color:#394356;font-size:11px;padding:5px 8px}
  .mvsub-btn-sm:hover{background:#303b50}
  .mvsub-danger{color:#ff9d9d;border-color:#6b3a3a}
  .mvsub-hint{font-size:11px;color:#7d8899;margin:6px 0 0}
  .mvsub-hits{max-height:190px;overflow-y:auto;margin-top:8px}
  .mvsub-hit{display:flex;align-items:center;gap:6px;padding:6px 4px;border-bottom:1px solid #252e3d}
  .mvsub-hit-title{flex:1;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mvsub-tag{font-size:10px;color:#9aa4b2;border:1px solid #394356;border-radius:4px;padding:1px 4px;flex:none}
  .mvsub-field{display:flex;align-items:center;gap:8px;font-size:11px;color:#b9c2d0;margin-top:6px}
  .mvsub-field input[type=range]{flex:1;min-width:0;accent-color:#2f6bff}
  .mvsub-field input[type=checkbox]{accent-color:#2f6bff}
  .mvsub-check{font-size:11px;color:#b9c2d0;display:flex;align-items:center;gap:4px}
  .mvsub-drop{border:1px dashed #46536a;border-radius:6px;padding:8px;text-align:center;
    font-size:11px;color:#9aa4b2;margin-top:6px}
  .mvsub-drop.on{border-color:#2f6bff;color:#cfe0ff;background:#1a2540}
  \`;

  const PANEL_HTML = \`
  <div class="mvsub-head"><span class="mvsub-title">外挂字幕</span><button data-act="close" class="mvsub-x">✕</button></div>
  <div class="mvsub-status" data-el="status"></div>
  <div class="mvsub-row">
    <input class="mvsub-input" data-el="q" placeholder="番号 / 片名" spellcheck="false" />
    <button class="mvsub-btn" data-act="search">搜索</button>
  </div>
  <p class="mvsub-hint">来源：迅雷字幕 + SubtitleCat（只向字幕站发请求，不带站点 cookie）</p>
  <div class="mvsub-hits" data-el="hits"></div>
  <div class="mvsub-sec">
    <div class="mvsub-row">
      <input type="file" data-el="file" accept=".srt,.ass,.ssa,.smi,.vtt,.txt" style="font-size:11px;max-width:100%" />
    </div>
    <div class="mvsub-drop" data-el="drop">也可以把 .srt / .ass 字幕文件直接拖进页面</div>
  </div>
  <div class="mvsub-sec">
    <div class="mvsub-row">
      <button class="mvsub-btn mvsub-btn-sm" data-act="minus">− 0.5s</button>
      <input type="range" data-el="offset" min="-30" max="30" step="0.1" style="flex:1;min-width:70px;accent-color:#2f6bff" />
      <button class="mvsub-btn mvsub-btn-sm" data-act="plus">+ 0.5s</button>
    </div>
    <div class="mvsub-row">
      <span class="mvsub-tag" data-el="offsetLabel">偏移 0.0s</span>
      <button class="mvsub-btn mvsub-btn-sm" data-act="resetOffset">归零</button>
      <button class="mvsub-btn mvsub-btn-sm" data-act="toggle">隐藏 / 显示字幕</button>
    </div>
  </div>
  <div class="mvsub-sec">
    <label class="mvsub-field">中文字号<input type="range" data-el="zhSize" min="14" max="56" step="1" /></label>
    <label class="mvsub-field">其它字号<input type="range" data-el="enSize" min="12" max="44" step="1" /></label>
    <label class="mvsub-field">底部距离<input type="range" data-el="bottom" min="2" max="35" step="1" /></label>
    <label class="mvsub-field">底色浓淡<input type="range" data-el="opacity" min="0" max="80" step="5" /></label>
    <div class="mvsub-row">
      <label class="mvsub-check"><input type="checkbox" data-el="outline" /> 描边</label>
      <label class="mvsub-check"><input type="checkbox" data-el="inverted" /> 双语上下交换</label>
    </div>
  </div>
  <div class="mvsub-sec mvsub-row">
    <button class="mvsub-btn mvsub-btn-sm" data-act="raw">导出原字幕</button>
    <button class="mvsub-btn mvsub-btn-sm" data-act="adjusted">导出校时版</button>
    <button class="mvsub-btn mvsub-btn-sm mvsub-danger" data-act="clear">清除并删缓存</button>
  </div>
  <p class="mvsub-hint">快捷键：Alt+Z 面板 · Alt+S 显隐 · Alt+←/→ 校时。选中的字幕按番号缓存在本机，重开同片自动挂回。</p>
  \`;

  function buildPanel() {
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);

    const launch = document.createElement("button");
    launch.className = "mvsub-launch";
    launch.textContent = "字";
    launch.title = "外挂字幕（Alt+Z）";
    document.documentElement.appendChild(launch);

    const panel = document.createElement("div");
    panel.className = "mvsub-panel";
    panel.style.display = "none";
    panel.innerHTML = PANEL_HTML;
    document.documentElement.appendChild(panel);
    S.panel = panel;

    for (const el of panel.querySelectorAll("[data-el]")) S.els[el.dataset.el] = el;
    S.els.q.value = S.keyword;
    refreshStatus();

    launch.addEventListener("click", () => togglePanel());
    panel.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      onAction(btn.dataset.act);
    });
    panel.addEventListener("change", (e) => {
      const el = e.target;
      if (el === S.els.file && el.files && el.files[0]) void loadLocalFile(el.files[0]);
      if (el.dataset && el.dataset.el in S.style) {
        S.style[el.dataset.el] = el.type === "checkbox" ? el.checked : Number(el.value);
        saveStyle();
        syncControls();
      }
    });
    panel.addEventListener("input", (e) => {
      const el = e.target;
      if (el === S.els.offset) {
        S.offset = Number(el.value);
        syncControls();
        queueSave();
      } else if (el.dataset && el.dataset.el in S.style && el.type === "range") {
        S.style[el.dataset.el] = Number(el.value);
        saveStyle();
      }
    });
    panel.addEventListener("dragover", (e) => {
      e.preventDefault();
      S.els.drop.classList.add("on");
    });
    panel.addEventListener("dragleave", () => S.els.drop.classList.remove("on"));
    panel.addEventListener("drop", (e) => {
      e.preventDefault();
      S.els.drop.classList.remove("on");
      if (e.dataTransfer.files[0]) void loadLocalFile(e.dataTransfer.files[0]);
    });

    // 拖到页面任意位置也能导入，但只在确实是字幕文件时接管，别破坏站点自己的拖拽。
    document.addEventListener("dragover", (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes("Files") && e.target !== panel && !panel.contains(e.target)) {
        e.preventDefault();
        S.els.drop.classList.add("on");
      }
    });
    document.addEventListener("drop", (e) => {
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (!file || !/\\.(srt|ass|ssa|smi|vtt|txt)$/i.test(file.name)) return;
      e.preventDefault();
      S.els.drop.classList.remove("on");
      void loadLocalFile(file);
    });

    syncControls();
  }

  function togglePanel(force) {
    if (!S.panel) return;
    const show = typeof force === "boolean" ? force : S.panel.style.display === "none";
    S.panel.style.display = show ? "block" : "none";
    if (show) refreshStatus();
  }

  function onAction(act) {
    switch (act) {
      case "close":
        togglePanel(false);
        break;
      case "search":
        void doSearch();
        break;
      case "minus":
        nudge(-0.5);
        break;
      case "plus":
        nudge(0.5);
        break;
      case "resetOffset":
        S.offset = 0;
        syncControls();
        queueSave();
        break;
      case "toggle":
        S.enabled = !S.enabled;
        S.lastText = "";
        syncControls();
        refreshStatus();
        queueSave();
        break;
      case "raw":
        exportSubtitle(false);
        break;
      case "adjusted":
        exportSubtitle(true);
        break;
      case "clear":
        clearAll();
        break;
      default:
        break;
    }
  }

  function nudge(delta) {
    S.offset = clamp(Math.round((S.offset + delta) * 10) / 10, -3600, 3600);
    S.lastText = "";
    syncControls();
    refreshStatus();
    queueSave();
  }

  function syncControls() {
    const e = S.els;
    if (!e.offset) return;
    e.offset.value = String(clamp(S.offset, -30, 30));
    e.offsetLabel.textContent = "偏移 " + (S.offset > 0 ? "+" : "") + S.offset.toFixed(1) + "s";
    for (const key of ["zhSize", "enSize", "bottom", "opacity"]) e[key].value = String(S.style[key]);
    for (const key of ["outline", "inverted"]) e[key].checked = !!S.style[key];
  }

  async function doSearch() {
    if (S.busy) return;
    const q = (S.els.q.value || "").trim();
    if (!q) {
      setStatus("先填一个番号或片名再搜", true);
      return;
    }
    S.busy = true;
    setStatus("正在搜索「" + q + "」…", false);
    S.els.hits.textContent = "";
    const jobs = [
      request(THUNDER_SEARCH + encodeURIComponent(q), "text")
        .then(parseThunder)
        .catch((err) => { throw new Error("迅雷：" + err.message); }),
      request(SUBCAT_SEARCH + encodeURIComponent(q), "text")
        .then(parseSubcatRows)
        .catch((err) => { throw new Error("SubtitleCat：" + err.message); }),
    ];
    const settled = await Promise.allSettled(jobs);
    const hits = [];
    const errs = [];
    settled.forEach((r) => {
      if (r.status === "fulfilled") hits.push(...r.value);
      else errs.push(r.reason.message);
    });
    S.hits = rankHits(hits, q);
    S.busy = false;
    renderHits();
    if (!S.hits.length) {
      setStatus(errs.length ? "没搜到：" + errs.join("；") : "没搜到字幕，换个关键词或改用本地导入", errs.length > 0);
    } else {
      setStatus("找到 " + S.hits.length + " 条候选，点「试播」即可挂到画面上" +
        (errs.length ? "（部分源失败：" + errs.join("；") + "）" : ""), false);
    }
  }

  function renderHits() {
    const box = S.els.hits;
    box.textContent = "";
    for (const hit of S.hits) {
      const row = document.createElement("div");
      row.className = "mvsub-hit";
      const tag = document.createElement("span");
      tag.className = "mvsub-tag";
      tag.textContent = hit.source;
      const title = document.createElement("span");
      title.className = "mvsub-hit-title";
      title.textContent = hit.title;
      title.title = hit.title;
      const btn = document.createElement("button");
      btn.className = "mvsub-btn mvsub-btn-sm";
      btn.textContent = "试播";
      btn.addEventListener("click", () => void previewHit(hit));
      row.appendChild(tag);
      row.appendChild(title);
      row.appendChild(btn);
      box.appendChild(row);
    }
  }

  // ---------------------------------------------------------------------------
  // 启动
  // ---------------------------------------------------------------------------

  /** 只在真的找到可见 <video> 之后才跑：面板、快捷键、观察器、菜单、定时兜底。 */
  function startRuntime() {
    // 先认一次番号 / 片名，面板里的关键词才不用等 video 出现。
    const info = extractKeyword(pageTitles());
    S.keyword = info.keyword;
    S.code = info.code;
    S.key = buildCacheKey(info.code, location.hostname, location.pathname);

    buildPanel();
    scanVideo();

    // 播放器常常是异步插进来的：变动观察 + 定时兜底。
    const mo = new MutationObserver(() => {
      window.clearTimeout(boot._t);
      boot._t = window.setTimeout(scanVideo, 250);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(scanVideo, 2500);
    window.addEventListener("resize", placeOverlay, { passive: true });
    document.addEventListener("fullscreenchange", placeOverlay);
    document.addEventListener("webkitfullscreenchange", placeOverlay);

    document.addEventListener("keydown", (e) => {
      if (!e.altKey) return;
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea";
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        togglePanel();
      } else if (typing) {
        return;
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        onAction("toggle");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudge(-0.5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudge(0.5);
      }
    });

    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("字幕：显示 / 隐藏面板", () => togglePanel());
      GM_registerMenuCommand("字幕：清除本机全部缓存", () => {
        storeSet(CACHE_KEY, {});
        setStatus("已清空本机字幕缓存", false);
      });
    }

    // 自动恢复缓存成功时别把「已自动匹配」的提示盖掉。
    if (S.code && !S.active) setStatus("已识别番号 " + S.code + "，点「搜索」找字幕", false);
  }

  /** 浅层检查，避免在大页面上每 2.5s 递归遍历整棵 DOM。 */
  function hasVisibleVideo(rootDoc) {
    let list = [];
    try { list = rootDoc.querySelectorAll("video"); } catch (_) { return false; }
    for (const v of list) {
      let r = null;
      try { r = v.getBoundingClientRect(); } catch (_) { continue; }
      if (r && r.width > 80 && r.height > 40) return true;
    }
    return false;
  }

  let ACTIVATED = false;
  function probeVideo() {
    if (ACTIVATED) return;
    // 没视频的普通网页：只有一个 2.5s 低频定时器，不建面板、不挂快捷键 / 观察器 /
    // 不注册菜单、不改 DOM。视频在 iframe 里时由那个 frame 自己的实例接管。
    if (!hasVisibleVideo(document)) {
      window.setTimeout(probeVideo, 2500);
      return;
    }
    ACTIVATED = true;
    startRuntime();
  }

  function boot() {
    if (FRAME) claimDoc(document); // 告诉顶层实例：这个 iframe 由我自己接管
    probeVideo();
  }

  boot();
})();
`
    }
  ];

  // src/keys.ts
  var MANIFEST_PUBLIC_KEY = "";

  // src/logger.ts
  var MAX_ENTRIES = 200;
  var LS_KEY = "__pake_loader_logs__";
  var entries = [];
  var loaded = false;
  var listeners = /* @__PURE__ */ new Set();
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) entries = parsed.slice(-MAX_ENTRIES);
    } catch {
      entries = [];
    }
  }
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(entries));
    } catch {
    }
  }
  function emit() {
    const snapshot2 = entries.slice();
    for (const fn of listeners) {
      try {
        fn(snapshot2);
      } catch {
      }
    }
  }
  function log(level, scope, message) {
    load();
    const entry = { time: Date.now(), level, scope, message: String(message).slice(0, 600) };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
    persist();
    emit();
    const prefix = "[PakeLoader]";
    const text = `${prefix} [${scope}] ${message}`;
    if (level === "error") console.error(text);
    else if (level === "warn") console.warn(text);
    else console.log(text);
  }
  function getLogs() {
    load();
    return entries.slice();
  }
  function clearLogs() {
    load();
    entries = [];
    persist();
    emit();
  }
  function subscribeLogs(fn) {
    listeners.add(fn);
    fn(getLogs());
    return () => {
      listeners.delete(fn);
    };
  }
  function describeError(err) {
    if (err instanceof Error) {
      const stack = err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : "";
      return `${err.name}: ${err.message}${stack ? " @ " + stack : ""}`;
    }
    if (typeof err === "string") return err;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  // src/gm-api.ts
  function safeCall(fn, ...args) {
    if (typeof fn !== "function") return;
    try {
      fn(...args);
    } catch (err) {
      console.warn("[PakeLoader] 脚本回调抛错：", describeError(err));
    }
  }
  function headersToText(headers) {
    const lines = [];
    try {
      if (headers && typeof headers.forEach === "function") {
        headers.forEach((value, key) => lines.push(key + ": " + value));
      } else if (headers && typeof headers.entries === "function") {
        for (const [key, value] of headers.entries()) lines.push(key + ": " + value);
      }
    } catch {
      return "";
    }
    return lines.join("\r\n");
  }
  function buildProxyUrl(proxy, target) {
    if (!proxy) return target;
    if (proxy.includes("{url}")) return proxy.replace(/\{url\}/g, encodeURIComponent(target));
    return proxy + target;
  }
  function createGmApi(ctx) {
    const scriptId = ctx.script.id;
    const { name, namespace, version, description, match, grant, runAt } = ctx.script.meta;
    const styleNodes = [];
    const menuIds = [];
    const api = {
      // ---- 同步存储 ----
      GM_getValue(key, fallback) {
        return gmGet(scriptId, String(key), fallback);
      },
      GM_setValue(key, value) {
        gmSet(scriptId, String(key), value);
        return void 0;
      },
      GM_deleteValue(key) {
        gmDelete(scriptId, String(key));
      },
      GM_listValues() {
        return gmListKeys(scriptId);
      },
      // ---- 现代 Promise 风格 ----
      GM: {
        getValue: async (key, fallback) => gmGet(scriptId, String(key), fallback),
        setValue: async (key, value) => {
          gmSet(scriptId, String(key), value);
        },
        deleteValue: async (key) => {
          gmDelete(scriptId, String(key));
        },
        listValues: async () => gmListKeys(scriptId),
        info: void 0
      },
      // ---- 样式 ----
      GM_addStyle(css) {
        const el = document.createElement("style");
        el.textContent = String(css);
        el.setAttribute("data-pake-script", scriptId);
        (document.head || document.documentElement).appendChild(el);
        styleNodes.push(el);
        return el;
      },
      // ---- 元信息 ----
      GM_info: {
        scriptHandler: "Pake Userscript Loader",
        version: ctx.loaderVersion,
        script: {
          name,
          namespace,
          version,
          description,
          matches: match,
          grant,
          runAt
        },
        scriptMetaStr: ""
      },
      // ---- 菜单 ----
      GM_registerMenuCommand(caption, fn) {
        const id = scriptId + ":" + menuIds.length + ":" + String(caption).slice(0, 24);
        menuIds.push(id);
        ctx.registerMenu({ id, scriptId, caption: String(caption), run: fn });
        return id;
      },
      GM_unregisterMenuCommand(id) {
        const i = menuIds.indexOf(id);
        if (i >= 0) menuIds.splice(i, 1);
        ctx.unregisterMenu(id);
        return void 0;
      },
      // ---- 剪贴板 ----
      GM_setClipboard(text) {
        const value = String(text);
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).catch(() => fallbackCopy(value));
            return void 0;
          }
        } catch {
        }
        fallbackCopy(value);
        return void 0;
      },
      // ---- 通知（无原生桥时降级为页面内提示） ----
      GM_notification(details) {
        const text = typeof details === "string" ? details : details && details.text ? details.text : "";
        if (text) ctx.toast(String(text).slice(0, 160));
      },
      // ---- 跨域请求 ----
      GM_xmlhttpRequest(details) {
        return gmRequest(details, ctx);
      }
    };
    api.GM.info = api.GM_info;
    const granted = new Set(grant.map((g) => g.trim().toLowerCase()));
    if (granted.size && !granted.has("none")) {
      const allowed = {};
      for (const [k, v] of Object.entries(api)) {
        const lower = k.toLowerCase();
        if (k === "GM" || granted.has(lower) || granted.has(k)) {
          allowed[k] = v;
        }
      }
      if ([...granted].some((g) => g.startsWith("gm."))) allowed.GM = api.GM;
      allowed.__cleanup = api.__cleanup;
      return allowed;
    }
    return api;
    function cleanup() {
      for (const el of styleNodes) {
        try {
          el.remove();
        } catch {
        }
      }
      styleNodes.length = 0;
      menuIds.length = 0;
      ctx.cleanupStyles();
    }
    api.__cleanup = cleanup;
  }
  function fallbackCopy(value) {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    } catch {
    }
  }
  async function gmRequest(details, ctx) {
    const url = String(details && details.url ? details.url : "");
    if (!url) {
      safeCall(details.onerror, {
        status: 0,
        statusText: "缺少 url",
        readyState: 4,
        responseHeaders: "",
        finalUrl: ""
      });
      return;
    }
    const method = (details.method || "GET").toUpperCase();
    const timeout = Number(details.timeout) > 0 ? Number(details.timeout) : 2e4;
    const controller = new AbortController();
    let timer;
    let finished = false;
    const finish = () => {
      finished = true;
      if (timer !== void 0) clearTimeout(timer);
    };
    timer = window.setTimeout(() => {
      if (finished) return;
      controller.abort();
      finish();
      safeCall(details.ontimeout, {
        status: 0,
        statusText: "timeout",
        readyState: 4,
        responseHeaders: "",
        finalUrl: url
      });
    }, timeout);
    const buildInit = () => {
      const init = {
        method,
        headers: details.headers || {},
        // anonymous: true 时不带站点 cookie，避免把登录态泄露给第三方字幕站。
        credentials: details.anonymous ? "omit" : "include",
        signal: controller.signal
      };
      if (method !== "GET" && method !== "HEAD" && details.data !== void 0) {
        init.body = details.data;
      }
      return init;
    };
    const doFetch = async (target, useNative) => {
      if (useNative) {
        const tauri = window.__TAURI__;
        const nativeFetch = tauri && tauri.http && tauri.http.fetch;
        if (typeof nativeFetch === "function") {
          return nativeFetch(target, buildInit());
        }
      }
      return fetch(target, buildInit());
    };
    const hasNative = (() => {
      const tauri = window.__TAURI__;
      return !!(tauri && tauri.http && typeof tauri.http.fetch === "function");
    })();
    let response = null;
    let lastError = null;
    if (hasNative) {
      try {
        response = await doFetch(url, true);
        if (response && response.status === 0) response = null;
      } catch (err) {
        lastError = err;
        response = null;
      }
    }
    if (!response) {
      try {
        response = await doFetch(url, false);
      } catch (err) {
        lastError = err;
      }
    }
    if (!response) {
      const proxy = ctx.corsProxy();
      if (proxy) {
        try {
          response = await doFetch(buildProxyUrl(proxy, url), false);
        } catch (err) {
          lastError = err;
        }
      }
    }
    if (!response) {
      finish();
      const message = lastError instanceof Error ? lastError.message : String(lastError);
      const isAbort = /abort/i.test(message);
      safeCall(details.onerror, {
        status: 0,
        statusText: isAbort ? "aborted" : "network error: " + message,
        readyState: 4,
        responseHeaders: "",
        finalUrl: url
      });
      return;
    }
    const base = {
      status: response.status,
      statusText: response.statusText,
      readyState: 4,
      responseHeaders: headersToText(response.headers),
      finalUrl: response.url || url
    };
    try {
      const mode = details.responseType || "text";
      if (mode === "arraybuffer") {
        base.response = await response.arrayBuffer();
      } else if (mode === "blob") {
        base.response = await response.blob();
      } else if (mode === "json") {
        const text = await response.text();
        base.responseText = text;
        try {
          base.response = JSON.parse(text);
        } catch {
          base.response = null;
        }
      } else if (mode === "document") {
        const text = await response.text();
        base.responseText = text;
        base.response = new DOMParser().parseFromString(text, "text/html");
      } else {
        const text = await response.text();
        base.responseText = text;
        base.response = text;
      }
      finish();
      safeCall(details.onload, base);
    } catch (err) {
      finish();
      base.statusText = describeError(err);
      safeCall(details.onerror, base);
    }
  }

  // src/executor.ts
  function newRegistry() {
    return {
      timers: /* @__PURE__ */ new Set(),
      intervals: /* @__PURE__ */ new Set(),
      rafs: /* @__PURE__ */ new Set(),
      observers: /* @__PURE__ */ new Set(),
      listeners: []
    };
  }
  function withTrackedGlobals(registry, fn) {
    const w = window;
    const originals = {
      setTimeout: w.setTimeout,
      clearTimeout: w.clearTimeout,
      setInterval: w.setInterval,
      clearInterval: w.clearInterval,
      requestAnimationFrame: w.requestAnimationFrame,
      cancelAnimationFrame: w.cancelAnimationFrame,
      addEventListener: w.addEventListener,
      removeEventListener: w.removeEventListener,
      MutationObserver: w.MutationObserver
    };
    const wrappedMO = originals.MutationObserver ? class TrackedMutationObserver extends originals.MutationObserver {
      constructor(cb) {
        super(cb);
        registry.observers.add(this);
      }
    } : void 0;
    try {
      w.setTimeout = (handler, timeout, ...rest) => {
        const id = originals.setTimeout.call(window, handler, timeout, ...rest);
        registry.timers.add(id);
        return id;
      };
      w.setInterval = (handler, timeout, ...rest) => {
        const id = originals.setInterval.call(window, handler, timeout, ...rest);
        registry.intervals.add(id);
        return id;
      };
      w.requestAnimationFrame = (cb) => {
        const id = originals.requestAnimationFrame.call(window, cb);
        registry.rafs.add(id);
        return id;
      };
      if (wrappedMO) w.MutationObserver = wrappedMO;
      w.addEventListener = function(type, fn2, opts) {
        if (fn2) registry.listeners.push({ target: this || window, type, fn: fn2, opts });
        return originals.addEventListener.call(this || window, type, fn2, opts);
      };
      return fn();
    } finally {
      w.setTimeout = originals.setTimeout;
      w.setInterval = originals.setInterval;
      w.requestAnimationFrame = originals.requestAnimationFrame;
      w.addEventListener = originals.addEventListener;
      if (originals.MutationObserver) w.MutationObserver = originals.MutationObserver;
    }
  }
  function disposeResources(registry) {
    for (const id of registry.timers) {
      try {
        window.clearTimeout(id);
      } catch {
      }
    }
    for (const id of registry.intervals) {
      try {
        window.clearInterval(id);
      } catch {
      }
    }
    for (const id of registry.rafs) {
      try {
        window.cancelAnimationFrame(id);
      } catch {
      }
    }
    for (const ob of registry.observers) {
      try {
        ob.disconnect();
      } catch {
      }
    }
    for (const { target, type, fn, opts } of registry.listeners) {
      try {
        target.removeEventListener(type, fn, opts);
      } catch {
      }
    }
    registry.timers.clear();
    registry.intervals.clear();
    registry.rafs.clear();
    registry.observers.clear();
    registry.listeners.length = 0;
  }
  function apiToParams(api) {
    const names = [];
    const values = [];
    for (const key of Object.keys(api)) {
      if (key.startsWith("__")) continue;
      if (!/^[A-Za-z_$][\w$]*$/.test(key)) continue;
      names.push(key);
      values.push(api[key]);
    }
    return { names, values };
  }
  function runScript(record, ctx) {
    const registry = newRegistry();
    const api = createGmApi(ctx);
    const { names, values } = apiToParams(api);
    const cleanup = api.__cleanup;
    const dispose = () => {
      try {
        cleanup == null ? void 0 : cleanup();
      } catch {
      }
      disposeResources(registry);
    };
    try {
      const body = record.source + "\n//# sourceURL=pake-userscript://" + record.id + ".user.js";
      const factory = new Function(...names, body);
      withTrackedGlobals(registry, () => factory(...values));
      log("info", record.id, `已执行（v${record.meta.version}）`);
    } catch (err) {
      const message = describeError(err);
      log("error", record.id, "执行失败：" + message);
      record.lastError = message;
      dispose();
      return { id: record.id, record, startedAt: Date.now(), dispose: () => void 0 };
    }
    return {
      id: record.id,
      record,
      startedAt: Date.now(),
      dispose
    };
  }

  // src/matcher.ts
  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function compileMatchPattern(pattern) {
    const raw = String(pattern || "").trim();
    if (raw === "<all_urls>") {
      return { regex: /^(https?|file|ftp):\/\/[^/]+\/.*$/ };
    }
    const m = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(raw);
    if (!m) return null;
    const [, scheme, host, path] = m;
    const schemeRe = scheme === "*" ? "https?" : escapeRegExp(scheme);
    let hostRe;
    if (host === "*") {
      hostRe = "[^/]+";
    } else if (host.startsWith("*.")) {
      hostRe = "(?:[^/]+\\.)?" + escapeRegExp(host.slice(2));
    } else {
      hostRe = escapeRegExp(host);
    }
    const pathRe = path.split("*").map(escapeRegExp).join(".*");
    return { regex: new RegExp("^" + schemeRe + "://" + hostRe + pathRe + "$", "i") };
  }
  function compileGlob(pattern) {
    const raw = String(pattern || "").trim();
    if (!raw) return null;
    if (/^(\*|https?|file|ftp):\/\//.test(raw)) return compileMatchPattern(raw);
    if (/^[\w.*-]+\//.test(raw) && !raw.startsWith("/")) {
      const withScheme = compileMatchPattern("*://" + raw);
      if (withScheme) return withScheme;
    }
    const re = raw.split("*").map(escapeRegExp).join(".*");
    return { regex: new RegExp("^" + re + "$", "i") };
  }
  var patternCache = /* @__PURE__ */ new Map();
  function compile(pattern, kind) {
    var _a;
    const key = kind + "|" + pattern;
    if (patternCache.has(key)) return (_a = patternCache.get(key)) != null ? _a : null;
    const compiled = kind === "match" ? compileMatchPattern(pattern) : compileGlob(pattern);
    patternCache.set(key, compiled);
    return compiled;
  }
  function urlTargets(href) {
    let withHash = String(href || "");
    let withoutHash = withHash;
    try {
      const u = new URL(withHash);
      withoutHash = u.origin + u.pathname + u.search;
    } catch {
      const i = withoutHash.indexOf("#");
      if (i >= 0) withoutHash = withoutHash.slice(0, i);
    }
    return { withHash, withoutHash };
  }
  function testAny(patterns, target, kind) {
    for (const p of patterns) {
      const c = compile(p, kind);
      if (c && c.regex.test(target)) return true;
    }
    return false;
  }
  function matchesUrl(meta, href) {
    const { withHash, withoutHash } = urlTargets(href);
    const hasPositive = meta.match.length > 0 || meta.include.length > 0;
    const positive = testAny(meta.match, withoutHash, "match") || testAny(meta.include, withHash, "glob");
    if (!hasPositive || !positive) return false;
    if (testAny(meta.excludeMatch, withoutHash, "match")) return false;
    if (testAny(meta.exclude, withHash, "glob")) return false;
    return true;
  }

  // src/metadata.ts
  var HEADER_OPEN = /\/\/\s*==UserScript==/;
  var HEADER_CLOSE = /\/\/\s*==\/UserScript==/;
  var MULTI_KEYS = /* @__PURE__ */ new Set([
    "match",
    "include",
    "exclude",
    "exclude-match",
    "grant",
    "require",
    "connect",
    "resource"
  ]);
  function extractHeaderBlock(source) {
    const text = String(source || "");
    const open = HEADER_OPEN.exec(text);
    if (!open) return null;
    const rest = text.slice(open.index);
    const close = HEADER_CLOSE.exec(rest);
    return close ? rest.slice(0, close.index) : rest.slice(0, 8192);
  }
  function emptyMeta() {
    return {
      name: "",
      namespace: "",
      version: "0.0.0",
      description: "",
      author: "",
      match: [],
      include: [],
      exclude: [],
      excludeMatch: [],
      grant: [],
      require: [],
      runAt: "document-end",
      allFrames: false,
      connect: [],
      extra: {}
    };
  }
  function parseMetadata(source, fallbackName = "未命名脚本") {
    var _a;
    const block = extractHeaderBlock(source);
    if (block === null) {
      throw new Error("缺少 ==UserScript== 元数据块");
    }
    const meta = emptyMeta();
    const extra = {};
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.replace(/^\s*\/\/\s?/, "").trim();
      if (!line || line.startsWith("==")) continue;
      const m = /^@([\w:-]+)(?:\s+(.*))?$/.exec(line);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const value = (m[2] || "").trim();
      switch (key) {
        case "name":
          if (!meta.name) meta.name = value;
          break;
        case "namespace":
          if (!meta.namespace) meta.namespace = value;
          break;
        case "version":
          if (value) meta.version = value;
          break;
        case "description":
          if (!meta.description) meta.description = value;
          break;
        case "author":
          if (!meta.author) meta.author = value;
          break;
        case "match":
          if (value) meta.match.push(value);
          break;
        case "include":
          if (value) meta.include.push(value);
          break;
        case "exclude":
          if (value) meta.exclude.push(value);
          break;
        case "exclude-match":
          if (value) meta.excludeMatch.push(value);
          break;
        case "grant":
          meta.grant.push(value || "none");
          break;
        case "require":
          if (value) meta.require.push(value);
          break;
        case "connect":
          if (value) meta.connect.push(value);
          break;
        case "run-at":
          if (value === "document-start" || value === "document-end" || value === "document-idle") {
            meta.runAt = value;
          }
          break;
        case "allframes":
          meta.allFrames = value !== "false";
          break;
        default:
          if (MULTI_KEYS.has(key)) {
            (extra[_a = "@" + key] || (extra[_a] = [])).push(value);
          } else {
            extra["@" + key] = [value];
          }
      }
    }
    if (!meta.name) meta.name = fallbackName;
    if (!meta.namespace) meta.namespace = meta.name;
    if (!meta.match.length && !meta.include.length) {
      meta.match.push("*://*/*");
    }
    meta.extra = extra;
    return meta;
  }
  function compareVersion(a, b) {
    const parse = (v) => String(v || "0").replace(/^v/i, "").split(/[.+-]/).map((x2) => {
      const n = parseInt(x2, 10);
      return Number.isFinite(n) ? n : 0;
    });
    const x = parse(a);
    const y = parse(b);
    const len = Math.max(x.length, y.length);
    for (let i = 0; i < len; i++) {
      const diff = (x[i] || 0) - (y[i] || 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
  }
  function scriptIdOf(meta, fallback) {
    const base = meta.namespace || meta.name || fallback;
    const slug = String(base).trim().replace(/[^\w.:-]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || fallback;
  }

  // src/manager-ui.ts
  var HOST_ID = "pake-userscript-loader-host";
  var CSS = `
:host{all:initial}
*{box-sizing:border-box}
.wrap{position:fixed;inset:0;z-index:2147483640;pointer-events:none;
  font:13px/1.5 "PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif;
  color:#e8edf5;-webkit-tap-highlight-color:transparent}
.fab{position:fixed;top:12px;right:10px;width:42px;height:42px;border-radius:12px;
  border:1px solid rgba(255,255,255,.16);background:rgba(28,34,48,.82);
  color:#dbe4f3;font-size:19px;line-height:1;cursor:pointer;pointer-events:auto;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  box-shadow:0 4px 14px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}
.fab:active{background:rgba(45,56,78,.92)}
/* 面板滑出后齿轮正好压在标题栏上，打开期间直接藏起来 */
.open .fab{display:none}
.mask{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:auto;opacity:0;
  transition:opacity .2s}
.panel{position:absolute;top:0;right:0;bottom:0;width:min(370px,94vw);pointer-events:auto;
  background:#151a24;border-left:1px solid #2a3345;display:flex;flex-direction:column;
  transform:translateX(101%);transition:transform .24s cubic-bezier(.22,.85,.25,1)}
.open .mask{opacity:1}
.open .panel{transform:translateX(0)}
.head{display:flex;align-items:center;gap:8px;padding:12px 12px 10px;border-bottom:1px solid #242c3b;flex:none}
.title{font-size:14px;font-weight:700}
.ver{font-size:10px;color:#7f8b9e;border:1px solid #333d4f;border-radius:4px;padding:0 5px}
.close{margin-left:auto;width:34px;height:34px;border:0;border-radius:8px;background:#232c3c;
  color:#b8c2d3;font-size:15px;cursor:pointer}
.body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:10px 12px 28px}
.card{background:#1b2230;border:1px solid #2a3345;border-radius:10px;padding:10px;margin-bottom:9px}
.row{display:flex;align-items:center;gap:8px}
.row+.row{margin-top:8px}
.name{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{font-size:11px;color:#8b96a8;margin-top:3px;word-break:break-word}
.tag{font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid #39445a;color:#9aa6b9;flex:none}
.tag.on{color:#8ee0a8;border-color:#2f6b47;background:rgba(60,160,100,.13)}
.tag.err{color:#ff9d9d;border-color:#6b3a3a;background:rgba(180,70,70,.13)}
.tag.off{color:#8b96a8}
.sw{flex:none;width:46px;height:27px;border-radius:14px;background:#39445a;position:relative;
  cursor:pointer;transition:background .18s}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;
  background:#fff;transition:transform .18s}
.sw.on{background:#2f6bff}
.sw.on::after{transform:translateX(19px)}
.btn{border:1px solid #39445a;background:#24304a;color:#cfd9ea;border-radius:8px;
  padding:8px 11px;font-size:12px;cursor:pointer;font-family:inherit}
.btn:active{background:#2f3c58}
.btn.primary{background:#2f6bff;border-color:#2f6bff;color:#fff}
.btn.primary:active{background:#4a80ff}
.btn.wide{width:100%;text-align:center}
.btn:disabled{opacity:.5;cursor:default}
.sec{margin:16px 0 8px;font-size:11px;color:#7f8b9e;letter-spacing:.04em;text-transform:uppercase}
.inp,.sel{width:100%;background:#0f1420;border:1px solid #39445a;border-radius:8px;
  color:#e8edf5;padding:9px 10px;font-size:12px;font-family:inherit;outline:none}
.inp:focus{border-color:#2f6bff}
.field{font-size:11px;color:#9aa6b9;margin:9px 0 4px;display:flex;align-items:center;gap:6px}
.hint{font-size:10px;color:#6f7b8d;margin-top:5px;line-height:1.55;word-break:break-word}
details{border-top:1px solid #242c3b;margin-top:9px;padding-top:8px}
summary{font-size:11px;color:#8b96a8;cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}
summary::before{content:"▸ ";color:#5c6879}
details[open] summary::before{content:"▾ "}
.kv{font-size:11px;color:#9aa6b9;margin-top:5px;word-break:break-all;line-height:1.6}
.msg{font-size:11px;padding:8px 10px;border-radius:8px;margin-bottom:9px;
  background:rgba(47,107,255,.12);border:1px solid rgba(47,107,255,.32);color:#c3d6ff}
.msg.err{background:rgba(180,70,70,.13);border-color:#6b3a3a;color:#ffb4b4}
.logline{font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  color:#8f9bad;margin-top:4px;line-height:1.5;word-break:break-word}
.logline b{font-weight:600;color:#a9b6c9}
.logline.error{color:#ff9d9d}
.logline.update{color:#8ee0a8}
.logline.warn{color:#ffd28a}
.menu{border:1px solid #39445a;background:#1f2836;color:#cbd6e6;border-radius:8px;
  padding:9px 10px;font-size:12px;cursor:pointer;width:100%;text-align:left;margin-top:6px;
  font-family:inherit}
.menu:active{background:#28344a}
.empty{font-size:11px;color:#6f7b8d;padding:6px 0}
`;
  function esc(text) {
    return String(text).replace(
      /[&<>"']/g,
      (c) => c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
    );
  }
  function timeText(ts) {
    if (!ts) return "从未";
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function clockText(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  var ManagerUI = class {
    constructor(deps) {
      this.host = null;
      this.root = null;
      this.open = false;
      this.deps = deps;
    }
    mount() {
      if (this.host) return;
      const host = document.createElement("div");
      host.id = HOST_ID;
      host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483640";
      const root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = CSS;
      const wrap = document.createElement("div");
      wrap.className = "wrap";
      wrap.innerHTML = `
      <div class="mask" data-act="close"></div>
      <aside class="panel">
        <div class="head">
          <span class="title">脚本管理器</span>
          <span class="ver">v${esc(this.deps.loaderVersion)}</span>
          <button class="close" data-act="close">✕</button>
        </div>
        <div class="body" data-el="body"></div>
      </aside>
      <button class="fab" data-act="toggle" title="脚本管理器">⚙</button>
    `;
      root.appendChild(style);
      root.appendChild(wrap);
      (document.body || document.documentElement).appendChild(host);
      this.host = host;
      this.root = root;
      wrap.addEventListener("click", (e) => this.onClick(e));
      wrap.addEventListener("change", (e) => this.onChange(e));
      wrap.addEventListener("input", (e) => this.onInput(e));
      this.render();
    }
    destroy() {
      var _a;
      (_a = this.host) == null ? void 0 : _a.remove();
      this.host = null;
      this.root = null;
    }
    /** 面板是否处于打开状态（用于决定要不要显示 toast）。 */
    isOpen() {
      return this.open;
    }
    setOpen(open) {
      var _a;
      this.open = open;
      const wrap = (_a = this.root) == null ? void 0 : _a.querySelector(".wrap");
      if (wrap) wrap.classList.toggle("open", open);
      if (open) this.render();
    }
    toggle() {
      this.setOpen(!this.open);
    }
    /** 重绘。打开时才渲染内容，关闭状态下不做无谓的 DOM 操作。 */
    render() {
      var _a, _b;
      const snapshot2 = this.deps.getSnapshot();
      const wrap = (_a = this.root) == null ? void 0 : _a.querySelector(".wrap");
      if (!wrap) return;
      wrap.style.display = "";
      const fab = wrap.querySelector(".fab");
      fab.style.display = snapshot2.config.showFab ? "" : "none";
      const body = wrap.querySelector('[data-el="body"]');
      const active = (_b = this.root) == null ? void 0 : _b.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "SELECT")) return;
      const scrollTop = body.scrollTop;
      body.innerHTML = this.bodyHtml(snapshot2);
      body.scrollTop = scrollTop;
    }
    bodyHtml(s) {
      const parts = [];
      if (s.message) {
        parts.push(`<div class="msg${s.messageError ? " err" : ""}">${esc(s.message)}</div>`);
      }
      parts.push(`<div class="sec" style="margin-top:0">脚本 ${s.scripts.length} 个</div>`);
      if (!s.scripts.length) {
        parts.push('<div class="empty">脚本库是空的。检查一下 build 时 scripts/ 目录有没有内容。</div>');
      }
      for (const script of s.scripts) {
        const running = s.running.includes(script.id);
        const originLabel = script.origin === "builtin" ? "内置" : script.origin === "remote" ? "远程" : "本地";
        const stateTag = script.lastError ? '<span class="tag err">执行报错</span>' : running ? '<span class="tag on">运行中</span>' : script.enabled ? '<span class="tag">未匹配</span>' : '<span class="tag off">已禁用</span>';
        parts.push(`
        <div class="card" data-card="${esc(script.id)}">
          <div class="row">
            <div class="name" title="${esc(script.meta.name)}">${esc(script.meta.name)}</div>
            <div class="sw${script.enabled ? " on" : ""}" data-act="toggleScript" data-id="${esc(script.id)}" role="switch" aria-checked="${script.enabled}"></div>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <span class="tag">v${esc(script.meta.version)}</span>
            <span class="tag">${originLabel}</span>
            ${stateTag}
          </div>
          <div class="meta">${esc(script.meta.description || "（无描述）")}</div>
          <details>
            <summary>详情</summary>
            <div class="kv">匹配：${esc(script.meta.match.concat(script.meta.include).join(" · "))}</div>
            <div class="kv">权限：${esc(script.meta.grant.join(" · ") || "无")}</div>
            <div class="kv">执行时机：${esc(script.meta.runAt)}</div>
            <div class="kv">更新时间：${timeText(script.updatedAt)}</div>
            ${script.lastError ? `<div class="kv" style="color:#ff9d9d">最近错误：${esc(script.lastError)}</div>` : ""}
            <div class="row" style="margin-top:8px">
              ${script.previous ? `<button class="btn" data-act="rollback" data-id="${esc(script.id)}">回退到 v${esc(script.previous.version)}</button>` : ""}
              <button class="btn" data-act="clearData" data-id="${esc(script.id)}">清除脚本数据</button>
            </div>
          </details>
        </div>
      `);
      }
      parts.push(`
      <div class="row" style="margin-top:2px">
        <button class="btn" data-act="enableAll" style="flex:1">全部启用</button>
        <button class="btn" data-act="disableAll" style="flex:1">全部禁用</button>
      </div>
    `);
      if (s.menus.length) {
        parts.push('<div class="sec">脚本菜单</div>');
        for (const cmd of s.menus) {
          parts.push(`<button class="menu" data-act="runMenu" data-id="${esc(cmd.id)}">${esc(cmd.caption)}</button>`);
        }
      }
      const c = s.config;
      parts.push(`
      <div class="sec">设置</div>
      <div class="card">
        <div class="row">
          <div style="flex:1">
            <div class="name" style="font-size:12px">启用脚本</div>
            <div class="meta">总开关，关闭后不执行任何脚本</div>
          </div>
          <div class="sw${c.enabled ? " on" : ""}" data-act="cfgBool" data-key="enabled" role="switch"></div>
        </div>
        <div class="row">
          <div style="flex:1">
            <div class="name" style="font-size:12px">显示悬浮入口</div>
            <div class="meta">关掉后只能通过脚本菜单找回</div>
          </div>
          <div class="sw${c.showFab ? " on" : ""}" data-act="cfgBool" data-key="showFab" role="switch"></div>
        </div>
      </div>

      <div class="card">
        <div class="field">Manifest 地址</div>
        <input class="inp" data-el="manifestUrl" value="${esc(c.manifestUrl)}" placeholder="https://example.com/missav-lite/update.json" spellcheck="false" />
        <div class="hint">留空则只用内置脚本。填了以后可远程更新脚本，不用重新打包 APK。</div>

        <div class="row" style="margin-top:10px">
          <div style="flex:1">
            <div class="name" style="font-size:12px">自动检查更新</div>
            <div class="meta">每 ${c.updateIntervalHours} 小时一次</div>
          </div>
          <div class="sw${c.autoUpdate ? " on" : ""}" data-act="cfgBool" data-key="autoUpdate" role="switch"></div>
        </div>

        <div class="field">检查间隔</div>
        <select class="sel" data-el="updateIntervalHours">
          ${[6, 12, 24, 48, 168].map((h) => `<option value="${h}"${h === c.updateIntervalHours ? " selected" : ""}>${h >= 168 ? "每周" : h + " 小时"}</option>`).join("")}
        </select>

        <button class="btn primary wide" data-act="checkUpdate" style="margin-top:10px" ${s.busy ? "disabled" : ""}>
          ${s.busy ? "正在检查…" : "立即检查更新"}
        </button>
        <div class="hint">上次检查：${timeText(s.lastCheck)}</div>

        <div class="field">CORS 中继（可选）</div>
        <input class="inp" data-el="corsProxy" value="${esc(c.corsProxy)}" placeholder="https://你的中继/?url={url}" spellcheck="false" />
        <div class="hint">字幕脚本要访问迅雷字幕和 SubtitleCat。如果直连被 CORS 挡住，填一个带 {url} 占位的中继地址，直连失败时会自动改走它。</div>
      </div>

      <div class="row">
        <button class="btn" data-act="reload" style="flex:1">刷新页面以使改动生效</button>
      </div>
      <div class="hint">启用 / 禁用脚本后，已注入的脚本不会自动退出。刷新一次最干净。</div>
    `);
      parts.push('<div class="sec">最近日志</div>');
      if (!s.logs.length) {
        parts.push('<div class="empty">暂无日志</div>');
      } else {
        const recent = s.logs.slice(-40).reverse();
        for (const line of recent) {
          parts.push(
            `<div class="logline ${esc(line.level)}">${clockText(line.time)} <b>${esc(line.scope)}</b> ${esc(line.message)}</div>`
          );
        }
      }
      return parts.join("");
    }
    onClick(e) {
      const target = e.target.closest("[data-act]");
      if (!target) return;
      const act = target.dataset.act || "";
      const id = target.dataset.id || "";
      switch (act) {
        case "close":
          this.setOpen(false);
          break;
        case "toggle":
          this.toggle();
          break;
        case "toggleScript": {
          const snapshot2 = this.deps.getSnapshot();
          const script = snapshot2.scripts.find((s) => s.id === id);
          if (script) this.deps.onToggleScript(id, !script.enabled);
          break;
        }
        case "enableAll":
          this.deps.onToggleAll(true);
          break;
        case "disableAll":
          this.deps.onToggleAll(false);
          break;
        case "checkUpdate":
          this.deps.onCheckUpdate();
          break;
        case "rollback":
          this.deps.onRollback(id);
          break;
        case "clearData":
          this.deps.onClearData(id);
          break;
        case "runMenu":
          this.deps.onRunMenu(id);
          break;
        case "reload":
          this.deps.onReload();
          break;
        case "cfgBool": {
          const key = target.dataset.key;
          if (!key) break;
          const snapshot2 = this.deps.getSnapshot();
          const current = Boolean(snapshot2.config[key]);
          this.deps.onPatchConfig({ [key]: !current });
          break;
        }
        default:
          break;
      }
    }
    onChange(e) {
      const el = e.target;
      const key = el.dataset.el;
      if (!key) return;
      if (key === "manifestUrl") {
        this.deps.onPatchConfig({ manifestUrl: el.value.trim() });
      } else if (key === "corsProxy") {
        this.deps.onPatchConfig({ corsProxy: el.value.trim() });
      } else if (key === "updateIntervalHours") {
        this.deps.onPatchConfig({ updateIntervalHours: Number(el.value) || 24 });
      }
    }
    onInput(e) {
      const el = e.target;
      if (el.dataset.el === "manifestUrl" && el.value.length > 400) {
        el.value = el.value.slice(0, 400);
      }
    }
    toast(text, isError = false) {
      var _a;
      const wrap = (_a = this.root) == null ? void 0 : _a.querySelector(".wrap");
      if (!wrap) return;
      const el = document.createElement("div");
      el.textContent = text;
      el.style.cssText = "position:absolute;left:50%;bottom:76px;transform:translateX(-50%);max-width:88vw;padding:10px 14px;border-radius:10px;font-size:12px;line-height:1.5;pointer-events:none;background:" + (isError ? "rgba(120,40,40,.94)" : "rgba(28,34,48,.94)") + ";color:#fff;border:1px solid rgba(255,255,255,.16);box-shadow:0 8px 24px rgba(0,0,0,.4);text-align:center;opacity:0;transition:opacity .18s";
      wrap.appendChild(el);
      requestAnimationFrame(() => {
        el.style.opacity = "1";
      });
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 220);
      }, 2600);
    }
  };

  // src/updater.ts
  var LAST_CHECK_KEY = "lastUpdateCheck";
  var DOWNLOAD_HOST_ALLOWLIST = [
    "github.io",
    "githubusercontent.com",
    "cdn.jsdelivr.net",
    "pages.dev",
    "unpkg.com"
  ];
  function emptyResult() {
    return {
      ok: true,
      checkedAt: 0,
      installed: [],
      updated: [],
      upToDate: [],
      errors: [],
      skipped: []
    };
  }
  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    if (!globalThis.crypto || !crypto.subtle) {
      throw new Error("当前环境不支持 crypto.subtle，无法校验脚本摘要");
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function hostAllowed(target, manifestUrl) {
    let u;
    let base;
    try {
      u = new URL(target);
      base = new URL(manifestUrl);
    } catch {
      return false;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.hostname === base.hostname) return true;
    return DOWNLOAD_HOST_ALLOWLIST.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  }
  function validateManifest(raw) {
    const obj = raw;
    if (!obj || typeof obj !== "object") throw new Error("Manifest 不是 JSON 对象");
    if (!Array.isArray(obj.scripts)) throw new Error("Manifest 缺少 scripts 数组");
    const scripts = [];
    for (const item of obj.scripts) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.id || "").trim();
      const version = String(item.version || "").trim();
      const url = String(item.url || "").trim();
      const sha256 = String(item.sha256 || "").trim().toLowerCase();
      if (!id || !version || !url) continue;
      if (!/^[0-9a-f]{64}$/.test(sha256)) {
        throw new Error(`脚本 ${id} 的 sha256 格式不正确`);
      }
      scripts.push({ ...item, id, version, url, sha256 });
    }
    return { ...obj, scripts };
  }
  async function verifySignature(rawText, signatureBase64, publicKeyBase64) {
    if (!globalThis.crypto || !crypto.subtle) throw new Error("当前环境不支持 WebCrypto");
    const b64ToBuffer = (b64) => {
      const bin = atob(b64.trim());
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out.buffer;
    };
    let key;
    try {
      key = await crypto.subtle.importKey(
        "raw",
        b64ToBuffer(publicKeyBase64),
        { name: "Ed25519" },
        false,
        ["verify"]
      );
    } catch (err) {
      throw new Error("无法导入签名公钥（当前 WebView 可能不支持 Ed25519）：" + describeError(err));
    }
    const ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      b64ToBuffer(signatureBase64),
      new TextEncoder().encode(rawText)
    );
    if (!ok) throw new Error("Manifest 签名校验失败，拒绝本次更新");
  }
  async function fetchText(url, timeoutMs = 15e3) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
  async function checkForUpdates(opts) {
    const result = emptyResult();
    result.checkedAt = Date.now();
    const { scripts, config } = opts;
    if (!config.manifestUrl) {
      result.ok = false;
      result.errors.push("未配置 Manifest 地址");
      return { scripts, result };
    }
    let rawText;
    try {
      rawText = await fetchText(config.manifestUrl);
    } catch (err) {
      result.ok = false;
      result.errors.push("拉取 Manifest 失败：" + describeError(err));
      log("warn", "loader", result.errors[0]);
      return { scripts, result };
    }
    if (config.verifySignature) {
      if (!opts.publicKeyBase64) {
        result.ok = false;
        result.errors.push("已开启签名校验，但 APK 内未内置公钥");
        return { scripts, result };
      }
      try {
        const sigUrl = new URL("update.json.sig", config.manifestUrl).toString();
        const sig = (await fetchText(sigUrl)).trim();
        await verifySignature(rawText, sig, opts.publicKeyBase64);
      } catch (err) {
        result.ok = false;
        result.errors.push(describeError(err));
        log("error", "loader", "签名校验未通过：" + describeError(err));
        return { scripts, result };
      }
    }
    let manifest;
    try {
      manifest = validateManifest(JSON.parse(rawText));
    } catch (err) {
      result.ok = false;
      result.errors.push("Manifest 格式错误：" + describeError(err));
      return { scripts, result };
    }
    if (manifest.minLoaderVersion && compareVersion(opts.loaderVersion, manifest.minLoaderVersion) < 0) {
      result.errors.push(`Loader 版本过低（需要 ≥ ${manifest.minLoaderVersion}），请更新 APK`);
    }
    const next = scripts.map((s) => ({ ...s }));
    const byId = new Map(next.map((s) => [s.id, s]));
    for (const entry of manifest.scripts) {
      const local = byId.get(entry.id);
      if (local && compareVersion(entry.version, local.meta.version) <= 0) {
        result.upToDate.push(entry.id);
        continue;
      }
      if (!hostAllowed(entry.url, config.manifestUrl)) {
        result.errors.push(`${entry.id}：下载地址不在允许的域名内（${entry.url}）`);
        continue;
      }
      try {
        const source = await fetchText(entry.url, 2e4);
        const digest = await sha256Hex(source);
        if (digest !== entry.sha256.toLowerCase()) {
          result.errors.push(`${entry.id}：SHA-256 不匹配，已拒绝安装`);
          log("error", entry.id, "SHA-256 不匹配，保留原版本");
          continue;
        }
        const meta = parseMetadata(source, entry.name || entry.id);
        const now = Date.now();
        if (!local) {
          const record = {
            id: entry.id,
            meta,
            source,
            enabled: entry.enabledByDefault !== false,
            origin: "remote",
            installedAt: now,
            updatedAt: now
          };
          next.push(record);
          byId.set(entry.id, record);
          result.installed.push(entry.id);
          log("update", entry.id, `已安装 v${meta.version}`);
        } else {
          const index = next.findIndex((s) => s.id === entry.id);
          next[index] = {
            ...local,
            meta,
            source,
            updatedAt: now,
            // 用户手动关掉的脚本，更新后依然是关闭状态。
            enabled: local.enabled,
            origin: local.origin === "builtin" ? "builtin" : "remote",
            previous: local.previous && local.meta.version === local.previous.version ? local.previous : { version: local.meta.version, source: local.source, updatedAt: local.updatedAt },
            lastError: void 0
          };
          result.updated.push(entry.id);
          log("update", entry.id, `已更新 ${local.meta.version} → ${meta.version}`);
        }
      } catch (err) {
        result.errors.push(`${entry.id}：${describeError(err)}`);
        log("error", entry.id, "更新失败：" + describeError(err));
      }
    }
    result.ok = result.errors.length === 0;
    return { scripts: next, result };
  }
  function rollbackScript(scripts, id) {
    const index = scripts.findIndex((s) => s.id === id);
    if (index < 0) return { scripts, ok: false };
    const target = scripts[index];
    if (!target.previous) return { scripts, ok: false };
    let meta;
    try {
      meta = parseMetadata(target.previous.source, target.meta.name);
    } catch {
      meta = { ...target.meta, version: target.previous.version };
    }
    const next = scripts.slice();
    next[index] = {
      ...target,
      source: target.previous.source,
      meta,
      updatedAt: Date.now(),
      previous: void 0,
      lastError: void 0
    };
    log("update", id, `已回退到 v${target.previous.version}`);
    return { scripts: next, ok: true };
  }
  async function readLastCheck() {
    try {
      const raw = localStorage.getItem("__pake_" + LAST_CHECK_KEY);
      return raw ? Number(raw) || 0 : 0;
    } catch {
      return 0;
    }
  }
  async function writeLastCheck(time) {
    try {
      localStorage.setItem("__pake_" + LAST_CHECK_KEY, String(time));
    } catch {
    }
  }

  // src/index.ts
  var LOADER_VERSION = "1.0.0";
  var SCRIPTS_KEY = "scripts";
  var BOOT_FLAG = "__PAKE_USERSCRIPT_LOADER__";
  var state = {
    scripts: [],
    config: { ...DEFAULT_CONFIG },
    running: /* @__PURE__ */ new Map(),
    menus: /* @__PURE__ */ new Map(),
    logs: [],
    lastCheck: 0,
    busy: false,
    message: "",
    messageError: false
  };
  var ui = null;
  var currentUrl = "";
  function setMessage(text, isError = false) {
    state.message = text;
    state.messageError = isError;
    ui == null ? void 0 : ui.render();
  }
  function snapshot() {
    return {
      scripts: state.scripts,
      config: state.config,
      running: [...state.running.keys()],
      menus: [...state.menus.values()],
      logs: state.logs,
      lastCheck: state.lastCheck,
      busy: state.busy,
      message: state.message,
      messageError: state.messageError
    };
  }
  function mergeBuiltins(scripts) {
    const next = scripts.slice();
    const added = [];
    const bumped = [];
    for (const builtin of BUILTIN_SCRIPTS) {
      let meta;
      try {
        meta = parseMetadata(builtin.source, builtin.fileName);
      } catch (err) {
        log("error", "loader", `内置脚本 ${builtin.fileName} 解析失败：${describeError(err)}`);
        continue;
      }
      const id = scriptIdOf(meta, builtin.fileName);
      const index = next.findIndex((s) => s.id === id);
      const now = Date.now();
      if (index < 0) {
        next.push({
          id,
          meta,
          source: builtin.source,
          enabled: true,
          origin: "builtin",
          installedAt: now,
          updatedAt: now
        });
        added.push(id);
        continue;
      }
      const local = next[index];
      if (local.origin === "builtin" && compareVersion(meta.version, local.meta.version) > 0) {
        next[index] = { ...local, meta, source: builtin.source, updatedAt: now };
        bumped.push(id);
      }
    }
    return { scripts: next, added, bumped };
  }
  async function persistScripts() {
    await kvSet(SCRIPTS_KEY, state.scripts);
  }
  async function loadScripts() {
    const stored = await kvGet(SCRIPTS_KEY);
    const base = Array.isArray(stored) ? stored : [];
    const merged = mergeBuiltins(base);
    state.scripts = merged.scripts;
    if (merged.added.length) log("info", "loader", "已安装内置脚本：" + merged.added.join(", "));
    if (merged.bumped.length) log("info", "loader", "内置脚本已更新：" + merged.bumped.join(", "));
    if (merged.added.length || merged.bumped.length) await persistScripts();
  }
  function makeContext(record) {
    return {
      script: record,
      loaderVersion: LOADER_VERSION,
      corsProxy: () => state.config.corsProxy,
      registerMenu: (cmd) => {
        state.menus.set(cmd.id, cmd);
        ui == null ? void 0 : ui.render();
      },
      unregisterMenu: (id) => {
        state.menus.delete(id);
        ui == null ? void 0 : ui.render();
      },
      cleanupStyles: () => void 0,
      toast: (text, isError = false) => ui == null ? void 0 : ui.toast(text, isError)
    };
  }
  function runMatchingScripts(reason) {
    if (!state.config.enabled) return;
    const href = location.href;
    for (const record of state.scripts) {
      if (!record.enabled) continue;
      if (state.running.has(record.id)) continue;
      if (!matchesUrl(record.meta, href)) continue;
      const running = runScript(record, makeContext(record));
      state.running.set(record.id, running);
      record.lastRunAt = Date.now();
      if (!record.lastError) delete record.lastError;
    }
    if (reason === "route") {
      log("info", "loader", "路由变化，已检查未运行的脚本");
    }
    ui == null ? void 0 : ui.render();
  }
  function stopScript(id) {
    const running = state.running.get(id);
    if (!running) return;
    try {
      running.dispose();
    } catch (err) {
      log("warn", id, "清理资源时出错：" + describeError(err));
    }
    state.running.delete(id);
  }
  function installRouteObserver() {
    currentUrl = location.href;
    let timer;
    const fire = () => {
      if (location.href === currentUrl) return;
      currentUrl = location.href;
      if (timer !== void 0) clearTimeout(timer);
      timer = window.setTimeout(() => runMatchingScripts("route"), 300);
    };
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      if (typeof original !== "function") continue;
      history[method] = function patched(...args) {
        const result = original.apply(this, args);
        fire();
        return result;
      };
    }
    window.addEventListener("popstate", fire);
    window.addEventListener("hashchange", fire);
  }
  async function patchConfig(patch) {
    if (patch.manifestUrl !== void 0 && !isAcceptableManifestUrl(patch.manifestUrl)) {
      setMessage("更新地址必须是 http(s) 链接", true);
      return;
    }
    state.config = await saveConfig({ ...state.config, ...patch });
    setMessage("");
    ui == null ? void 0 : ui.render();
  }
  function toggleScript(id, enabled) {
    const record = state.scripts.find((s) => s.id === id);
    if (!record) return;
    record.enabled = enabled;
    if (!enabled) {
      stopScript(id);
      const count = gmClearScript("");
      void count;
      setMessage(`已禁用「${record.meta.name}」，刷新页面可清除它在页面上留下的界面`, false);
    } else {
      setMessage(`已启用「${record.meta.name}」，刷新页面后生效`, false);
    }
    void persistScripts();
    ui == null ? void 0 : ui.render();
  }
  function toggleAll(enabled) {
    for (const record of state.scripts) {
      record.enabled = enabled;
      if (!enabled) stopScript(record.id);
    }
    void persistScripts();
    setMessage(enabled ? "已全部启用，刷新页面后生效" : "已全部禁用", false);
    ui == null ? void 0 : ui.render();
  }
  async function runUpdateCheck(manual) {
    if (state.busy) return;
    if (!state.config.manifestUrl) {
      if (manual) setMessage("先填一个 Manifest 地址", true);
      return;
    }
    state.busy = true;
    state.message = "正在检查更新…";
    state.messageError = false;
    ui == null ? void 0 : ui.render();
    let result = null;
    try {
      const checked = await checkForUpdates({
        scripts: state.scripts,
        config: state.config,
        loaderVersion: LOADER_VERSION,
        publicKeyBase64: MANIFEST_PUBLIC_KEY || void 0
      });
      state.scripts = checked.scripts;
      result = checked.result;
      await persistScripts();
    } catch (err) {
      state.busy = false;
      setMessage("检查更新失败：" + describeError(err), true);
      return;
    }
    state.busy = false;
    state.lastCheck = result.checkedAt;
    await writeLastCheck(result.checkedAt);
    const changed = result.installed.length + result.updated.length;
    if (result.errors.length) {
      setMessage(result.errors[0] + (result.errors.length > 1 ? ` 等 ${result.errors.length} 个问题` : ""), true);
    } else if (changed) {
      setMessage(
        `脚本已更新（新增 ${result.installed.length} / 更新 ${result.updated.length}），刷新页面后生效`,
        false
      );
    } else {
      setMessage(manual ? "已是最新版本" : "", false);
    }
    ui == null ? void 0 : ui.render();
  }
  function rollback(id) {
    const { scripts, ok } = rollbackScript(state.scripts, id);
    if (!ok) {
      setMessage("这个脚本没有可回退的旧版本", true);
      return;
    }
    state.scripts = scripts;
    stopScript(id);
    void persistScripts();
    setMessage("已回退，刷新页面后生效", false);
    ui == null ? void 0 : ui.render();
  }
  function clearScriptData(id) {
    const count = gmClearScript(id);
    const record = state.scripts.find((s) => s.id === id);
    setMessage(`已清除「${(record == null ? void 0 : record.meta.name) || id}」的 ${count} 项本地数据`, false);
    ui == null ? void 0 : ui.render();
  }
  function runMenu(id) {
    const cmd = state.menus.get(id);
    if (!cmd) return;
    try {
      cmd.run();
      setMessage("已执行：" + cmd.caption, false);
    } catch (err) {
      setMessage("菜单命令执行失败：" + describeError(err), true);
    }
  }
  function whenDomReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }
  async function boot() {
    const w = window;
    if (w[BOOT_FLAG]) {
      log("warn", "loader", "检测到重复注入，已跳过");
      return;
    }
    w[BOOT_FLAG] = { version: LOADER_VERSION };
    log("info", "loader", `Loader v${LOADER_VERSION} 启动 @ ${location.host}`);
    state.config = await loadConfig();
    state.lastCheck = await readLastCheck();
    await loadScripts();
    subscribeLogs((list) => {
      state.logs = list;
      if (ui == null ? void 0 : ui.isOpen()) ui.render();
    });
    state.logs = [];
    ui = new ManagerUI({
      loaderVersion: LOADER_VERSION,
      getSnapshot: snapshot,
      onToggleScript: toggleScript,
      onToggleAll: toggleAll,
      onPatchConfig: (patch) => void patchConfig(patch),
      onCheckUpdate: () => void runUpdateCheck(true),
      onRollback: rollback,
      onClearData: clearScriptData,
      onRunMenu: runMenu,
      onReload: () => location.reload(),
      onToast: (text, isError) => ui == null ? void 0 : ui.toast(text, isError)
    });
    whenDomReady(() => {
      ui == null ? void 0 : ui.mount();
      runMatchingScripts("boot");
      installRouteObserver();
      const due = state.config.autoUpdate && state.config.manifestUrl && Date.now() - state.lastCheck > state.config.updateIntervalHours * 3600 * 1e3;
      if (due) {
        window.setTimeout(() => void runUpdateCheck(false), 2500);
      }
    });
    const api = w[BOOT_FLAG];
    api.open = () => ui == null ? void 0 : ui.setOpen(true);
    api.close = () => ui == null ? void 0 : ui.setOpen(false);
    api.scripts = () => state.scripts.map((s) => ({
      id: s.id,
      name: s.meta.name,
      version: s.meta.version,
      enabled: s.enabled,
      running: state.running.has(s.id),
      lastError: s.lastError
    }));
    api.logs = () => state.logs.slice(-50);
    api.clearLogs = () => clearLogs();
    api.check = () => runUpdateCheck(true);
    api.version = LOADER_VERSION;
  }
  boot().catch((err) => {
    console.error("[PakeLoader] 启动失败：", err);
  });
})();
