// Builds kaaya.org from src/template.html and the Journal stories in content/journal/.
// One real web address per section, per story and per topic, each with its own
// title, description, share preview and share bar. Also writes sitemap.xml,
// robots.txt and 404.html. Run: node build/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from './vendor/marked.esm.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://kaaya.org';
const POSTS_DIR = path.join(ROOT, 'content', 'journal');

const SECTIONS = {
  home:        { path: '/',                        img: '/img/niche.jpg',        title: 'Kaaya · A mud-built learning campus in Tilwari, Dehradun' },
  idea:        { path: '/the-idea/',               img: '/img/house.jpg',        title: 'The idea · Kaaya, Tilwari' },
  community:   { path: '/community-and-climate/',  img: '/img/isvc-meeting.jpg', title: 'Community and climate · Kaaya, Tilwari' },
  fellowships: { path: '/fellowships/',            img: '/img/padav-2.jpg',      title: 'Fellowships · Kaaya, Tilwari' },
  learning:    { path: '/learning-centre/',        img: '/img/lc-plough.jpg',    title: 'Learning Centre · Kaaya, Tilwari, Dehradun' },
  journal:     { path: '/journal/',                img: '/img/niche.jpg',        title: 'Journal · Kaaya' },
  model:       { path: '/the-model/',              img: '/img/model-exchange.jpg', title: "Kaaya's Rural-Urban Connect Model" },
};
// Section pages held back from the site for now. A held-back page is not written, its
// folder is removed, its menu link is dropped and links to it elsewhere are re-pointed.
// To publish The model again, empty this list: const UNPUBLISHED = [];
const UNPUBLISHED = ['model'];

const TOPICS = {
  'origins':           { title: 'Origins' },
  'neighbourhoods':    { title: 'Neighbourhoods' },
  'field-notes':       { title: 'Field Notes' },
  'learning-journeys': { title: 'Learning Journeys' },
  'reflections':       { title: 'Reflections' },
};

// Which Journal stories each section page shows at its foot (newest first).
const FEEDS = {
  home:        { title: 'From the Journal' },
  journal:     { title: 'Latest from the Journal' },
  idea:        { title: 'Origins',           topic: 'origins' },
  community:   { title: 'Neighbourhoods',    topic: 'neighbourhoods' },
  fellowships: { title: 'Field Notes',       topic: 'field-notes' },
  learning:    { title: 'Learning Journeys', topic: 'learning-journeys' },
  model:       { title: 'Reflections',       topic: 'reflections' },
};

// The value exchange diagram (its styles and script live in src/template.html).
const VX_DIAGRAM = `<div class="vx" data-vx><div class="vx-fig"><svg viewBox="0 0 700 640" role="group" aria-labelledby="vx-t"><title id="vx-t">How value moves at Kaaya: six parties joined by lines that carry something each way</title><defs><marker id="ah-m" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="ah-m" d="M0 0L10 5L0 10z"/></marker><marker id="ah-v" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="ah-v" d="M0 0L10 5L0 10z"/></marker></defs><g class="links"></g><g class="dots" aria-hidden="true"></g><g class="nodes" aria-hidden="true"></g></svg><ul class="vx-key" aria-label="Key"><li><i class="sw k-m" aria-hidden="true"></i>Money and trade</li><li><i class="sw k-v" aria-hidden="true"></i>Value that isn't money</li></ul></div><div class="vx-side"><div class="vx-cap" aria-live="polite"><p class="what"></p><h3></h3><div class="say"></div></div><div class="vx-ctl"><button type="button" class="step prev" aria-label="Previous">←</button><div class="dots"></div><button type="button" class="step next" aria-label="Next">→</button><span class="count" aria-hidden="true"></span></div></div></div>`;

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const clip = (t, n = 160) => { t = strip(t); return t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n - 1)) + '…'; };
const fmt = d => { try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };
const abs = u => !u ? '' : u.startsWith('http') ? u : SITE + u;

// ---------- Journal stories: content/journal/<slug>.md ----------
// Each file starts with front matter between --- lines (title, date, excerpt, cover, topics, ...),
// then the story in Markdown. The editor at /admin writes these files.
function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return [{}, text];
  const data = {}, lines = m[1].split(/\r?\n/);
  const scalar = v => {
    v = v.trim();
    if (/^".*"$/.test(v)) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
    if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    if (v === 'true' || v === 'false') return v === 'true';
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (v === '' || v === '~' || v === 'null') return '';
    return v;
  };
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/); if (!kv) continue;
    const [, key, rest] = kv;
    if (/^[|>][-+]?$/.test(rest)) {                       // block text: | or >
      const block = []; while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) block.push(lines[++i].replace(/^\s{2}/, ''));
      data[key] = (rest[0] === '>' ? block.join(' ').replace(/\s+/g, ' ') : block.join('\n')).trim();
    } else if (/^\[.*\]$/.test(rest.trim())) {             // [a, b]
      const inner = rest.trim().slice(1, -1).trim();
      data[key] = inner ? inner.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(scalar).filter(x => x !== '') : [];
    } else if (rest.trim() === '' && i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) {  // - a\n- b
      const list = []; while (i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) list.push(scalar(lines[++i].replace(/^\s*-\s/, '')));
      data[key] = list;
    } else data[key] = scalar(rest);
  }
  return [data, m[2]];
}

const yt = u => { const m = String(u).match(/^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; };
const md = new Marked({
  renderer: {
    // ![alt](src "caption") -> a figure with its caption
    image({ href, title, text }) {
      return `<figure><img loading="lazy" src="${esc(href)}" alt="${esc(text)}">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}</figure>`;
    },
    // A paragraph that is only a picture stays a figure, not a figure inside <p>;
    // a paragraph that is only a YouTube address becomes the video.
    paragraph(token) {
      const t = token.tokens || [];
      if (t.length === 1 && t[0].type === 'image') return this.parser.parseInline(t) + '\n';
      // A paragraph that is only [[value-exchange-diagram]] becomes the moving diagram.
      if (token.text.replace(/\\/g, '').trim() === '[[value-exchange-diagram]]') return VX_DIAGRAM + '\n';
      const id = yt(token.text.trim()) && token.text.trim() === token.text.trim().split(/\s/)[0] && yt(token.text.trim());
      if (id) return `<div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Video" allowfullscreen loading="lazy"></iframe></div>\n`;
      return `<p>${this.parser.parseInline(t)}</p>\n`;
    },
    link({ href, title, tokens }) {
      const ext = /^https?:\/\//.test(href) && !href.startsWith(SITE);
      return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${ext ? ' target="_blank" rel="noopener"' : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).map(f => {
    const [d, body] = frontMatter(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8'));
    const slug = String(d.slug || f.replace(/\.md$/, '')).trim();
    const words = strip(body).split(' ').length;
    return {
      slug, title: d.title || slug, draft: d.draft === true,
      date: d.date ? new Date(d.date).toISOString() : new Date(0).toISOString(),
      updated: d.updated ? new Date(d.updated).toISOString() : '',
      excerpt: d.excerpt || clip(md.parse(body), 200),
      cover: d.cover || '', topics: Array.isArray(d.topics) ? d.topics : d.topics ? [d.topics] : [],
      minutes: Number(d.minutes) || Math.max(1, Math.round(words / 200)),
      body: body.trim(),
    };
  }).filter(p => !p.draft).sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- Template ----------
let tpl = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');
if (UNPUBLISHED.includes('model')) {
  tpl = tpl.replace(/\s*<a href="\/the-model\/" data-view="model">The model<\/a>/, '')
           .replace('<a href="/the-model/">How the two sustain each other →</a>', '<a href="/journal/how-value-moves-both-ways/">How the two sustain each other →</a>');
  fs.rmSync(path.join(ROOT, 'the-model'), { recursive: true, force: true });
}
const mStart = tpl.indexOf('<main class="wrap">') + '<main class="wrap">'.length;
const mEnd = tpl.indexOf('</main>');
const before = tpl.slice(0, mStart), after = tpl.slice(mEnd);
const views = {};
for (const chunk of tpl.slice(mStart, mEnd).split(/(?=<div id="view-)/)) {
  const m = chunk.match(/^<div id="view-(\w+)"/); if (!m) continue;
  views[m[1]] = chunk.replace(/<!--[\s\S]*?-->/g, '').replace(/^(<div id="view-\w+" data-page="\w+") hidden/, '$1').trim();
}
const firstText = (v, re) => { const m = views[v].match(re); return m ? strip(m[1]) : ''; };
const h1Of = v => firstText(v, /<h1[^>]*>([\s\S]*?)<\/h1>/);
const ledeOf = v => firstText(v, /<p class="lede[^"]*">([\s\S]*?)<\/p>/);

const ORG = { '@type': 'Organization', name: 'Kaaya', url: SITE, logo: SITE + '/img/kaaya-mark.png', email: 'connect@kaaya.org', telephone: '+91-82799-59201',
  address: { '@type': 'PostalAddress', streetAddress: 'Village Tilwari', addressLocality: 'Dehradun', addressRegion: 'Uttarakhand', postalCode: '248197', addressCountry: 'IN' },
  sameAs: ['https://www.kaaya-offline.com'] };

const HASH_REDIRECT = `<script>(function(){var h=location.hash.slice(1);if(!h)return;var m={home:'/',idea:'/the-idea/',community:'/community-and-climate/',fellowships:'/fellowships/',learning:'/learning-centre/',journal:'/journal/',model:'/the-model/'};var p=h.split('/');var t=m[p[0]]||(p[0]==='post'&&p[1]?'/journal/'+p[1]+'/':p[0]==='blog'?'/topics/'+(p[1]?p[1]+'/':''):null);if(t&&t!==location.pathname)location.replace(t);})();</script>`;

function head({ title, desc, url, img, type = 'website', ld }) {
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:site_name" content="Kaaya">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(abs(img))}">`,
    `<meta property="og:locale" content="en_IN">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(abs(img))}">`,
    ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '',
    HASH_REDIRECT,
  ].filter(Boolean).join('\n');
}
const shareBar = (title, url) => `<div class="share" data-title="${esc(title)}" data-url="${esc(url)}" aria-label="Share this page"><span>Share</span><button type="button" class="native" hidden>Share…</button><a data-net="wa" target="_blank" rel="noopener">WhatsApp</a><a data-net="li" target="_blank" rel="noopener">LinkedIn</a><a data-net="fb" target="_blank" rel="noopener">Facebook</a><a data-net="x" target="_blank" rel="noopener">X</a><button type="button" class="copy">Copy link</button></div>`;

function page({ key, arg = '', prerendered = false, h, view, share }) {
  const body = `<body data-page="${key}"${arg ? ` data-arg="${esc(arg)}"` : ''}${prerendered ? ' data-prerendered="1"' : ''}>`;
  return before.replace('<!--HEAD-->', h).replace('<body>', body) + '\n' + view + '\n' + (share || '') + '\n' + after;
}
const out = [];
function write(p, html) {
  const f = path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
  out.push(p);
}

// ---------- Posts ----------
const posts = readPosts();
const ogImg = p => p.cover || '/img/niche.jpg';
const card = p => `<article class="card">${p.cover ? `<img loading="lazy" src="${esc(p.cover)}" alt="${esc(p.title)}">` : ''}<div class="b"><span class="meta">${esc(fmt(p.date))}</span><h3>${esc(p.title)}</h3><p>${esc(clip(p.excerpt, 180))}</p><a class="more" href="/journal/${esc(p.slug)}/">Read more →</a></div></article>`;
const feed = key => {
  const f = FEEDS[key]; if (!f) return '';
  const list = posts.filter(p => !f.topic || p.topics.includes(f.topic)).slice(0, 3);
  const all = f.topic ? `/topics/${f.topic}/` : '/topics/';
  return `<section class="feed"><h2>${esc(f.title)}</h2><div class="cards">${list.length ? list.map(card).join('') : '<p class="empty">The first stories here are on their way.</p>'}</div><a class="all" href="${all}">All ${esc(f.topic ? f.title.toLowerCase() : 'Journal posts')} →</a></section>`;
};
const withFeed = (view, key) => view.replace(/<\/div>\s*$/, feed(key) + '\n</div>');

// ---------- Sections ----------
for (const [key, s] of Object.entries(SECTIONS)) {
  if (UNPUBLISHED.includes(key)) continue;
  const url = SITE + s.path;
  const title = s.title;
  const desc = clip(ledeOf(key) || 'Kaaya is a mud-built campus in Tilwari village, Dehradun, where rural and urban communities meet and learn from each other.');
  const ld = key === 'home' ? [{ '@context': 'https://schema.org', ...ORG }, { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Kaaya', url: SITE }] : { '@context': 'https://schema.org', '@type': 'WebPage', name: h1Of(key), url, isPartOf: SITE, publisher: ORG };
  write(s.path, page({ key, h: head({ title, desc, url, img: s.img, ld }), view: withFeed(views[key], key), share: shareBar(title, url) }));
}

// ---------- Story pages ----------
for (const p of posts) {
  const url = `${SITE}/journal/${p.slug}/`;
  const startsWithPicture = /^!\[/.test(p.body);
  const bodyHtml = `<p class="meta">${esc(fmt(p.date))}${p.minutes ? ' · ' + p.minutes + ' min read' : ''}</p><h1>${esc(p.title)}</h1>` +
    (p.cover && !startsWithPicture ? `<figure class="banner"><img src="${esc(p.cover)}" alt="${esc(p.title)}"></figure>` : '') + md.parse(p.body);
  const view = views.post.replace('<div class="post-body"><p class="empty">Loading…</p></div>', `<div class="post-body">${bodyHtml}</div>`);
  const desc = clip(p.excerpt);
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: desc, url, mainEntityOfPage: url, image: abs(ogImg(p)),
    datePublished: p.date, dateModified: p.updated || p.date, author: ORG, publisher: ORG };
  write(`/journal/${p.slug}/`, page({ key: 'post', arg: p.slug, prerendered: true,
    h: head({ title: p.title + ' · Kaaya Journal', desc, url, img: ogImg(p), type: 'article', ld }), view, share: shareBar(p.title, url) }));
}

// Remove the pages of stories that were deleted or turned back into drafts.
const live = new Set(posts.map(p => p.slug));
for (const d of fs.readdirSync(path.join(ROOT, 'journal'), { withFileTypes: true })) {
  if (!d.isDirectory() || live.has(d.name)) continue;
  const f = path.join(ROOT, 'journal', d.name, 'index.html');
  if (fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('<body data-page="post"')) {
    fs.rmSync(path.join(ROOT, 'journal', d.name), { recursive: true });
    console.log('Removed old story page /journal/' + d.name + '/');
  }
}

// ---------- Topic pages ----------
const topicPage = (slug, t, list) => {
  const url = SITE + '/topics/' + (slug ? slug + '/' : '');
  const title = (t ? t.title : 'All stories') + ' · Kaaya Journal';
  const desc = t ? `${t.title}: stories from the Kaaya campus and the villages around Tilwari, Dehradun.` : 'All stories from the Kaaya Journal: notes from the campus and the village, shared as they happen.';
  const view = views.blog.replace('<h1 class="blog-title">All stories</h1>', `<h1 class="blog-title">${esc(t ? t.title : 'All stories')}</h1>`)
    .replace('<div class="cards"></div>', `<div class="cards">${list.length ? list.map(card).join('') : '<p class="empty">The first stories here are on their way.</p>'}</div>`);
  write(url.replace(SITE, ''), page({ key: 'blog', arg: slug, h: head({ title, desc, url, img: list[0] ? ogImg(list[0]) : '/img/niche.jpg', ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url } }), view, share: shareBar(title, url) }));
};
topicPage('', null, posts);
for (const [slug, t] of Object.entries(TOPICS)) topicPage(slug, t, posts.filter(p => p.topics.includes(slug)));

// ---------- 404 ----------
write('/404.html', page({ key: 'post', h: head({ title: 'Page not found · Kaaya', desc: 'Kaaya is a mud-built campus in Tilwari village, Dehradun.', url: SITE + '/', img: '/img/niche.jpg' }).replace('<link rel="canonical"', '<meta name="robots" content="noindex"><link rel="canonical"'), view: views.post, share: '' }));

// ---------- Old addresses that moved ----------
// A story whose address changed keeps a small page at the old one that sends readers on.
const MOVED = { '/journal/kaayas-rural-urban-connect-model/': '/journal/how-value-moves-both-ways/' };
for (const [from, to] of Object.entries(MOVED)) {
  const dir = path.join(ROOT, from);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>This story has moved</title><meta name="robots" content="noindex"><link rel="canonical" href="${SITE}${to}"><meta http-equiv="refresh" content="0; url=${to}"></head><body><p>This story has moved. <a href="${to}">Continue to the story</a>.</p></body></html>\n`);
}

// ---------- sitemap + robots ----------
const lastmod = Object.fromEntries(posts.map(p => [`/journal/${p.slug}/`, (p.updated || p.date).slice(0, 10)]));
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  out.filter(p => p.endsWith('/')).map(p => `  <url><loc>${SITE}${p}</loc>${lastmod[p] ? `<lastmod>${lastmod[p]}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log('Wrote', out.length, 'pages');
