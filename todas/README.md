# ToDas – Public Transportation Route and Fare Finder (Dasmariñas City)

Run it through a web server (browsers block `fetch()` on `file://`):

    python3 -m http.server 8000     # then open http://localhost:8000

| Path | What it holds |
|---|---|
| `index.html` | Page structure only |
| `css/styles.css` | All styling |
| `assets/todas-logo.png` | Logo |
| `data/road-network.json` | OpenStreetMap road network (compact format) |
| `data/places.json` | Barangays and landmarks |
| `js/config.js` | Shared constants, landmark search words |
| `js/road-network.js` | Road graph, nearest-node lookup |
| `js/place-search.js` | Reading / searching places |
| `js/legacy-road-search.js` | Old shortest-road search (unused) |
| `js/route-directory.js` | **Jeepney route list (R01–R07, R10, jr01–jr05). Add new routes here** |
| `js/route-builder.js` | Builds rideable road pieces from the route list |
| `js/trip-planner.js` | Cheapest walk + jeepney trip |
| `js/app-state.js` | DOM references and shared page state |
| `js/map-view.js` | Canvas drawing, zoom / pan maths |
| `js/location-picker.js` | A / B search boxes and map clicks |
| `js/trip-controls.js` | Find route button, route directory table |
| `js/fare-panel.js` | Fare rule and fare / trip-progress panel |
| `js/pin-mode.js` | Temporary pins |
| `js/data-loader.js` | Loads the two JSON files, builds map and routes |
| `js/pan-zoom.js` | Mouse / touch / button handlers |
| `js/main.js` | Start-up |

Scripts are plain (non-module) files that share globals, so the order in `index.html` matters.
