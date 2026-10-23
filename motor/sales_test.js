// Proves del motor de sales: node motor/sales_test.js (abans: python3 eines/motor_sales.py)
const assert = require('assert');
const S = require('./sales_complet.js');
const T0 = Date.parse('2026-10-23T12:00:00Z');
const t = (s) => new Date(T0 + s * 1000).toISOString();
let game = '', ui = null;
const msgN = {};
const send = (pid, text, s, name) => {
  msgN[pid] = (msgN[pid] || 0) + 1;
  const r = S.run({ mode: 'step', game_json: game, room: 'web-sala0001', pid, name: name || pid, text, msg: msgN[pid], now: t(s) });
  if (r.game_json) game = r.game_json;
  if (r.ui) ui = JSON.parse(r.ui);
  return r;
};
const ai = (raw, s) => { const r = S.run({ mode: 'apply', game_json: game, ai_raw: raw, now: t(s) }); if (r.game_json) game = r.game_json; ui = JSON.parse(r.ui); return r; };
const G = () => JSON.parse(game);
const aiRaw = JSON.stringify({ challenges: [
  { title: 'Hot hatch dels 2000', criteria: [{ type: 'body', any: ['hatch'], hard: true }, { type: 'power', min: 180 }, { type: 'years', from: 2000, to: 2015 }, { type: 'drive', any: ['F', '4'] }] },
  { title: 'Impossible', criteria: [{ type: 'body', any: ['pickup'], hard: true }, { type: 'engine', any: ['M'], hard: true }, { type: 'power', min: 900 }] },
  { title: 'Massa fàcil', criteria: [{ type: 'years', from: 1960, to: 2026, hard: true }, { type: 'power', min: 50 }, { type: 'length', min: 3000 }] },
  { title: 'Tipus inventat', criteria: [{ type: 'color', any: ['red'] }, { type: 'body', any: ['sedan'] }] },
] });

// --- sala de 3 jugadors
let r = send('p-host0001', '/sala 5', 0, 'Gery');
assert.equal(ui.status, 'lobby'); assert.equal(ui.players.length, 1); assert.equal(ui.host, S.tag('p-host0001'));
send('p-anna0001', '/unir', 2, 'Anna'); send('p-biel0001', '/unir', 3, 'Gery');
assert.deepEqual(ui.players.map((p) => p.alias), ['Gery', 'Anna', 'Gery 2']);
assert.ok(!JSON.stringify(ui).includes('p-anna0001'), 'mai surten els identificadors secrets');
r = send('p-anna0001', '/comencar', 4); assert.equal(r.route, 'none', 'només l’amfitrió comença');
r = send('p-host0001', '/comencar', 5); assert.equal(r.route, 'challenge'); assert.equal(ui.status, 'preparing');
assert.match(r.prompt, /Create 9 different challenges/);
send('p-anna0001', '/unir', 6); assert.equal(ui.players.length, 3, 'ja no s’hi pot entrar');
r = ai(aiRaw, 20);
let g = G();
assert.equal(g.challenges.length, 5); assert.equal(g.challenges[0].title, 'Hot hatch dels 2000');
assert.ok(!g.challenges.some((c) => ['Impossible', 'Massa fàcil', 'Tipus inventat'].includes(c.title)), 'els reptes dolents es descarten');
assert.equal(ui.round_status, 'open'); assert.equal(ui.deadline, t(54));
assert.equal(ui.challenge.criteria[0].label, 'Carrosseria hatchback'); assert.ok(ui.challenge.criteria[0].hard);
assert.ok(!JSON.stringify(ui).includes(g.challenges[1].title), 'no es veu el repte de la ronda següent');
// Tres tries: un hot hatch bo, un de lent i un que no és hatch
const golf = S.CARS.find((x) => /Golf Mk5/.test(x[1])) || S.CARS.find((x) => x[4].includes('hatch') && x[8] >= 200 && x[2] >= 2000 && x[2] <= 2012 && x[5] === 'F');
const twingo = S.CARS.find((x) => x[0] === 'renault-twingo-1992');
const coupe = S.CARS.find((x) => x[4] === 'coupe' && x[8] > 300);
send('p-host0001', '#fitxa ' + golf[0] + '|' + golf[1], 30);
assert.ok(ui.players.find((p) => p.alias === 'Gery').picked); assert.equal(ui.round_status, 'open');
send('p-host0001', '#fitxa ' + twingo[0], 31); assert.equal(G().rounds[0].picks['p-host0001'].key, golf[0], 'no es pot canviar el cotxe');
send('p-anna0001', '#fitxa inventat-1234|Fals', 32); assert.ok(!G().rounds[0].picks['p-anna0001'], 'només cotxes de la base de dades');
send('p-anna0001', '#fitxa ' + twingo[0], 33);
send('p-biel0001', '/temps', 40); assert.equal(ui.round_status, 'open', '/temps abans d’hora no fa res');
send('p-biel0001', '#fitxa ' + coupe[0], 41);
assert.equal(ui.round_status, 'verdict', 'quan tothom ha triat, es resol');
assert.equal(ui.result[0].alias, 'Gery'); assert.equal(ui.result[0].points, 2);
assert.equal(ui.result[2].alias, 'Gery 2'); assert.equal(ui.result[2].hard, false);
assert.equal(ui.result[0].rows.length, 4); assert.ok(ui.result[0].car.name);
assert.equal(ui.next_at, t(61));
// Ronda següent: un no amfitrió no pot passar abans d'hora
send('p-anna0001', '/seguent', 45); assert.equal(ui.round_status, 'verdict');
send('p-anna0001', '/seguent', 62); assert.equal(ui.round, 2); assert.equal(ui.round_status, 'open');
// Ronda 2: només un tria, la resta perd per temps
send('p-anna0001', '#fitxa ' + golf[0], 70);
send('p-biel0001', '#fitxa ' + golf[0], 62 + 34 + 6); assert.ok(!G().rounds[1].picks['p-biel0001'], 'tard');
send('p-host0001', '/temps', 62 + 34);
assert.equal(ui.round_status, 'verdict'); assert.equal(ui.result[0].alias, 'Anna'); assert.equal(ui.result[0].points, 2);
assert.equal(ui.result[1].points, 0); assert.equal(ui.result[1].car, null);
assert.deepEqual(ui.players.map((p) => p.points), [2, 3, 0]);
// Ordre repetida (mateix número de missatge): no es torna a aplicar
const before = game;
r = S.run({ mode: 'step', game_json: game, room: 'web-sala0001', pid: 'p-host0001', text: '/seguent', msg: msgN['p-host0001'], now: t(200) });
assert.equal(r.game_json, ''); assert.equal(game, before);
// L'amfitrió surt: passa a l'Anna
send('p-host0001', '/surt', 100); assert.equal(ui.host, S.tag('p-anna0001')); assert.equal(ui.players.length, 2);
for (let n = 3; n <= 5; n++) { send('p-anna0001', '/seguent', 100 * n); send('p-anna0001', '/temps', 100 * n + 40); }
assert.equal(ui.status, 'finished'); assert.equal(ui.history.length, 5);

// --- solitari contra el Rival IA
game = '';
r = send('p-solo0001', '/nova 10', 0, 'Gery'); assert.equal(r.route, 'challenge'); assert.equal(ui.status, 'preparing'); assert.equal(ui.solo, true);
r = ai('això no és JSON', 15); // la IA falla: reptes de recanvi
g = G(); assert.equal(g.challenges.length, 10); assert.equal(new Set(g.challenges.map((c) => c.title)).size, 10);
assert.equal(ui.round_status, 'open'); assert.ok(G().rounds[0].picks.ia, 'el rival ja ha triat');
assert.ok(!JSON.stringify(ui).includes(G().rounds[0].picks.ia.key), 'el cotxe del rival no es veu abans d’hora');
send('p-solo0001', '#fitxa ' + twingo[0], 20);
assert.equal(ui.round_status, 'verdict'); assert.equal(ui.result.length, 2);
assert.ok(ui.result.some((e) => e.alias === 'Rival IA' && e.car));

// --- tries que arriben a part (web): una fila per jugador, i /temps les recull
game = ''; for (const k in msgN) delete msgN[k];
send('p-host0001', '/sala 5', 0, 'Gery'); send('p-anna0001', '/unir', 1, 'Anna'); send('p-biel0001', '/unir', 1, 'Biel');
send('p-host0001', '/comencar', 2); ai(aiRaw, 10); // termini: 10 + 34 = 44
const F = (pid, round, key, s) => [pid, round, key, t(s)].join('\x1f');
let picks = [F('p-host0001', 1, golf[0], 20), F('p-anna0001', 1, twingo[0], 21), F('p-zzzz0001', 1, golf[0], 21), F('p-biel0001', 2, golf[0], 22)].join('\x1e') + '\x1e';
assert.equal(S.parsePicks(picks).length, 4);
let rr = S.run({ mode: 'step', game_json: game, room: 'web-sala0001', pid: 'p-host0001', text: '/temps', msg: 99, now: t(25), picks });
ui = JSON.parse(rr.ui); game = rr.game_json;
assert.equal(ui.round_status, 'open', 'encara en falta un (la del Biel és d’una altra ronda)');
assert.deepEqual(ui.players.map((p) => p.picked), [true, true, false]);
picks += F('p-biel0001', 1, 'inventat-1', 30) + '\x1e';
rr = S.run({ mode: 'step', game_json: game, room: 'web-sala0001', pid: 'p-host0001', text: '/temps', msg: 100, now: t(31), picks });
ui = JSON.parse(rr.ui); game = rr.game_json; assert.equal(ui.round_status, 'open', 'cotxe fora de la base de dades');
picks = picks.replace('inventat-1', coupe[0]);
rr = S.run({ mode: 'step', game_json: game, room: 'web-sala0001', pid: 'p-anna0001', text: '/temps', msg: 100, now: t(32), picks });
ui = JSON.parse(rr.ui); game = rr.game_json;
assert.equal(ui.round_status, 'verdict', 'tothom ha triat: es resol sense esperar');
assert.equal(ui.result[0].alias, 'Gery'); assert.equal(ui.result.length, 3);
// Una tria rebuda després del termini (més la gràcia) no compta
rr = S.run({ mode: 'step', game_json: game, room: 'web-sala0001', pid: 'p-host0001', text: '/seguent', msg: 101, now: t(40) }); game = rr.game_json; // ronda 2, termini 40 + 34 = 74
picks = [F('p-host0001', 2, golf[0], 80), F('p-anna0001', 2, golf[0], 78), F('p-biel0001', 2, golf[0], 20)].join('\x1e');
rr = S.run({ mode: 'step', game_json: game, room: 'web-sala0001', pid: 'p-anna0001', text: '/temps', msg: 101, now: t(90), picks });
ui = JSON.parse(rr.ui); game = rr.game_json;
assert.equal(ui.round_status, 'verdict'); assert.equal(ui.result.find((e) => e.alias === 'Gery').car, null, 'tard');
assert.ok(ui.result.find((e) => e.alias === 'Anna').car, 'dins la gràcia');
assert.equal(ui.result.find((e) => e.alias === 'Biel').car, null, 'una fila antiga no compta');

// --- puntuació
const ch = S.buildChallenge({ title: 'x', criteria: [{ type: 'weight', max: 1000, hard: true }, { type: 'body', any: ['hatch'] }, { type: 'origin', any: ['FR'] }] });
const noKg = S.CARS.find((x) => !x[9] && x[4].includes('hatch'));
assert.equal(S.scoreCar(ch, noKg).hardOk, false, 'un imprescindible sense dada no es compleix');
assert.equal(S.origin('Alfa Romeo Giulia'), 'IT'); assert.equal(S.origin('Land Rover Defender'), 'GB'); assert.equal(S.origin('Mercedes-Benz SL'), 'DE');
const unknown = S.CARS.filter((x) => !S.origin(x[1])).map((x) => x[1]);
assert.deepEqual(unknown, [], 'totes les marques tenen país');
console.log('OK: motor de sales');
