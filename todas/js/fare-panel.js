/* Fare rule, fare calculation and the fare / trip-progress panel. */

// ---------- Jeepney fare ----------
// CONNECTION POINT between the map/route code and the fare rule:
//   planJeepneyTrip() returns the trip as legs ("ride" or "walk"), each with its length in metres (leg.meters,
//   measured along the jeepney route's road pieces). The fare is computed from that ridden distance.
// Rule copied from data.js (fareRules.jeepney):
//   - first 4 km: 14 pesos (regular) or 12 pesos (student / senior / PWD)
//   - each started extra km: 2 pesos (4.1-5 km = 16, never an odd 15); a discounted ride never costs less than 12
// Every pickup is a separate jeepney, so every ride is charged on its own. Walking is never charged.
const JEEPNEY_FARE_RULE = {
  includedKm: 4,
  regularBase: 14,
  discountedBase: 12,
  regularPerExtraKm: 2,
  discountedPerExtraKm: 2,
  roundTo: 1,
  discountedMinimum: 12,
  // passenger type -> [label shown on the page, discount flag]
  passengerTypes: {
    regular: ["Regular", 0],
    student: ["Student", 0.2],
    senior: ["Senior Citizen", 0.2],
    pwd: ["PWD", 0.2],
  },
};

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[ch],
  );
const roundToCentavos = (amount) => Math.round(amount * 100) / 100;

const formatPeso = (amount) => "₱" + amount.toFixed(2);

const formatKm = (km) => +Math.max(0, km).toFixed(2) + " km";

const formatMeters = (meters) =>
  meters < 1000
    ? Math.round(meters) + " m"
    : (meters / 1000).toFixed(1) + " km";
const capitalizeFirst = (text) => text[0].toUpperCase() + text.slice(1);

// Fare in pesos for ONE jeepney ride of `distanceKm` kilometres.
function jeepneyFareForDistance(distanceKm, passengerType) {
  const rule = JEEPNEY_FARE_RULE;
  const isDiscounted = rule.passengerTypes[passengerType][1] > 0;
  const base = isDiscounted ? rule.discountedBase : rule.regularBase;
  const perExtraKm = isDiscounted
    ? rule.discountedPerExtraKm
    : rule.regularPerExtraKm;
  // every STARTED km after the first 4 km costs the extra rate: 4 km or less = 14 (never 15), 4.1-5 km = 16, ...
  const extraKm = Math.ceil(Math.max(0, distanceKm - rule.includedKm) - 0.0001);
  let fare = base + extraKm * perExtraKm;
  fare = Math.round(fare / rule.roundTo) * rule.roundTo;
  if (isDiscounted) fare = Math.max(fare, rule.discountedMinimum);
  return roundToCentavos(fare);
}

// Called right after a trip is planned. Builds the list of stops used by the progress panel
// (start, then the end of every ride/walk leg) and shows the fare section below the map.
// The panel stays hidden when the trip has no jeepney ride (nothing to pay).
function showFarePanel() {
  const panel = byId("fare");
  const legs = currentTrip.segs.filter(
    (leg) => leg.kind === "ride" || leg.meters >= 25,
  ); // drop tiny walks
  if (!legs.some((leg) => leg.kind === "ride")) {
    panel.hidden = true;
    return;
  }
  const stops = [
    {
      node: startNode,
      name: byId("inA").value || "Your location (A)",
    },
  ];
  legs.forEach((leg, index) => {
    const endNode = leg.nodes[leg.nodes.length - 1];
    const isLastLeg = index === legs.length - 1;
    const nextLeg = legs[index + 1];
    const placeText = describePickupPoint(
      endNode,
      leg.kind === "ride"
        ? leg.routeIndex
        : nextLeg && nextLeg.kind === "ride"
          ? nextLeg.routeIndex
          : -1,
    );
    stops.push({
      node: endNode,
      name: isLastLeg
        ? byId("inB").value || "Your destination (B)"
        : (leg.kind === "ride" ? "Drop-off: " : "Pickup: ") + placeText,
      shortName: isLastLeg ? "your destination (B)" : placeText,
    });
  });
  currentTrip.fareProgress = {
    legs,
    stops,
    step: 0,
  };
  panel.hidden = false;
  renderFarePanel();
}

// Draws the three fare cards (total, trip progress simulator, route timeline) for the current step.
function renderFarePanel() {
  const passengerType = byId("pax").value;
  const { legs, stops } = currentTrip.fareProgress;
  const step = currentTrip.fareProgress.step;

  // 1) Fare for every ride leg: distance ridden (km) -> fare rule.
  legs.forEach((leg) => {
    if (leg.kind === "ride") {
      leg.km = leg.meters / 1000;
      leg.fare = jeepneyFareForDistance(leg.km, passengerType);
    }
  });
  // 2) Running totals at every stop (km ridden, fare paid, metres travelled including walking).
  let kmRidden = 0;
  let farePaid = 0;
  let metersTravelled = 0;
  stops.forEach((stop, index) => {
    if (index > 0) {
      const leg = legs[index - 1];
      metersTravelled += leg.meters;
      if (leg.kind === "ride") {
        kmRidden += leg.km;
        farePaid = roundToCentavos(farePaid + leg.fare);
      }
    }
    stop.kmRidden = kmRidden;
    stop.farePaid = farePaid;
    stop.meters = metersTravelled;
  });
  const finalStop = stops[stops.length - 1];
  const here = stops[step];
  const nextLeg = legs[step];
  const gapToPin = (exactPoint, node) =>
    exactPoint
      ? Math.hypot(
          exactPoint[0] - roadMap.nodeX[node],
          exactPoint[1] - roadMap.nodeY[node],
        )
      : 0;
  const walkingMeters =
    legs
      .filter((leg) => leg.kind === "walk")
      .reduce((sum, leg) => sum + leg.meters, 0) +
    gapToPin(startPoint, startNode) +
    gapToPin(destinationPoint, destinationNode);
  const rideCount = legs.filter((leg) => leg.kind === "ride").length;
  const routeLabel = (leg) =>
    jeepneyRoutes[leg.routeIndex].id +
    " " +
    jeepneyRoutes[leg.routeIndex].name;
  const nextText = !nextLeg
    ? "You have arrived at your destination."
    : nextLeg.kind === "ride"
      ? `Next: board ${escapeHtml(routeLabel(nextLeg))} — ${formatPeso(nextLeg.fare)}, ${formatKm(nextLeg.km)}. Get off at ${escapeHtml(stops[step + 1].shortName)}.`
      : `Next: walk ${formatMeters(nextLeg.meters)} to ${escapeHtml(stops[step + 1].shortName)} (no fare).`;
  const statBlocks = (pairs) =>
    pairs
      .map(
        ([label, value]) =>
          `<div><div class="fc-k">${label}</div><div class="fc-v">${value}</div></div>`,
      )
      .join("");
  byId("fare").innerHTML =
    // Card 1: total fare
    `<div class="card fc"><div class="fc-sum"><div><div class="fc-k">Total jeepney fare · ${JEEPNEY_FARE_RULE.passengerTypes[passengerType][0]}</div><div class="fc-big">${formatPeso(finalStop.farePaid)}</div></div>` +
    statBlocks([
      ["Jeepney distance", formatKm(finalStop.kmRidden)],
      ["Jeepney rides", rideCount],
      ["Walking (no fare)", formatMeters(walkingMeters)],
    ]) +
    `</div></div>` +
    // Card 2: trip progress simulator (Previous stop / Next stop / Restart)
    `<div class="card fc"><h2>Trip progress (simulated) — you are at: ${escapeHtml(here.name)}</h2><div class="fc-grid">` +
    statBlocks([
      ["Jeepney km travelled", formatKm(here.kmRidden)],
      ["Jeepney km left", formatKm(finalStop.kmRidden - here.kmRidden)],
      ["Fare paid so far", formatPeso(here.farePaid)],
      [
        "Fare remaining",
        formatPeso(roundToCentavos(finalStop.farePaid - here.farePaid)),
      ],
    ]) +
    `</div><div class="fc-bar"><i style="width:${finalStop.meters ? Math.round((here.meters / finalStop.meters) * 100) : 0}%"></i></div><div class="fc-next">${nextText}</div><div class="fc-btns"><button id="fPrev"${step ? "" : " disabled"}>◀ Previous stop</button><button id="fNext"${step < stops.length - 1 ? "" : " disabled"}>Next stop ▶</button><button id="fRes">Restart</button></div></div>` +
    // Card 3: route timeline (walk legs are shown differently from jeepney legs)
    `<div class="card fc"><h2>Your route</h2><ul class="fc-tl">` +
    stops
      .map((stop, index) => {
        const leg = legs[index];
        const legHtml = !leg
          ? ""
          : `<div style="margin-top:8px">${leg.kind === "ride" ? `<span class="fc-pill">Jeepney</span>${escapeHtml(routeLabel(leg))} · ${formatKm(leg.km)} · ${formatPeso(leg.fare)}` : `<span class="fc-pill w">Walk</span>${formatMeters(leg.meters)} · not charged`}</div>`;
        return `<li${index === step ? ' class="on"' : ""}><b>${escapeHtml(stop.name)}</b><div class="fc-k" style="text-transform:none;letter-spacing:0">${formatKm(stop.kmRidden)} travelled · ${formatKm(finalStop.kmRidden - stop.kmRidden)} left · ${formatPeso(stop.farePaid)} paid</div>${legHtml}</li>`;
      })
      .join("") +
    `</ul></div>`;
  byId("fPrev").onclick = () => {
    currentTrip.fareProgress.step--;
    renderFarePanel();
  };
  byId("fNext").onclick = () => {
    currentTrip.fareProgress.step++;
    renderFarePanel();
  };
  byId("fRes").onclick = () => {
    currentTrip.fareProgress.step = 0;
    renderFarePanel();
  };
  drawMap(); // redraw the map so the yellow ring follows the current step
}
// Changing the passenger type recalculates the fares.
byId("pax").onchange = () => {
  if (currentTrip && currentTrip.fareProgress) renderFarePanel();
};
