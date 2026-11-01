// يحوّل ملفات Markdown في content/ إلى docs/data.json
// الاستعمال: node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const BOOKS_DIR = path.join(ROOT, 'content/books');
const META_DIR = path.join(ROOT, 'content/meta');
const OUT = path.join(ROOT, 'docs/data.json');

const AUDIENCES = [
  { id: 'adults', ar: 'البالغون المصابون بـ ADHD', desc: 'فهم النفس، والمشاعر، والغضب، والتنظيم.' },
  { id: 'parents', ar: 'الآباء والأمهات', desc: 'التربية، وتقليل الصراع، وتوحيد الموقف.' },
  { id: 'teachers', ar: 'المعلمون والمحيطون', desc: 'التسهيلات، والتواصل، وقراءة السلوك.' },
  { id: 'challenges', ar: 'تحديات خاصة', desc: 'البُعد، والضغط اليومي، وإنهاك مقدم الرعاية.' }
];

// عبارات ممنوعة في أي ملف محتوى (بيانات شخصية). البناء يفشل إن وُجدت.
const BANNED = [/ما يخص حالتي/, /حالتكم/, /حالتك/, /لحالتك/, /ابنك/, /ابني\b/, /ملفاتك/, /الأب المسافر/, /ظروف سياسية/, /ضغط سياسي/, /الأب المصاب/, /الأم التي تحمل/];

// ---------- أدوات مساعدة ----------
function parseFrontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w_]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    else v = v.replace(/^"(.*)"$/, '$1');
    meta[kv[1]] = v;
  }
  return { meta, body: src.slice(m[0].length) };
}
const md = s => marked.parse(s, { gfm: true, breaks: false });
const inline = s => marked.parseInline(s);
const plain = s => s
  .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
  .replace(/^>\s?/gm, '').replace(/^\s*[-*]\s+/gm, '').replace(/^\s*\d+\.\s+/gm, '')
  .replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
function norm(s) {
  return s.toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}
const dedent = (lines, n = 2) => lines.map(l => l.startsWith(' '.repeat(n)) ? l.slice(n) : l);
// أرقام الفصول المذكورة: "الفصل 4" و"الفصلان 4 و6" و"الفصول 1، 2، 3"
function chapterRefs(t) {
  const out = [];
  for (const m of t.matchAll(/(?:الفصل|المبدأ)(?:ان|ين|ول)?\s+((?:\d+\s*(?:و|،|,|-|–)?\s*)+)/g)) {
    for (const d of m[1].matchAll(/\d+/g)) out.push(+d[0]);
  }
  return [...new Set(out)];
}

// أدوار الأقسام بحسب عنوانها، لا برقمها
const ROLES = [
  ['personal', /ما يخص حالتي|حالتي|حالتكم/],
  ['card', /بطاقة/],
  ['core', /الفكرة المحورية/],
  ['map', /خريطة/],
  ['chapters', /ملخص الفصول/],
  ['tools', /أهم\s+\d*\s*أدا|أهم .*أدوات|الأدوات/],
  ['differences', /يختلف|موازنة/],
  ['questions', /أسئلة|أرقام للتحقق/],
  ['quality', /ملاحظات جودة|جودة/]
];
function splitSections(body) {
  const parts = body.split(/^## /m).slice(1);
  return parts.map(p => {
    const nl = p.indexOf('\n');
    const title = p.slice(0, nl).trim().replace(/^\d+[.)]\s*/, '');
    const role = (ROLES.find(([, re]) => re.test(title)) || [])[0] || 'other';
    return { title, role, body: p.slice(nl + 1).trim() };
  });
}
// "- **المفتاح:** نص" مع الأسطر المتفرعة تحته
function parseKV(lines) {
  const out = []; let cur = null;
  for (const l of lines) {
    const m = l.match(/^- \*\*(.+?)\*\*\s*(.*)$/);
    if (m) { cur = { k: m[1].replace(/[:：]\s*$/, ''), v: m[2].trim(), rest: [] }; out.push(cur); }
    else if (cur && l.trim() && /^\s+/.test(l)) cur.rest.push(l);
  }
  return out.map(o => ({ k: o.k, v: o.v + (o.rest.length ? '\n\n' + dedent(o.rest).join('\n') : '') }));
}

const FIELD_KIND = [
  [/^المشكلة/, 'problem', 'المشكلة', 'book'],
  [/^الأفكار/, 'ideas', 'الأفكار الأساسية', 'book'],
  [/^المفاهيم/, 'concepts', 'المفاهيم', 'book'],
  [/^(القصة|القصص)/, 'story', 'القصة والأمثلة', 'book'],
  [/^ماذا تثبت/, 'proves', 'ماذا تثبت القصة؟', 'inference'],
  [/^الأدوات/, 'tools', 'الأدوات والخطوات', 'book'],
  [/^ادعاءات/, 'claims', 'ادعاءات تحتاج تحققًا', 'verify'],
  [/^(تحذير|التحذير)/, 'warnings', 'تحذيرات', 'book'],
  [/^النتيجة/, 'outcome', 'النتيجة', 'book']
];
const MED = /دواء|الدواء|منشط|جرعة|الجرعة|فلوكستين|كلوميبرامين/;
const cleanLabel = s => s.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[:：]\s*$/, '').trim();

function parseChapter(raw, idx, extra) {
  const lines = raw.split('\n');
  const title = lines[0].replace(/^###\s*/, '').replace(/\s*\(ص\s*[^)]*\)\s*$/, '').trim();
  let num = null, name = title, en = '', prefix = '', badge = '', id = 'sec' + idx;
  const mNum = title.match(/^(?:الفصل|المبدأ)\s+(\d+):\s*(.*)$/);
  if (mNum) { num = +mNum[1]; name = mNum[2]; prefix = `${title.startsWith('المبدأ') ? 'المبدأ' : 'الفصل'} ${num}: `; badge = String(num); id = 'ch' + num; }
  else if (title.startsWith('المقدمة')) { id = 'ch0'; badge = 'م'; num = 0; name = title.replace(/^المقدمة:?\s*/, '') || 'المقدمة'; if (title.replace(/\(.*\)/, '').trim() === 'المقدمة') name = 'المقدمة'; else prefix = 'المقدمة: '; }
  else if (title.startsWith('الخاتمة')) { id = 'conclusion'; badge = 'خ'; name = title.replace(/^الخاتمة:?\s*/, '') || 'الخاتمة'; prefix = name === 'الخاتمة' ? '' : 'الخاتمة: '; }
  else if (title.startsWith('الملاحق')) { id = 'appendix'; badge = 'ل'; }
  else { badge = String(idx + 1); }
  const mEn = name.match(/\(([A-Za-z][^)]*)\)\s*$/);
  if (mEn) { en = mEn[1]; name = name.slice(0, mEn.index).trim(); }

  // الحقول: سطر يبدأ بـ **تسمية** (مع "- " أو بدونها) وتسميته من الحقول المعروفة فقط
  const fields = []; let cur = null; const pre = [];
  for (const l of lines.slice(1)) {
    if (l.trim() === '---') continue;
    const m = l.match(/^(?:- )?\*\*(.+?)\*\*\s*(.*)$/);
    const kind = m && FIELD_KIND.find(([re]) => re.test(m[1]));
    if (kind) {
      cur = { kind, label: cleanLabel(m[1]), first: m[2].trim(), rest: [] };
      fields.push(cur);
    } else if (cur) cur.rest.push(l);
    else pre.push(l);
  }
  const outFields = fields.map(f => {
    const rest = dedent(f.rest).join('\n').trim();
    const src = f.first + (rest ? '\n\n' + rest : '');
    return {
      key: f.kind[1], label: f.kind[2], tag: f.kind[3],
      html: md(src), text: plain(src),
      specialist: ['tools', 'ideas'].includes(f.kind[1]) && MED.test(plain(src))
    };
  });
  const preSrc = pre.join('\n').trim();
  if (preSrc) outFields.unshift({ key: 'other', label: 'المحتوى', tag: 'book', html: md(preSrc), text: plain(preSrc), specialist: false });
  const problem = outFields.find(f => f.key === 'problem');
  const lead = problem ? problem.text.split(/(?<=[.؟!])\s/)[0] : (outFields[0] ? outFields[0].text.slice(0, 140) : '');
  return {
    id, num, prefix, badge, title: name, en, lead, fields: outFields,
    sensitive: (extra.sensitiveChapters || []).includes(num), text: plain(raw)
  };
}

function buildBook(file) {
  const src = fs.readFileSync(path.join(BOOKS_DIR, file), 'utf8');
  for (const re of BANNED) if (re.test(src)) throw new Error(`${file}: عبارة ممنوعة (${re}). نظّف الملف قبل البناء.`);
  const { meta, body } = parseFrontMatter(src);
  meta.id = meta.id || file.replace(/\.md$/, '');
  const metaFile = path.join(META_DIR, file.replace(/\.md$/, '.json'));
  const extra = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  const secs = splitSections(body.replace(/^# .*\n/, '')).filter(s => s.role !== 'personal');
  const sec = r => secs.find(s => s.role === r) || { body: '' };

  const card = parseKV(sec('card').body.split('\n')).map(({ k, v }) => ({ k, html: md(v).replace(/^<p>|<\/p>\s*$/g, ''), text: plain(v) }));
  const core = sec('core').body.split('\n').filter(l => /^\d+\.\s/.test(l)).map(l => {
    const t = l.replace(/^\d+\.\s*/, ''); return { html: inline(t), text: plain(t) };
  });

  const chRaw = sec('chapters').body.split(/^### /m).slice(1).map(s => '### ' + s);
  const chapters = chRaw.map((r, i) => parseChapter(r, i, extra));
  const keyOf = c => c.num != null && c.id.startsWith('ch') ? String(c.num) : c.id;
  chapters.forEach(c => { c.audiences = (extra.chapterAudiences || {})[keyOf(c)] || (extra.chapterAudiences || {}).default || []; });

  const tools = [];
  for (const l of sec('tools').body.split('\n')) {
    const m = l.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (!m) continue;
    const n = +m[1], mm = (extra.tools || {})[n] || {};
    tools.push({
      id: `${meta.id}-t${n}`, n, bookId: meta.id,
      title: m[2].replace(/[:：]\s*$/, ''), html: inline(m[3].trim()), text: plain(m[2] + ' ' + m[3]),
      chapters: chapterRefs(l), kind: mm.kind || 'أداة', audiences: mm.audiences || [], tag: mm.tag || 'book',
      checklistTitle: mm.checklistTitle || null, checklist: mm.checklist || null
    });
  }

  const differences = parseKV(sec('differences').body.split('\n')).map(({ k, v }) => ({ title: k, html: md(v).replace(/^<p>|<\/p>\s*$/g, ''), text: plain(k + ' ' + v) }));

  const questions = [], numbers = []; let state = 'q';
  for (const l of sec('questions').body.split('\n')) {
    if (/^\*\*(?:ادعاءات|أرقام)/.test(l.trim())) {
      state = 'n';
      const t = l.replace(/^\*\*[^*]+\*\*\s*/, '').trim();
      if (t) numbers.push({ html: inline(t), text: plain(t), chapters: chapterRefs(t) });
      continue;
    }
    if (state === 'q' && /^\d+\.\s/.test(l)) { const t = l.replace(/^\d+\.\s*/, ''); questions.push({ html: inline(t), text: plain(t) }); }
    else if (state === 'n' && /^- /.test(l)) { const t = l.replace(/^- /, ''); numbers.push({ html: inline(t), text: plain(t), chapters: chapterRefs(t) }); }
  }
  const quality = sec('quality').body.split('\n').filter(l => /^- /.test(l)).map(l => inline(l.replace(/^- /, '')));

  return {
    id: meta.id, title: String(meta.title).replace(/\s*[—-]\s*ملخص.*$/, ''), author: meta.author, year: +meta.year,
    audience: meta.audience || [], ageRange: meta.age_range || '', sourcePages: meta.source_pages || '',
    card, core, chapters, tools, differences, questions, numbers, quality,
    chapterNote: plain((sec('chapters').body.split('\n').find(l => l.startsWith('>')) || ''))
  };
}

// ---------- المفاهيم والبحث ----------
function snippetFor(chapter, re) {
  for (const f of chapter.fields) {
    for (const p of f.text.split(/(?<=[.؟!])\s+/)) if (re.test(norm(p))) return p.length > 190 ? p.slice(0, 187) + '…' : p;
  }
  return '';
}

const books = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.md')).sort().map(buildBook);
const conceptsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/concepts.json'), 'utf8'));

const concepts = conceptsRaw.map(c => {
  const re = new RegExp(c.patterns.map(p => norm(p).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('|'));
  const hits = [];
  for (const b of books) for (const ch of b.chapters) {
    if (re.test(norm(ch.text))) hits.push({ bookId: b.id, bookTitle: b.title, chapterId: ch.id, prefix: ch.prefix, chTitle: ch.title, snippet: snippetFor(ch, re) });
  }
  return { id: c.id, ar: c.ar, en: c.en, def: c.def, tag: c.tag, hits, books: [...new Set(hits.map(h => h.bookId))] };
}).filter(c => c.hits.length > 0);

const audienceLists = AUDIENCES.map(a => ({
  ...a,
  tools: books.flatMap(b => b.tools.filter(t => t.audiences.includes(a.id)).map(t => ({ bookId: b.id, n: t.n, title: t.title, kind: t.kind }))),
  chapters: books.flatMap(b => b.chapters.filter(c => c.audiences.includes(a.id)).map(c => ({ bookId: b.id, id: c.id, badge: c.badge, prefix: c.prefix, title: c.title, lead: c.lead })))
}));

const index = [];
for (const b of books) {
  for (const ch of b.chapters) for (const f of ch.fields) {
    index.push({ type: 'chapter', title: ch.prefix + ch.title, sub: f.label, text: f.text, tag: f.tag, audience: ch.audiences, book: b.id, href: `#/book/${b.id}/${ch.id}` });
  }
  for (const t of b.tools) index.push({ type: 'tool', title: t.title, sub: t.kind, text: t.text + ' ' + (t.checklist || []).join(' '), tag: t.tag, audience: t.audiences, book: b.id, href: `#/toolkit/${b.id}-t${t.n}` });
  for (const d of b.differences) index.push({ type: 'difference', title: d.title, sub: 'خلاف أو موازنة', text: d.text, tag: 'dispute', audience: [], book: b.id, href: `#/book/${b.id}/differences` });
  for (const n of b.numbers) index.push({ type: 'verify', title: 'يحتاج تحققًا', sub: n.chapters.map(c => 'الفصل ' + c).join('، '), text: n.text, tag: 'verify', audience: [], book: b.id, href: `#/book/${b.id}/verify` });
}
for (const c of concepts) index.push({ type: 'concept', title: `${c.ar} (${c.en})`, sub: 'مفهوم', text: c.def, tag: c.tag, audience: [], book: '', href: `#/concept/${c.id}` });

const strip = b => ({ ...b, nTools: b.tools.length, chapters: b.chapters.map(({ text, ...rest }) => rest) });
const stub = b => {
  const full = strip(b);
  return { id: b.id, title: b.title, author: b.author, year: b.year, audience: b.audience, ageRange: b.ageRange,
    nTools: full.nTools, chapters: full.chapters.map(c => ({ id: c.id, badge: c.badge, prefix: c.prefix, title: c.title })) };
};
const data = {
  site: { title: 'ADHD Wiki', subtitle: 'مرجع العائلة', generated: new Date().toISOString().slice(0, 10), stage: `نموذج تجريبي: ${books.length} ${books.length > 10 ? 'كتابًا' : books.length > 2 ? 'كتب' : books.length === 2 ? 'كتابان' : 'كتاب'}` },
  audiences: AUDIENCES.map(a => ({ id: a.id, ar: a.ar, desc: a.desc })),
  news: fs.existsSync(path.join(ROOT, 'content/news.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'content/news.json'), 'utf8')) : [],
  books: books.map(stub),
  concepts, audienceLists
};
const OUT_DIR = path.dirname(OUT);
fs.mkdirSync(path.join(OUT_DIR, 'books'), { recursive: true });
for (const f of fs.readdirSync(path.join(OUT_DIR, 'books'))) fs.unlinkSync(path.join(OUT_DIR, 'books', f));
for (const b of books) fs.writeFileSync(path.join(OUT_DIR, 'books', b.id + '.json'), JSON.stringify(strip(b)));
fs.writeFileSync(path.join(OUT_DIR, 'search.json'), JSON.stringify(index));
fs.writeFileSync(OUT, JSON.stringify(data));

// ---------- مصفوفة الموضوعات × المؤلفين (docs/topics.json) ----------
const authorGroups = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/authors.json'), 'utf8'));
const topicsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/topics.json'), 'utf8'));
const groupOfBook = {};
for (const g of authorGroups) for (const id of g.books) groupOfBook[id] = g.id;
for (const b of books) if (!groupOfBook[b.id]) throw new Error('كتاب بلا مجموعة مؤلف في content/authors.json: ' + b.id);
const clip = (text, re) => {
  for (const p of text.split(/(?<=[.؟!])\s+/)) if (re.test(norm(p))) return p.length > 230 ? p.slice(0, 227) + '…' : p;
  return text.length > 230 ? text.slice(0, 227) + '…' : text;
};
const topics = topicsRaw.map(t => {
  const re = new RegExp(t.patterns.map(p => norm(p).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('|'), 'g');
  const per = {}, diffs = [];
  for (const r of index) {
    if (!r.book || r.type === 'concept' || r.type === 'verify') continue;
    if (r.tag === 'specialist' || MED.test(r.title + ' ' + r.text)) continue; // لا تُعرض مقاطع الدواء في المصفوفة
    const hay = norm(r.title + ' ' + r.sub + ' ' + r.text);
    const m = hay.match(re); if (!m) continue;
    const mt = (norm(r.text + ' ' + r.sub).match(re) || []).length;
    const gid = groupOfBook[r.book];
    if (r.type === 'difference') { diffs.push({ gid, bookId: r.book, title: r.title, text: r.text.length > 420 ? r.text.slice(0, 417) + '…' : r.text, href: r.href }); continue; }
    if (mt === 0 && (per[gid] || []).some(x => x.score > 0)) continue;
    (per[gid] = per[gid] || []).push({ score: mt * 2 + (m.length > mt ? 1 : 0), bookId: r.book, type: r.type, title: r.title, sub: r.sub, text: clip(r.text, new RegExp(re.source)), titleOnly: mt === 0, tag: r.tag, href: r.href });
  }
  const counts = {}, passages = {};
  for (const [gid, arr] of Object.entries(per)) {
    counts[gid] = arr.length;
    const seen = new Set();
    passages[gid] = arr.sort((a, b) => b.score - a.score).filter(p => { const k = p.text; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6).map(({ score, ...x }) => x);
  }
  return { id: t.id, ar: t.ar, desc: t.desc, counts, passages, differences: diffs.slice(0, 14), nDifferences: diffs.length };
}).filter(t => Object.keys(t.counts).length >= 2);
fs.writeFileSync(path.join(OUT_DIR, 'topics.json'), JSON.stringify({ groups: authorGroups.map(g => ({ id: g.id, ar: g.ar, books: g.books.filter(id => books.some(b => b.id === id)) })).filter(g => g.books.length), topics }));
console.log('topics:', topics.map(t => `${t.id}(${Object.keys(t.counts).length} مؤلفين)`).join(' '));

console.log('books:', books.length);
for (const b of books) {
  console.log(' ', b.id, '| chapters:', b.chapters.length, 'tools:', b.tools.length, 'differences:', b.differences.length, 'questions:', b.questions.length, 'numbers:', b.numbers.length, 'card:', b.card.length, 'core:', b.core.length, 'quality:', b.quality.length);
  for (const c of b.chapters) console.log('    ', c.id.padEnd(10), c.fields.map(f => f.key).join(','));
}
console.log('concepts:', concepts.map(c => `${c.id}(${c.hits.length})`).join(' '));
console.log('index records:', index.length, '| data.json KB:', Math.round(fs.statSync(OUT).size / 1024), '| search.json KB:', Math.round(fs.statSync(path.join(OUT_DIR, 'search.json')).size / 1024));
