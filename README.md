# Progetti di data visualization

Un unico sito GitHub Pages con un progetto per cartella. Ogni cartella è un sottopercorso:

```
index.html                 pagina iniziale con l'elenco dei progetti
province/                  Imprese nelle province italiane  →  .../dataviz_project/province/
```

## Aggiungere un progetto

1. Crea una cartella (es. `nuovo-progetto/`) con il suo `index.html`. Nel progetto usa percorsi relativi (`css/stile.css`, non `/css/stile.css`), così funziona sotto qualsiasi sottopercorso.
2. Aggiungi un blocco `<li>` con il link nell'elenco di `index.html`.
3. Unisci le modifiche a `main`: GitHub Pages ripubblica il sito da solo.

## Avvio in locale

Le pagine caricano i dati con `fetch`, quindi serve un web server (con `file://` il browser blocca la richiesta). Dalla radice della repo:

```
python3 -m http.server 8000
```

poi apri http://localhost:8000.

## province/ — Imprese nelle province italiane

Dashboard interattiva (mappa coropletica, KPI, classifica, andamento 2021–2025) con filtri per anno, settore, dimensione d'impresa e macroarea.

```
index.html                       pagina (solo markup)
css/theme.css                    variabili di colore, tema chiaro/scuro
css/fonts.css                    @font-face di Barlow
css/dashboard.css                stili della dashboard
js/dash-runtime.js               tema, parametri/filtri, caricamento dei dati
js/dashboard.js                  logica: aggregazioni, mappa, KPI, classifica, grafico
js/embed.js                      invia l'altezza al parent via postMessage (uso in iframe)
js/vendor/                       d3 7.9.0, topojson-client 3.1.0
fonts/                           Barlow 400/500/600 (woff)
data/imprese_province.json       dati delle imprese per provincia
data/limits_IT_provinces.json    confini provinciali in TopoJSON
```

I confini sono agganciati ai dati tramite il codice ISTAT a 3 cifre (`prov_istat_code` nel TopoJSON, `cod_istat_prov` nel dataset). Il tema si può forzare con `?theme=dark`, `?theme=light` o `?theme=auto`.
