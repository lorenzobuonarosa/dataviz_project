// Runtime minimale della dashboard: tema, parametri/filtri e caricamento dei dati.
(function () {
  var q = new URLSearchParams(location.search), t = q.get('theme');
  if (t !== 'dark' && t !== 'light' && t !== 'auto') t = 'light';
  if (t === 'auto') t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);

  var DEF = {
    anno: 2025,
    settori: ['Turismo', 'Industria', 'Agricoltura', 'Servizi'],
    dimensioni: ['Micro', 'Piccola', 'Media-grande'],
    macroaree: ['Nord-Ovest', 'Nord-Est', 'Centro', 'Sud', 'Isole'],
    metrica: 'fatturato',
    sel: null
  };
  var SOURCES = {
    imprese_province: 'data/imprese_province.json',
    confini_province: 'data/limits_IT_provinces.json' // TopoJSON
  };

  var P = JSON.parse(JSON.stringify(DEF)), cbs = [], DATA = {};
  function run() { cbs.forEach(function (f) { f(); }); }

  Object.keys(SOURCES).forEach(function (id) {
    DATA[id] = { status: 'loading' };
    fetch(SOURCES[id])
      .then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.json(); })
      .then(function (d) { DATA[id] = { status: 'ok', data: d, columns: [] }; })
      .catch(function (e) { console.error('Caricamento di ' + SOURCES[id] + ' fallito:', e); DATA[id] = { status: 'error' }; })
      .then(run);
  });

  window.dash = {
    colors: ['var(--c1)', 'var(--c2)', '#2e9d6b', '#8a4fd0', '#c43c6a', '#0e8fa3', '#8c7a1f', '#777'],
    data: function (id) { return DATA[id] || { status: 'missing' }; },
    params: function () { return P; },
    setParams: function (o) { Object.assign(P, JSON.parse(JSON.stringify(o))); run(); },
    resetParams: function () { P = JSON.parse(JSON.stringify(DEF)); run(); },
    onData: function (f) { cbs.push(f); f(); },
    setLink: function () {}
  };
  window.addEventListener('resize', run);
})();
