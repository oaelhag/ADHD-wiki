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
function dedent(lines, n = 2) {
  return lines.map(l => l.startsWith(' '.repeat(n)) ? l.slice(n) : l);
}
function splitSections(body) {
  const parts = body.split(/^## /m).slice(1);
  return parts.map(p => {
    const nl = p.indexOf('\n');
    return { title: p.slice(0, nl).trim(), body: p.slice(nl + 1).trim() };
  });
}
function parseKV(lines) {
  // "- **المفتاح:** نص" على المستوى الأول
  const out = [];
  for (const l of lines) {
    const m = l.match(/^- \*\*(.+?)\*\*\s*(.*)$/);
    if (m) out.push({ k: m[1].replace(/[:：]\s*$/, ''), v: m[2].trim() });
  }
  return out;
}

const FIELD_KIND = [
  [/^المشكلة/, 'problem', 'المشكلة', 'book'],
  [/^الأفكار/, 'ideas', 'الأفكار الأساسية', 'book'],
  [/^المفاهيم/, 'concepts', 'المفاهيم', 'book'],
  [/^(القصة|القصص)/, 'story', 'القصة والأمثلة', 'book'],
  [/^ماذا تثبت/, 'proves', 'ماذا تثبت القصة؟', 'inference'],
  [/^الأدوات/, 'tools', 'الأدوات والخطوات', 'book'],
  [/^(تحذير|التحذير)/, 'warnings', 'تحذيرات', 'book'],
  [/^النتيجة/, 'outcome', 'النتيجة', 'book']
];
const MED = /دواء|الدواء|منشط|جرعة|الجرعة|فلوكستين|كلوميبرامين/;

function parseChapter(raw, idx) {
  const lines = raw.split('\n');
  const title = lines[0].replace(/^###\s*/, '').trim();
  let num = 0, name = title, en = '';
  const mNum = title.match(/^الفصل\s+(\d+):\s*(.*)$/);
  if (mNum) { num = +mNum[1]; name = mNum[2]; }
  else if (title.startsWith('المقدمة')) { num = 0; name = 'المقدمة'; }
  const mEn = name.match(/\(([A-Za-z][^)]*)\)\s*$/);
  if (mEn && num !== 0 && !/:/.test(name.slice(mEn.index))) { en = mEn[1]; name = name.slice(0, mEn.index).trim(); }
  if (num === 0) en = 'Introduction';

  const fields = [];
  let cur = null;
  for (const l of lines.slice(1)) {
    if (l.trim() === '---') continue;
    const m = l.match(/^- \*\*(.+?)\*\*\s*(.*)$/);
    if (m) {
      cur = { label: m[1].replace(/[:：]\s*$/, ''), first: m[2].trim(), rest: [] };
      fields.push(cur);
    } else if (cur) cur.rest.push(l);
  }
  const outFields = fields.map(f => {
    const kind = FIELD_KIND.find(([re]) => re.test(f.label));
    const rest = dedent(f.rest).join('\n').trim();
    const src = f.first + (rest ? '\n\n' + rest : '');
    return {
      key: kind ? kind[1] : 'other',
      label: kind ? kind[2] : f.label,
      tag: kind ? kind[3] : 'book',
      html: md(src),
      text: plain(src),
      specialist: kind && (kind[1] === 'tools' || kind[1] === 'ideas') && MED.test(plain(src))
    };
  });
  const all = outFields.map(f => f.text).join(' ');
  const problem = outFields.find(f => f.key === 'problem');
  const lead = problem ? problem.text.split(/(?<=[.؟!])\s/)[0] : '';
  return {
    id: 'ch' + num, num, title: name, en, lead,
    fields: outFields,
    medical: MED.test(all),
    sensitive: num === 7 || num === 11,
    text: plain(raw)
  };
}

function buildBook(file) {
  const src = fs.readFileSync(path.join(BOOKS_DIR, file), 'utf8');
  const { meta, body } = parseFrontMatter(src);
  const metaFile = path.join(META_DIR, file.replace(/\.md$/, '.json'));
  const extra = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  const secs = splitSections(body.replace(/^# .*\n/, ''));
  const sec = n => secs.find(s => s.title.startsWith(n + '.'));

  const card = parseKV(sec(1).body.split('\n')).map(({ k, v }) => ({ k, html: inline(v), text: plain(v) }));
  const core = sec(2).body.split('\n').filter(l => /^\d+\.\s/.test(l)).map(l => {
    const t = l.replace(/^\d+\.\s*/, '');
    return { html: inline(t), text: plain(t) };
  });

  const chBody = sec(4).body;
  const chRaw = chBody.split(/^### /m).slice(1).map(s => '### ' + s);
  const chapters = chRaw.map(parseChapter);
  chapters.forEach(c => { c.audiences = (extra.chapterAudiences || {})[c.num] || []; });

  // الأدوات
  const tools = [];
  for (const l of sec(5).body.split('\n')) {
    const m = l.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (!m) continue;
    const n = +m[1];
    const refs = [...l.matchAll(/الفصل\s+(\d+)/g)].map(x => +x[1]);
    const mm = (extra.tools || {})[n] || {};
    tools.push({
      id: `${meta.id}-t${n}`, n, bookId: meta.id,
      title: m[2].replace(/[:：]\s*$/, ''),
      html: inline(m[3].trim()), text: plain(m[2] + ' ' + m[3]),
      chapters: refs,
      kind: mm.kind || 'أداة', audiences: mm.audiences || [], tag: mm.tag || 'book',
      checklistTitle: mm.checklistTitle || null, checklist: mm.checklist || null
    });
  }

  // الخلافات
  const differences = parseKV(sec(6).body.split('\n')).map(({ k, v }) => ({
    title: k, html: inline(v), text: plain(k + ' ' + v)
  }));

  // أسئلة وأرقام
  const s7 = sec(7).body.split('\n');
  const iNum = s7.findIndex(l => l.includes('أرقام للتحقق'));
  const questions = s7.slice(0, iNum).filter(l => /^\d+\.\s/.test(l)).map(l => {
    const t = l.replace(/^\d+\.\s*/, '');
    return { html: inline(t), text: plain(t) };
  });
  const numbers = s7.slice(iNum + 1).filter(l => /^- /.test(l)).map(l => {
    const t = l.replace(/^- /, '');
    return { html: inline(t), text: plain(t), chapters: [...t.matchAll(/الفصل\s+(\d+)/g)].map(x => +x[1]) };
  });
  const quality = sec(8).body.split('\n').filter(l => /^- /.test(l)).map(l => inline(l.replace(/^- /, '')));

  return {
    id: meta.id, title: meta.title, author: meta.author, year: +meta.year,
    audience: meta.audience || [], ageRange: meta.age_range || '', sourcePages: meta.source_pages || '',
    card, core, chapters, tools, differences, questions, numbers, quality,
    chapterNote: plain(sec(4).body.split('\n').find(l => l.startsWith('>')) || '')
  };
}

// ---------- المفاهيم والبحث ----------
function snippetFor(chapter, re) {
  for (const f of chapter.fields) {
    const parts = f.text.split(/(?<=[.؟!])\s+/);
    for (const p of parts) if (re.test(norm(p))) return p.length > 190 ? p.slice(0, 187) + '…' : p;
  }
  return '';
}

const books = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.md')).map(buildBook);
const conceptsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/concepts.json'), 'utf8'));

const concepts = conceptsRaw.map(c => {
  const re = new RegExp(c.patterns.map(p => norm(p).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('|'));
  const hits = [];
  for (const b of books) {
    for (const ch of b.chapters) {
      if (re.test(norm(ch.text))) {
        hits.push({ bookId: b.id, bookTitle: b.title, chapterId: ch.id, num: ch.num, chTitle: ch.title, snippet: snippetFor(ch, re) });
      }
    }
  }
  return { id: c.id, ar: c.ar, en: c.en, def: c.def, tag: c.tag, hits };
}).filter(c => c.hits.length > 0);

const audiences = AUDIENCES.map(a => ({
  ...a,
  tools: books.flatMap(b => b.tools.filter(t => t.audiences.includes(a.id)).map(t => ({ bookId: b.id, n: t.n, title: t.title, kind: t.kind }))),
  chapters: books.flatMap(b => b.chapters.filter(c => c.audiences.includes(a.id)).map(c => ({ bookId: b.id, id: c.id, num: c.num, title: c.title, lead: c.lead })))
}));

// فهرس البحث
const index = [];
for (const b of books) {
  for (const ch of b.chapters) {
    for (const f of ch.fields) {
      index.push({
        type: 'chapter', title: (ch.num ? `الفصل ${ch.num}: ` : '') + ch.title, sub: f.label,
        text: f.text, tag: f.tag, audience: ch.audiences, book: b.id,
        href: `#/book/${b.id}/${ch.id}`
      });
    }
  }
  for (const t of b.tools) {
    index.push({ type: 'tool', title: t.title, sub: t.kind, text: t.text + ' ' + (t.checklist || []).join(' '), tag: t.tag, audience: t.audiences, book: b.id, href: `#/toolkit/${b.id}-t${t.n}` });
  }
  for (const d of b.differences) {
    index.push({ type: 'difference', title: d.title, sub: 'خلاف أو موازنة', text: d.text, tag: 'dispute', audience: [], book: b.id, href: `#/book/${b.id}/differences` });
  }
  for (const n of b.numbers) {
    index.push({ type: 'verify', title: 'رقم يحتاج تحققًا', sub: n.chapters.map(c => 'الفصل ' + c).join('، '), text: n.text, tag: 'verify', audience: [], book: b.id, href: `#/book/${b.id}/verify` });
  }
}
for (const c of concepts) {
  index.push({ type: 'concept', title: `${c.ar} (${c.en})`, sub: 'مفهوم', text: c.def, tag: c.tag, audience: [], book: '', href: `#/concept/${c.id}` });
}

const data = {
  site: { title: 'ADHD Wiki', subtitle: 'مرجع العائلة', generated: new Date().toISOString().slice(0, 10), stage: 'نموذج تجريبي: كتاب واحد' },
  audiences: AUDIENCES.map(a => ({ id: a.id, ar: a.ar, desc: a.desc })),
  books: books.map(b => ({ ...b, chapters: b.chapters.map(({ text, ...rest }) => rest) })),
  concepts, audienceLists: audiences, index
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data));

// تقرير سريع
console.log('books:', books.length);
for (const b of books) {
  console.log(' ', b.id, 'chapters:', b.chapters.length, 'tools:', b.tools.length, 'differences:', b.differences.length, 'questions:', b.questions.length, 'numbers:', b.numbers.length);
  for (const c of b.chapters) console.log('    ', c.id, c.fields.map(f => f.key).join(','), c.medical ? '[med]' : '', c.sensitive ? '[sens]' : '');
}
console.log('concepts:', concepts.map(c => `${c.id}(${c.hits.length})`).join(' '));
console.log('index records:', index.length, 'size KB:', Math.round(fs.statSync(OUT).size / 1024));
