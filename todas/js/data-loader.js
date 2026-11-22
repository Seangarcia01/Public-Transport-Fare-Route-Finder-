/* Loads data/road-network.json and data/places.json, builds the map and routes. */

// ---------- Loading the map data ----------
// The two data files sit in the data/ folder. They are fetched, so open the page through a web server
// (for example: python3 -m http.server, then visit http://localhost:8000) - browsers block fetch() on file:// pages.
const ROAD_NETWORK_URL = "data/road-network.json"; // OpenStreetMap roads (compact format, see readRoadWays)
const PLACES_URL = "data/places.json"; // barangays and landmarks (OpenStreetMap-style elements)

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + " returned " + response.status);
  return response.json();
}

// LOADS THE MAP: reads the road data, builds the road graph, then the jeepney routes, then loads places.
async function loadMap() {
  byId("retry").hidden = true;
  statusMessage.textContent = "Loading the Dasmariñas map…";
  let ways = null;
  try {
    ways = readRoadWays(await fetchJson(ROAD_NETWORK_URL));
  } catch (_) {}
  try {
    if (!ways || !ways.length) throw 0;
    roadMap = buildRoadMap(ways);
    try {
      buildJeepneyRoutes();
    } catch (_) {
      jeepneyRoutes = [];
    }
  } catch (_) {
    roadMap = null;
    statusMessage.textContent =
      "The map data could not be loaded. Open the page from a web server (not file://) and try again.";
    byId("retry").hidden = false;
    drawMap();
    return;
  }
  await loadPlaces();
  renderRouteDirectory();
  view = {
    zoom: 1,
    panX: 0,
    panY: 0,
  };
  [startPicker, destinationPicker].forEach((c) => c.enable(true));
  byId("reset").disabled = false;
  byId("go").disabled = false;
  statusMessage.textContent = defaultStatusText();
  refreshMap();
}

// Loads barangays and landmarks from data/places.json and snaps them to the map.
// If the file is missing the map still works with junctions only.
async function loadPlaces() {
  let raw = null;
  try {
    raw = readPlaces(await fetchJson(PLACES_URL));
  } catch (_) {}
  try {
    placePointsOnMap(raw || []);
  } catch (_) {
    places = [];
  }
}

byId("retry").onclick = loadMap;
