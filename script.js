/* SIGMA-P trip planner for Dasmariñas, Cavite.
   NOTE: places, links, times and fares below are SAMPLE data. Replace NODES and EDGES
   with real stops, jeepney/tricycle/UV routes, travel times and LTFRB or local fares. */

const STUDENT_DISCOUNT = 0.2; // student fare = base fare less 20%
const BOARDING_PENALTY = 4; // comfort cost added for every ride you board
const MODES = {
  jeep: { name: "Jeepney", color: "#9b3fd1", comfort: 1.6 },
  trike: { name: "Tricycle", color: "#2b5fd9", comfort: 2.0 },
  uv: { name: "UV Express", color: "#e8b800", comfort: 1.0 },
};

/* id: [full name, short map label, drawn-map x, drawn-map y, other names people may type, [lat, lng] or null, search text used to find the real spot] */
const NODES = {
  cityhall: [
    "Dasmariñas City Hall",
    "City Hall",
    120,
    235,
    ["City Hall"],
    null,
    "Dasmariñas City Hall, Cavite",
  ],
  district: [
    "District Dasmariñas",
    "District",
    200,
    290,
    ["The District Dasmariñas", "District"],
    null,
    "The District Dasmariñas, Cavite",
  ],
  sm: [
    "SM Dasmariñas Main Entrance",
    "SM Dasma",
    245,
    365,
    ["SM City Dasmariñas", "SM"],
    [14.3015, 120.9567],
    null,
  ],
  robinsons: [
    "Robinsons Place Dasmariñas",
    "Robinsons",
    270,
    410,
    ["Robinsons"],
    null,
    "Robinsons Place Dasmariñas, Cavite",
  ],
  dlsu: [
    "De La Salle Dasmariñas Gate 1",
    "DLSU-D",
    335,
    300,
    ["DLSU Dasma, 4103", "DLSU Dasma", "DLSU-D", "DLSU", "De La Salle"],
    [14.32356, 120.95976],
    null,
  ],
  paliparan: [
    "Paliparan",
    "Paliparan",
    350,
    395,
    [],
    null,
    "Paliparan, Dasmariñas, Cavite",
  ],
  salitran: [
    "Salitran",
    "Salitran",
    70,
    265,
    [],
    null,
    "Salitran, Dasmariñas, Cavite",
  ],
  sampaloc: [
    "Sampaloc",
    "Sampaloc",
    190,
    215,
    [],
    null,
    "Sampaloc, Dasmariñas, Cavite",
  ],
};

/* [from, to, mode, km, minutes, base fare in pesos] – SAMPLE values, roads work both ways */
const EDGES = [
  ["cityhall", "sampaloc", "jeep", 3.1, 10, 13],
  ["cityhall", "district", "jeep", 2.4, 8, 13],
  ["cityhall", "salitran", "jeep", 4.0, 13, 15],
  ["district", "sampaloc", "trike", 1.6, 6, 20],
  ["district", "dlsu", "jeep", 4.2, 13, 15],
  ["sampaloc", "sm", "jeep", 2.2, 8, 13],
  ["sampaloc", "dlsu", "jeep", 3.4, 11, 13],
  ["sm", "robinsons", "trike", 0.9, 4, 20],
  ["sm", "dlsu", "uv", 3.6, 11, 25],
  ["robinsons", "dlsu", "jeep", 3.8, 12, 15],
  ["district", "paliparan", "uv", 3.5, 11, 25],
  ["salitran", "district", "trike", 2.5, 9, 20],
  ["dlsu", "paliparan", "uv", 4.2, 13, 28],
];

/* What "best" means for each priority button. Each returns the cost of one leg. */
const WEIGHTS = {
  time: (e) => e.min,
  budget: (e) => e.fare + e.min / 1000, // cheapest, then fastest
  comfort: (e) => e.min * MODES[e.mode].comfort + BOARDING_PENALTY,
  distance: (e) => e.km,
};

const ADJ = {};
Object.keys(NODES).forEach((id) => (ADJ[id] = []));
EDGES.forEach(([a, b, mode, km, min, fare]) => {
  ADJ[a].push({ to: b, mode, km, min, fare });
  ADJ[b].push({ to: a, mode, km, min, fare });
});

/* Binary min-heap used as Dijkstra's priority queue */
class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(k, v) {
    const a = this.a;
    a.push([k, v]);
    let i = a.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a,
      top = a[0],
      last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/* Dijkstra's algorithm: cheapest cost from src to every place, plus the way back (prev). */
function dijkstra(src, weight) {
  const dist = {},
    prev = {},
    heap = new Heap();
  Object.keys(NODES).forEach((id) => (dist[id] = Infinity));
  dist[src] = 0;
  heap.push(0, src);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue; // stale queue entry
    for (const e of ADJ[u]) {
      const nd = d + weight(e);
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = { from: u, edge: e };
        heap.push(nd, e.to);
      }
    }
  }
  return { dist, prev };
}

/* Walk prev back from dst to src and return the legs in travel order (null if unreachable). */
function pathTo(prev, src, dst) {
  const legs = [];
  let c = dst;
  while (c !== src) {
    const p = prev[c];
    if (!p) return null;
    legs.unshift({ ...p.edge, from: p.from, to: c });
    c = p.from;
  }
  return legs;
}

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const names = (id) => [NODES[id][0], ...NODES[id][4]].map(norm);
/* null = field empty, undefined = no match */
function resolve(text) {
  const q = norm(text);
  if (!q) return null;
  const ids = Object.keys(NODES);
  return (
    ids.find((id) => names(id).includes(q)) ||
    ids.find((id) => names(id).some((n) => n.includes(q)))
  );
}

/* ---- UI ---- */
const $ = (s) => document.querySelector(s),
  app = $(".app"),
  V = ["home", "location", "route"];
const state = { prio: "time", planned: false };
const cards = [
  ["dlsu", "Saved", "a"],
  ["sm", "Saved", "b"],
  ["district", "Recommended", "c"],
];
const kmFromStart = dijkstra("cityhall", WEIGHTS.distance).dist;
const money = (n) => {
  n = Math.round(n * 100) / 100;
  return Number.isInteger(n) ? n : n.toFixed(2);
};
const studentFare = (e) => e.fare * (1 - STUDENT_DISCOUNT);

function drawCards(q = "") {
  const k = norm(q);
  const r = cards.filter((c) => !k || names(c[0]).some((n) => n.includes(k)));
  $("#list").innerHTML =
    r
      .map(
        ([id, tag, cls]) =>
          `<article class="card"><div class="ct"><h3>${NODES[id][0]}</h3><small>${tag}</small><b class="km">${kmFromStart[id].toFixed(1)} Km</b><button class="btn sm" data-go="location" data-to="${NODES[id][0]}">Directions</button></div><div class="ph ${cls}" role="img" aria-label="${NODES[id][0]}"></div></article>`,
      )
      .join("") ||
    '<p class="none">No places match your search. Try another name.</p>';
}

function drawMap(legs, src, dst) {
  if (window.L) {
    drawLeaflet(legs, src, dst);
    return;
  }
  const on = new Set(legs.flatMap((l) => [l.from, l.to])),
    P = (id) => NODES[id];
  let s = EDGES.map(
    ([a, b]) =>
      `<line class="edge" x1="${P(a)[2]}" y1="${P(a)[3]}" x2="${P(b)[2]}" y2="${P(b)[3]}"/>`,
  ).join("");
  s += legs
    .map(
      (l) =>
        `<line x1="${P(l.from)[2]}" y1="${P(l.from)[3]}" x2="${P(l.to)[2]}" y2="${P(l.to)[3]}" stroke="${MODES[l.mode].color}" stroke-width="5" stroke-linecap="round"/>`,
    )
    .join("");
  for (const id in NODES) {
    const [, short, x, y] = NODES[id],
      hit = on.has(id);
    const fill =
      id === src
        ? "#a0522d"
        : id === dst
          ? "#1d6b3a"
          : hit
            ? "#fff"
            : "var(--mut)";
    s += `<circle cx="${x}" cy="${y}" r="${hit ? 7 : 3}" fill="${fill}" stroke="${hit ? "#fff" : "none"}" stroke-width="2"/>`;
    if (hit)
      s += `<text class="lbl" x="${x > 270 ? x - 11 : x + 11}" y="${y - 9}" text-anchor="${x > 270 ? "end" : "start"}">${short}</text>`;
  }
  $("#rg").innerHTML = s;
}

function render(legs, src, dst) {
  $("#rf").textContent = NODES[src][0];
  $("#rd").textContent = NODES[dst][0];
  $("#legs").innerHTML = legs
    .map(
      (l) =>
        `<div class="leg"><b>₱${money(studentFare(l))}</b><svg class="i"><use href="#i-bus"/></svg><span>${NODES[l.from][0]} - ${NODES[l.to][0]}<small>${MODES[l.mode].name} · ${l.km} km</small></span><span>${l.min}m</span><i class="dot" style="background:${MODES[l.mode].color}" title="${MODES[l.mode].name}"></i></div>`,
    )
    .join("");
  $("#chips").innerHTML = legs
    .map((l) => `<span>${NODES[l.from][1]} - ${NODES[l.to][1]}</span>`)
    .join("");
  $("#tt").textContent = legs.reduce((t, l) => t + l.min, 0) + "min";
  $("#tf").textContent =
    money(legs.reduce((t, l) => t + studentFare(l), 0)) + " Pesos";
  $("#td").textContent = legs.reduce((t, l) => t + l.km, 0).toFixed(1) + " km";
  drawMap(legs, src, dst);
  state.planned = true;
}

function showErr(msg) {
  const e = $("#err");
  e.textContent = msg;
  e.hidden = !msg;
  return false;
}

/* strict = user pressed Search (report problems); otherwise fall back to the sample trip */
function plan(strict) {
  const f = resolve($("#from").value),
    t = resolve($("#to").value);
  if (strict) {
    const bad =
      f === undefined
        ? $("#from").value
        : t === undefined
          ? $("#to").value
          : null;
    if (bad)
      return showErr(
        `We couldn’t find “${bad.trim()}”. Pick a place from the list.`,
      );
  }
  let src = f || "cityhall",
    dst = t || "dlsu";
  if (src === dst) {
    if (strict) return showErr("Choose two different places.");
    src = "cityhall";
    dst = "dlsu";
  }
  const legs = pathTo(dijkstra(src, WEIGHTS[state.prio]).prev, src, dst);
  if (!legs) return showErr("No route found between those places.");
  showErr("");
  render(legs, src, dst);
  return true;
}

/* ---- Leaflet map of Dasmariñas (free, no key). Drag to pan, scroll / pinch / +- to zoom. ---- */
const DASMA = L.latLngBounds([14.275, 120.905], [14.375, 121.005]);
const geo = (() => {
  try {
    return JSON.parse(localStorage.getItem("sigmap-geo") || "{}");
  } catch (e) {
    return {};
  }
})();
const LL = (id) => NODES[id][5] || geo[id] || null; // null = real spot not found yet, so no pin
const GREEN = "#00a651";
const mk = (id) =>
  L.map(id, {
    zoomControl: false,
    minZoom: 12,
    maxZoom: 18,
    maxBounds: DASMA.pad(0.3),
    maxBoundsViscosity: 0.8,
  }).setView([14.3294, 120.9367], 13);
const mapLoc = mk("gm-loc"),
  mapRoute = mk("gm-route");
document.body.classList.add("has-gmap");
[mapLoc, mapRoute].forEach((m) => {
  L.control.zoom({ position: "topright" }).addTo(m);
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      subdomains: "abcd",
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  ).addTo(m);
});
const layers = {
  loc: L.layerGroup().addTo(mapLoc),
  route: L.layerGroup().addTo(mapRoute),
};
let routeBounds = null;
const pinIcon = (text, color) =>
  L.divIcon({
    className: "",
    html: `<div class="pin" style="--c:${color}">${text}</div>`,
    iconSize: [0, 0],
  });

function placePins() {
  layers.loc.clearLayers();
  Object.keys(NODES).forEach((id) => {
    const p = LL(id);
    if (p)
      L.marker(p, { icon: pinIcon(NODES[id][1], GREEN) })
        .addTo(layers.loc)
        .bindTooltip(NODES[id][0]);
  });
  if (state.last) drawLeaflet(...state.last);
}
function drawLeaflet(legs, src, dst) {
  state.last = [legs, src, dst];
  layers.route.clearLayers();
  const pts = [];
  legs.forEach((l) => {
    const a = LL(l.from),
      b = LL(l.to);
    if (a && b)
      L.polyline([a, b], {
        color: MODES[l.mode].color,
        weight: 6,
        opacity: 0.95,
      }).addTo(layers.route);
  });
  new Set(legs.flatMap((l) => [l.from, l.to])).forEach((id) => {
    const p = LL(id);
    if (!p) return;
    pts.push(p);
    L.marker(p, {
      icon: pinIcon(
        NODES[id][1],
        id === src ? "#a0522d" : id === dst ? "#1d6b3a" : GREEN,
      ),
      zIndexOffset: 500,
    })
      .addTo(layers.route)
      .bindTooltip(NODES[id][0]);
  });
  routeBounds = pts.length ? L.latLngBounds(pts) : null;
  refreshMaps();
}
/* maps are 0x0 while their screen is hidden, so re-measure and re-fit whenever a screen appears */
function refreshMaps() {
  requestAnimationFrame(() => {
    if (app.dataset.v === "location") {
      mapLoc.invalidateSize();
      const ls = layers.loc.getLayers();
      mapLoc.fitBounds(ls.length > 1 ? L.featureGroup(ls).getBounds() : DASMA, {
        padding: [30, 30],
        maxZoom: 15,
      });
    }
    if (app.dataset.v === "route") {
      mapRoute.invalidateSize();
      mapRoute.fitBounds(routeBounds || DASMA, {
        padding: [50, 50],
        maxZoom: 16,
      });
    }
  });
}

function go() {
  const v = location.hash.slice(1);
  app.dataset.v = V.includes(v) ? v : "home";
  if (app.dataset.v === "route" && !state.planned) plan(false);
  scrollTo(0, 0);
  refreshMaps();
  document
    .querySelectorAll("[data-nav]")
    .forEach((a) => a.classList.toggle("on", a.dataset.nav === app.dataset.v));
}

$("#places").innerHTML = Object.values(NODES)
  .map((n) => `<option value="${n[0]}">`)
  .join("");
drawCards();
$("#q").addEventListener("input", (e) => drawCards(e.target.value));
addEventListener("hashchange", go);
go();

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-go]");
  if (!t) return;
  if (t.dataset.to) $("#to").value = t.dataset.to;
  if (t.dataset.go === "route" && !plan(true)) return;
  location.hash = t.dataset.go;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.closest(".fld"))
    $("#location [data-go=route]").click();
});
$("#pri").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.prio = b.textContent.trim().toLowerCase();
  document
    .querySelectorAll("#pri button")
    .forEach((x) => x.setAttribute("aria-pressed", x === b));
});

const sheetEl = $("#location .sheet");
new ResizeObserver(() =>
  $("#location").style.setProperty("--sh", sheetEl.offsetHeight + 36 + "px"),
).observe(sheetEl);

/* Find the real spot of each place (OpenStreetMap Nominatim, free). Runs once, results are saved in this browser. */
placePins();
(async () => {
  for (const id in NODES) {
    const n = NODES[id];
    if (n[5] || geo[id] || !n[6]) continue;
    try {
      const r = await fetch(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&viewbox=120.88,14.40,121.03,14.25&bounded=1&q=" +
          encodeURIComponent(n[6]),
      );
      const j = await r.json();
      if (j[0]) {
        geo[id] = [+j[0].lat, +j[0].lon];
        localStorage.setItem("sigmap-geo", JSON.stringify(geo));
        placePins();
      }
    } catch (e) {
      /* offline or blocked: that pin stays hidden */
    }
    await new Promise((ok) => setTimeout(ok, 1100));
  }
})();
