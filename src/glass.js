/* Carlume · Liquid Glass: Maße für Kopf/Leiste, gleitende Linse in Leiste und Unterreitern, leichtes Tippen-Feedback.
   Die App rendert Leiste und Ansicht per innerHTML neu; deshalb merkt sich das Skript die letzte Position der Linse
   und lässt sie von dort zum neuen Eintrag gleiten (FLIP), statt zu springen. */
(function(){
  "use strict";
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const C = window.Capacitor;
  const native = !!(C && C.isNativePlatform && C.isNativePlatform());
  const H = (() => { try { return native ? C.registerPlugin("Haptics") : null; } catch { return null; } })();
  let hapticOk = !!H;
  function tick(kind){
    if (!hapticOk) return;
    try {
      const p = kind === "sel" ? H.selectionChanged() : H.impact({style: "LIGHT"});
      if (p && p.catch) p.catch(() => { hapticOk = false; });
    } catch { hapticOk = false; }
  }

  /* ---------- Maße: Inhalt beginnt unter dem Glas-Kopf und endet über der Leiste ---------- */
  let lastTop = -1, lastTabs = -1;
  function measure(){
    const top = document.querySelector(".top"), tabs = document.getElementById("tabs");
    if (top){ const h = Math.round(top.getBoundingClientRect().height); if (h !== lastTop){ lastTop = h; root.style.setProperty("--topH", h + "px"); } }
    if (tabs){
      const r = tabs.getBoundingClientRect(), vh = window.innerHeight || root.clientHeight;
      const h = tabs.offsetParent === null ? 0 : Math.max(0, Math.round(vh - r.top));
      if (h !== lastTabs){ lastTabs = h; root.style.setProperty("--tabsH", h + "px"); }
    }
  }

  /* ---------- Linse ---------- */
  const memo = new Map();          // letzte Linsen-Position je Unterreiter-Gruppe
  function place(track, el, from){
    if (!el){ if (!track.classList.contains("lg-none")) track.classList.add("lg-none"); track._lg = null; return; }
    const x = el.offsetLeft, w = el.offsetWidth;
    if (!w) return;
    if (track.classList.contains("lg-none")) track.classList.remove("lg-none");
    const cur = track._lg;
    if (cur && cur.x === x && cur.w === w) return;
    const start = from || cur;
    if (start && !reduce.matches && (start.x !== x || start.w !== w)){
      if (!cur || from){
        track.classList.add("lg-still");
        track.style.setProperty("--tx", start.x + "px"); track.style.setProperty("--tw", start.w + "px");
        void track.offsetWidth;
        track.classList.remove("lg-still");
      }
    } else {
      track.classList.add("lg-still");
      requestAnimationFrame(() => requestAnimationFrame(() => track.classList.remove("lg-still")));
    }
    track.style.setProperty("--tx", x + "px"); track.style.setProperty("--tw", w + "px");
    track._lg = {x, w};
  }
  function segKey(seg){
    const b = seg.querySelector("button[id^='seg-']");
    if (b) return b.id.split("-")[1];
    const p = seg.closest("[id]");
    return p ? "p:" + p.id : null;
  }
  function update(){
    raf = 0;
    measure();
    const tabs = document.getElementById("tabs");
    if (tabs) place(tabs, tabs.querySelector('.tab[aria-selected="true"]'));
    for (const seg of document.querySelectorAll(".seg")){
      if (!seg.offsetParent) continue;
      const sel = seg.querySelector('button[aria-selected="true"],button[aria-pressed="true"]');
      const k = segKey(seg);
      const prev = !seg._lg && k ? memo.get(k) : null;
      place(seg, sel, prev);
      if (k && seg._lg) memo.set(k, seg._lg);
    }
  }
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

  /* ---------- Tippen: kurzes Haptik-Feedback auf dem Handy ---------- */
  document.addEventListener("click", e => {
    const t = e.target.closest && e.target.closest(".tab,.seg button,.chip,.moremenu button");
    if (!t) return;
    if (t.getAttribute("aria-selected") === "true" && !t.hasAttribute("data-more")) return;
    tick(t.matches(".tab") ? "imp" : "sel");
  }, true);

  function start(){
    root.classList.add("lg");
    new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected", "aria-pressed", "hidden"]});
    window.addEventListener("resize", schedule, {passive: true});
    if (window.ResizeObserver){
      const ro = new ResizeObserver(schedule);
      const watch = () => { const t = document.querySelector(".top"), b = document.getElementById("tabs"); if (t) ro.observe(t); if (b) ro.observe(b); };
      watch();
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
