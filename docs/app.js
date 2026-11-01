/* ADHD Wiki: واجهة ثابتة بلا خادم. البيانات: data.json (فهرس خفيف) + books/<id>.json لكل كتاب + search.json للبحث */
(() => {
  'use strict';
  const $app = document.getElementById('app');
  let D = null;

  const TAGS = {
    book: ['يقوله الكتاب', 'ما يذكره المؤلف، بإعادة صياغة.'],
    claim: ['ادعاء المؤلف', 'رأي أو رقم يذكره المؤلف ولم نتحقق منه.'],
    inference: ['استنتاج', 'اجتهاد معدّ الموقع أو الملخِّص، وليس نص الكتاب.'],
    verify: ['قيد التحقق', 'رقم أو معلومة تحتاج مراجعة من المصدر قبل الاعتماد عليها.'],
    specialist: ['يحتاج مختصًا', 'قرار طبي أو نفسي. يُترك للطبيب أو المختص.'],
    dispute: ['خلاف', 'موضع اختلف فيه الكتب أو يحتاج موازنة. نعرض الرأيين.']
  };
  const TYPES = { chapter: 'فصل', tool: 'أداة', concept: 'مفهوم', difference: 'خلاف', verify: 'للتحقق' };

  // ---------- أدوات ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('adhdwiki:v1:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('adhdwiki:v1:' + k, JSON.stringify(v)); } catch (e) { /* التخزين غير متاح */ } }
  };
  const chip = (tag, extra = '') => `<span class="chip ${tag}" title="${esc(TAGS[tag][1])}">${TAGS[tag][0]}</span>${extra}`;
  const audName = id => (D.audiences.find(a => a.id === id) || {}).ar || id;
  const getBook = id => D.books.find(b => b.id === id);

  // تعبير نمطي يتجاوز التشكيل وأشكال الألف والياء والتاء المربوطة
  function termRe(t) {
    const marks = '[\\u064B-\\u065F\\u0670\\u0640]*';
    const map = { 'ا': '[اأإآٱ]', 'أ': '[اأإآٱ]', 'إ': '[اأإآٱ]', 'آ': '[اأإآٱ]', 'ي': '[يى]', 'ى': '[يى]', 'ه': '[هة]', 'ة': '[هة]' };
    return [...t].map(ch => (map[ch] || ch.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')) + marks).join('');
  }
  function parseQuery(q) { return q.trim().split(/\s+/).filter(Boolean).map(t => new RegExp(termRe(t), 'i')); }
  function highlight(text, res) {
    if (!res.length) return esc(text);
    const all = new RegExp(res.map(r => r.source).join('|'), 'gi');
    let out = '', last = 0, m;
    while ((m = all.exec(text))) {
      if (m[0] === '') { all.lastIndex++; continue; }
      out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  function snippet(text, res) {
    let idx = -1;
    for (const r of res) { const m = r.exec(text); if (m && (idx < 0 || m.index < idx)) idx = m.index; }
    const start = Math.max(0, idx - 60);
    const s = text.slice(start, start + 190);
    return (start > 0 ? '…' : '') + s + (start + 190 < text.length ? '…' : '');
  }
  const hash = () => {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(qs || '') };
  };

  // واجهة للعروض الإضافية (viz.js)
  window.__views = window.__views || Object.create(null);
  window.__wiki = { D: () => D, esc, chip, getBook, hash, termRe, parseQuery, highlight, snippet, loadIndex: () => loadIndex(), loadJSON: u => loadJSON(u) };

  // ---------- العروض ----------
  function home() {
    const nb = D.books.length, nc = D.books.reduce((s, b) => s + b.chapters.length, 0);
    const nt = D.books.reduce((s, b) => s + b.nTools, 0);
    return `
      <section class="hero">
        <h1>مرجع العائلة عن ADHD والتربية</h1>
        <p class="lead">ابحث عن مفهوم أو مشكلة، فتصلك الفكرة والأداة ورقم الفصل.</p>
        <form class="searchbox" role="search" id="homeSearch">
          <input type="search" name="q" placeholder="مثال: الذاكرة العاملة، التجنب، وقت إضافي" aria-label="ابحث في المرجع" autocomplete="off">
          <button class="btn" type="submit">ابحث</button>
        </form>
        <div class="quick" aria-label="بحث سريع">
          ${['الذاكرة العاملة', 'كره الانتظار', 'التجنب', 'وقت إضافي', 'النوم'].map(q => `<a href="#/search?q=${encodeURIComponent(q)}">${q}</a>`).join('')}
        </div>
      </section>
      ${newsBox()}
      <section class="doors" aria-label="الأقسام">
        <a class="door" href="#/library"><b>${nb}</b><span>المكتبة</span><small>${nc} فصلًا بملخصات كاملة، وخريطة لكل كتاب.</small></a>
        <a class="door" href="#/toolkit"><b>${nt}</b><span>الأدوات</span><small>خطوات وقوائم تحقق تجرّبها وتضع عليها علامة.</small></a>
        <a class="door" href="#/concepts"><b>${D.concepts.length}</b><span>المفاهيم</span><small>مصطلح بمصطلح، وأين يظهر في الكتب.</small></a>
        <a class="door" href="#/audience"><b>${D.audiences.length}</b><span>حسب من تكون؟</span><small>بالغ مصاب، أب أو أم، معلم، أو تحدٍّ خاص.</small></a>
      </section>
      <p class="stage">${esc(D.site.stage)}. كل شيء هنا موسوم: ما يقوله الكتاب، وما هو استنتاج، وما يحتاج مختصًا. <a href="#/about">اعرف الوسوم</a>.</p>`;
  }

  function newsBox() {
    const n = (D.news || [])[0];
    if (!n) return '';
    const links = (n.books || []).map(id => D.books.find(b => b.id === id)).filter(Boolean)
      .map(b => `<a href="#/book/${b.id}">${esc(b.title.split(':')[0])}</a>`).join('') + (n.links || []).map(([h, t]) => `<a href="${esc(h)}">${esc(t)}</a>`).join('');
    return `<aside class="news" aria-label="آخر الإضافات"><b>${esc(n.title)} <small>${esc(n.date)}</small></b><p>${esc(n.note)}</p><div class="quick">${links}</div></aside>`;
  }

  function library() {
    return `<h1>المكتبة</h1>
      <p class="muted">كل كتاب له بطاقة، وخريطة فصول، وملخص لكل فصل.</p>
      ${D.books.map(b => `
        <article class="card">
          <h3><a href="#/book/${b.id}">${esc(b.title)}</a></h3>
          <p class="muted">${esc(b.author)}، ${b.year}</p>
          <div class="chips">${b.audience.map(a => `<span class="chip plain">${esc(audName(a))}</span>`).join('')}</div>
          <p class="muted">${b.chapters.length} فصلًا، و${b.nTools} أداة. الفئة العمرية في الكتاب: ${esc(b.ageRange)}.</p>
        </article>`).join('')}
      <p class="empty">الكتب الأخرى تُضاف واحدًا بعد الآخر بعد مراجعة كل ملخص.</p>`;
  }

  function bookPage(b, current) {
    const strip = `<div class="strip" role="list" aria-label="خريطة الفصول">${b.chapters.map(c =>
      `<a class="tile" role="listitem" href="#/book/${b.id}/${c.id}" ${current === c.id ? 'aria-current="true"' : ''}><b>${esc(c.badge)}</b><span>${esc(c.title)}</span></a>`).join('')}</div>`;
    return { strip, b };
  }

  function book(id) {
    const b = D.books.find(x => x.id === id);
    if (!b) return notFound();
    const { strip } = bookPage(b);
    return `${printCard(b)}<div class="screen-only">
      <p class="crumbs"><a href="#/library">المكتبة</a></p>
      <h1>${esc(b.title)}</h1>
      <p class="muted">${esc(b.author)}، ${b.year}</p>
      <p class="actions"><button class="btn ghost" type="button" data-print>🖨 طباعة بطاقة الكتاب</button></p>
      <h2>الفكرة في خمسة أسطر</h2>
      <ol class="body">${b.core.map(c => `<li>${c.html}</li>`).join('')}</ol>
      <h2>خريطة الفصول</h2>
      ${strip}
      ${b.chapterNote ? `<p class="muted">${esc(b.chapterNote.replace(/^ملاحظة عن الإحالات:\s*/, ''))}</p>` : ''}
      <h2>بطاقة الكتاب</h2>
      <div class="card"><dl class="kv">${b.card.map(k => `<dt>${esc(k.k)}</dt><dd>${k.html}</dd>`).join('')}</dl></div>
      <h2>أقسام أخرى في الكتاب</h2>
      <ul class="list card">
        <li><a class="row" href="#/toolkit"><span class="n">${b.nTools}</span><span><strong>الأدوات</strong><br><span class="muted">أهم ${b.nTools} أداة، مع قوائم تحقق.</span></span></a></li>
        <li><a class="row" href="#/book/${b.id}/differences"><span class="n">${b.differences.length}</span><span><strong>أين يختلف الكتاب</strong><br><span class="muted">مواضع تحتاج موازنة، نعرض فيها الرأيين.</span></span></a></li>
        <li><a class="row" href="#/book/${b.id}/verify"><span class="n">${b.numbers.length}</span><span><strong>أرقام تحتاج تحققًا</strong><br><span class="muted">وأسئلة تحتاج الرجوع إلى النص الأصلي.</span></span></a></li>
      </ul></div>`;
  }

  function printCard(b) {
    const tools = (b.tools || []).slice(0, 15);
    const sens = b.chapters.filter(c => c.sensitive).map(c => c.prefix + c.title);
    return `<section class="printcard" aria-hidden="true" dir="rtl">
      <header class="pc-head">
        <div class="pc-brand">مرجع العائلة عن ADHD والتربية</div>
        <h1>${esc(b.title)}</h1>
        <p>${esc(b.author)} · ${b.year}</p>
        <div class="pc-aud">${b.audience.map(a => `<span>${esc(audName(a))}</span>`).join('')}<span>${esc(b.ageRange)}</span></div>
      </header>
      <h2>الفكرة في خمسة أسطر</h2>
      <ol class="pc-core">${b.core.map(c => `<li>${c.html}</li>`).join('')}</ol>
      <div class="pc-cols">
        <div>
          <h2>بطاقة الكتاب</h2>
          <dl class="pc-kv">${b.card.map(k => `<dt>${esc(k.k)}</dt><dd>${k.html}</dd>`).join('')}</dl>
        </div>
        <div>
          <h2>خريطة الفصول (${b.chapters.length})</h2>
          <ul class="pc-map">${b.chapters.map(c => `<li><b>${esc(c.badge)}</b>${esc(c.title)}</li>`).join('')}</ul>
        </div>
      </div>
      <h2>أهم الأدوات</h2>
      <ul class="pc-tools">${tools.map(t => `<li><i></i><span>${esc(t.title)}</span><small>${esc(t.kind)}</small></li>`).join('')}</ul>
      ${b.differences.length ? `<h2>أين يحتاج الكتاب موازنة</h2><ul class="pc-diff">${b.differences.map(d => `<li>${esc(d.title)}</li>`).join('')}</ul>` : ''}
      ${sens.length ? `<p class="pc-note">فصول حساسة: ${sens.map(esc).join('، ')}.</p>` : ''}
      <footer class="pc-foot">ملخص تعليمي وليس بديلًا عن الكتاب أو المختص. لا تشخيص ولا جرعات. ما يحتاج تحققًا موسوم في صفحة «للتحقق».</footer>
    </section>`;
  }

  function chapter(bid, cid) {
    const b = D.books.find(x => x.id === bid); if (!b) return notFound();
    const i = b.chapters.findIndex(c => c.id === cid); if (i < 0) return notFound();
    const c = b.chapters[i];
    const prev = b.chapters[i - 1], next = b.chapters[i + 1];
    const openKeys = new Set(['ideas', 'tools', 'warnings']);
    const body = c.fields.filter(f => f.key !== 'problem').map(f => `
      <details class="fld" ${openKeys.has(f.key) ? 'open' : ''}>
        <summary>${esc(f.label)} ${chip(f.tag)}${f.specialist ? ' ' + chip('specialist') : ''}</summary>
        <div class="body">${f.html}</div>
      </details>`).join('');
    const related = D.concepts.filter(k => k.hits.some(h => h.chapterId === c.id && h.bookId === b.id));
    const { strip } = bookPage(b, c.id);
    return `
      <p class="crumbs"><a href="#/library">المكتبة</a> / <a href="#/book/${b.id}">${esc(b.title.split(':')[0])}</a></p>
      ${strip}
      <h1>${esc(c.prefix + c.title)}</h1>
      <p class="actions"><button class="btn ghost" type="button" data-print>🖨 طباعة الفصل</button></p>
      ${c.en ? `<p class="muted" dir="ltr" style="text-align:end">${esc(c.en)}</p>` : ''}
      ${c.sensitive ? `<p class="callout" role="note">تنبيه: يتناول هذا الفصل حزنًا شديدًا أو إيذاء النفس. اقرأه بحذر. إن كنت أنت أو أحد من حولك في خطر فوري، اطلب مساعدة طوارئ محلية أو مختصًا الآن.</p>` : ''}
      ${(c.fields.find(f => f.key === 'problem') || {}).html ? `<div class="card"><strong>المشكلة:</strong> ${c.fields.find(f => f.key === 'problem').html.replace(/^<p>|<\/p>\s*$/g, '')}</div>` : ''}
      ${body}
      ${related.length ? `<h2>مفاهيم في هذا الفصل</h2><div class="chips">${related.map(k => `<a class="chip book" href="#/concept/${k.id}">${esc(k.ar)}</a>`).join('')}</div>` : ''}
      <nav class="pager" aria-label="الفصول">
        ${prev ? `<a href="#/book/${b.id}/${prev.id}"><small>الفصل السابق</small>${esc(prev.prefix + prev.title)}</a>` : '<span></span>'}
        ${next ? `<a href="#/book/${b.id}/${next.id}"><small>الفصل التالي</small>${esc(next.prefix + next.title)}</a>` : '<span></span>'}
      </nav>`;
  }

  function differences(id) {
    const b = D.books.find(x => x.id === id); if (!b) return notFound();
    return `<p class="crumbs"><a href="#/library">المكتبة</a> / <a href="#/book/${b.id}">${esc(b.title.split(':')[0])}</a></p>
      <h1>أين يختلف الكتاب أو يحتاج موازنة</h1>
      <p class="muted">عند الخلاف نعرض الرأيين ولا نحسم. القرار الأول لمختص يعرف الحالة.</p>
      ${b.differences.map(d => `<article class="card"><h3>${esc(d.title)} ${chip('dispute')}</h3><div class="body"><p>${d.html}</p></div></article>`).join('')}`;
  }

  function verify(id) {
    const b = D.books.find(x => x.id === id); if (!b) return notFound();
    return `<p class="crumbs"><a href="#/library">المكتبة</a> / <a href="#/book/${b.id}">${esc(b.title.split(':')[0])}</a></p>
      <h1>للتحقق قبل الاعتماد</h1>
      <h2>أرقام ${chip('verify')}</h2>
      <ul class="body card">${b.numbers.map(n => `<li>${n.html}</li>`).join('')}</ul>
      <h2>أسئلة للرجوع إلى النص الأصلي</h2>
      <ol class="body card">${b.questions.map(q => `<li>${q.html}</li>`).join('')}</ol>
      <h2>ملاحظات جودة</h2>
      <ul class="body card">${b.quality.map(q => `<li>${q}</li>`).join('')}</ul>`;
  }

  function toolkit(focusId, params) {
    const aud = params.get('aud') || '', kind = params.get('kind') || '';
    let tools = D.books.flatMap(b => b.tools);
    const kinds = [...new Set(tools.map(t => t.kind))];
    const total = tools.length;
    if (aud) tools = tools.filter(t => t.audiences.includes(aud));
    if (kind) tools = tools.filter(t => t.kind === kind);
    const link = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); const s = p.toString(); return '#/toolkit' + (s ? '?' + s : ''); };
    const done = store.get('tried', {});
    return `<h1>الأدوات</h1>
      <p class="muted">خطوات وقوائم من الكتب. علّم ما جرّبته. العلامات تُحفظ في هذا المتصفح فقط.</p>
      <div class="filters" aria-label="تصفية حسب المستفيد">
        <button type="button" data-href="${link('aud', '')}" aria-pressed="${!aud}">الكل</button>
        ${D.audiences.map(a => `<button type="button" data-href="${link('aud', a.id)}" aria-pressed="${aud === a.id}">${esc(a.ar)}</button>`).join('')}
      </div>
      <div class="filters">
        <label for="tk-kind" class="muted">النوع</label>
        <select id="tk-kind" data-tk="kind"><option value="">كل الأنواع</option>${kinds.map(k => `<option value="${esc(k)}" ${kind === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
      </div>
      <p class="count">${tools.length} من ${total}</p>
      ${tools.length ? tools.map(t => toolCard(t, done, focusId)).join('') : '<p class="empty">لا توجد أدوات بهذا التصفية. جرّب «الكل».</p>'}`;
  }
  function toolCard(t, done, focusId) {
    const b = getBook(t.bookId);
    const checks = store.get('chk:' + t.id, []);
    const src = t.chapters.length ? 'الفصل ' + t.chapters.join('، ') : '';
    return `<article class="card tool ${focusId === t.id ? 'hl' : ''}" id="${t.id}">
      <h3>${esc(t.title)}</h3>
      <div class="chips">${chip(t.tag)}<span class="chip plain">${esc(t.kind)}</span>${t.audiences.map(a => `<span class="chip plain">${esc(audName(a))}</span>`).join('')}</div>
      <div class="body"><p>${t.html}</p></div>
      ${t.checklist ? `<h4 style="margin:.6em 0 0">${esc(t.checklistTitle)}</h4>
        <ul class="check">${t.checklist.map((s, i) => `<li><label><input type="checkbox" data-chk="${t.id}" data-i="${i}" ${checks.includes(i) ? 'checked' : ''}><span>${esc(s)}</span></label></li>`).join('')}</ul>` : ''}
      <p class="src">المصدر: ${esc(b.title.split(':')[0])}، ${esc(src)}. ${t.chapters[0] != null ? `<a href="#/book/${b.id}/ch${t.chapters[0]}">افتح الفصل</a>` : ''}</p>
      <label class="tried"><input type="checkbox" data-tried="${t.id}" ${done[t.id] ? 'checked' : ''}> جرّبتها</label>
    </article>`;
  }

  function concepts() {
    const list = [...D.concepts].sort((a, b) => a.ar.localeCompare(b.ar, 'ar'));
    return `<h1>شبكة المفاهيم</h1>
      <p class="muted">كل مصطلح يقودك إلى الفصول التي يظهر فيها. كلما أضفنا كتابًا اتسعت الشبكة. <a href="#/map">شاهدها كخريطة تفاعلية</a> أو <a href="#/compare">قارن المؤلفين</a>.</p>
      <div class="cgrid">${list.map(c => `<a href="#/concept/${c.id}"><strong>${esc(c.ar)}</strong><small>${esc(c.en)}</small><span class="muted">${c.hits.length} فصول</span></a>`).join('')}</div>`;
  }
  function concept(id) {
    const c = D.concepts.find(x => x.id === id); if (!c) return notFound();
    return `<p class="crumbs"><a href="#/concepts">المفاهيم</a></p>
      <h1>${esc(c.ar)}</h1>
      <p class="muted" dir="ltr" style="text-align:end">${esc(c.en)}</p>
      <div class="card"><p>${esc(c.def)}</p><div class="chips">${chip(c.tag)}</div></div>
      <h2>أين يظهر</h2>
      ${c.books.map(bid => { const bk = getBook(bid); return `<h3>${esc(bk.title.split(':')[0])} <span class="muted">${esc(bk.author)}</span></h3>
        <div class="card">${c.hits.filter(h => h.bookId === bid).map(h => `<div class="hit"><a href="#/book/${h.bookId}/${h.chapterId}"><strong>${esc((h.prefix || '') + h.chTitle)}</strong></a>${h.snippet ? `<q>${esc(h.snippet)}</q>` : ''}</div>`).join('')}</div>`; }).join('')}
      ${D.books.length > c.books.length ? `<p class="muted">لم يظهر في: ${D.books.filter(b => !c.books.includes(b.id)).map(b => esc(b.title.split(':')[0])).join('، ')}.</p>` : ''}
      ${D.books.length < 2 ? '<p class="empty">لم تُضف كتب أخرى بعد. عند إضافتها سيظهر هنا ما تقوله عن المفهوم نفسه.</p>' : ''}
      <p><a class="btn ghost" href="#/search?q=${encodeURIComponent(c.ar)}">ابحث عن «${esc(c.ar)}» في كل شيء</a></p>`;
  }

  function audience(id) {
    const tabs = `<div class="filters" aria-label="المستفيدون">${D.audiences.map(a => `<button type="button" data-href="#/audience/${a.id}" aria-pressed="${a.id === id}">${esc(a.ar)}</button>`).join('')}</div>`;
    if (!id) {
      return `<h1>حسب من تكون؟</h1><p class="muted">اختر موقعك لترى ما يخصك.</p>
        <div class="doors">${D.audienceLists.map(a => `<a class="door" href="#/audience/${a.id}"><b>${a.tools.length + a.chapters.length}</b><span>${esc(a.ar)}</span><small>${esc(a.desc)}</small></a>`).join('')}</div>
        <p class="stage">التصنيف اجتهاد من معدّ الموقع وليس رأي المؤلفين.</p>`;
    }
    const a = D.audienceLists.find(x => x.id === id); if (!a) return notFound();
    return `<h1>${esc(a.ar)}</h1><p class="muted">${esc(a.desc)}</p>${tabs}
      <p class="stage">التصنيف اجتهاد من معدّ الموقع وليس رأي المؤلفين ${chip('inference')}</p>
      ${!a.tools.length && !a.chapters.length ? `<p class="empty">لا يغطي الكتاب الوحيد المضاف حتى الآن هذا الموضوع. سنضيف الكتب المناسبة له لاحقًا. هذا أصدق من ملء الصفحة بكلام عام.</p>` : ''}
      ${a.chapters.length ? `<h2>فصول تناسبك</h2><ul class="list card">${a.chapters.map(c => `<li><a class="row" href="#/book/${c.bookId}/${c.id}"><span class="n">${esc(c.badge)}</span><span><strong>${esc(c.prefix + c.title)}</strong> <span class="muted">${esc(getBook(c.bookId).title.split(':')[0])}</span><br><span class="muted">${esc(c.lead)}</span></span></a></li>`).join('')}</ul>` : ''}
      ${a.tools.length ? `<h2>أدوات تناسبك</h2><ul class="list card">${a.tools.map(t => `<li><a class="row" href="#/toolkit/${t.bookId}-t${t.n}"><span class="n">${t.n}</span><span><strong>${esc(t.title)}</strong> <span class="chip plain">${esc(t.kind)}</span></span></a></li>`).join('')}</ul>` : ''}`;
  }

  function search(params) {
    const q = params.get('q') || '', type = params.get('type') || '', aud = params.get('aud') || '', tag = params.get('tag') || '', bk = params.get('book') || '';
    const res = parseQuery(q);
    let results = [];
    if (res.length) {
      results = D.index.filter(r => (!type || r.type === type) && (!aud || r.audience.includes(aud)) && (!tag || r.tag === tag) && (!bk || r.book === bk || r.type === 'concept'))
        .map(r => {
          const hay = r.title + ' ' + r.sub + ' ' + r.text;
          if (!res.every(re => re.test(hay))) return null;
          let score = 0; res.forEach(re => { if (re.test(r.title)) score += 6; const m = hay.match(new RegExp(re.source, 'gi')); score += m ? Math.min(m.length, 5) : 0; });
          if (r.type === 'concept') score += 4;
          return { r, score };
        }).filter(Boolean).sort((a, b) => b.score - a.score);
    }
    const sel = (name, label, opts, val) => `<div><label for="f-${name}">${label}</label><select id="f-${name}" data-f="${name}"><option value="">الكل</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${val === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
    return `<h1>بحث</h1>
      <form class="searchbox" role="search" id="searchForm"><input type="search" name="q" value="${esc(q)}" placeholder="اكتب كلمة أو أكثر" aria-label="كلمات البحث" autocomplete="off"><button class="btn" type="submit">ابحث</button></form>
      <div class="sfilters">
        ${sel('type', 'النوع', Object.entries(TYPES), type)}
        ${sel('aud', 'المستفيد', D.audiences.map(a => [a.id, a.ar]), aud)}
        ${sel('tag', 'الوسم', Object.entries(TAGS).map(([k, v]) => [k, v[0]]), tag)}
        ${sel('book', 'الكتاب (رأسي)', D.books.map(b => [b.id, b.title.split(':')[0]]), bk)}
      </div>
      <p class="muted">بلا كتاب محدد، يبحث في كل الكتب (أفقي). مع كتاب محدد، يبحث داخله فقط (رأسي).</p>
      ${res.length ? `<p class="count">${results.length} نتيجة</p>` : ''}
      ${results.slice(0, 60).map(({ r }) => `<div class="res"><a href="${r.href}"><strong>${highlight(r.title, res)}</strong> <span class="chip plain">${TYPES[r.type]}</span> ${chip(r.tag)}<p>${esc(r.sub)}: ${highlight(snippet(r.text, res), res)}</p></a></div>`).join('')}
      ${res.length && !results.length ? '<p class="empty">لا توجد نتائج. جرّب كلمة أقصر، أو أزل التصفية.</p>' : ''}`;
  }

  function about() {
    return `<h1>عن الموقع</h1>
      <p class="lead">مرجع عائلي غير ربحي يجمع أفكار كتب ADHD والتربية في بنية واحدة يسهل البحث فيها.</p>
      <h2>وسوم الشفافية</h2>
      <div class="legend card">${Object.entries(TAGS).map(([k, v]) => `<div>${chip(k)}<span>${esc(v[1])}</span></div>`).join('')}</div>
      <h2>ما ليس هذا الموقع</h2>
      <ul class="body"><li>ليس تشخيصًا ولا علاجًا. لا جرعات ولا توصية دوائية.</li><li>ليس بديلًا عن الكتب. الملخص خريطة، والكتاب هو المصدر.</li><li>لا يحكم على أحد، ولا يفترض سبب سلوك بعينه.</li></ul>
      <h2>كيف يُبنى</h2>
      <ul class="body"><li>كل كتاب ملف Markdown واحد، يتحول إلى بيانات منظمة (فصول، أدوات، مفاهيم، خلافات).</li><li>إضافة كتاب جديدة لا تغيّر الكود، فقط تضيف ملفًا.</li><li>الأفكار بإعادة صياغة، مع إحالة إلى الفصل. أرقام الصفحات حيث تتوفر.</li><li>آخر بناء: ${esc(D.site.generated)}.</li></ul>
      <h2>الخصوصية</h2>
      <p>لا حسابات ولا تتبع. علامات «جرّبتها» وقوائم التحقق تُحفظ في متصفحك وحده.</p>`;
  }
  function notFound() { return `<h1>الصفحة غير موجودة</h1><p>الرابط قديم أو خاطئ. <a href="#/">ارجع إلى الرئيسية</a>.</p>`; }

  // ---------- تحميل البيانات عند الحاجة ----------
  const loading = {};
  const loadJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
  function loadBook(id) {
    const i = D.books.findIndex(b => b.id === id);
    if (i < 0 || D.books[i].core) return Promise.resolve();
    return (loading['b:' + id] = loading['b:' + id] || loadJSON('books/' + encodeURIComponent(id) + '.json').then(full => { D.books[D.books.findIndex(b => b.id === id)] = full; }));
  }
  const loadAllBooks = () => Promise.all(D.books.map(b => loadBook(b.id)));
  function loadIndex() {
    if (D.index) return Promise.resolve();
    return (loading.index = loading.index || loadJSON('search.json').then(x => { D.index = x; }));
  }
  let seq = 0;
  function render() {
    if (!D) return;
    const my = ++seq;
    const { parts } = hash();
    const [a, b] = parts;
    let need;
    if (a === 'book' && b) need = loadBook(b);
    else if (a === 'toolkit') need = loadAllBooks();
    else if (a === 'search') need = loadIndex();
    else if (window.__views[a] && window.__views[a].need) need = window.__views[a].need();
    if (!need) return draw();
    $app.setAttribute('aria-busy', 'true');
    need.then(() => { if (my === seq) { $app.removeAttribute('aria-busy'); draw(); } })
      .catch(() => { if (my === seq) { $app.removeAttribute('aria-busy'); $app.innerHTML = '<p class="callout">تعذّر تحميل البيانات. أعد تحميل الصفحة.</p>'; } });
  }
  function draw() {
    const { parts, params } = hash();
    const [a, b, c] = parts;
    let html, title = 'ADHD Wiki', nav = a || '';
    if (!a) html = home();
    else if (a === 'library') html = library();
    else if (a === 'book') html = !c ? book(b) : c === 'differences' ? differences(b) : c === 'verify' ? verify(b) : chapter(b, c);
    else if (a === 'toolkit') html = toolkit(b, params);
    else if (a === 'concepts') html = concepts();
    else if (a === 'concept') { html = concept(b); nav = 'concepts'; }
    else if (a === 'audience') html = audience(b);
    else if (a === 'search') html = search(params);
    else if (a === 'about') html = about();
    else if (window.__views[a]) html = window.__views[a].html(b, params);
    else html = notFound();
    $app.innerHTML = html;
    $app.classList.toggle('wide', !!(window.__views[a] && window.__views[a].wide));
    const h1 = $app.querySelector('h1'); if (h1) title = h1.textContent + ' | ADHD Wiki';
    document.title = title;
    document.querySelectorAll('#nav a').forEach(l => l.toggleAttribute('aria-current', l.dataset.nav === (nav === 'book' ? 'library' : nav)));
    document.querySelectorAll('#nav a[aria-current]').forEach(l => l.setAttribute('aria-current', 'page'));
    if (a === 'toolkit' && b) { const el = document.getElementById(b); if (el) { el.scrollIntoView({ block: 'center' }); return; } }
    if (a === 'book' && c && /^ch/.test(c)) { const t = $app.querySelector('.tile[aria-current]'); if (t) t.scrollIntoView({ inline: 'center', block: 'nearest' }); }
    window.scrollTo(0, 0);
    $app.focus({ preventScroll: true });
    if (window.__views[a] && window.__views[a].after) window.__views[a].after($app, b, params);
  }

  // ---------- أحداث ----------
  document.addEventListener('submit', e => {
    if (e.target.id === 'homeSearch' || e.target.id === 'searchForm') {
      e.preventDefault();
      const q = new FormData(e.target).get('q') || '';
      const p = e.target.id === 'searchForm' ? new URLSearchParams(hash().params) : new URLSearchParams();
      p.set('q', q);
      location.hash = '#/search?' + p.toString();
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.f) { const p = hash().params; t.value ? p.set(t.dataset.f, t.value) : p.delete(t.dataset.f); location.hash = '#/search?' + p.toString(); }
    if (t.dataset.tk) { const p = hash().params; t.value ? p.set(t.dataset.tk, t.value) : p.delete(t.dataset.tk); const s = p.toString(); location.hash = '#/toolkit' + (s ? '?' + s : ''); }
    if (t.dataset.chk) { const k = 'chk:' + t.dataset.chk; let a = store.get(k, []); const i = +t.dataset.i; a = t.checked ? [...new Set([...a, i])] : a.filter(x => x !== i); store.set(k, a); }
    if (t.dataset.tried) { const d = store.get('tried', {}); d[t.dataset.tried] = t.checked; store.set('tried', d); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-href]');
    if (b) location.hash = b.dataset.href;
    if (e.target.closest('button[data-print]')) {
      document.querySelectorAll('details.fld').forEach(d => { d.dataset.was = d.open ? '1' : '0'; d.open = true; });
      window.print();
      document.querySelectorAll('details.fld').forEach(d => { d.open = d.dataset.was === '1'; });
    }
  });
  window.addEventListener('hashchange', render);

  fetch('data.json').then(r => r.json()).then(d => { D = d; render(); })
    .catch(() => { $app.innerHTML = '<p class="callout">تعذّر تحميل البيانات. أعد تحميل الصفحة.</p>'; });
})();
