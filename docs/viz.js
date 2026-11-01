/* ADHD Wiki: العروض التفاعلية (خريطة المفاهيم + مصفوفة مقارنة المؤلفين). تعتمد على app.js */
(() => {
  'use strict';
  const W = window.__wiki, views = window.__views;
  if (!W || !views) return;
  const esc = W.esc;
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MED = /دواء|الدواء|منشط|جرعة|الجرعة|فلوكستين|كلوميبرامين/;
  const short = t => String(t).split(':')[0];
  const setUrl = (path, p) => { const s = p.toString(); try { history.replaceState(null, '', '#/' + path + (s ? '?' + s : '')); } catch (e) { /* لا شيء */ } };
  const bound = new WeakSet();

  /* =====================================================================
     1) خريطة المفاهيم
     ===================================================================== */
  const M = { g: null, minW: 2, minB: 2, book: '', sel: '', vis: null, view: null, pos: null };
  const VW = 900, VH = 620;

  function buildGraph() {
    const D = W.D();
    const cs = D.concepts.filter(c => c.hits.length);
    const keys = cs.map(c => new Set(c.hits.map(h => h.bookId + '|' + h.chapterId)));
    const info = new Map();
    cs.forEach(c => c.hits.forEach(h => info.set(h.bookId + '|' + h.chapterId, h)));
    const nodes = cs.map((c, i) => ({ i, id: c.id, ar: c.ar, en: c.en, def: c.def, books: c.books, nc: c.hits.length }));
    const edges = [];
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const shared = [...keys[i]].filter(k => keys[j].has(k));
      if (!shared.length) continue;
      const bk = new Set(shared.map(k => k.split('|')[0]));
      edges.push({ a: i, b: j, w: shared.length, nb: bk.size, str: shared.length / (keys[i].size + keys[j].size - shared.length), shared });
    }
    return { nodes, edges, info };
  }

  function visible() {
    const g = M.g;
    const edges = g.edges.filter(e => e.w >= M.minW && e.nb >= M.minB);
    const deg = new Array(g.nodes.length).fill(0);
    edges.forEach(e => { deg[e.a]++; deg[e.b]++; });
    return { edges, deg, active: g.nodes.filter(n => deg[n.i] > 0) };
  }

  function layout(nodes, edges) {
    const n = nodes.length; if (!n) return;
    const idx = new Map(nodes.map((nd, k) => [nd.i, k]));
    const x = new Float64Array(n), y = new Float64Array(n);
    for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; x[k] = VW / 2 + Math.cos(a) * VW * 0.33; y[k] = VH / 2 + Math.sin(a) * VH * 0.33; }
    const E = edges.map(e => [idx.get(e.a), idx.get(e.b), 0.5 + Math.min(1, e.str * 3)]);
    const kk = Math.sqrt(VW * VH / n) * 0.78;
    let t = VW / 7;
    const dx = new Float64Array(n), dy = new Float64Array(n);
    for (let it = 0; it < 380; it++) {
      dx.fill(0); dy.fill(0);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let ax = x[i] - x[j], ay = y[i] - y[j], d2 = ax * ax + ay * ay;
        if (d2 < 0.01) { ax = 0.1 * (i - j); ay = 0.1; d2 = 0.02; }
        const d = Math.sqrt(d2), f = kk * kk / d / d;
        dx[i] += ax * f; dy[i] += ay * f; dx[j] -= ax * f; dy[j] -= ay * f;
      }
      for (const [i, j, s] of E) {
        const ax = x[i] - x[j], ay = y[i] - y[j], d = Math.sqrt(ax * ax + ay * ay) || 0.01, f = d / kk * s;
        dx[i] -= ax * f; dy[i] -= ay * f; dx[j] += ax * f; dy[j] += ay * f;
      }
      for (let i = 0; i < n; i++) {
        dx[i] -= (x[i] - VW / 2) * 0.012; dy[i] -= (y[i] - VH / 2) * 0.02;
        const disp = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01, lim = Math.min(disp, t);
        x[i] = Math.max(70, Math.min(VW - 70, x[i] + dx[i] / disp * lim));
        y[i] = Math.max(28, Math.min(VH - 28, y[i] + dy[i] / disp * lim));
      }
      t *= 0.985;
    }
    nodes.forEach((nd, k) => { nd.x = x[k]; nd.y = y[k]; });
  }

  const radius = nd => 5 + Math.min(11, 2 * Math.sqrt(nd.books.length));

  function mapHtml(_, params) {
    if (!M.g) M.g = buildGraph();
    const D = W.D();
    M.minW = Math.max(1, Math.min(6, +params.get('w') || 2));
    M.minB = params.get('b') === '1' ? 1 : 2;
    M.book = params.get('book') || '';
    M.sel = params.get('c') || '';
    if (M.sel && !M.g.nodes.some(n => n.id === M.sel)) M.sel = '';
    return `<h1>خريطة المفاهيم</h1>
      <p class="muted">كل نقطة مفهوم. يربط بين مفهومين خط حين يظهران معًا في الفصل نفسه من كتب الموقع. اضغط على نقطة لترى ما يرتبط بها ولماذا.</p>
      <details class="how"><summary>كيف تقرأ الخريطة؟</summary>
        <ul><li>حجم النقطة = عدد الكتب التي يظهر فيها المفهوم.</li>
        <li>سُمك الخط = قوة الاقتران (نسبة الفصول المشتركة إلى فصول المفهومين).</li>
        <li>الرابط مبني على <b>ظهور الكلمات معًا في الفصل</b> بمطابقة آلية. هو دليل للقراءة وليس ادعاءً من المؤلف أن أحدهما يسبب الآخر.</li>
        <li>اسحب النقطة لتحريكها، وبالعجلة أو الأزرار للتكبير.</li></ul></details>
      <div class="vz-controls" role="group" aria-label="خيارات الخريطة">
        <label>أقل عدد فصول مشتركة <select id="mapW">${[1, 2, 3, 4, 5, 6].map(v => `<option value="${v}" ${v === M.minW ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label><input type="checkbox" id="mapB" ${M.minB === 2 ? 'checked' : ''}> الاقتران في كتابين فأكثر</label>
        <label>أبرز كتابًا <select id="mapBook"><option value="">الكل</option>${D.books.map(b => `<option value="${esc(b.id)}" ${b.id === M.book ? 'selected' : ''}>${esc(short(b.title))}</option>`).join('')}</select></label>
        <label>اذهب إلى مفهوم <select id="mapJump"><option value="">اختر…</option>${[...M.g.nodes].sort((a, b) => a.ar.localeCompare(b.ar, 'ar')).map(n => `<option value="${esc(n.id)}" ${n.id === M.sel ? 'selected' : ''}>${esc(n.ar)}</option>`).join('')}</select></label>
      </div>
      <div class="map-wrap">
        <div class="map-stage">
          <div class="zoombtns" aria-label="التكبير"><button type="button" data-viz="zin" aria-label="تكبير">+</button><button type="button" data-viz="zout" aria-label="تصغير">−</button><button type="button" data-viz="zreset" aria-label="إعادة الضبط">⟲</button></div>
          <svg id="mapSvg" role="group" aria-label="خريطة تفاعلية للمفاهيم. استعمل القائمة «اذهب إلى مفهوم» أو الجدولة بمفتاح Tab للوصول للنقاط." viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet"></svg>
        </div>
        <aside id="mapPanel" class="map-panel card" aria-live="polite"></aside>
      </div>
      <div id="mapIso"></div>`;
  }

  function drawMap() {
    const svg = document.getElementById('mapSvg'); if (!svg) return;
    const v = M.vis;
    const bookSet = M.book ? new Set(M.g.nodes.filter(n => n.books.includes(M.book)).map(n => n.i)) : null;
    const sel = M.sel ? M.g.nodes.find(n => n.id === M.sel) : null;
    const nbrs = new Set();
    if (sel) v.edges.forEach(e => { if (e.a === sel.i) nbrs.add(e.b); if (e.b === sel.i) nbrs.add(e.a); });
    const byI = i => M.g.nodes[i];
    const lines = v.edges.map((e, k) => {
      const A = byI(e.a), B = byI(e.b), hot = sel && (e.a === sel.i || e.b === sel.i);
      return `<line data-e="${k}" class="mp-edge ${hot ? 'hot' : sel ? 'dim' : ''}" x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}" stroke-width="${(0.8 + Math.min(4.2, e.str * 14)).toFixed(2)}"/>`;
    }).join('');
    const nodes = v.active.map(n => {
      const cls = ['mp-node', sel && n.i === sel.i ? 'sel' : '', sel && nbrs.has(n.i) ? 'nb' : '', (sel && n.i !== sel.i && !nbrs.has(n.i)) || (bookSet && !bookSet.has(n.i)) ? 'dim' : '', bookSet && bookSet.has(n.i) ? 'inbook' : ''].filter(Boolean).join(' ');
      return `<g class="${cls}" data-n="${esc(n.id)}" data-i="${n.i}" tabindex="0" role="button" aria-pressed="${sel && n.i === sel.i}" aria-label="${esc(n.ar)}: في ${n.books.length} كتب، ${v.deg[n.i]} روابط" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})"><circle r="${radius(n).toFixed(1)}"/><text y="${(radius(n) + 12).toFixed(1)}" text-anchor="middle">${esc(n.ar)}</text></g>`;
    }).join('');
    const vb = M.view || { x: 0, y: 0, w: VW, h: VH };
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.innerHTML = `<g class="mp-edges">${lines}</g><g class="mp-nodes">${nodes}</g>`;
    const iso = M.g.nodes.filter(n => !v.deg[n.i]);
    document.getElementById('mapIso').innerHTML = iso.length ? `<details class="how"><summary>${iso.length} مفهومًا بلا روابط عند هذا الحد</summary><div class="chips">${iso.map(n => `<button type="button" class="chip plain" data-n="${esc(n.id)}">${esc(n.ar)}</button>`).join(' ')}</div><p class="muted">خفّض «أقل عدد فصول مشتركة» أو ألغِ شرط الكتابين لتظهر روابطها.</p></details>` : '';
    drawPanel(sel);
  }

  function drawPanel(sel) {
    const p = document.getElementById('mapPanel'); if (!p) return;
    const v = M.vis, D = W.D();
    if (!sel) {
      p.innerHTML = `<h2>${v.active.length} مفهومًا و${v.edges.length} رابطًا</h2><p class="muted">اضغط على أي نقطة لترى تعريفها والمفاهيم المرتبطة بها والفصول التي تجمعهما.</p>
        <h3>الأكثر ارتباطًا</h3><ol class="top-list">${[...v.active].sort((a, b) => v.deg[b.i] - v.deg[a.i]).slice(0, 8).map(n => `<li><button type="button" class="linkish" data-n="${esc(n.id)}">${esc(n.ar)}</button> <span class="muted">${v.deg[n.i]} روابط</span></li>`).join('')}</ol>`;
      return;
    }
    const rel = v.edges.filter(e => e.a === sel.i || e.b === sel.i).map(e => ({ e, o: M.g.nodes[e.a === sel.i ? e.b : e.a] })).sort((a, b) => b.e.str - a.e.str);
    p.innerHTML = `<h2>${esc(sel.ar)}</h2><p class="muted" dir="ltr" style="text-align:end;margin:0">${esc(sel.en)}</p>
      <p>${esc(sel.def)}</p>
      <p class="muted">يظهر في ${sel.books.length} كتب: ${sel.books.map(id => { const b = W.getBook(id); return `<a href="#/book/${esc(id)}"><bdi>${esc(short(b.title))}</bdi></a>`; }).join('، ')}.</p>
      <p><a class="btn ghost" href="#/concept/${esc(sel.id)}">صفحة المفهوم</a> <button type="button" class="btn ghost" data-viz="clear">إلغاء التحديد</button></p>
      <h3>${rel.length ? 'مرتبط بـ ' + rel.length + ' مفاهيم' : 'لا روابط عند هذا الحد'}</h3>
      ${rel.map(({ e, o }) => `<details class="rel"><summary><b>${esc(o.ar)}</b> <span class="muted">${e.w} فصول في ${e.nb} ${e.nb > 2 ? 'كتب' : e.nb === 2 ? 'كتابين' : 'كتاب'}</span></summary>
        <ul>${e.shared.map(k => { const h = M.g.info.get(k); return `<li><a href="#/book/${esc(h.bookId)}/${esc(h.chapterId)}"><bdi>${esc(short(h.bookTitle))}</bdi>: ${esc((h.prefix || '') + h.chTitle)}</a></li>`; }).join('')}</ul>
        <p><button type="button" class="linkish" data-n="${esc(o.id)}">اذهب إلى «${esc(o.ar)}»</button></p></details>`).join('')}`;
  }

  function recompute() {
    M.vis = visible();
    layout(M.vis.active, M.vis.edges);
    M.view = null;
    drawMap();
  }
  function persistMap() {
    const p = new URLSearchParams();
    if (M.minW !== 2) p.set('w', M.minW);
    if (M.minB === 1) p.set('b', '1');
    if (M.book) p.set('book', M.book);
    if (M.sel) p.set('c', M.sel);
    setUrl('map', p);
  }
  function selectNode(id) {
    M.sel = id || '';
    const jump = document.getElementById('mapJump'); if (jump) jump.value = M.sel;
    // إن كان المفهوم بلا روابط عند الحد الحالي، نخفض الحد ليظهر
    if (M.sel && !M.vis.active.some(n => n.id === M.sel)) {
      const n = M.g.nodes.find(x => x.id === M.sel);
      const need = M.g.edges.filter(e => e.a === n.i || e.b === n.i).sort((a, b) => b.w - a.w)[0];
      if (need) { M.minW = Math.max(1, Math.min(M.minW, need.w)); M.minB = need.nb >= 2 ? M.minB : 1; const s = document.getElementById('mapW'); if (s) s.value = M.minW; const c = document.getElementById('mapB'); if (c) c.checked = M.minB === 2; recompute(); persistMap(); return; }
    }
    drawMap(); persistMap();
  }

  // سحب وتكبير
  function svgPoint(svg, ev) { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
  function zoom(f, cx, cy) {
    const svg = document.getElementById('mapSvg'); if (!svg) return;
    const vb = M.view || { x: 0, y: 0, w: VW, h: VH };
    const nw = Math.max(180, Math.min(VW, vb.w * f)), k = nw / vb.w, nh = vb.h * k;
    const px = cx == null ? vb.x + vb.w / 2 : cx, py = cy == null ? vb.y + vb.h / 2 : cy;
    M.view = { w: nw, h: nh, x: Math.max(0, Math.min(VW - nw, px - (px - vb.x) * k)), y: Math.max(0, Math.min(VH - nh, py - (py - vb.y) * k)) };
    svg.setAttribute('viewBox', `${M.view.x} ${M.view.y} ${M.view.w} ${M.view.h}`);
  }
  function bindMap(root) {
    const svg = document.getElementById('mapSvg');
    let drag = null;
    svg.addEventListener('pointerdown', ev => {
      const g = ev.target.closest('.mp-node');
      const pt = svgPoint(svg, ev);
      drag = { g, id: g && g.dataset.n, i: g && +g.dataset.i, sx: ev.clientX, sy: ev.clientY, moved: false, start: pt, vb: { ...(M.view || { x: 0, y: 0, w: VW, h: VH }) } };
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', ev => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 4) return;
      drag.moved = true;
      if (drag.g) {
        const pt = svgPoint(svg, ev), n = M.g.nodes[drag.i];
        n.x = pt.x; n.y = pt.y;
        drag.g.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
        M.vis.edges.forEach((e, k) => {
          if (e.a !== n.i && e.b !== n.i) return;
          const el = svg.querySelector(`[data-e="${k}"]`); if (!el) return;
          if (e.a === n.i) { el.setAttribute('x1', n.x); el.setAttribute('y1', n.y); } else { el.setAttribute('x2', n.x); el.setAttribute('y2', n.y); }
        });
      } else {
        const r = svg.getBoundingClientRect(), vb = drag.vb;
        const nx = Math.max(0, Math.min(VW - vb.w, vb.x - (ev.clientX - drag.sx) * vb.w / r.width)), ny = Math.max(0, Math.min(VH - vb.h, vb.y - (ev.clientY - drag.sy) * vb.h / r.height));
        M.view = { ...vb, x: nx, y: ny };
        svg.setAttribute('viewBox', `${nx} ${ny} ${vb.w} ${vb.h}`);
      }
    });
    const end = () => { if (drag && !drag.moved && drag.id) selectNode(drag.id); else if (drag && !drag.moved && !drag.id && M.sel) selectNode(''); drag = null; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', () => { drag = null; });
    svg.addEventListener('wheel', ev => { ev.preventDefault(); const pt = svgPoint(svg, ev); zoom(ev.deltaY > 0 ? 1.15 : 0.87, pt.x, pt.y); }, { passive: false });
    svg.addEventListener('keydown', ev => {
      const g = ev.target.closest && ev.target.closest('.mp-node');
      if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); selectNode(g.dataset.n); }
    });
  }

  views.map = {
    wide: true,
    html: mapHtml,
    after(root) {
      M.vis = visible();
      layout(M.vis.active, M.vis.edges);
      M.view = null;
      drawMap();
      bindMap(root);
      if (!bound.has(root)) bound.add(root), bindGlobal(root);
    }
  };

  /* =====================================================================
     2) مصفوفة مقارنة المؤلفين
     ===================================================================== */
  const C = { data: null, t: '', custom: null, sel: [], busy: false };
  const MAXSEL = 4;

  function loadTopics() {
    if (C.data) return Promise.resolve();
    return W.loadJSON('topics.json').then(x => { C.data = x; C.gOf = {}; x.groups.forEach(g => g.books.forEach(b => { C.gOf[b] = g.id; })); C.gName = Object.fromEntries(x.groups.map(g => [g.id, g.ar])); });
  }
  const curTopic = () => C.custom || (C.data && C.data.topics.find(t => t.id === C.t)) || null;
  const tagChip = t => (t === 'specialist' ? W.chip('specialist') : t === 'claim' ? W.chip('claim') : t === 'inference' ? W.chip('inference') : t === 'verify' ? W.chip('verify') : '');

  function compareHtml(_, params) {
    C.t = params.get('t') || ''; C.custom = null;
    const q = params.get('q') || '';
    C.q = q;
    C.sel = (params.get('a') || '').split(',').filter(Boolean);
    const T = C.data.topics, G = C.data.groups;
    const used = G.filter(g => T.some(t => t.counts[g.id]));
    const max = Math.max(...T.flatMap(t => Object.values(t.counts)));
    const shade = n => n ? (0.14 + 0.72 * Math.min(1, n / Math.max(6, max * 0.6))).toFixed(2) : 0;
    return `<h1>مقارنة المؤلفين</h1>
      <p class="muted">اختر مشكلة (مثل الإحباط أو الرفض أو العقاب) ثم قارن كيف تناولها كل مؤلف، بجانب بعض، مع روابط للفصول الأصلية.</p>
      <details class="how"><summary>كيف تُبنى المصفوفة؟ وما حدودها؟</summary><ul>
        <li>الرقم في الخلية = عدد المقاطع في ملخصات ذلك المؤلف التي تذكر الموضوع بكلماته المفتاحية.</li>
        <li>الرقم الأكبر لا يعني أن المؤلف أفضل أو أدق، وصفر لا يعني أنه يعارض. قد يعالج الفكرة بكلمات أخرى.</li>
        <li>الاتفاق والاختلاف في الأسفل مأخوذ من أقسام «أين يختلف الكتاب» التي كتبها معدّ الملخصات، وليس استنتاجًا آليًا.</li>
        <li>مقاطع الدواء مستثناة عمدًا. القرار الدوائي للطبيب.</li></ul></details>
      <form class="vz-controls" id="cmpForm" role="search"><label for="cmpQ">أو اكتب مشكلة بكلماتك</label>
        <input id="cmpQ" name="q" type="search" value="${esc(q)}" placeholder="مثال: المماطلة، الكذب، الغيرة"> <button class="btn" type="submit">قارن</button></form>
      <div class="hm-wrap" tabindex="0" role="region" aria-label="جدول المواضيع مقابل المؤلفين، مرّر أفقيًا">
        <table class="hm"><caption class="sr">الموضوعات في الصفوف والمؤلفون في الأعمدة. كل خلية عدد المقاطع.</caption>
          <thead><tr><th scope="col" class="corner">الموضوع</th>${used.map(g => `<th scope="col" class="vh"><span>${esc(g.ar)}</span></th>`).join('')}</tr></thead>
          <tbody>${T.map(t => `<tr><th scope="row"><button type="button" class="linkish" data-viz="topic" data-t="${esc(t.id)}">${esc(t.ar)}</button></th>${used.map(g => { const n = t.counts[g.id] || 0; return n ? `<td><button type="button" class="hc" data-viz="cell" data-t="${esc(t.id)}" data-g="${esc(g.id)}" style="--a:${shade(n)}" aria-label="${esc(g.ar)}، ${esc(t.ar)}: ${n} مقطعًا">${n}</button></td>` : `<td class="z" aria-label="لا مقاطع">·</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <section id="cmpDetail" aria-live="polite"></section>`;
  }

  function topPick(t, n) { return Object.entries(t.counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g); }

  function cmpDetail() {
    const box = document.getElementById('cmpDetail'); if (!box) return;
    const t = curTopic();
    if (!t) { box.innerHTML = `<p class="empty">اختر موضوعًا من الجدول أو اكتب مشكلة في الأعلى لتبدأ المقارنة.</p>`; return; }
    C.sel = C.sel.filter(g => t.counts[g]);
    const gs = Object.entries(t.counts).sort((a, b) => b[1] - a[1]);
    const cols = C.sel.map(gid => {
      const ps = t.passages[gid] || [], first = ps.slice(0, 3), rest = ps.slice(3);
      const card = p => `<article class="pcard"><p class="pmeta">${p.type === 'tool' ? '<span class="chip plain">أداة</span> ' : ''}${tagChip(p.tag)} <a href="${esc(p.href)}">${esc(p.title)}</a> <span class="muted">${esc(p.sub)}</span></p>${p.titleOnly ? '<p class="muted small">الموضوع في عنوان الفصل. اقرأ الفصل للتفاصيل.</p>' : `<p>${esc(p.text)}</p>`}</article>`;
      const books = [...new Set(ps.map(p => p.bookId))].map(id => { try { return short(W.getBook(id).title); } catch (e) { return id; } });
      return `<div class="ccol"><h3>${esc(C.gName[gid])}</h3><p class="muted small">${t.counts[gid]} مقطعًا${books.length ? ' · ' + books.slice(0, 3).map(t => '<bdi>' + esc(t) + '</bdi>').join('، ') + (books.length > 3 ? '…' : '') : ''}</p>${first.map(card).join('')}${rest.length ? `<details><summary>${rest.length} مقاطع أخرى</summary>${rest.map(card).join('')}</details>` : ''}</div>`;
    }).join('');
    const diffsAll = t.differences || [];
    const diffs = (C.sel.length ? diffsAll.filter(d => C.sel.includes(d.gid)) : diffsAll).slice(0, 10);
    box.innerHTML = `<h2>${esc(t.ar)}${t.custom ? ' <span class="chip plain">بحث حر</span>' : ''}</h2>
      <p class="muted">${esc(t.desc || '')}</p>
      <div class="pick" role="group" aria-label="اختر المؤلفين للمقارنة (حتى ${MAXSEL})">
        ${gs.map(([g, n]) => `<button type="button" class="pk" data-viz="pick" data-g="${esc(g)}" aria-pressed="${C.sel.includes(g)}">${esc(C.gName[g])} <span>${n}</span></button>`).join('')}
        <span class="pk-act"><button type="button" class="linkish" data-viz="top3">الأكثر تناولًا (3)</button> · <button type="button" class="linkish" data-viz="clr">مسح</button></span></div>
      ${C.sel.length ? `<div class="ccols" style="--n:${C.sel.length}">${cols}</div>` : '<p class="empty">اضغط على مؤلفين أو أكثر (حتى ' + MAXSEL + ') لتظهر أقوالهم جنبًا إلى جنب.</p>'}
      <h3>ما سجّله معدّو الملخصات عن الاتفاق والاختلاف ${W.chip('dispute')}</h3>
      ${diffs.length ? diffs.map(d => `<div class="card dcard"><p class="pmeta"><b>${esc(C.gName[d.gid] || '')}</b> · <a href="${esc(d.href)}">${esc(d.title)}</a></p><p>${esc(d.text)}</p></div>`).join('') : '<p class="muted">لا أقسام «أين يختلف الكتاب» تذكر هذا الموضوع عند المؤلفين المختارين.</p>'}
      ${(t.nDifferences || 0) > diffs.length && !C.sel.length ? `<p class="muted small">يوجد ${t.nDifferences} خلافًا مسجّلًا؛ اختر مؤلفين لتصفية ما يخصهم.</p>` : ''}`;
  }

  function persistCmp() {
    const p = new URLSearchParams();
    if (C.custom) p.set('q', C.q); else if (C.t) p.set('t', C.t);
    if (C.sel.length) p.set('a', C.sel.join(','));
    setUrl('compare', p);
  }
  function setTopic(id, pick) {
    C.t = id; C.custom = null; C.q = '';
    const t = curTopic(); if (!t) return;
    C.sel = pick && t.counts[pick] ? [pick, ...topPick(t, 3).filter(g => g !== pick)].slice(0, 2) : topPick(t, 3);
    cmpDetail(); persistCmp(); scrollDetail();
  }
  function scrollDetail() { const d = document.getElementById('cmpDetail'); if (d) d.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' }); }

  function customTopic(q) {
    const res = W.parseQuery(q); if (!res.length) return null;
    const per = {}, diffs = [];
    for (const r of W.D().index) {
      if (!r.book || r.type === 'concept' || r.type === 'verify') continue;
      if (r.tag === 'specialist' || MED.test(r.title + ' ' + r.text)) continue;
      const gid = C.gOf[r.book]; if (!gid) continue;
      const hay = r.title + ' ' + r.sub + ' ' + r.text;
      if (!res.every(re => re.test(hay))) continue;
      let score = 0; res.forEach(re => { const m = (r.text + ' ' + r.sub).match(new RegExp(re.source, 'gi')); score += m ? m.length * 2 : 0; });
      if (r.type === 'difference') { diffs.push({ gid, bookId: r.book, title: r.title, text: r.text.length > 420 ? r.text.slice(0, 417) + '…' : r.text, href: r.href }); continue; }
      (per[gid] = per[gid] || []).push({ score, bookId: r.book, type: r.type, title: r.title, sub: r.sub, text: W.snippet(r.text, res), titleOnly: score === 0, tag: r.tag, href: r.href });
    }
    const counts = {}, passages = {};
    for (const [g, arr] of Object.entries(per)) { counts[g] = arr.length; const seen = new Set(); passages[g] = arr.sort((a, b) => b.score - a.score).filter(p => !seen.has(p.text) && seen.add(p.text)).slice(0, 6); }
    return { id: 'custom', ar: '«' + q + '»', desc: 'نتيجة بحث حر في ملخصات كل الكتب. كلما كانت الكلمة أعم كثرت المقاطع غير الدقيقة.', counts, passages, differences: diffs.slice(0, 14), nDifferences: diffs.length, custom: true };
  }
  function runCustom(q) {
    C.q = q; C.t = '';
    return W.loadIndex().then(() => {
      C.custom = customTopic(q);
      if (!C.custom || !Object.keys(C.custom.counts).length) { C.custom = null; document.getElementById('cmpDetail').innerHTML = `<p class="empty">لم تظهر مقاطع عن «${esc(q)}». جرّب كلمة أقرب أو أقل تحديدًا.</p>`; return; }
      C.sel = topPick(C.custom, 3); cmpDetail(); persistCmp();
    });
  }

  views.compare = {
    wide: true,
    need: () => loadTopics(),
    html: compareHtml,
    after(root, _, params) {
      if (!bound.has(root)) bound.add(root), bindGlobal(root);
      if (C.q && !C.t) { runCustom(C.q); return; }
      const t = curTopic();
      if (t && !C.sel.length) C.sel = topPick(t, 3);
      cmpDetail();
    }
  };

  /* =====================================================================
     أحداث مشتركة (تُربط مرة واحدة على جذر التطبيق)
     ===================================================================== */
  function bindGlobal(root) {
    root.addEventListener('click', ev => {
      const el = ev.target.closest('[data-viz],[data-n]'); if (!el || !root.contains(el)) return;
      if (el.dataset.n && !el.closest('svg')) { selectNode(el.dataset.n); return; }
      switch (el.dataset.viz) {
        case 'zin': zoom(0.8); break;
        case 'zout': zoom(1.25); break;
        case 'zreset': M.view = null; drawMap(); break;
        case 'clear': selectNode(''); break;
        case 'topic': setTopic(el.dataset.t); break;
        case 'cell': setTopic(el.dataset.t, el.dataset.g); break;
        case 'pick': {
          const g = el.dataset.g;
          if (C.sel.includes(g)) C.sel = C.sel.filter(x => x !== g);
          else C.sel = [...C.sel, g].slice(-MAXSEL);
          cmpDetail(); persistCmp(); break;
        }
        case 'top3': { const t = curTopic(); if (t) { C.sel = topPick(t, 3); cmpDetail(); persistCmp(); } break; }
        case 'clr': C.sel = []; cmpDetail(); persistCmp(); break;
      }
    });
    root.addEventListener('change', ev => {
      const id = ev.target.id;
      if (id === 'mapW') { M.minW = +ev.target.value; recompute(); persistMap(); }
      else if (id === 'mapB') { M.minB = ev.target.checked ? 2 : 1; recompute(); persistMap(); }
      else if (id === 'mapBook') { M.book = ev.target.value; drawMap(); persistMap(); }
      else if (id === 'mapJump') { selectNode(ev.target.value); }
    });
    root.addEventListener('submit', ev => {
      if (ev.target.id === 'cmpForm') { ev.preventDefault(); const q = (new FormData(ev.target).get('q') || '').toString().trim(); if (q) runCustom(q).then(scrollDetail); }
    });
  }
})();
