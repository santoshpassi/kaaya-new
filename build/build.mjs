// Builds kaaya.org from src/template.html and the Wix Blog.
// One real web address per section, per story and per topic, each with its own
// title, description, share preview and share bar. Also writes sitemap.xml,
// robots.txt and 404.html. Run: node build/build.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://kaaya.org';
const CLIENT_ID = 'af19981c-8c44-4ad2-b015-40e5faeea5e4';
const API = 'https://www.wixapis.com/blog/v3';
const CACHE = path.join(ROOT, 'build', 'posts-cache.json');

const SECTIONS = {
  home:        { path: '/',                        img: '/img/niche.jpg',        title: 'Kaaya · A mud-built learning campus in Tilwari, Dehradun' },
  idea:        { path: '/the-idea/',               img: '/img/house.jpg',        title: 'The idea · Kaaya, Tilwari' },
  community:   { path: '/community-and-climate/',  img: '/img/isvc-meeting.jpg', title: 'Community and climate · Kaaya, Tilwari' },
  fellowships: { path: '/fellowships/',            img: '/img/padav-2.jpg',      title: 'Fellowships · Kaaya, Tilwari' },
  learning:    { path: '/learning-centre/',        img: '/img/lc-plough.jpg',    title: 'Learning Centre · Kaaya, Tilwari, Dehradun' },
  journal:     { path: '/journal/',                img: '/img/niche.jpg',        title: 'Journal · Kaaya' },
  model:       { path: '/the-model/',              img: '/img/team.jpg',         title: 'The model · Kaaya' },
};
const TOPICS = {
  'origins':           { title: 'Origins',           cat: '1ba44c37-a019-429f-a92a-e0eec9ed4ea1' },
  'neighbourhoods':    { title: 'Neighbourhoods',    cat: '37120d9a-e728-4c1d-b7da-77c335357d21' },
  'field-notes':       { title: 'Field Notes',       cat: '1a25a862-e5da-4ef9-ae2c-0231be4e9931' },
  'learning-journeys': { title: 'Learning Journeys', cat: '40aa1ec6-6f46-4873-b5b4-ebc0eec1555e' },
  'reflections':       { title: 'Reflections',       cat: '58fb5d24-8f5a-4f53-8faf-e3de49630f27' },
};

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const clip = (t, n = 160) => { t = strip(t); return t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n - 1)) + '…'; };
const fmt = d => { try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };
const abs = u => !u ? '' : u.startsWith('http') ? u : SITE + u;

// ---------- Wix ----------
async function fetchPosts() {
  const t = await fetch('https://www.wixapis.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: CLIENT_ID, grantType: 'anonymous' }) });
  const token = (await t.json()).access_token;
  const r = await fetch(API + '/posts?paging.limit=100&fieldsets=URL', { headers: { Authorization: token } });
  if (!r.ok) throw new Error('posts ' + r.status);
  const list = (await r.json()).posts || [];
  for (const p of list) {
    const d = await fetch(API + '/posts/slugs/' + encodeURIComponent(p.slug) + '?fieldsets=RICH_CONTENT', { headers: { Authorization: token } });
    if (d.ok) p.richContent = (await d.json()).post.richContent;
  }
  return list;
}

// ---------- Rich content to HTML (same as the page's own renderer) ----------
const media = s => !s ? '' : s.url ? s.url : s.id ? 'https://static.wixstatic.com/media/' + s.id : '';
const yt = u => { const m = String(u).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/); return m ? m[1] : null; };
const kids = n => (n.nodes || []).map(node).join('');
function txt(n) {
  let h = esc(n.textData.text);
  for (const d of n.textData.decorations || []) {
    if (d.type === 'BOLD') h = '<strong>' + h + '</strong>';
    else if (d.type === 'ITALIC') h = '<em>' + h + '</em>';
    else if (d.type === 'UNDERLINE') h = '<u>' + h + '</u>';
    else if (d.type === 'LINK' && d.linkData?.link?.url) h = '<a href="' + esc(d.linkData.link.url) + '" target="_blank" rel="noopener">' + h + '</a>';
  }
  return h;
}
function node(n) {
  switch (n.type) {
    case 'PARAGRAPH': { const c = kids(n); return c ? '<p>' + c + '</p>' : ''; }
    case 'HEADING': { const l = Math.min(Math.max(n.headingData?.level || 2, 2), 4); return '<h' + l + '>' + kids(n) + '</h' + l + '>'; }
    case 'BULLETED_LIST': return '<ul>' + kids(n) + '</ul>';
    case 'ORDERED_LIST': return '<ol>' + kids(n) + '</ol>';
    case 'LIST_ITEM': return '<li>' + kids(n).replace(/^<p>|<\/p>$/g, '') + '</li>';
    case 'BLOCKQUOTE': return '<blockquote>' + kids(n) + '</blockquote>';
    case 'DIVIDER': return '<hr>';
    case 'TEXT': return txt(n);
    case 'IMAGE': { const im = n.imageData?.image; const u = im && media(im.src); return u ? '<figure><img loading="lazy" src="' + esc(u) + '" alt="' + esc(n.imageData.altText || '') + '">' + (n.imageData.caption ? '<figcaption>' + esc(n.imageData.caption) + '</figcaption>' : '') + '</figure>' : ''; }
    case 'VIDEO': {
      const v = n.videoData?.video; const u = v?.src?.url; const id = u && yt(u);
      if (id) return '<div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '" title="' + esc(n.videoData.title || 'Video') + '" allowfullscreen loading="lazy"></iframe></div>';
      if (v?.src?.id) return '<div class="vid"><video controls preload="metadata" src="https://video.wixstatic.com/video/' + esc(v.src.id) + '/file"></video></div>';
      return u ? '<p><a href="' + esc(u) + '" target="_blank" rel="noopener">Watch the video ↗</a></p>' : '';
    }
    case 'LAYOUT': {
      const u = media(n.layoutData?.backdropImage?.media?.src);
      return u ? '<figure class="banner"><img src="' + esc(u) + '" alt=""><figcaption>' + kids(n).replace(/<\/?p>/g, '') + '</figcaption></figure>' : kids(n);
    }
    default: return kids(n);
  }
}

// ---------- Template ----------
const tpl = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');
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
let posts;
try { posts = await fetchPosts(); fs.writeFileSync(CACHE, JSON.stringify(posts)); console.log('Fetched', posts.length, 'posts from Wix'); }
catch (e) { console.warn('Wix not reachable (' + e.message + '); using cache'); posts = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : []; }

const coverOf = p => p.media?.wixMedia?.image?.url || p.media?.embedMedia?.thumbnail?.url || '';
const ogImg = p => { const c = coverOf(p); return c.startsWith('https://static.wixstatic.com/media/') ? c + '/v1/fill/w_1200,h_630,al_c,q_85/share.jpg' : c || '/img/niche.jpg'; };
const thumb = u => u && u.startsWith('https://static.wixstatic.com') ? u + '/v1/fill/w_720,h_480,al_c,q_80/cover.jpg' : u;
const card = p => `<article class="card">${coverOf(p) ? `<img loading="lazy" src="${esc(thumb(coverOf(p)))}" alt="${esc(p.title)}">` : ''}<div class="b"><span class="meta">${esc(fmt(p.firstPublishedDate))}</span><h3>${esc(p.title)}</h3><p>${esc(clip(p.excerpt, 180))}</p><a class="more" href="/journal/${esc(p.slug)}/">Read more →</a></div></article>`;

// ---------- Sections ----------
for (const [key, s] of Object.entries(SECTIONS)) {
  const url = SITE + s.path;
  const title = s.title;
  const desc = clip(ledeOf(key) || 'Kaaya is a mud-built campus in Tilwari village, Dehradun, where rural and urban communities meet and learn from each other.');
  const ld = key === 'home' ? [{ '@context': 'https://schema.org', ...ORG }, { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Kaaya', url: SITE }] : { '@context': 'https://schema.org', '@type': 'WebPage', name: h1Of(key), url, isPartOf: SITE, publisher: ORG };
  write(s.path, page({ key, h: head({ title, desc, url, img: s.img, ld }), view: views[key], share: shareBar(title, url) }));
}

// ---------- Story pages ----------
for (const p of posts) {
  const url = `${SITE}/journal/${p.slug}/`;
  const nodes = p.richContent?.nodes || [];
  const hasBanner = nodes.some(x => x.type === 'LAYOUT');
  const cover = coverOf(p);
  const bodyHtml = nodes.length
    ? `<p class="meta">${esc(fmt(p.firstPublishedDate))}${p.minutesToRead ? ' · ' + p.minutesToRead + ' min read' : ''}</p><h1>${esc(p.title)}</h1>` +
      (cover && !hasBanner && !cover.includes('ytimg') ? `<figure class="banner"><img src="${esc(cover)}" alt="${esc(p.title)}"></figure>` : '') + nodes.map(node).join('')
    : `<p class="meta">${esc(fmt(p.firstPublishedDate))}</p><h1>${esc(p.title)}</h1><p>${esc(p.excerpt)}</p>`;
  const view = views.post.replace('<div class="post-body"><p class="empty">Loading…</p></div>', `<div class="post-body">${bodyHtml}</div>`);
  const desc = clip(p.excerpt);
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: desc, url, mainEntityOfPage: url, image: abs(ogImg(p)),
    datePublished: p.firstPublishedDate, dateModified: p.lastPublishedDate || p.firstPublishedDate, author: ORG, publisher: ORG };
  write(`/journal/${p.slug}/`, page({ key: 'post', arg: p.slug, prerendered: nodes.length > 0,
    h: head({ title: p.title + ' · Kaaya Journal', desc, url, img: ogImg(p), type: 'article', ld }), view, share: shareBar(p.title, url) }));
}

// ---------- Topic pages ----------
const topicPage = (slug, t, list) => {
  const url = SITE + '/topics/' + (slug ? slug + '/' : '');
  const title = (t ? t.title : 'All stories') + ' · Kaaya Journal';
  const desc = t ? `${t.title}: stories from the Kaaya campus and the villages around Tilwari, Dehradun.` : 'All stories from the Kaaya Journal: notes from the campus and the village, shared as they happen.';
  const view = views.blog.replace('<h1 class="blog-title">All stories</h1>', `<h1 class="blog-title">${esc(t ? t.title : 'All stories')}</h1>`)
    .replace('<div class="cards"></div>', `<div class="cards">${list.map(card).join('')}</div>`);
  write(url.replace(SITE, ''), page({ key: 'blog', arg: slug, h: head({ title, desc, url, img: list[0] ? ogImg(list[0]) : '/img/niche.jpg', ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url } }), view, share: shareBar(title, url) }));
};
topicPage('', null, posts);
for (const [slug, t] of Object.entries(TOPICS)) topicPage(slug, t, posts.filter(p => (p.categoryIds || []).includes(t.cat)));

// ---------- 404 (also renders brand-new stories before the next build) ----------
write('/404.html', page({ key: 'post', h: head({ title: 'Kaaya', desc: 'Kaaya is a mud-built campus in Tilwari village, Dehradun.', url: SITE + '/', img: '/img/niche.jpg' }).replace('<link rel="canonical"', '<meta name="robots" content="noindex"><link rel="canonical"'), view: views.post, share: shareBar('Kaaya', SITE + '/') }));

// ---------- sitemap + robots ----------
const lastmod = Object.fromEntries(posts.map(p => [`/journal/${p.slug}/`, (p.lastPublishedDate || p.firstPublishedDate || '').slice(0, 10)]));
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  out.filter(p => p.endsWith('/')).map(p => `  <url><loc>${SITE}${p}</loc>${lastmod[p] ? `<lastmod>${lastmod[p]}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log('Wrote', out.length, 'pages');
