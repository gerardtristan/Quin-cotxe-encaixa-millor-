// Partida web en solitari: temps límit, derrota per temps i estat per a la pàgina.
const assert = require('assert');
const { run } = require('./engine_web.js');
let game = '', ui = null;
const sent = [];
const T0 = Date.parse('2026-10-23T12:00:00Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const h = (r) => { if (r.game_json) game = r.game_json; sent.push(...r.messages); if (r.ui) ui = JSON.parse(r.ui); return r; };
const msg = (text, s) => h(run({ mode: 'step', game_json: game, event_json: JSON.stringify({ chat_type: 'private', chat_id: 'web-abc123', from_id: 'web-abc123', first_name: 'Gery', text }), now: at(s) }));
const ai = (r, s, raw1, src1, raw2, src2) => h(run({ mode: 'apply', task: r.route, pending_json: r.pending_json, game_json: game, ai_raw_1: JSON.stringify(raw1), ai_src_1: src1, ai_raw_2: raw2 ? JSON.stringify(raw2) : '', ai_src_2: src2 || '', now: at(s) }));
const last = () => sent[sent.length - 1].text;
const crit = [{ id: 'body', label: 'Hot hatch', type: 'categorical' }, { id: 'fwd', label: 'Tracció davantera', type: 'hard' },
  { id: 'years', label: '2005-2015', type: 'range', rule: { from: 2005, to: 2015 } }, { id: 'hp', label: '200 CV', type: 'numeric', rule: { min: 200 } }];
const ex = ['a', 'b', 'c'].map(x => ({ model_name: 'M' + x, car: 'Cotxe ' + x, source_urls: ['https://s.example/' + x] }));
const challenge = (r, s) => ai(r, s, { candidates: [{ challenge: { title: 'Repte ' + s, criteria: crit }, examples: ex }] }, 'https://s.example/a | https://s.example/b | https://s.example/c');

let r = msg('/nova', 0); assert.ok(JSON.parse(game).web);
r = msg('/config rondes 5', 1);
r = msg('/comencar', 2); assert.equal(r.route, 'challenge');
assert.ok(r.messages.every(m => typeof m.seq === 'number'));
r = challenge(r, 20);
assert.equal(ui.round_status, 'open'); assert.equal(ui.deadline, at(50)); assert.equal(ui.turn_seconds, 30);
assert.match(last(), /Tens 30 segons/);
assert.ok(!JSON.stringify(ui).includes('Cotxe'), 'la pàgina no veu els exemples');
// /temps abans d'hora no fa res
r = msg('/temps', 30); assert.match(last(), /Encara queda temps/); assert.equal(JSON.parse(game).rounds[0].status, 'open');
// /temps a l'hora: perd la ronda
r = msg('/temps', 50);
let g = JSON.parse(game);
assert.equal(g.rounds[0].status, 'verdict'); assert.equal(g.rounds[0].verdict_current.decisive, 'temps');
assert.match(last(), /no ha triat cap cotxe a temps[\s\S]*Rival IA: 1/);
r = msg('/apela no és just', 52); assert.match(last(), /cap veredicte/);
// Ronda 2: el cotxe arriba tard
r = msg('/seguent', 60); r = challenge(r, 70);
r = msg('Clio RS 2010', 110); assert.match(last(), /acabat el temps|no ha triat/);
assert.equal(JSON.parse(game).rounds[1].status, 'verdict');
// Ronda 3: text lliure no val a la web, només fitxes de la llista
r = msg('/seguent', 120); r = challenge(r, 130);
r = msg('Clio', 150); assert.match(last(), /Tria el cotxe de la llista/); assert.equal(r.route, 'none');
r = msg('#fitxa renault-clio-iii|Renault Clio III RS|2006-2012', 152);
assert.equal(r.route, 'verify'); assert.match(sent[sent.length - 2].text, /Rebut: Renault Clio III RS \(2006-2012\)/);
assert.equal(ui.round_status, 'verifying'); assert.equal(ui.my_car, 'Renault Clio III RS (2006-2012)');
assert.equal(ui.verdict.a.car, 'Renault Clio III RS (2006-2012)'); assert.equal(ui.me, 'a');
assert.match(r.prompt_1, /Renault Clio III RS/);
const ok = (u) => ({ status: 'meets', source: u, value: 1, years_off: 0 });
const evs = (u) => ({ evals: { body: ok(u), fwd: ok(u), years: ok(u), hp: ok(u) } });
const fail = (u) => ({ evals: { body: ok(u), fwd: { status: 'fails', source: u, value: 'RWD' }, years: ok(u), hp: ok(u) } });
r = ai(r, 200, evs('https://x.example/1'), 'https://x.example/1', fail('https://x.example/2'), 'https://x.example/2');
g = JSON.parse(game); assert.equal(g.rounds[2].status, 'verdict');
assert.equal(ui.board.length, 2);
assert.deepEqual(ui.results, ['lose', 'lose', 'win']);
assert.equal(ui.verdict.outcome, 'a'); assert.equal(ui.verdict.decisive, 'requisits_durs');
assert.equal(ui.verdict.b.rows.find(x => x.id === 'fwd').status, 'fails');
assert.equal(ui.criteria.length, 4); assert.ok(ui.criteria.find(c => c.id === 'fwd').hard);
// /nova 5 a la web: crea i comença la partida d'una vegada
game = '';
const w2 = (text, s) => h(run({ mode: 'step', game_json: game, event_json: JSON.stringify({ chat_type: 'private', chat_id: 'web-xyz98765', from_id: 'web-xyz98765', first_name: 'Gery', text }), now: at(s) }));
r = w2('/nova 10', 0); assert.equal(r.route, 'challenge'); assert.equal(ui.status, 'playing'); assert.equal(ui.rounds, 10);
r = challenge(r, 30); assert.equal(ui.round_status, 'open'); assert.deepEqual(ui.results, [null]);
// Telegram no canvia: un xat privat normal no té límit de temps
game = '';
const tg = (text, s) => h(run({ mode: 'step', game_json: game, event_json: JSON.stringify({ chat_type: 'private', chat_id: '7', from_id: '7', first_name: 'G', text }), now: at(s) }));
tg('/nova', 0); r = tg('/comencar', 1); r = challenge(r, 5);
assert.equal(JSON.parse(game).rounds[0].deadline, undefined);
r = tg('Clio RS', 500); assert.equal(r.route, 'identify');
console.log('OK: partida web amb temps límit');
