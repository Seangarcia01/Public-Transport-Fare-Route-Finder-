/* FIND ROUTE button and route directory table. */

// ---------- Jeepney trip (replaces the shortest-path search) ----------
const JEEPNEY_RIDE_COLORS = ["#1ea7e8"];

// FIND ROUTE button: plans the trip (planJeepneyTrip) and hands the result to the fare panel.
//   map  -> startNode / destinationNode (road nodes chosen in the A and B boxes or by clicking the map)
//   trip -> currentTrip.segs (walk and ride legs)
//   fare -> showFarePanel() reads those legs and prices every ride
byId("go").onclick = () => {
  if (startNode == null || destinationNode == null) {
    statusMessage.textContent =
      "Pick both a location (A) and a destination (B).";
    return;
  }
  if (startNode === destinationNode) {
    statusMessage.textContent =
      "Location and destination are the same spot. Pick a different destination.";
    return;
  }
  clearTripResult();
  if (!jeepneyRoutes.some((r) => r.routeEdges.size)) {
    statusMessage.textContent =
      "The jeepney routes could not be matched to this map.";
    return;
  }
  currentTrip = planJeepneyTrip(startNode, destinationNode);
  if (!currentTrip) {
    statusMessage.textContent =
      "No way to get between these two spots. Try a nearby place.";
    return;
  }
  statusMessage.textContent = currentTrip.pickups
    ? ""
    : "No jeepney route helps with this trip. Walk the whole way.";
  showFarePanel();
  drawMap();
};
// Plain-words description of a node: "the <crossing road> junction, in Barangay ...".
// Used for pickup / drop-off names in the fare panel.
function describePickupPoint(node, routeIndex) {
  const ownRoadIds =
      routeIndex >= 0 ? jeepneyRoutes[routeIndex].roadNameIds : new Set(),
    crossRoads = new Set(),
    ownRoads = new Set();
  for (const e of [
    ...roadMap.outgoingEdges[node],
    ...roadMap.incomingEdges[node],
  ])
    if (e[2])
      (ownRoadIds.has(e[2]) ? ownRoads : crossRoads).add(
        withCurlyApostrophe(roadMap.roadNames[e[2]]),
      );
  const crossRoad = [...crossRoads][0],
    ownRoad = [...ownRoads][0];
  return (
    (crossRoad
      ? "the " + crossRoad + " junction"
      : ownRoad
        ? ownRoad
        : "a local street") +
    ", " +
    describeBarangay(roadMap.nodeX[node], roadMap.nodeY[node])
  );
}

function renderRouteDirectory() {
  const el = byId("jrdir");
  if (!el) return;
  el.hidden = !jeepneyRoutes.length;
  const t = el.querySelector("tbody");
  t.innerHTML = "";
  jeepneyRoutes.forEach((r) => {
    const tr = document.createElement("tr");
    [
      r.id,
      r.name + (r.approx ? " (approx.)" : "") + (r.note ? " – " + r.note : ""),
      r.from[0] + (r.twoWay ? " ↔ " : " → ") + r.to[0],
    ].forEach((x) => {
      const td = document.createElement("td");
      td.textContent = x;
      tr.appendChild(td);
    });
    t.appendChild(tr);
  });
}
