(function () {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const TOPO_OBJECT = 'limits_IT_provinces';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in (attrs || {})) e.setAttribute(k, attrs[k]); return e; };

  // ---------- formattazione all'italiana ----------
  const nf = (v, dec) => {
    if (v == null || !isFinite(v)) return '—';
    const s = Math.abs(v).toFixed(dec || 0);
    const parts = s.split('.');
    const g = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 && +s !== 0 ? '−' : '') + g + (parts[1] ? ',' + parts[1] : '');
  };
  const sg = (v, dec) => (v > 0 && +Math.abs(v).toFixed(dec) !== 0 ? '+' : '') + nf(v, dec);

  const METRICS = {
    fatturato: { label: 'Fatturato (mln €)', unit: 'mln €', kind: 'abs', desc: 'Somma del fatturato delle imprese che rispettano i filtri, in milioni di euro.' },
    imprese: { label: 'Numero imprese', unit: 'imprese', kind: 'abs', desc: 'Somma del numero di imprese che rispettano i filtri.' },
    occupati: { label: 'Occupati', unit: 'occupati', kind: 'abs', desc: 'Somma degli occupati delle imprese che rispettano i filtri.' },
    variazione: { label: 'Variazione % del fatturato', unit: '%', kind: 'var', desc: 'Media delle variazioni percentuali del fatturato, ponderata sul fatturato.' }
  };
  function fmtV(m, v, o) {
    o = o || {};
    if (v == null || !isFinite(v)) return 'n.d.';
    if (m === 'fatturato') return (o.big && Math.abs(v) >= 100000) ? nf(v / 1000, 1) + ' mld €' : nf(v, Math.abs(v) >= 100 ? 0 : 1) + ' mln €';
    if (m === 'variazione') return sg(v, 1) + '%';
    return nf(v, 0) + (o.unit ? ' ' + METRICS[m].unit : '');
  }
  const fmtB = (m, v) => m === 'variazione' ? sg(v, 1) + '%' : nf(v, Math.abs(v) >= 100 || m !== 'fatturato' ? 0 : 1);

  // ---------- proiezione cartografica (Albers conica equivalente, per l'Italia) ----------
  const RAD = Math.PI / 180, L0 = 12.5 * RAD, P0 = 42 * RAD, P1 = 36 * RAD, P2 = 46 * RAD;
  const AN = (Math.sin(P1) + Math.sin(P2)) / 2, AC = Math.cos(P1) ** 2 + 2 * AN * Math.sin(P1), AR0 = Math.sqrt(AC - 2 * AN * Math.sin(P0)) / AN;
  function project(lon, lat) {
    const r = Math.sqrt(AC - 2 * AN * Math.sin(lat * RAD)) / AN, th = AN * (lon * RAD - L0);
    return [r * Math.sin(th), -(AR0 - r * Math.cos(th))];
  }

  // ---------- stato ----------
  let ROWS = null, GEO = null, MAP = null, INFO = null, BYYEAR = null, YEARS = [], LISTS = null, CUR = null, built = false, mapBuilt = false;
  const arr = (x) => Array.isArray(x) ? x : (x == null || x === '' ? [] : [x]);
  const pad3 = (c) => String(c).padStart(3, '0');

  function prepare(rows, topo) {
    if (prepare.r === rows && prepare.g === topo) return;
    prepare.r = rows; prepare.g = topo; mapBuilt = false;
    ROWS = rows.map((r) => ({ cod: pad3(r.cod_istat_prov), anno: +r.anno, settore: r.settore, dim: r.dimensione_impresa, macro: r.macroarea, f: +r.fatturato_mln_eur, i: +r.n_imprese, o: +r.occupati, v: +r.var_fatturato_perc }));
    INFO = new Map();
    const set = { settori: new Set(), dim: new Set(), macro: new Set(), anni: new Set() };
    rows.forEach((r) => {
      const c = pad3(r.cod_istat_prov);
      if (!INFO.has(c)) INFO.set(c, { cod: c, sigla: r.sigla, nome: r.provincia, regione: r.regione, macro: r.macroarea });
      set.settori.add(r.settore); set.dim.add(r.dimensione_impresa); set.macro.add(r.macroarea); set.anni.add(+r.anno);
    });
    YEARS = [...set.anni].sort((a, b) => a - b);
    LISTS = { settori: [...set.settori], dimensioni: [...set.dim], macroaree: [...set.macro] };
    BYYEAR = new Map(YEARS.map((y) => [y, []]));
    ROWS.forEach((r) => BYYEAR.get(r.anno).push(r));
    // confini: TopoJSON -> feature GeoJSON, una per provincia (join sul codice ISTAT a 3 cifre)
    GEO = topojson.feature(topo, topo.objects[TOPO_OBJECT]).features.map((f) => ({
      cod: pad3(f.properties.prov_istat_code), sigla: f.properties.prov_acr, nome: f.properties.prov_name, regione: f.properties.reg_name, geometry: f.geometry
    }));
  }

  function buildGeometry() {
    const feats = GEO.map((g) => {
      const gm = g.geometry;
      const polys = gm.type === 'Polygon' ? [gm.coordinates] : gm.coordinates;
      return { g, polys: polys.map((poly) => poly.map((ring) => ring.map((p) => project(p[0], p[1])))) };
    });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    feats.forEach((f) => f.polys.forEach((poly) => poly.forEach((ring) => ring.forEach((p) => {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }))));
    const W = 1000, k = W / (x1 - x0), H = (y1 - y0) * k;
    feats.forEach((f) => {
      let d = '';
      f.polys.forEach((poly) => poly.forEach((ring) => {
        let px = 0, py = 0;
        ring.forEach((p, i) => {
          const x = (p[0] - x0) * k, y = (p[1] - y0) * k;
          if (i === 0) { d += 'M' + x.toFixed(1) + ' ' + y.toFixed(1); px = x; py = y; }
          else if (i === ring.length - 1 || Math.hypot(x - px, y - py) >= 0.35) { d += 'L' + x.toFixed(1) + ' ' + y.toFixed(1); px = x; py = y; }
        });
        d += 'Z';
      }));
      f.g.d = d; f.polys = null;
    });
    return { W, H };
  }

  // ---------- aggregazione ----------
  function readP() {
    const p = dash.params();
    const pick = (x, all) => { const a = arr(x); return new Set(a.length ? a : all); };
    const anno = YEARS.includes(+p.anno) ? +p.anno : YEARS[YEARS.length - 1];
    return { anno, settori: pick(p.settori, LISTS.settori), dim: pick(p.dimensioni, LISTS.dimensioni), macro: pick(p.macroaree, LISTS.macroaree), m: METRICS[p.metrica] ? p.metrica : 'fatturato', sel: p.sel ? pad3(p.sel) : null };
  }
  function valOf(a) { return { fatturato: a.f, imprese: a.i, occupati: a.o, variazione: a.f > 0 ? a.w / a.f : null }; }
  function aggYear(year, P) {
    const m = new Map();
    (BYYEAR.get(year) || []).forEach((r) => {
      if (!P.settori.has(r.settore) || !P.dim.has(r.dim) || !P.macro.has(r.macro)) return;
      let a = m.get(r.cod); if (!a) { a = { f: 0, i: 0, o: 0, w: 0 }; m.set(r.cod, a); }
      a.f += r.f; a.i += r.i; a.o += r.o; a.w += r.v * r.f;
    });
    m.forEach((a) => { a.val = valOf(a); });
    return m;
  }
  function natOf(m) {
    const t = { f: 0, i: 0, o: 0, w: 0 };
    m.forEach((a) => { t.f += a.f; t.i += a.i; t.o += a.o; t.w += a.w; });
    return { tot: valOf(t), n: m.size };
  }

  // ---------- scale di colore ----------
  const SEQ = [14, 30, 46, 62, 80, 100];
  const mix = (c, pct) => 'color-mix(in srgb, ' + c + ' ' + pct + '%, var(--color-panel))';
  function makeScale(m, vals) {
    if (!vals.length) return null;
    if (METRICS[m].kind === 'abs') {
      const s = vals.slice().sort((a, b) => a - b);
      const thr = [1, 2, 3, 4, 5].map((i) => d3.quantile(s, i / 6));
      const b = [s[0]].concat(thr, [s[s.length - 1]]);
      return { div: false, b, cls: (v) => Math.min(5, d3.bisectRight(thr, v)), color: (i) => mix(dash.colors[0], SEQ[i]) };
    }
    const mx = Math.max(...vals.map((v) => Math.abs(v)), 0.01);
    const steps = [0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20, 25, 50, 100];
    const step = steps.find((x) => x >= mx / 3) || mx / 3;
    const b = [-3, -2, -1, 0, 1, 2, 3].map((k) => k * step);
    const str = [100, 62, 28, 28, 62, 100];
    return { div: true, b, cls: (v) => Math.max(0, Math.min(5, Math.floor((v + 3 * step) / step))), color: (i) => mix(i < 3 ? dash.colors[1] : dash.colors[0], str[i]) };
  }
  const NODATA = 'var(--cds-chart-muted)';

  // ---------- tooltip ----------
  function setTip(tip, lines) {
    tip.replaceChildren();
    lines.forEach((l) => { const d = el('div', l.c || '', null); if (l.b) { const b = el('b', '', l.t); d.appendChild(b); } else d.textContent = l.t; tip.appendChild(d); });
  }
  function moveTip(tip, box, e) {
    tip.style.display = 'block';
    const r = box.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + tip.offsetWidth > r.width) x = e.clientX - r.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > r.height) y = e.clientY - r.top - tip.offsetHeight - 14;
    tip.style.left = Math.max(0, x) + 'px'; tip.style.top = Math.max(0, y) + 'px';
  }

  // ---------- controlli ----------
  function buildControls() {
    if (built) return; built = true;
    const anno = $('#f-anno');
    YEARS.forEach((y) => anno.appendChild(new Option(String(y), String(y))));
    anno.addEventListener('change', () => dash.setParams({ anno: +anno.value }));
    const met = $('#f-metrica');
    Object.keys(METRICS).forEach((k) => met.appendChild(new Option(METRICS[k].label, k)));
    met.addEventListener('change', () => dash.setParams({ metrica: met.value }));
    [['#f-settori', 'settori'], ['#f-dimensioni', 'dimensioni'], ['#f-macroaree', 'macroaree']].forEach(([sel, key]) => {
      const box = $(sel), items = LISTS[key];
      items.forEach((it) => { const b = el('button', 'pv-chip', it); b.type = 'button'; b.dataset.v = it; b.title = 'Clic: attiva/disattiva · doppio clic: solo questo'; box.appendChild(b); });
      box.addEventListener('dblclick', (e) => { const b = e.target.closest('button'); if (b && b.dataset.v) dash.setParams({ [key]: [b.dataset.v] }); });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.all) { dash.setParams({ [key]: items.slice() }); return; }
        const a = arr(dash.params()[key]); const cur = new Set(a.length ? a : items);
        if (cur.has(b.dataset.v)) { if (cur.size === 1) return; cur.delete(b.dataset.v); } else cur.add(b.dataset.v);
        dash.setParams({ [key]: items.filter((x) => cur.has(x)) });
      });
    });
    $('#f-reset').addEventListener('click', () => dash.resetParams());
    $('#side-clear').addEventListener('click', () => dash.setParams({ sel: null }));
  }
  function syncControls(P) {
    $('#f-anno').value = String(P.anno);
    $('#f-metrica').value = P.m;
    [['#f-settori', P.settori, LISTS.settori], ['#f-dimensioni', P.dim, LISTS.dimensioni], ['#f-macroaree', P.macro, LISTS.macroaree]].forEach(([sel, set, items]) => {
      $(sel).querySelectorAll('button').forEach((b) => {
        const on = b.dataset.all ? items.every((x) => set.has(x)) : set.has(b.dataset.v);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  }
  const toggleSel = (cod) => dash.setParams({ sel: CUR && CUR.P.sel === cod ? null : cod });

  // ---------- mappa ----------
  function ensureMap() {
    if (mapBuilt) return; mapBuilt = true;
    const dim = buildGeometry();
    const box = $('#mapbox'); box.replaceChildren();
    const svg = sv('svg', { viewBox: '0 0 ' + dim.W + ' ' + dim.H.toFixed(1), role: 'img', 'aria-label': 'Mappa coropletica delle province italiane' });
    const g = sv('g'); svg.appendChild(g);
    const hl = sv('path', { class: 'pv-hl' }), sp = sv('path', { class: 'pv-selp' });
    svg.appendChild(hl); svg.appendChild(sp);
    const tip = el('div', 'pv-tip'); tip.id = 'map-tip';
    box.appendChild(svg); box.appendChild(tip);
    GEO.forEach((f) => {
      const p = sv('path', { class: 'pv-prov', d: f.d });
      f.el = p; g.appendChild(p);
      p.addEventListener('mousemove', (e) => {
        hl.setAttribute('d', f.d); if (!CUR) return;
        const info = CUR.byCod.get(f.cod), lines = [];
        if (info) {
          const M = CUR.P.m;
          lines.push({ t: info.nome + ' (' + info.sigla + ')', b: 1 }, { t: info.regione, c: 'm' }, { t: METRICS[M].label + ' · ' + CUR.P.anno + ': ' + fmtV(M, info.v, { unit: 1 }) });
        } else if (INFO.has(f.cod)) {
          const i2 = INFO.get(f.cod);
          lines.push({ t: f.nome + ' (' + f.sigla + ')', b: 1 }, { t: f.regione, c: 'm' }, { t: 'Nessun dato per i filtri attivi' });
        } else {
          lines.push({ t: f.nome + ' (' + f.sigla + ')', b: 1 }, { t: f.regione, c: 'm' }, { t: 'Non agganciata ai dati: il codice ISTAT ' + f.cod + ' non è nel dataset', c: 'm' });
        }
        setTip(tip, lines); moveTip(tip, box, e);
      });
      p.addEventListener('mouseleave', () => { hl.setAttribute('d', ''); tip.style.display = 'none'; });
      p.addEventListener('click', () => { if (CUR && CUR.byCod.has(f.cod)) toggleSel(f.cod); });
    });
    MAP = { svg, hl, sp, tip };
  }

  function drawMap(P, scale, byCod) {
    ensureMap();
    $('#mapbox').classList.remove('dash-skeleton');
    GEO.forEach((f) => {
      const info = byCod.get(f.cod);
      f.el.style.fill = info && scale ? scale.color(scale.cls(info.v)) : NODATA;
      f.el.classList.toggle('has', !!info);
      f.el.setAttribute('aria-label', f.nome + (info ? ': ' + fmtV(P.m, info.v, { unit: 1 }) : ': nessun dato'));
    });
    const sel = P.sel && GEO.find((f) => f.cod === P.sel);
    MAP.sp.setAttribute('d', sel ? sel.d : '');
    $('#map-title').textContent = METRICS[P.m].label + ' · ' + P.anno;
    $('#map-sub').textContent = METRICS[P.m].desc + (METRICS[P.m].kind === 'abs' ? ' Colori per quantili (6 classi di uguale numerosità).' : ' Scala divergente centrata sullo zero.');
    const lg = $('#legenda'); lg.replaceChildren();
    if (scale) {
      for (let i = 0; i < 6; i++) {
        const it = el('span', 'pv-lg'); const sw = el('span', 'pv-sw'); sw.style.background = scale.color(i);
        it.appendChild(sw); it.appendChild(document.createTextNode(fmtB(P.m, scale.b[i]) + ' – ' + fmtB(P.m, scale.b[i + 1])));
        lg.appendChild(it);
      }
    }
    const nd = el('span', 'pv-lg'); const sw = el('span', 'pv-sw'); sw.style.background = NODATA; nd.appendChild(sw); nd.appendChild(document.createTextNode('Senza dati'));
    lg.appendChild(nd);
  }

  function drawNote() {
    const geoCods = new Set(GEO.map((g) => g.cod));
    const nodata = [...INFO.values()].filter((i) => !geoCods.has(i.cod));
    const nogeo = GEO.filter((g) => !INFO.has(g.cod));
    const note = $('#map-note');
    if (!nodata.length && !nogeo.length) { note.textContent = 'Tutte le ' + INFO.size + ' province del dataset sono agganciate ai confini tramite il codice ISTAT a 3 cifre.'; return; }
    const regs = [...new Set(nogeo.map((g) => g.regione))].join(', ');
    note.textContent = (INFO.size - nodata.length) + ' province su ' + INFO.size + ' agganciate ai confini (join sul codice ISTAT a 3 cifre). Non agganciate: ' +
      nodata.map((i) => i.nome + ' (' + i.cod + ')').join(', ') + '. Il file dei confini riporta ' + nogeo.length + ' aree (' + regs + ': ' +
      nogeo.map((g) => g.nome + ' ' + g.cod).join(', ') + ') con codici assenti nel dataset e le disegna in grigio. Le province non agganciate restano comunque nei KPI e nella classifica.';
  }

  // ---------- KPI ----------
  function setKpi(id, label, value, sub, color) {
    const r = $(id); r.children[0].textContent = label;
    const v = r.children[1]; v.textContent = value; v.classList.remove('dash-skeleton'); v.style.color = color || '';
    r.children[2].textContent = sub;
  }
  function drawKpis(P, list, natNow, natPrev) {
    const M = P.m, kind = METRICS[M].kind;
    if (!list.length) {
      ['#kpi-1', '#kpi-2', '#kpi-3', '#kpi-4'].forEach((id, i) => setKpi(id, ['Totale nazionale', 'Prima provincia', 'Ultima provincia', 'Rispetto all’anno precedente'][i], 'n.d.', 'Nessun dato con i filtri attivi'));
      return;
    }
    const top = list[0], bot = list[list.length - 1];
    setKpi('#kpi-1', kind === 'abs' ? 'Totale nazionale · ' + METRICS[M].label : 'Variazione media nazionale (ponderata sul fatturato)', fmtV(M, natNow.tot[M], { big: 1, unit: 1 }), P.anno + ' · ' + list.length + ' province con dati');
    setKpi('#kpi-2', 'Prima provincia · ' + top.info.nome, fmtV(M, top.v, { big: 1 }), top.info.regione + ' · ' + P.anno);
    setKpi('#kpi-3', 'Ultima provincia · ' + bot.info.nome, fmtV(M, bot.v, { big: 1 }), bot.info.regione + ' · ' + P.anno);
    const y1 = P.anno - 1;
    if (!natPrev) { setKpi('#kpi-4', 'Rispetto al ' + y1, 'n.d.', 'Primo anno della serie: nessun anno precedente'); return; }
    const a = natNow.tot[M], b = natPrev.tot[M];
    let txt = 'n.d.', d = null;
    if (kind === 'abs') { if (b > 0) { d = (a / b - 1) * 100; txt = sg(d, 1) + '%'; } }
    else if (a != null && b != null) { d = a - b; txt = sg(d, 1) + ' p.p.'; }
    setKpi('#kpi-4', 'Rispetto al ' + y1 + ' (stessi filtri)', txt, kind === 'abs' ? 'Da ' + fmtV(M, b, { big: 1, unit: 1 }) + ' a ' + fmtV(M, a, { big: 1, unit: 1 }) : 'Media nazionale ' + y1 + ': ' + fmtV(M, b), d == null || Math.abs(d) < 0.05 ? '' : (d > 0 ? 'var(--color-ok)' : 'var(--color-bad)'));
  }

  // ---------- classifica ----------
  function drawRank(P, list) {
    const M = P.m, top = list.slice(0, 10), box = $('#rk-list'); box.replaceChildren();
    $('#rk-title').textContent = 'Prime 10 province · ' + METRICS[M].label;
    $('#rk-sub').textContent = P.anno + ' · stessi filtri della mappa. Clicca una barra per aprire l’andamento della provincia.';
    const mx = Math.max(...top.map((t) => Math.abs(t.v)), 0.0001);
    const geoCods = new Set(GEO.map((g) => g.cod));
    top.forEach((t, i) => {
      const b = el('button', 'pv-rk'); b.type = 'button'; b.dataset.key = t.cod; b.setAttribute('aria-pressed', P.sel === t.cod ? 'true' : 'false');
      b.appendChild(el('span', 'pv-rk-n', String(i + 1)));
      const nm = el('span', 'pv-rk-name', t.info.nome + ' '); nm.appendChild(el('small', '', t.info.sigla + (geoCods.has(t.cod) ? '' : ' · non in mappa'))); b.appendChild(nm);
      const tr = el('span', 'pv-rk-track'), bar = el('span', 'pv-rk-bar');
      bar.style.width = (Math.abs(t.v) / mx * 100).toFixed(1) + '%'; bar.style.background = t.v < 0 ? dash.colors[1] : dash.colors[0];
      tr.appendChild(bar); b.appendChild(tr);
      b.appendChild(el('span', 'pv-rk-v', fmtV(M, t.v, { big: 0 })));
      b.addEventListener('click', () => toggleSel(t.cod));
      box.appendChild(b);
    });
    if (!top.length) box.appendChild(el('div', 'pv-empty', 'Nessun dato con i filtri attivi.'));
  }

  // ---------- pannello provincia ----------
  function drawSide(P, byCod, list) {
    const empty = $('#side-empty'), body = $('#side-body'), clear = $('#side-clear');
    const info = P.sel && INFO.get(P.sel);
    if (!info) { empty.hidden = false; body.hidden = true; clear.hidden = true; $('#side-title').textContent = 'Provincia selezionata'; $('#side-sub').textContent = ''; return; }
    empty.hidden = true; body.hidden = false; clear.hidden = false;
    const M = P.m, kind = METRICS[M].kind;
    $('#side-title').textContent = info.nome + ' (' + info.sigla + ')';
    $('#side-sub').textContent = info.regione + ' · ' + info.macro + ' · ' + METRICS[M].label;
    const prov = [], nat = [];
    YEARS.forEach((y) => {
      const m = y === P.anno ? CUR.cur : aggYear(y, P);
      const a = m.get(P.sel);
      prov.push({ y, v: a ? a.val[M] : null });
      const n = natOf(m);
      nat.push({ y, v: m.size ? (kind === 'abs' ? n.tot[M] / n.n : n.tot[M]) : null });
    });
    const key = $('#side-key'); key.replaceChildren();
    [[dash.colors[0], info.nome, false], ['var(--color-fg-muted)', kind === 'abs' ? 'Media nazionale per provincia' : 'Media nazionale ponderata', true]].forEach(([c, t, dashed]) => {
      const s = el('span', 'pv-lg'); const l = sv('svg', { width: 18, height: 8, 'aria-hidden': 'true' });
      l.appendChild(sv('line', { x1: 0, x2: 18, y1: 4, y2: 4, stroke: c, 'stroke-width': 2, 'stroke-dasharray': dashed ? '4 3' : 'none' }));
      s.appendChild(l); s.appendChild(document.createTextNode(t)); key.appendChild(s);
    });
    drawLine($('#side-chart'), prov, nat, P, info);
    const it = prov.find((p) => p.y === P.anno), nt = nat.find((p) => p.y === P.anno);
    const rank = list.findIndex((t) => t.cod === P.sel) + 1;
    let gap = 'n.d.';
    if (it && it.v != null && nt && nt.v != null) gap = kind === 'abs' ? (nt.v ? sg((it.v / nt.v - 1) * 100, 1) + '% sulla media' : 'n.d.') : sg(it.v - nt.v, 1) + ' p.p.';
    const sum = $('#side-sum'); sum.replaceChildren();
    [[info.nome + ' · ' + P.anno, it ? fmtV(M, it.v, { big: 1 }) : 'n.d.'], ['Media nazionale · ' + P.anno, nt ? fmtV(M, nt.v, { big: 1 }) : 'n.d.'], ['Scarto dalla media', gap], ['Posizione in classifica', rank ? rank + 'ª su ' + list.length : 'n.d.']].forEach(([l, v]) => {
      const d = el('div'); d.appendChild(el('div', 'pv-lab', l)); d.appendChild(el('div', 'pv-sum-v', v)); sum.appendChild(d);
    });
  }

  function drawLine(box, prov, nat, P, info) {
    box.replaceChildren();
    const M = P.m, W = Math.max(box.clientWidth || 300, 240), H = 210, mt = 10, mb = 26, mr = 14;
    const vals = prov.concat(nat).map((d) => d.v).filter((v) => v != null);
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img', 'aria-label': 'Andamento ' + YEARS[0] + '–' + YEARS[YEARS.length - 1] + ' di ' + info.nome + ' e media nazionale' });
    box.appendChild(svg);
    if (!vals.length) { const t = sv('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }); t.textContent = 'Nessun dato con i filtri attivi'; svg.appendChild(t); return; }
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (METRICS[M].kind === 'var') { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (lo === hi) { lo -= 1; hi += 1; }
    const y = d3.scaleLinear([lo, hi], [H - mb, mt]).nice(4);
    const ticks = y.ticks(4);
    const axis = sv('g'); svg.appendChild(axis);
    const labels = ticks.map((t) => { const x = sv('text', { 'text-anchor': 'end', 'dominant-baseline': 'middle' }); x.textContent = fmtB(M, t); axis.appendChild(x); return x; });
    let ml = 0; labels.forEach((x) => { ml = Math.max(ml, x.getComputedTextLength ? x.getComputedTextLength() : 0); }); ml = (ml || 40) + 10;
    const x = d3.scalePoint(YEARS, [ml + 8, W - mr - 8]).padding(0.2);
    ticks.forEach((t, i) => {
      labels[i].setAttribute('x', ml - 6); labels[i].setAttribute('y', y(t));
      axis.appendChild(sv('line', { x1: ml, x2: W - mr, y1: y(t), y2: y(t), stroke: t === 0 && METRICS[M].kind === 'var' ? 'var(--cds-chart-reference)' : 'var(--cds-chart-grid)', 'stroke-width': 1 }));
    });
    YEARS.forEach((yr) => { const t = sv('text', { x: x(yr), y: H - 8, 'text-anchor': 'middle' }); t.textContent = String(yr); svg.appendChild(t); });
    const ln = d3.line().defined((d) => d.v != null).x((d) => x(d.y)).y((d) => y(d.v));
    const p1 = sv('path', { d: ln(nat) || '', fill: 'none', 'stroke-width': 2, 'stroke-dasharray': '4 3', 'stroke-linecap': 'butt' }); p1.style.stroke = 'var(--color-fg-muted)'; svg.appendChild(p1);
    const p2 = sv('path', { d: ln(prov) || '', fill: 'none', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); p2.style.stroke = dash.colors[0]; svg.appendChild(p2);
    prov.forEach((d) => { if (d.v == null) return; const c = sv('circle', { cx: x(d.y), cy: y(d.v), r: d.y === P.anno ? 5 : 3 }); c.style.fill = dash.colors[0]; svg.appendChild(c); });
    const rule = sv('line', { y1: mt, y2: H - mb, 'stroke-width': 1, visibility: 'hidden' }); rule.style.stroke = 'var(--cds-chart-axis)'; svg.appendChild(rule);
    const tip = el('div', 'pv-tip'); box.appendChild(tip);
    const hit = sv('rect', { x: ml, y: 0, width: W - ml, height: H, fill: 'transparent' }); svg.appendChild(hit);
    hit.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
      let best = YEARS[0], bd = Infinity; YEARS.forEach((yr) => { const dd = Math.abs(x(yr) - px); if (dd < bd) { bd = dd; best = yr; } });
      rule.setAttribute('x1', x(best)); rule.setAttribute('x2', x(best)); rule.setAttribute('visibility', 'visible');
      const a = prov.find((d) => d.y === best), b = nat.find((d) => d.y === best);
      setTip(tip, [{ t: String(best), c: 'm' }, { t: info.nome + ': ' + fmtV(M, a && a.v, { unit: 1 }) }, { t: 'Media nazionale: ' + fmtV(M, b && b.v, { unit: 1 }) }]);
      moveTip(tip, box, e);
    });
    hit.addEventListener('mouseleave', () => { rule.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; });
  }

  // ---------- render ----------
  function render() {
    const P = readP();
    syncControls(P);
    const cur = aggYear(P.anno, P);
    const prevM = YEARS.includes(P.anno - 1) ? aggYear(P.anno - 1, P) : null;
    const list = [];
    cur.forEach((a, cod) => { const v = a.val[P.m]; if (v != null && isFinite(v)) list.push({ cod, v, info: INFO.get(cod) }); });
    list.sort((p, q) => q.v - p.v || p.info.nome.localeCompare(q.info.nome, 'it'));
    const byCod = new Map(list.map((t) => [t.cod, { v: t.v, nome: t.info.nome, sigla: t.info.sigla, regione: t.info.regione }]));
    CUR = { P, cur, byCod };
    const natNow = natOf(cur), natPrev = prevM && prevM.size ? natOf(prevM) : null;
    const scale = makeScale(P.m, list.map((t) => t.v));
    drawMap(P, scale, byCod);
    drawNote();
    drawKpis(P, list, natNow, natPrev);
    drawRank(P, list);
    drawSide(P, byCod, list);
    $('#pv-take').textContent = list.length
      ? 'Nel ' + P.anno + (METRICS[P.m].kind === 'abs' ? ' il totale nazionale è ' + fmtV(P.m, natNow.tot[P.m], { big: 1, unit: 1 }) : ' la variazione media del fatturato è ' + fmtV(P.m, natNow.tot[P.m])) + '; al primo posto ' + list[0].info.nome + ' (' + fmtV(P.m, list[0].v, { big: 1 }) + '), ultima ' + list[list.length - 1].info.nome + ' (' + fmtV(P.m, list[list.length - 1].v, { big: 1 }) + ').'
      : 'Nessuna provincia ha dati con i filtri attivi.';
  }

  function failed(box, msg) { box.replaceChildren(el('div', 'pv-failed', msg || 'Failed to load')); box.classList.remove('dash-skeleton'); }

  dash.onData(() => {
    const a = dash.data('imprese_province'), b = dash.data('confini_province');
    if (a.status === 'ok' && b.status === 'ok') {
      prepare(a.data, b.data);
      buildControls();
      render();
      return;
    }
    if (['error', 'connect', 'declined', 'missing'].includes(a.status) || ['error', 'connect', 'declined', 'missing'].includes(b.status)) {
      mapBuilt = false; failed($('#mapbox'), 'Impossibile caricare i dati: servi la cartella con un web server (es. python3 -m http.server).');
    }
  });
})();
