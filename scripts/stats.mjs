// Gera assets/stats.svg com dados reais da API GraphQL do GitHub.
// Uso: STATS_TOKEN=... node scripts/stats.mjs   |   node scripts/stats.mjs --mock (prévia)
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const MOCK = process.argv.includes('--mock');
const PLACEHOLDER = process.argv.includes('--placeholder');
const TOKEN = process.env.STATS_TOKEN;

const C = { bg0: '#060a0a', bg1: '#0b1513', acc: '#5eead4', txt: '#e8f0ee', mut: '#8a9b97', dim: '#4b5d59', cell: '#12201d' };
const LEVELS = ['#12201d', '#15463d', '#1d7363', '#34b39a', '#5eead4'];
const LANG = ['#5eead4', '#34b39a', '#1d7363', '#7dd3fc', '#a7b8b4', '#4b5d59'];

async function gql(query, variables = {}) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-stats' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function fetchData() {
  const base = await gql(`{ viewer {
    createdAt
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
      totalCount
      nodes { languages(first: 8, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } }
    }
    contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { contributionCount date } } } }
  } }`);
  const v = base.viewer;
  const now = new Date();
  let commits = 0, commitsYear = 0;
  for (let y = new Date(v.createdAt).getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
    const from = new Date(Date.UTC(y, 0, 1)).toISOString();
    const to = (y === now.getUTCFullYear() ? now : new Date(Date.UTC(y, 11, 31, 23, 59, 59))).toISOString();
    const d = await gql(`query($from: DateTime!, $to: DateTime!) { viewer { contributionsCollection(from: $from, to: $to) { totalCommitContributions restrictedContributionsCount } } }`, { from, to });
    const n = d.viewer.contributionsCollection.totalCommitContributions;
    commits += n;
    if (y === now.getUTCFullYear()) commitsYear = n;
  }
  const langs = {};
  for (const r of v.repositories.nodes) for (const e of r.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;
  const days = v.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays);
  return {
    commits, commitsYear, year: now.getUTCFullYear(),
    repos: v.repositories.totalCount,
    year12: v.contributionsCollection.contributionCalendar.totalContributions,
    weeks: v.contributionsCollection.contributionCalendar.weeks.map(w => w.contributionDays.map(d => d.contributionCount)),
    streak: streak(days),
    langs,
  };
}

function streak(days) {
  let i = days.length - 1, s = 0;
  if (days[i] && days[i].contributionCount === 0) i--; // hoje ainda sem commit não quebra a sequência
  for (; i >= 0 && days[i].contributionCount > 0; i--) s++;
  return s;
}

function mockData() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const weeks = Array.from({ length: 53 }, (_, w) => Array.from({ length: 7 }, () => (rnd() < 0.35 ? 0 : Math.floor(rnd() * (w > 30 ? 14 : 7)))));
  return { commits: 1234, commitsYear: 567, year: 2026, repos: 33, year12: 890, weeks, streak: 12,
    langs: { TypeScript: 50, JavaScript: 20, Java: 10, Dart: 8, PHP: 7, Go: 5 } };
}

const fmt = n => (n == null ? '—' : n.toLocaleString('pt-BR'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const font = k => `@font-face{font-family:${k.startsWith('inter') ? 'I' : 'M'};font-weight:${k.slice(-3)};src:url(data:font/woff2;base64,${readFileSync(ROOT + 'assets/fonts/' + k + '.woff2').toString('base64')}) format('woff2')}`;

function render(d) {
  const W = 1200, H = 470;
  const kpis = [
    ['COMMITS', fmt(d.commits), 'desde a criação da conta'],
    [`COMMITS EM ${d.year ?? ''}`.trim(), fmt(d.commitsYear), 'no ano corrente'],
    ['CONTRIBUIÇÕES', fmt(d.year12), 'nos últimos 12 meses'],
    ['SEQUÊNCIA', d.streak == null ? '—' : `${d.streak}d`, 'dias seguidos com contribuição'],
  ];
  const kw = (W - 64 - 3 * 16) / 4;
  let body = '';
  kpis.forEach(([l, v, s], i) => {
    const x = 32 + i * (kw + 16);
    body += `<rect x="${x}" y="32" width="${kw.toFixed(1)}" height="128" rx="12" fill="${C.acc}" fill-opacity=".025" stroke="${C.acc}" stroke-opacity=".12"/>
<text x="${x + 22}" y="62" class="m" font-size="11.5" letter-spacing="1.2" fill="${C.mut}">${esc(l)}</text>
<text x="${x + 20}" y="114" class="i" font-size="46" font-weight="600" letter-spacing="-1.5" fill="${i === 0 ? C.acc : C.txt}">${esc(v)}</text>
<text x="${x + 22}" y="140" class="i" font-size="13" fill="${C.dim}">${esc(s)}</text>`;
  });
  // heatmap
  const weeks = (d.weeks || []).slice(-53);
  const flat = weeks.flat().filter(n => n > 0).sort((a, b) => a - b);
  const q = p => flat[Math.floor((flat.length - 1) * p)] || 1;
  const lv = n => (n === 0 ? 0 : n <= q(0.25) ? 1 : n <= q(0.5) ? 2 : n <= q(0.75) ? 3 : 4);
  const cs = 13, gap = 4, hx = 32, hy = 212;
  body += `<text x="32" y="196" class="m" font-size="11.5" letter-spacing="1.2" fill="${C.mut}">ÚLTIMOS 12 MESES</text>`;
  if (weeks.length) {
    weeks.forEach((wk, wi) => wk.forEach((n, di) => {
      body += `<rect x="${hx + wi * (cs + gap)}" y="${hy + di * (cs + gap)}" width="${cs}" height="${cs}" rx="3.5" fill="${LEVELS[lv(n)]}"/>`;
    }));
  } else {
    body += `<rect x="${hx}" y="${hy}" width="${53 * (cs + gap) - gap}" height="${7 * (cs + gap) - gap}" rx="8" fill="${C.cell}"/><text x="${hx + 450}" y="${hy + 64}" text-anchor="middle" class="m" font-size="13" fill="${C.dim}">aguardando a primeira execução do workflow</text>`;
  }
  const lx = hx + 53 * (cs + gap) - gap;
  body += `<text x="${lx}" y="196" text-anchor="end" class="m" font-size="11" fill="${C.dim}">mais</text>`;
  LEVELS.forEach((c, i) => (body += `<rect x="${lx - 38 - (LEVELS.length - i) * 17}" y="186" width="12" height="12" rx="3" fill="${c}"/>`));
  body += `<text x="${lx - 38 - LEVELS.length * 17 - 8}" y="196" text-anchor="end" class="m" font-size="11" fill="${C.dim}">menos</text>`;
  // side: repos
  const sx = lx + 30, sw = W - 32 - sx;
  body += `<rect x="${sx}" y="${hy}" width="${sw}" height="${7 * (cs + gap) - gap}" rx="12" fill="${C.acc}" fill-opacity=".025" stroke="${C.acc}" stroke-opacity=".12"/>
<text x="${sx + 20}" y="${hy + 30}" class="m" font-size="11.5" letter-spacing="1.2" fill="${C.mut}">REPOSITÓRIOS</text>
<text x="${sx + 18}" y="${hy + 84}" class="i" font-size="46" font-weight="600" letter-spacing="-1.5" fill="${C.txt}">${fmt(d.repos)}</text>
<text x="${sx + 20}" y="${hy + 110}" class="i" font-size="13" fill="${C.dim}">públicos e privados</text>`;
  // languages
  const tot = Object.values(d.langs || {}).reduce((a, b) => a + b, 0);
  const top = Object.entries(d.langs || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const by = 380, bw = W - 64;
  body += `<text x="32" y="${by - 12}" class="m" font-size="11.5" letter-spacing="1.2" fill="${C.mut}">LINGUAGENS MAIS USADAS</text>`;
  if (tot) {
    let x = 32;
    body += `<clipPath id="bar"><rect x="32" y="${by}" width="${bw}" height="10" rx="5"/></clipPath><g clip-path="url(#bar)">`;
    top.forEach(([, v], i) => { const w = (v / tot) * bw; body += `<rect x="${x}" y="${by}" width="${w + 1}" height="10" fill="${LANG[i]}"/>`; x += w; });
    body += `<rect x="${x}" y="${by}" width="${32 + bw - x}" height="10" fill="${C.cell}"/></g>`;
    let lxx = 32;
    top.forEach(([n, v], i) => {
      const label = `${n} ${((v / tot) * 100).toFixed(1).replace('.', ',')}%`;
      body += `<circle cx="${lxx + 5}" cy="${by + 36}" r="5" fill="${LANG[i]}"/><text x="${lxx + 16}" y="${by + 40.5}" class="i" font-size="13.5" fill="${C.txt}" fill-opacity=".85">${esc(label)}</text>`;
      lxx += label.length * 7.6 + 46;
    });
  } else {
    body += `<rect x="32" y="${by}" width="${bw}" height="10" rx="5" fill="${C.cell}"/>`;
  }
  const upd = new Date().toISOString().slice(0, 10);
  body += `<text x="${W - 32}" y="${by - 12}" text-anchor="end" class="m" font-size="11" fill="${C.dim}">atualizado em ${upd}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Estatísticas do GitHub: ${fmt(d.commits)} commits, ${fmt(d.repos)} repositórios"><title>Estatísticas do GitHub</title>
<style>${['inter400', 'inter600', 'mono400'].map(font).join('')}.i{font-family:I,Inter,'Segoe UI',system-ui,sans-serif}.m{font-family:M,'JetBrains Mono',ui-monospace,Consolas,monospace}</style>
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg0}"/></linearGradient>
<radialGradient id="glow" cx="1" cy="0" r=".7"><stop offset="0" stop-color="${C.acc}" stop-opacity=".14"/><stop offset="1" stop-color="${C.acc}" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${C.acc}" stroke-opacity=".045"/></pattern>
<clipPath id="clip"><rect width="${W}" height="${H}" rx="18"/></clipPath></defs>
<g clip-path="url(#clip)"><rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#grid)"/><rect width="${W}" height="${H}" fill="url(#glow)"/></g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${C.acc}" stroke-opacity=".16"/>
${body}</svg>`;
}

if (!MOCK && !PLACEHOLDER && !TOKEN) throw new Error('Defina o secret STATS_TOKEN');
const data = MOCK ? mockData() : PLACEHOLDER ? { year: new Date().getUTCFullYear() } : await fetchData();
writeFileSync(ROOT + (MOCK ? 'stats-preview.svg' : 'assets/stats.svg'), render(data));
console.log('ok', MOCK ? '(mock)' : '');
