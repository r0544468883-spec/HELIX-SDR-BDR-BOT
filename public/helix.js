/* HELIX PIXEL — the unique HELIX sensing layer (helix.js).
   ONE pixel, embedded in EVERY HELIX system. Self-contained: posts to this
   app's own /api/px-ingest, no dependency on the CRM or any other product.

   Embed (in <head>):
     <script async src="/helix.js" data-ws="WORKSPACE_ID"></script>
   or cross-origin:
     <script async src="https://<this-app-host>/helix.js" data-ws="WORKSPACE_ID"></script>

   Captures: pageview, click (x/y heatmap), scroll depth, rage/dead clicks,
   returns, funnel steps, form + video signals, pricing/demo intent, exit intent,
   time-on-page. Privacy-first: first-party, cookieless (localStorage id),
   sendBeacon, NO DOM/session recording. Before marketing consent only anonymous
   events are sent and identity resolution is off (תיקון 13). */
(function () {
  var s = document.currentScript;
  var ws = (s && s.getAttribute('data-ws')) || 'default';
  var base = (s && s.src ? s.src.replace(/\/helix\.js.*$/, '') : '');
  var api = base + '/api/px-ingest';

  var vid = localStorage.getItem('helix_vid');
  var isReturn = !!vid;
  if (!vid) { vid = 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); localStorage.setItem('helix_vid', vid); }
  var now0 = Date.now();
  var sid = sessionStorage.getItem('helix_sid');
  var lastSeen = +(sessionStorage.getItem('helix_seen') || 0);
  if (!sid || (now0 - lastSeen) > 30 * 60 * 1000) { sid = 's_' + now0.toString(36) + Math.random().toString(36).slice(2, 6); }
  sessionStorage.setItem('helix_sid', sid);
  sessionStorage.setItem('helix_seen', String(now0));

  function readConsent() { try { return JSON.parse(localStorage.getItem('helix_consent') || '') || {}; } catch (e) { return {}; } }
  var consent = readConsent();
  if (typeof consent.analytics === 'undefined') consent = { analytics: true, marketing: false };

  function device() { return { type: (innerWidth < 768 ? 'mobile' : (innerWidth < 1024 ? 'tablet' : 'desktop')), viewport: innerWidth + 'x' + innerHeight }; }

  function send(event, props) {
    if (!consent.analytics) return;
    var payload = {
      event: event, ts: new Date().toISOString(), workspace_id: ws, visitor_id: vid, session_id: sid,
      contact_hint: consent.marketing ? (localStorage.getItem('helix_contact') || null) : null,
      url: location.pathname, referrer: document.referrer || null, props: props || {},
      consent: { analytics: !!consent.analytics, marketing: !!consent.marketing }, device: device()
    };
    try {
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if (navigator.sendBeacon) navigator.sendBeacon(api, blob);
      else fetch(api, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' }, keepalive: true });
    } catch (e) { /* fail silent */ }
  }

  var queue = (window.helix && window.helix.q) || [];
  window.helix = {
    track: function (name, props) { send(String(name), props || {}); },
    identify: function (email, traits) {
      if (!consent.marketing || !email) return;
      localStorage.setItem('helix_contact', String(email));
      send('identify', { email: String(email), traits: traits || {} });
    },
    consent: function (next) {
      consent = { analytics: next && next.analytics !== false, marketing: !!(next && next.marketing) };
      localStorage.setItem('helix_consent', JSON.stringify(consent));
      send('consent_update', { analytics: consent.analytics, marketing: consent.marketing });
    }
  };
  queue.forEach(function (c) { try { window.helix[c[0]].apply(null, c.slice(1)); } catch (e) {} });

  // ---- auto-capture ----
  send('pageview', { ref: document.referrer });
  if (isReturn) send('return_visit', {});

  var stepName = document.body && document.body.getAttribute('data-helix-step');
  if (stepName) send('step', { name: stepName, index: parseInt(document.body.getAttribute('data-helix-index') || '0', 10) });

  var p = location.pathname.toLowerCase();
  if (/pric|מחיר|tariff|plans/.test(p)) send('pricing_view', {});
  if (/demo|דמו|book|calendly|meeting/.test(p)) send('demo_click', {});

  function norm(e) { return { x: +(e.clientX / innerWidth).toFixed(3), y: +(e.clientY / innerHeight).toFixed(3) }; }
  function interactive(el) { return !!(el && el.closest && el.closest('a,button,input,select,textarea,label,[role="button"],[onclick]')); }

  var recent = [];
  document.addEventListener('click', function (e) {
    var q = norm(e); send('click', { x: q.x, y: q.y });
    var t = Date.now(); recent.push({ t: t, x: q.x, y: q.y });
    recent = recent.filter(function (c) { return t - c.t < 800; });
    if (recent.length >= 3) {
      var near = recent.filter(function (c) { return Math.abs(c.x - q.x) < 0.05 && Math.abs(c.y - q.y) < 0.05; });
      if (near.length >= 3) { send('rage_click', { x: q.x, y: q.y }); recent = []; }
    }
    try { if (!interactive(e.target) && getComputedStyle(e.target).cursor === 'pointer') send('dead_click', { x: q.x, y: q.y }); } catch (err) {}
  }, { passive: true });

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-helix]');
    if (el) send(el.getAttribute('data-helix'), {});
  }, { passive: true });

  document.addEventListener('submit', function (e) {
    var f = e.target; send('form_submit', { id: (f && (f.id || f.name)) || null });
    if (consent.marketing && f && f.querySelector) { var em = f.querySelector('input[type="email"]'); if (em && em.value) window.helix.identify(em.value); }
  }, true);

  var startedForm = false;
  document.addEventListener('focusin', function (e) {
    if (!startedForm && e.target && e.target.closest && e.target.closest('form')) { startedForm = true; send('form_start', {}); }
  });

  document.addEventListener('timeupdate', function (e) {
    var v = e.target; if (!v || !v.duration) return;
    var pct = Math.round((v.currentTime / v.duration) * 100);
    if (pct >= 80 && !v.__helix80) { v.__helix80 = 1; send('video_progress', { pct: pct }); }
  }, true);

  var maxDepth = 0, deepReported = false;
  addEventListener('scroll', function () {
    var h = document.documentElement.scrollHeight - innerHeight;
    var d = h > 0 ? (scrollY / h) : 1;
    if (d > maxDepth) maxDepth = d > 1 ? 1 : d;
    if (maxDepth >= 0.9 && !deepReported) { deepReported = true; send('high_intent_scroll', { depth: +maxDepth.toFixed(3) }); }
  }, { passive: true });

  var exitFired = false;
  document.addEventListener('mouseout', function (e) {
    if (!exitFired && e.clientY <= 0 && !e.relatedTarget) { exitFired = true; send('exit_intent', {}); }
  });

  var start = Date.now(), flushed = false;
  function flush() {
    if (flushed) return; flushed = true;
    send('scroll_depth', { depth: +maxDepth.toFixed(3) });
    send('time_on_page', { seconds: Math.round((Date.now() - start) / 1000) });
  }
  addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);
})();
