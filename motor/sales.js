// Motor de les partides web de «Quin encaixa millor?»: sales de fins a 8 jugadors i partida en solitari contra el Rival IA.
// Funció pura: (estat de la sala + una ordre) -> (nou estat + estat visible per a la pàgina + tasca d'IA).
// La IA només proposa reptes; els veredictes surten de les fitxes de la base de dades, amb regles fixes.

// ---------------------------------------------------------------- constants
const MAX_PLAYERS = 8;
const TURN_MS = 30000; // temps per triar cotxe
const OPEN_MARGIN_MS = 4000; // el que triga la pàgina a veure la ronda oberta
const GRACE_MS = 5000; // marge per la latència en enviar el cotxe
const NEXT_MS = 20000; // temps del veredicte abans de la ronda següent
const STUCK_MS = 120000; // un repte que es prepara més d'això es pot tornar a demanar
const TIE_MARGIN = 5;
const RIVAL = 'ia';
const RIVAL_ALIAS = 'Rival IA';
const WEIGHT = { hard: 3, soft: 2 };

// Fitxes: [clau, nom, any inici, any final (0 = encara es fa), carrosseries, tracció (F/R/4), motor (F/M/R), CV mín, CV màx, kg, llargada mm]
const CARS = /*COTXES*/[];
const BY_KEY = {};
for (const r of CARS) BY_KEY[r[0]] = r;
const THIS_YEAR = 2026;

// País de fundació de cada marca (l'origen d'una marca és on es va fundar).
const BRANDS = [['Mercedes-Benz', 'DE'], ['Land Rover', 'GB'], ['Range Rover', 'GB'], ['Alfa Romeo', 'IT'], ['Aston Martin', 'GB'],
  ['Toyota', 'JP'], ['Ford', 'US'], ['Honda', 'JP'], ['Renault', 'FR'], ['Volkswagen', 'DE'], ['Opel', 'DE'], ['Nissan', 'JP'],
  ['SEAT', 'ES'], ['Peugeot', 'FR'], ['BMW', 'DE'], ['Mitsubishi', 'JP'], ['Citroën', 'FR'], ['Mazda', 'JP'], ['Fiat', 'IT'],
  ['Audi', 'DE'], ['Chevrolet', 'US'], ['Subaru', 'JP'], ['Hyundai', 'KR'], ['Porsche', 'DE'], ['Škoda', 'CZ'], ['Kia', 'KR'],
  ['Dacia', 'RO'], ['Suzuki', 'JP'], ['Ferrari', 'IT'], ['Lamborghini', 'IT'], ['Lancia', 'IT'], ['Dodge', 'US'], ['Mini', 'GB'],
  ['Jeep', 'US'], ['Volvo', 'SE'], ['Smart', 'DE'], ['Lotus', 'GB'], ['Cupra', 'ES'], ['Bugatti', 'FR'], ['McLaren', 'GB'], ['DMC', 'US'],
  ['DeLorean', 'US'], ['Lexus', 'JP'], ['Jaguar', 'GB'], ['Maserati', 'IT'], ['Saab', 'SE'], ['Tesla', 'US'], ['Infiniti', 'JP'], ['Abarth', 'IT']];
function origin(name) {
  const b = BRANDS.find(([m]) => name === m || name.startsWith(m + ' '));
  return b ? b[1] : null;
}

// ---------------------------------------------------------------- criteris
const BODY = { hatch: 'hatchback', sedan: 'berlina', coupe: 'coupé', familiar: 'familiar', cabrio: 'descapotable', suv: 'SUV', pickup: 'pick-up', mpv: 'monovolum' };
const DRIVE = { F: 'davantera', R: 'posterior', 4: 'integral' };
const ENGINE = { F: 'davanter', M: 'central', R: 'posterior' };
const COUNTRY = { DE: 'alemanya', FR: 'francesa', IT: 'italiana', ES: 'espanyola', GB: 'britànica', SE: 'sueca', CZ: 'txeca', RO: 'romanesa', US: 'nord-americana', JP: 'japonesa', KR: 'coreana' };
const TYPES = ['body', 'years', 'power', 'weight', 'length', 'drive', 'engine', 'origin'];
const LIMITS = { years: [1950, THIS_YEAR], power: [40, 1600], weight: [500, 3500], length: [2500, 6000] };

const num = (n) => Math.round(n).toLocaleString('ca-ES').replace(/\s/g, '.');
const orList = (xs) => xs.length <= 1 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' o ' + xs[xs.length - 1];

// Neteja un criteri de la IA: només tipus i valors coneguts; si no és vàlid, null.
function cleanCriterion(c) {
  if (!c || !TYPES.includes(c.type)) return null;
  const hard = c.hard === true;
  const pick = (dict) => [...new Set((Array.isArray(c.any) ? c.any : []).map(String).filter((v) => v in dict))];
  if (c.type === 'body') { const any = pick(BODY); return any.length ? { type: 'body', any, hard } : null; }
  if (c.type === 'drive') { const any = pick(DRIVE); return any.length && any.length < 3 ? { type: 'drive', any, hard } : null; }
  if (c.type === 'engine') { const any = pick(ENGINE); return any.length && any.length < 3 ? { type: 'engine', any, hard } : null; }
  if (c.type === 'origin') { const any = pick(COUNTRY); return any.length && any.length <= 4 ? { type: 'origin', any, hard } : null; }
  const [lo, hi] = LIMITS[c.type];
  const ok = (x) => typeof x === 'number' && x >= lo && x <= hi;
  if (c.type === 'years') {
    const from = Math.round(c.from), to = Math.round(c.to);
    return ok(from) && ok(to) && from <= to ? { type: 'years', from, to, hard } : null;
  }
  if (ok(c.min) && !ok(c.max)) return { type: c.type, min: Math.round(c.min), hard };
  if (ok(c.max) && !ok(c.min)) return { type: c.type, max: Math.round(c.max), hard };
  return null;
}

function label(c) {
  switch (c.type) {
    case 'body': return 'Carrosseria ' + orList(c.any.map((v) => BODY[v]));
    case 'years': return c.from === c.to ? `Fabricat el ${c.from}` : `Fabricat entre ${c.from} i ${c.to}`;
    case 'power': return c.min ? `Almenys ${num(c.min)} CV` : `Com a màxim ${num(c.max)} CV`;
    case 'weight': return c.min ? `Almenys ${num(c.min)} kg` : `Com a màxim ${num(c.max)} kg`;
    case 'length': return (c.min ? 'Almenys ' : 'Com a màxim ') + ((c.min || c.max) / 1000).toFixed(2).replace('.', ',') + ' m de llarg';
    case 'drive': return 'Tracció ' + orList(c.any.map((v) => DRIVE[v]));
    case 'engine': return 'Motor ' + orList(c.any.map((v) => ENGINE[v]));
    case 'origin': return 'Marca ' + orList(c.any.map((v) => COUNTRY[v]));
  }
  return '';
}

// Satisfacció d'un criteri per a una fitxa: 1 compleix, entre 0 i 1 a prop, 0 no, null sense dada.
function evalCriterion(c, r) {
  const y0 = r[2], y1 = r[3] || THIS_YEAR, body = r[4] ? r[4].split(' ') : [], drive = r[5], eng = r[6], cvMin = r[7], cvMax = r[8], kg = r[9], mm = r[10];
  const near = (v, target, tol) => Math.max(0, 1 - Math.abs(v - target) / (target * tol));
  switch (c.type) {
    case 'body': return { n: body.length ? (c.any.some((v) => body.includes(v)) ? 1 : 0) : null, v: body.map((b) => BODY[b]).join(', ') || null };
    case 'years': {
      if (!y0) return { n: null, v: null };
      const v = `${y0}–${r[3] ? y1 : 'avui'}`;
      if (y0 <= c.to && y1 >= c.from) return { n: 1, v };
      const gap = y0 > c.to ? y0 - c.to : c.from - y1;
      return { n: Math.max(0, 1 - 0.25 * gap), v };
    }
    case 'power': {
      if (!cvMax) return { n: null, v: null };
      const v = cvMin && cvMin !== cvMax ? `${cvMin}–${cvMax} CV` : `${cvMax} CV`;
      if (c.min) return { n: cvMax >= c.min ? 1 : near(cvMax, c.min, 0.25), v };
      const lo = cvMin || cvMax;
      return { n: lo <= c.max ? 1 : near(lo, c.max, 0.25), v };
    }
    case 'weight': {
      if (!kg) return { n: null, v: null };
      const v = `${num(kg)} kg`;
      if (c.min) return { n: kg >= c.min ? 1 : near(kg, c.min, 0.15), v };
      return { n: kg <= c.max ? 1 : near(kg, c.max, 0.15), v };
    }
    case 'length': {
      if (!mm) return { n: null, v: null };
      const v = (mm / 1000).toFixed(2).replace('.', ',') + ' m';
      if (c.min) return { n: mm >= c.min ? 1 : near(mm, c.min, 0.08), v };
      return { n: mm <= c.max ? 1 : near(mm, c.max, 0.08), v };
    }
    case 'drive': {
      if (!drive) return { n: null, v: null };
      return { n: [...drive].some((d) => c.any.includes(d)) ? 1 : 0, v: [...drive].map((d) => DRIVE[d]).join(' o ') };
    }
    case 'engine': return eng ? { n: c.any.includes(eng) ? 1 : 0, v: ENGINE[eng] } : { n: null, v: null };
    case 'origin': {
      const o = origin(r[1]);
      return o ? { n: c.any.includes(o) ? 1 : 0, v: COUNTRY[o] } : { n: null, v: null };
    }
  }
  return { n: null, v: null };
}

// Puntuació d'una fitxa en un repte: una dada que falta no suma, i un imprescindible sense dada no es compleix.
function scoreCar(ch, r) {
  let num_ = 0, den = 0, hardOk = true, complete = true;
  const rows = ch.criteria.map((c) => {
    const e = evalCriterion(c, r), w = c.hard ? WEIGHT.hard : WEIGHT.soft;
    num_ += w * (e.n || 0); den += w;
    if (c.hard && e.n !== 1) hardOk = false;
    if (e.n === null) complete = false;
    return { id: c.id, n: e.n === null ? null : Math.round(e.n * 100) / 100, v: e.v };
  });
  return { score: den ? Math.round(1000 * num_ / den) / 10 : 0, hardOk, complete, rows };
}

// Un contra un: primer els imprescindibles, després la puntuació amb un marge d'empat.
function duel(a, b) {
  if (!a && !b) return 0;
  if (!a || !b) return a ? 1 : -1;
  if (a.key === b.key) return 0;
  if (a.hardOk !== b.hardOk) return a.hardOk ? 1 : -1;
  const d = a.score - b.score;
  return Math.abs(d) >= TIE_MARGIN ? Math.sign(d) : 0;
}

// Un repte val si un grup raonable de fitxes amb totes les dades el compleix bé, però no la majoria.
function validate(ch) {
  const good = CARS.filter((r) => { const s = scoreCar(ch, r); return s.hardOk && s.complete && s.score >= 80; }).length;
  const hardOk = CARS.filter((r) => scoreCar(ch, r).hardOk).length;
  return { ok: good >= 4 && hardOk <= CARS.length * 0.45, good, hardOk };
}

function buildChallenge(raw) {
  if (!raw || typeof raw.title !== 'string') return null;
  const title = raw.title.replace(/[<>\n\r]/g, '').trim().slice(0, 70);
  const seen = new Set(), criteria = [];
  for (const c0 of Array.isArray(raw.criteria) ? raw.criteria : []) {
    const c = cleanCriterion(c0);
    if (!c || seen.has(c.type)) continue;
    seen.add(c.type); criteria.push(c);
  }
  if (!title || criteria.length < 3) return null;
  const ch = { title, criteria: criteria.slice(0, 5) };
  if (!ch.criteria.some((c) => c.hard)) ch.criteria[0].hard = true;
  let hard = 0;
  for (const c of ch.criteria) if (c.hard && ++hard > 2) c.hard = false;
  ch.criteria.forEach((c, i) => { c.id = 'c' + (i + 1); c.label = label(c); });
  return ch;
}

// Reptes de recanvi, per si la IA falla o en proposa massa pocs de vàlids.
const SPARE = [
  { title: 'Hot hatch per a la carretera de muntanya', criteria: [{ type: 'body', any: ['hatch'], hard: true }, { type: 'power', min: 180 }, { type: 'drive', any: ['F', '4'] }, { type: 'years', from: 2000, to: 2020 }] },
  { title: 'Esportiu lleuger de tracció posterior', criteria: [{ type: 'drive', any: ['R'], hard: true }, { type: 'body', any: ['coupe', 'cabrio'] }, { type: 'weight', max: 1300 }, { type: 'power', min: 150 }] },
  { title: 'SUV familiar per anar a esquiar', criteria: [{ type: 'body', any: ['suv'], hard: true }, { type: 'drive', any: ['4'], hard: true }, { type: 'years', from: 2010, to: THIS_YEAR }, { type: 'length', min: 4500 }] },
  { title: 'Berlina ràpida per a autopista', criteria: [{ type: 'body', any: ['sedan'], hard: true }, { type: 'power', min: 300 }, { type: 'years', from: 2005, to: THIS_YEAR }, { type: 'length', min: 4700 }] },
  { title: 'Superesportiu amb el motor darrere teu', criteria: [{ type: 'engine', any: ['M', 'R'], hard: true }, { type: 'power', min: 450 }, { type: 'body', any: ['coupe', 'cabrio'] }, { type: 'years', from: 1985, to: THIS_YEAR }] },
  { title: 'Utilitari clàssic per a la ciutat', criteria: [{ type: 'body', any: ['hatch'], hard: true }, { type: 'years', from: 1975, to: 1995 }, { type: 'length', max: 3800 }, { type: 'power', max: 100 }] },
  { title: 'Familiar per carregar-ho tot', criteria: [{ type: 'body', any: ['familiar', 'mpv'], hard: true }, { type: 'years', from: 2000, to: THIS_YEAR }, { type: 'length', min: 4600 }, { type: 'power', min: 120 }] },
  { title: 'Icona japonesa dels 90', criteria: [{ type: 'origin', any: ['JP'], hard: true }, { type: 'years', from: 1990, to: 1999 }, { type: 'power', min: 200 }, { type: 'body', any: ['coupe', 'hatch'] }] },
  { title: 'Gran turisme italià', criteria: [{ type: 'origin', any: ['IT'], hard: true }, { type: 'power', min: 250 }, { type: 'body', any: ['coupe', 'cabrio'] }, { type: 'years', from: 1970, to: THIS_YEAR }] },
  { title: 'Tot terreny de veritat', criteria: [{ type: 'drive', any: ['4'], hard: true }, { type: 'body', any: ['suv', 'pickup'] }, { type: 'weight', min: 1600 }, { type: 'years', from: 1980, to: THIS_YEAR }] },
];

function chooseChallenges(rawList, n, rand) {
  const out = [], titles = new Set();
  for (const raw of rawList) {
    const ch = buildChallenge(raw);
    if (!ch || titles.has(ch.title.toLowerCase()) || !validate(ch).ok) continue;
    titles.add(ch.title.toLowerCase()); out.push(ch);
    if (out.length >= n) break;
  }
  const spare = SPARE.slice().sort(() => rand() - 0.5);
  for (const raw of spare) {
    if (out.length >= n) break;
    const ch = buildChallenge(raw);
    if (ch && !titles.has(ch.title.toLowerCase()) && validate(ch).ok) { titles.add(ch.title.toLowerCase()); out.push(ch); }
  }
  // Si encara en falten (partides de 15 rondes), es repeteixen recanvis.
  for (let i = 0; out.length < n; i++) out.push(buildChallenge(spare[i % spare.length]));
  return out.slice(0, n);
}

function challengePrompt(n) {
  return [
    'You design challenges for a car quiz game for car enthusiasts. Players get a challenge and pick the real car that fits it best from a database. Write titles in Catalan with correct spelling.',
    `Create ${n} different challenges. Each challenge has a short catchy title in Catalan (max 60 characters, like "Hot hatch per a la carretera de muntanya" or "Esportiu lleuger dels 90") and 3 to 5 criteria, each of a different type, using ONLY these types:`,
    '- {"type":"body","any":[...]} values: hatch, sedan, coupe, familiar, cabrio, suv, pickup, mpv',
    `- {"type":"years","from":YYYY,"to":YYYY} production years overlap, between 1960 and ${THIS_YEAR}`,
    '- {"type":"power","min":N} or {"type":"power","max":N} horsepower (CV), 50 to 1000',
    '- {"type":"weight","min":N} or {"type":"weight","max":N} kerb weight kg, 700 to 2800',
    '- {"type":"length","min":N} or {"type":"length","max":N} length in mm, 3000 to 5300',
    '- {"type":"drive","any":[...]} values: F (front), R (rear), 4 (all-wheel)',
    '- {"type":"engine","any":[...]} values: F (front), M (mid), R (rear)',
    '- {"type":"origin","any":[...]} brand country: DE, FR, IT, ES, GB, SE, CZ, RO, US, JP, KR',
    'Mark 1 or 2 criteria per challenge with "hard":true (must be met). Prefer body, drive, engine, origin or years as hard criteria. Make the challenges varied and fun: classics, hot hatches, family cars, supercars, off-roaders, city cars, Japanese icons, European saloons.',
    'Each challenge must be met by at least 4 real, well-known cars of mainstream brands (Toyota, Ford, Honda, Renault, Volkswagen, Opel, Nissan, SEAT, Peugeot, Mercedes-Benz, BMW, Mitsubishi, Citroën, Mazda, Fiat, Audi, Chevrolet, Subaru, Hyundai, Porsche, Škoda, Kia, Dacia, Suzuki, Ferrari, Land Rover, Lamborghini, Lancia, Mini, Alfa Romeo, Jeep, Volvo, Lotus) but must not be met by most cars.',
    'Return ONLY JSON, no text before or after: {"challenges":[{"title":"...","criteria":[{"type":"body","any":["hatch"],"hard":true},{"type":"power","min":180}]}]}',
  ].join('\n');
}

function parseJSON(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  const s = String(raw), i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j < i) return fallback;
  try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return fallback; }
}

// ---------------------------------------------------------------- jugadors i rondes
// L'etiqueta pública d'un jugador: la pàgina la calcula igual per reconèixer-se, però no permet fer-se passar per ell.
function tag(pid) {
  let h = 5381;
  for (let i = 0; i < pid.length; i++) h = ((h * 33) ^ pid.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(6, '0').slice(-6);
}
function cleanAlias(name, players) {
  let a = String(name || '').replace(/[<>\n\r]/g, '').trim().slice(0, 24) || 'Pilot';
  if (a === RIVAL_ALIAS) a = 'Pilot';
  const base = a;
  for (let i = 2; players.some((p) => p.alias.toLowerCase() === a.toLowerCase()); i++) a = `${base} ${i}`;
  return a;
}
const humans = (g) => g.players.filter((p) => p.pid !== RIVAL && !p.left);
const cur = (g) => g.rounds[g.rounds.length - 1] || null;
const at = (iso) => Date.parse(iso);
const iso = (ms) => new Date(ms).toISOString();

function newGame(room, host, alias, rounds, solo, now) {
  const g = { v: 2, room, host, solo, status: 'lobby', created_at: now, rounds_total: rounds, players: [], seen: {}, challenges: [], rounds: [], prep_at: null };
  g.players.push({ pid: host, alias: cleanAlias(alias, []), tag: tag(host) });
  if (solo) g.players.push({ pid: RIVAL, alias: RIVAL_ALIAS, tag: RIVAL });
  return g;
}

function startPreparing(g, ctx) {
  g.status = 'preparing'; g.prep_at = ctx.now;
  ctx.ai(challengePrompt(Math.min(g.rounds_total + 4, 19)));
}

// El Rival IA tria abans de conèixer cap cotxe: un dels que encaixen bé, a l'atzar.
function rivalPick(ch, rand) {
  const good = CARS.map((r) => [scoreCar(ch, r), r]).filter(([s]) => s.hardOk && s.complete).sort((a, b) => b[0].score - a[0].score);
  const top = good.slice(0, 30);
  const r = top.length ? top[Math.floor(rand() * top.length)][1] : CARS[Math.floor(rand() * CARS.length)];
  return r[0];
}

function openRound(g, ctx) {
  const n = g.rounds.length + 1, ch = g.challenges[n - 1];
  const r = { n, challenge: ch, opened_at: ctx.now, deadline: iso(at(ctx.now) + OPEN_MARGIN_MS + TURN_MS), picks: {}, status: 'open' };
  if (g.solo) r.picks[RIVAL] = { key: rivalPick(ch, ctx.rand), at: ctx.now };
  g.rounds.push(r);
  ctx.say(`Ronda ${n}: ${ch.title}`);
}

function resolveRound(g, ctx) {
  const r = cur(g);
  const entries = g.players.filter((p) => !p.left || r.picks[p.pid]).map((p) => {
    const pk = r.picks[p.pid], row = pk && BY_KEY[pk.key];
    const s = row ? Object.assign({ key: row[0] }, scoreCar(r.challenge, row)) : null;
    return { pid: p.pid, s, car: row ? { key: row[0], name: row[1], years: row[2] ? `${row[2]}–${row[3] || 'avui'}` : '' } : null };
  });
  for (const e of entries) e.points = entries.reduce((acc, o) => o === e ? acc : acc + [0, 0.5, 1][duel(e.s, o.s) + 1] * (e.s || o.s ? 1 : 0), 0);
  entries.sort((x, y) => y.points - x.points || (y.s ? y.s.score : -1) - (x.s ? x.s.score : -1));
  r.status = 'verdict'; r.verdict_at = ctx.now;
  r.result = entries.map((e) => ({ pid: e.pid, points: e.points, car: e.car, score: e.s ? e.s.score : null, hardOk: e.s ? e.s.hardOk : false, rows: e.s ? e.s.rows : [] }));
  const best = r.result[0];
  ctx.say(best && best.car ? `Ronda ${r.n}: guanya ${alias(g, best.pid)} amb ${best.car.name}.` : `Ronda ${r.n}: ningú no ha triat cap cotxe.`);
  if (r.n >= g.rounds_total) { g.status = 'finished'; ctx.say('Partida acabada.'); }
}
function alias(g, pid) { const p = g.players.find((x) => x.pid === pid); return p ? p.alias : '?'; }

function totals(g) {
  const t = {};
  for (const p of g.players) t[p.pid] = 0;
  for (const r of g.rounds) for (const e of r.result || []) t[e.pid] = (t[e.pid] || 0) + e.points;
  return t;
}

// ---------------------------------------------------------------- ordres
function step(g, ev, ctx) {
  const text = String(ev.text || '').trim();
  const [cmd0, ...rest] = text.split(/\s+/);
  const cmd = (cmd0 || '').toLowerCase();
  const arg = rest.join(' ');
  const pid = ev.pid, now = at(ctx.now);
  const me = g && g.players.find((p) => p.pid === pid && !p.left);
  const isHost = !!g && g.host === pid;

  if (cmd === '/nova' || cmd === '/sala') {
    if (g && g.status !== 'finished' && g.status !== 'cancelled') { ctx.say('Aquesta sala ja té una partida.'); return g; }
    const n = [5, 10, 15].includes(Number(arg)) ? Number(arg) : 5;
    const ng = newGame(ev.room, pid, ev.name, n, cmd === '/nova', ctx.now);
    if (ng.solo) startPreparing(ng, ctx); else ctx.say(`${ng.players[0].alias} ha creat la sala.`);
    return ng;
  }
  if (!g) { ctx.say('Aquesta sala no existeix.'); return g; }

  switch (cmd) {
    case '/unir': {
      if (me) return g;
      if (g.status !== 'lobby') { ctx.say('La partida ja ha començat.'); return g; }
      if (humans(g).length >= MAX_PLAYERS) { ctx.say('La sala és plena.'); return g; }
      const p = { pid, alias: cleanAlias(ev.name, humans(g)), tag: tag(pid) };
      g.players = g.players.filter((x) => x.pid !== pid).concat([p]);
      ctx.say(`${p.alias} entra a la sala.`);
      return g;
    }
    case '/surt': {
      if (!me) return g;
      if (g.status === 'lobby') g.players = g.players.filter((x) => x.pid !== pid); else me.left = true;
      ctx.say(`${me.alias} surt de la sala.`);
      if (isHost) {
        const next = humans(g)[0];
        if (next) g.host = next.pid; else g.status = 'cancelled';
      }
      return g;
    }
    case '/comencar': {
      if (!isHost || g.status !== 'lobby') return g;
      if (humans(g).length < 2) { ctx.say('Cal que hi hagi almenys dues persones a la sala.'); return g; }
      startPreparing(g, ctx);
      return g;
    }
    case '/reintenta': {
      // Si el repte s'ha encallat (per exemple, Make s'ha aturat), es torna a demanar.
      if (g.status === 'preparing' && now - at(g.prep_at) > STUCK_MS && me) startPreparing(g, ctx);
      return g;
    }
    case '#fitxa': {
      const r = cur(g);
      if (!me || g.status !== 'playing' || !r || r.status !== 'open') return g;
      if (r.picks[pid]) return g;
      if (now > at(r.deadline) + GRACE_MS) { ctx.say(`${me.alias} ha arribat tard.`); return g; }
      const key = arg.split('|')[0].trim();
      if (!BY_KEY[key]) { ctx.say('Aquest cotxe no és a la base de dades.'); return g; }
      r.picks[pid] = { key, at: ctx.now };
      if (humans(g).every((p) => r.picks[p.pid])) resolveRound(g, ctx);
      return g;
    }
    case '/temps': {
      const r = cur(g);
      if (g.status === 'playing' && r && r.status === 'open' && (now >= at(r.deadline) - 1000 || humans(g).every((p) => r.picks[p.pid]))) resolveRound(g, ctx);
      return g;
    }
    case '/seguent': {
      const r = cur(g);
      if (!me || g.status !== 'playing' || !r || r.status !== 'verdict') return g;
      // L'amfitrió passa quan vol; si no hi és, qualsevol jugador pot passar quan s'acaba el temps del veredicte.
      if (!isHost && now < at(r.verdict_at) + NEXT_MS) return g;
      openRound(g, ctx);
      return g;
    }
    case '/cancela': {
      if (!isHost) return g;
      g.status = 'cancelled'; ctx.say('Partida cancel·lada.');
      return g;
    }
    default: return g;
  }
}

// Les tries de la web arriben a part (una fila per jugador, desada en rebre-la) perquè no facin cua al motor.
// Només compten les de la ronda oberta, de jugadors de la sala, de cotxes de la base de dades i fetes a temps.
function mergePicks(g, picks) {
  const r = g && cur(g);
  if (!r || g.status !== 'playing' || r.status !== 'open') return;
  for (const pk of picks) {
    const p = g.players.find((x) => x.pid === pk.pid && !x.left && x.pid !== RIVAL);
    if (!p || Number(pk.round) !== r.n || r.picks[p.pid] || !BY_KEY[pk.key]) continue;
    // Una fila d'una partida anterior de la mateixa sala és d'abans que s'obrís la ronda.
    if (!(at(pk.at) <= at(r.deadline) + GRACE_MS && at(pk.at) >= at(r.opened_at) - 2000)) continue;
    r.picks[p.pid] = { key: pk.key, at: pk.at };
  }
}
function parsePicks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw).split('\x1e').map((line) => line.split('\x1f').map((x) => x.trim())).filter((f) => f.length >= 4 && f[0])
    .map(([pid, round, key, at]) => ({ pid, round, key, at }));
}

// Arriba la resposta de la IA amb els reptes.
function apply(g, ctx, raw) {
  if (!g || g.status !== 'preparing') return g;
  const out = parseJSON(raw, null);
  const list = out && Array.isArray(out.challenges) ? out.challenges : [];
  g.challenges = chooseChallenges(list, g.rounds_total, ctx.rand);
  g.ai_valid = g.challenges.filter((c) => list.some((x) => x && x.title && x.title.trim().slice(0, 70) === c.title)).length;
  g.status = 'playing';
  openRound(g, ctx);
  return g;
}

// ---------------------------------------------------------------- estat visible per a la pàgina
// Mai inclou els identificadors secrets dels jugadors ni els reptes de les rondes que encara no han començat.
function uiState(g, ctx) {
  if (!g) return { status: 'none', server_now: ctx.now };
  const t = totals(g), r = cur(g);
  const tagOf = (pid) => (g.players.find((p) => p.pid === pid) || {}).tag || '?';
  const ui = {
    status: g.status, solo: !!g.solo, rounds: g.rounds_total, round: r ? r.n : 0,
    host: tagOf(g.host), server_now: ctx.now, turn_ms: TURN_MS,
    players: g.players.filter((p) => !p.left).map((p) => ({ tag: p.tag, alias: p.alias, points: t[p.pid] || 0, picked: !!(r && r.status === 'open' && r.picks[p.pid]) })),
    history: g.rounds.filter((x) => x.result).map((x) => x.result.map((e) => [tagOf(e.pid), e.points])),
  };
  if (r) {
    ui.round_status = r.status;
    ui.challenge = { title: r.challenge.title, criteria: r.challenge.criteria.map((c) => ({ id: c.id, label: c.label, hard: !!c.hard })) };
    if (r.status === 'open') ui.deadline = r.deadline;
    if (r.status === 'verdict') {
      ui.verdict_at = r.verdict_at;
      ui.next_at = iso(at(r.verdict_at) + NEXT_MS);
      ui.result = r.result.map((e) => ({ tag: tagOf(e.pid), alias: alias(g, e.pid), points: e.points, car: e.car, score: e.score, hard: e.hardOk, rows: e.rows }));
    }
  }
  if (g.status === 'preparing') ui.prep_at = g.prep_at;
  return ui;
}

// ---------------------------------------------------------------- punt d'entrada (Make)
function run(input) {
  const msgs = [];
  const ctx = { now: input.now || new Date().toISOString(), rand: Math.random, task: 'none', prompt: '', say: (t) => msgs.push(String(t).slice(0, 300)), ai: (p) => { ctx.task = 'challenge'; ctx.prompt = p; } };
  let g = parseJSON(input.game_json, null);
  if (g && g.v !== 2) g = null;
  if (input.mode === 'apply') g = apply(g, ctx, input.ai_raw);
  else {
    const pid = String(input.pid || ''), msg = Number(input.msg) || 0;
    // Cada pàgina numera les seves ordres: una ordre repetida o antiga no es torna a aplicar.
    if (g && g.seen && msg && (g.seen[pid] || 0) >= msg) return { route: 'none', prompt: '', game_json: '', ui: '', text: '', seq: 0 };
    mergePicks(g, parsePicks(input.picks));
    g = step(g, { room: String(input.room || ''), pid, name: input.name, text: input.text }, ctx);
    if (g && msg) g.seen[pid] = msg;
  }
  return {
    route: ctx.task, prompt: ctx.prompt,
    game_json: g ? JSON.stringify(g) : '',
    ui: JSON.stringify(uiState(g, ctx)),
    text: msgs.join('\n'),
    seq: Date.now(),
  };
}

if (typeof module !== 'undefined') module.exports = { run, parsePicks, scoreCar, duel, validate, buildChallenge, chooseChallenges, evalCriterion, tag, CARS, SPARE, origin };
