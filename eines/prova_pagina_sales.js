// Prova la pàgina de sales amb un Make simulat: el motor de sales real en Node, entrada, tries i estat.
// Ús: python3 eines/motor_sales.py && python3 eines/construeix.py && node eines/prova_pagina_sales.js . (cal Playwright)
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = pw;
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(process.argv[2] || '.');
const S = require(path.join(REPO, 'motor/sales_complet.js'));
const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const OUT = require('os').tmpdir();

const aiRaw = JSON.stringify({ challenges: [
  { title: 'Hot hatch dels 2000', criteria: [{ type: 'body', any: ['hatch'], hard: true }, { type: 'power', min: 180 }, { type: 'years', from: 2000, to: 2015 }, { type: 'drive', any: ['F', '4'] }] },
  { title: 'Esportiu lleuger', criteria: [{ type: 'body', any: ['coupe', 'cabrio'], hard: true }, { type: 'weight', max: 1300 }, { type: 'power', min: 150 }, { type: 'drive', any: ['R'] }] },
] });
const rooms = {}, picks = {};
let queue = Promise.resolve();
const stats = { sends: [], polls: 0, pollsByRoom: {} };
const save = (room, r) => { if (r.game_json) rooms[room] = { ui: r.ui, seq: r.seq, text: r.text, notice: '', game_json: r.game_json }; };
const picksText = (room) => Object.values(picks).filter((p) => p.room === room).map((p) => [p.pid, p.round, p.car, p.at].join('\u001f') + '\u001e').join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Motor seqüencial, com l'escenari de Make
function motor(q) {
  queue = queue.then(async () => {
    await sleep(500);
    const g = rooms[q.room] ? rooms[q.room].game_json : '';
    const r = S.run({ mode: 'step', game_json: g, room: q.room, pid: q.pid, name: q.name, text: q.text, msg: q.msg, picks: picksText(q.room) });
    if (r.route === 'none') { save(q.room, r); return; }
    save(q.room, r);
    await sleep(1500);
    const a = S.run({ mode: 'apply', game_json: r.game_json, ai_raw: aiRaw });
    save(q.room, a);
  });
}

(async () => {
  const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const errs = [];
  const nouJugador = async (nom) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
    await ctx.route('https://qem.test/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route('https://hook.eu1.make.com/**', async (route) => {
      const u = new URL(route.request().url()), q = Object.fromEntries(u.searchParams);
      const H = { 'access-control-allow-origin': '*', 'content-type': 'text/plain' };
      if (q.k !== 'b28b13c9be8d3977a7e8b4e5') return route.fulfill({ status: 200, body: 'Accepted' });
      if (u.pathname.includes('qz24m7')) {
        stats.sends.push(nom + ':' + q.text);
        if (q.text === '#fitxa') { picks[q.room + '_' + q.pid] = { room: q.room, round: Number(q.round), pid: q.pid, tag: q.tag, car: q.car, at: new Date().toISOString() }; await sleep(300); }
        else motor(q);
        return route.fulfill({ status: 200, headers: H, body: 'ok' });
      }
      stats.polls++; stats.pollsByRoom[nom] = (stats.pollsByRoom[nom] || 0) + 1;
      const rm = rooms[q.room] || {};
      const tags = q.round ? Object.values(picks).filter((p) => p.room === q.room && p.round === Number(q.round)).map((p) => p.tag + ',').join('') : '';
      return route.fulfill({ status: 200, headers: H, body: [Date.now(), rm.seq || '', rm.ui || '', rm.text || '', rm.notice || '', tags].join('\u001f') });
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(nom + ': ' + e));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(nom + ': ' + m.text()); });
    return { p, ctx, nom };
  };
  const shot = (j, n) => j.p.screenshot({ path: path.join(OUT, `s_${n}.png`), fullPage: true });
  const tria = async (j, q) => {
    await j.p.waitForSelector('#cerca', { timeout: 30000 });
    await j.p.fill('#cerca', q); await j.p.waitForTimeout(150);
    await j.p.keyboard.press('Enter'); await j.p.waitForTimeout(100);
    await j.p.click('#envia');
  };
  const t0 = Date.now();

  // --- sala de 3
  const A = await nouJugador('Anna'), B = await nouJugador('Biel'), C = await nouJugador('Carla');
  await A.p.goto('https://qem.test/');
  await shot(A, 0);
  await A.p.fill('#nom', 'Anna'); await A.p.click('#crea');
  await A.p.waitForSelector('#enllac', { timeout: 15000 });
  const link = await A.p.inputValue('#enllac');
  if (!/^https:\/\/qem\.test\/\?sala=[a-z0-9]{10}$/.test(link)) throw new Error('enllaç: ' + link);
  for (const [j, n] of [[B, 'Biel'], [C, 'Anna']]) {
    await j.p.goto(link);
    await j.p.waitForSelector('#unir');
    await j.p.fill('#nom', n); await j.p.click('#unir');
  }
  await shot(B, 1);
  await A.p.waitForFunction(() => document.querySelectorAll('.jugadors li').length === 3, null, { timeout: 20000 });
  const noms = await A.p.$$eval('.jugadors li', (l) => l.map((x) => x.textContent.trim()));
  if (!noms.some((x) => x.startsWith('Anna 2'))) throw new Error('àlies repetit: ' + noms);
  if (await B.p.$('#comenca')) throw new Error('un convidat no pot començar');
  await shot(A, 2);
  await A.p.click('#comenca');
  await B.p.waitForSelector('.preparant'); await shot(B, 3);
  // Ronda 1: tothom tria i es resol abans del temps
  await Promise.all([tria(A, 'golf mk5'), tria(B, 'twingo'), tria(C, 'civic')]);
  await shot(C, 4);
  await A.p.waitForSelector('.classificacio', { timeout: 30000 });
  await B.p.waitForSelector('.classificacio', { timeout: 30000 });
  const tRonda1 = Date.now();
  await shot(A, 5); await shot(B, 6);
  const meu = await B.p.$eval('.classificacio li.jo strong', (x) => x.textContent);
  if (meu !== 'Biel') throw new Error('fila pròpia: ' + meu);
  if (await B.p.$('#seguent')) throw new Error('només l’amfitrió té el botó');
  // L'amfitrió passa de ronda
  await A.p.click('#seguent');
  await B.p.waitForSelector('#cerca', { timeout: 20000 });
  // Ronda 2: la Carla no tria; es resol pel temps
  await Promise.all([tria(A, 'mx-5'), tria(B, 'clio')]);
  await shot(A, 7);
  await C.p.waitForSelector('.classificacio', { timeout: 60000 });
  await shot(C, 8);
  const txt = await C.p.$eval('.banner', (x) => x.textContent);
  if (!/temps/.test(txt)) throw new Error('banner de la Carla: ' + txt);
  // Sense amfitrió: la ronda següent arriba sola
  await B.p.waitForSelector('#cerca', { timeout: 40000 });
  const tiles = await B.p.$$eval('.casella', (l) => l.map((x) => x.className));
  if (tiles.filter((c) => /guanya|perd|empat/.test(c)).length !== 2) throw new Error('caselles: ' + tiles);
  // Recàrrega a mitja partida: continua a la mateixa sala
  await B.p.reload();
  await B.p.waitForSelector('#cerca', { timeout: 20000 });
  // La resta de rondes ràpid fins al final
  for (let r = 3; r <= 5; r++) {
    await Promise.all([tria(A, 'golf mk5'), tria(B, 'twingo'), tria(C, 'clio')]);
    await A.p.waitForSelector('.classificacio', { timeout: 30000 });
    if (r < 5) { await A.p.click('#seguent'); await A.p.waitForSelector('#cerca', { timeout: 20000 }); }
  }
  await B.p.waitForSelector('.total', { timeout: 30000 });
  await B.p.waitForFunction(() => /Classificació final/.test(document.body.textContent), null, { timeout: 30000 });
  await shot(B, 9);
  const polls1 = stats.polls;
  await B.p.waitForTimeout(8000);
  if (stats.polls !== polls1) throw new Error('segueix preguntant després del final: ' + (stats.polls - polls1));
  const durada = (Date.now() - t0) / 1000;

  // --- solitari
  const D = await nouJugador('Dani');
  await D.p.goto('https://qem.test/');
  await D.p.fill('#nom', 'Dani'); await D.p.click('#sol');
  await tria(D, 'golf mk5');
  await D.p.waitForSelector('.classificacio', { timeout: 20000 });
  await shot(D, 10);
  const solo = await D.p.$$eval('.classificacio li strong', (l) => l.map((x) => x.textContent));
  if (!solo.includes('Rival IA') || !solo.includes('Dani')) throw new Error('solitari: ' + solo);
  if (/sala=/.test(D.p.url())) throw new Error('el solitari no té enllaç');

  console.log('errors', errs);
  console.log('ordres', stats.sends.length, 'consultes', stats.polls, stats.pollsByRoom, 'durada', durada.toFixed(0) + ' s');
  console.log(stats.sends.filter((x) => !/#fitxa/.test(x)).join(' | '));
  await b.close();
  if (errs.length) process.exit(1);
  console.log('OK: pàgina de sales');
})().catch((e) => { console.error(e); process.exit(1); });
