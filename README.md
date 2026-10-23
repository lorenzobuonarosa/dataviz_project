# Imprese nelle province italiane

Dashboard interattiva (mappa coropletica, KPI, classifica, andamento 2021–2025) con filtri per anno, settore, dimensione d'impresa e macroarea.

## Struttura

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

I confini sono agganciati ai dati tramite il codice ISTAT a 3 cifre (`prov_istat_code` nel TopoJSON, `cod_istat_prov` nel dataset).

## Avvio in locale

I dati sono caricati con `fetch`, quindi serve un web server (aprendo `index.html` con `file://` il browser blocca la richiesta):

```
python3 -m http.server 8000
```

poi apri http://localhost:8000. Il tema si può forzare con `?theme=dark`, `?theme=light` o `?theme=auto`.
