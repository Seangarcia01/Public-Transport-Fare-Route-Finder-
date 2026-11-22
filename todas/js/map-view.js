/* Canvas map: zoom/pan maths and drawing (drawMap). */

// ---------- View ----------
// VIEW: the map is drawn with zoom (view.zoom) and pan (view.panX / view.panY).
// pixelsPerMeter() is the current scale; worldToScreenX/Y and screenToWorldX/Y convert between metres and pixels.
const pixelsPerMeter = () =>
    Math.min(canvasWidth / roadMap.width, canvasHeight / roadMap.height) *
    0.95 *
    view.zoom,
  worldToScreenX = (x) =>
    (x - roadMap.centerX) * pixelsPerMeter() +
    canvasWidth / 2 +
    view.panX,
  worldToScreenY = (y) =>
    (roadMap.centerY - y) * pixelsPerMeter() +
    canvasHeight / 2 +
    view.panY;
const screenToWorldX = (px) =>
    (px - canvasWidth / 2 - view.panX) / pixelsPerMeter() +
    roadMap.centerX,
  screenToWorldY = (py) =>
    roadMap.centerY -
    (py - canvasHeight / 2 - view.panY) / pixelsPerMeter();
function fitCanvasToScreen() {
  const rect = mapCanvas.getBoundingClientRect(),
    pixelRatio = devicePixelRatio || 1;
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  mapCanvas.width = offscreenBaseLayer.width = Math.round(
    canvasWidth * pixelRatio,
  );
  mapCanvas.height = offscreenBaseLayer.height = Math.round(
    canvasHeight * pixelRatio,
  );
  baseLayerStale = true;
  drawMap();
}

function zoomAtPoint(screenX, screenY, zoomFactor) {
  const newZoom = Math.max(1, Math.min(80, view.zoom * zoomFactor)),
    ratio = newZoom / view.zoom;
  view.panX =
    screenX -
    canvasWidth / 2 -
    (screenX - canvasWidth / 2 - view.panX) * ratio;
  view.panY =
    screenY -
    canvasHeight / 2 -
    (screenY - canvasHeight / 2 - view.panY) * ratio;
  view.zoom = newZoom;
}

function refreshMap() {
  baseLayerStale = true;
  drawMap();
}
// Paints the parts that do not change while the trip changes: roads (three classes), main road names,
// barangays (purple squares) and key landmarks (red circles) with their labels.
// The result is cached in offscreenBaseLayer and only repainted when baseLayerStale is set (zoom, pan, resize).
function drawBaseLayer(context) {
  const pixelRatio = devicePixelRatio || 1;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.lineCap = "round";
  context.lineJoin = "round";
  const lineWidths = [
      Math.max(0.8, pixelsPerMeter() * 5),
      Math.max(1.4, pixelsPerMeter() * 8),
      Math.max(2.2, pixelsPerMeter() * 12),
    ],
    lineColors = [
      cssVariable("--road"),
      cssVariable("--major"),
      cssVariable("--major"),
    ];
  for (let roadClass = 0; roadClass < 3; roadClass++) {
    context.beginPath();
    context.lineWidth = Math.min(
      lineWidths[roadClass],
      roadClass === 0 ? 3 : 8,
    );
    context.strokeStyle = lineColors[roadClass];
    for (let i = 0; i < roadMap.drawSegments.length; i += 3)
      if (roadMap.drawSegments[i + 2] === roadClass) {
        context.moveTo(
          worldToScreenX(roadMap.nodeX[roadMap.drawSegments[i]]),
          worldToScreenY(roadMap.nodeY[roadMap.drawSegments[i]]),
        );
        context.lineTo(
          worldToScreenX(roadMap.nodeX[roadMap.drawSegments[i + 1]]),
          worldToScreenY(roadMap.nodeY[roadMap.drawSegments[i + 1]]),
        );
      }
    context.stroke();
  }
  context.font = "600 11px 'Segoe UI',system-ui,sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 3;
  roadMap.roadLabels.forEach(([nameIndex, node]) => {
    const x = worldToScreenX(roadMap.nodeX[node]),
      y = worldToScreenY(roadMap.nodeY[node]);
    if (x < 0 || y < 0 || x > canvasWidth || y > canvasHeight) return;
    context.strokeStyle = cssVariable("--bg");
    context.strokeText(
      withCurlyApostrophe(roadMap.roadNames[nameIndex]),
      x,
      y,
    );
    context.fillStyle = cssVariable("--ink");
    context.fillText(
      withCurlyApostrophe(roadMap.roadNames[nameIndex]),
      x,
      y,
    );
  });
  places.forEach((place) => {
    if (place.groupId > 3) return;
    const x = worldToScreenX(place.x),
      y = worldToScreenY(place.y);
    if (
      x < -20 ||
      y < -20 ||
      x > canvasWidth + 20 ||
      y > canvasHeight + 20
    )
      return;
    context.fillStyle = cssVariable("--ink");
    if (place.groupId === 0) {
      context.fillStyle = cssVariable("--brgy");
      context.fillRect(x - 4.5, y - 4.5, 9, 9);
      context.strokeStyle = cssVariable("--bg");
      context.lineWidth = 1.5;
      context.strokeRect(x - 4.5, y - 4.5, 9, 9);
      context.fillStyle = cssVariable("--ink");
    } else if (place.groupId === 1) {
      context.beginPath();
      context.arc(x, y, 5, 0, 7);
      context.fillStyle = cssVariable("--meet");
      context.fill();
      context.strokeStyle = cssVariable("--bg");
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = cssVariable("--ink");
    }
    if (view.zoom >= 2.2 || place.groupId === 1) {
      context.textAlign = "left";
      context.font = "600 11px 'Segoe UI',system-ui,sans-serif";
      context.lineWidth = 3;
      context.strokeStyle = cssVariable("--bg");
      context.strokeText(place.label, x + 7, y - 7);
      context.fillStyle = cssVariable("--ink");
      context.fillText(place.label, x + 7, y - 7);
    }
  });
}

function drawPinShape(x, y, i, col) {
  mapCtx.beginPath();
  mapCtx.moveTo(x, y);
  mapCtx.bezierCurveTo(x - 13, y - 12, x - 11, y - 27, x, y - 27);
  mapCtx.bezierCurveTo(x + 11, y - 27, x + 13, y - 12, x, y);
  mapCtx.fillStyle = col;
  mapCtx.fill();
  mapCtx.strokeStyle = "#fff";
  mapCtx.lineWidth = 2;
  mapCtx.stroke();
  mapCtx.fillStyle = "#fff";
  mapCtx.font = "700 11px sans-serif";
  mapCtx.textAlign = "center";
  mapCtx.textBaseline = "middle";
  mapCtx.fillText(String(i + 1), x, y - 17);
}
// Paints one frame: cached base layer first, then the trip on top
// (walk legs dotted, jeepney rides as a solid blue line with a numbered green pickup circle), the yellow ring
// for the fare-panel step, and finally the A / B markers.
function drawMap() {
  const pixelRatio = devicePixelRatio || 1;
  mapCtx.setTransform(1, 0, 0, 1, 0, 0);
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  if (!roadMap) {
    mapCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    mapCtx.fillStyle = cssVariable("--mute");
    mapCtx.font = "15px 'Segoe UI',system-ui,sans-serif";
    mapCtx.textAlign = "center";
    mapCtx.fillText(
      byId("retry").hidden ? "Loading map…" : "Map unavailable",
      canvasWidth / 2,
      canvasHeight / 2,
    );
    return;
  }
  if (baseLayerStale) {
    drawBaseLayer(offscreenBaseLayer.getContext("2d"));
    baseLayerStale = false;
  }
  mapCtx.drawImage(offscreenBaseLayer, 0, 0);
  mapCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  mapCtx.lineCap = "round";
  mapCtx.lineJoin = "round";
  const startColor = cssVariable("--sa"),
    destinationColor = cssVariable("--sb"),
    routeColor = cssVariable("--route");
  if (
    legacySearchResult &&
    !(legacyShownSteps >= legacySearchResult.su.length)
  ) {
    [
      [0, cssVariable("--sa")],
      [1, cssVariable("--sb")],
    ].forEach(([kk, col]) => {
      mapCtx.beginPath();
      mapCtx.strokeStyle = col;
      mapCtx.lineWidth = 3;
      for (let i = 0; i < legacyShownSteps; i++)
        if (
          legacySearchResult.sk[i] === kk &&
          legacySearchResult.sp[i] >= 0
        ) {
          mapCtx.moveTo(
            worldToScreenX(roadMap.nodeX[legacySearchResult.sp[i]]),
            worldToScreenY(roadMap.nodeY[legacySearchResult.sp[i]]),
          );
          mapCtx.lineTo(
            worldToScreenX(roadMap.nodeX[legacySearchResult.su[i]]),
            worldToScreenY(roadMap.nodeY[legacySearchResult.su[i]]),
          );
        }
      mapCtx.stroke();
    });
  }
  const searchFinished =
    legacySearchResult &&
    legacyShownSteps >= legacySearchResult.su.length;
  if (searchFinished) {
    mapCtx.beginPath();
    legacySearchResult.path.forEach((v, i) =>
      i
        ? mapCtx.lineTo(
            worldToScreenX(roadMap.nodeX[v]),
            worldToScreenY(roadMap.nodeY[v]),
          )
        : mapCtx.moveTo(
            worldToScreenX(roadMap.nodeX[v]),
            worldToScreenY(roadMap.nodeY[v]),
          ),
    );
    mapCtx.strokeStyle = cssVariable("--panel");
    mapCtx.lineWidth = 8;
    mapCtx.stroke();
    mapCtx.strokeStyle = routeColor;
    mapCtx.lineWidth = 4;
    mapCtx.stroke();
  }
  if (currentTrip) {
    const rideColor = (i) =>
      JEEPNEY_RIDE_COLORS[i % JEEPNEY_RIDE_COLORS.length];
    let rideNumber = 0;
    currentTrip.segs.forEach((s) => {
      const tracePath = () => {
        mapCtx.beginPath();
        s.nodes.forEach((v, i) =>
          i
            ? mapCtx.lineTo(
                worldToScreenX(roadMap.nodeX[v]),
                worldToScreenY(roadMap.nodeY[v]),
              )
            : mapCtx.moveTo(
                worldToScreenX(roadMap.nodeX[v]),
                worldToScreenY(roadMap.nodeY[v]),
              ),
        );
      };
      if (s.kind === "walk") {
        if (s.nodes.length > 1) {
          tracePath();
          mapCtx.setLineDash([2, 7]);
          mapCtx.strokeStyle = cssVariable("--panel");
          mapCtx.lineWidth = 7;
          mapCtx.stroke();
          mapCtx.strokeStyle = cssVariable("--ink");
          mapCtx.lineWidth = 3.5;
          mapCtx.stroke();
          mapCtx.setLineDash([]);
        }
      } else {
        tracePath();
        mapCtx.strokeStyle = cssVariable("--panel");
        mapCtx.lineWidth = 9;
        mapCtx.stroke();
        mapCtx.strokeStyle = rideColor(rideNumber);
        mapCtx.lineWidth = 5;
        mapCtx.stroke();
        rideNumber++;
      }
    });
    rideNumber = 0;
    currentTrip.segs.forEach((s) => {
      if (s.kind !== "ride") return;
      const c = rideColor(rideNumber),
        a = s.nodes[0],
        z = s.nodes[s.nodes.length - 1];
      mapCtx.beginPath();
      mapCtx.arc(
        worldToScreenX(roadMap.nodeX[z]),
        worldToScreenY(roadMap.nodeY[z]),
        7,
        0,
        7,
      );
      mapCtx.fillStyle = "#fff";
      mapCtx.fill();
      mapCtx.strokeStyle = c;
      mapCtx.lineWidth = 3.5;
      mapCtx.stroke();
      const x = worldToScreenX(roadMap.nodeX[a]),
        y = worldToScreenY(roadMap.nodeY[a]);
      mapCtx.beginPath();
      mapCtx.arc(x, y, 11, 0, 7);
      mapCtx.fillStyle = cssVariable("--sa");
      mapCtx.fill();
      mapCtx.strokeStyle = "#fff";
      mapCtx.lineWidth = 2.5;
      mapCtx.stroke();
      mapCtx.fillStyle = "#10201a";
      mapCtx.font = "700 12px sans-serif";
      mapCtx.textAlign = "center";
      mapCtx.textBaseline = "middle";
      mapCtx.fillText(String(rideNumber + 1), x, y + 0.5);
      mapCtx.font = "700 11px 'Segoe UI',system-ui,sans-serif";
      mapCtx.textAlign = "left";
      mapCtx.lineWidth = 3;
      mapCtx.strokeStyle = cssVariable("--panel");
      const t = jeepneyRoutes[s.routeIndex].id;
      mapCtx.strokeText(t, x + 14, y - 10);
      mapCtx.fillStyle = cssVariable("--ink");
      mapCtx.fillText(t, x + 14, y - 10);
      rideNumber++;
    });
  }
  if (currentTrip && currentTrip.fareProgress) {
    const q =
      currentTrip.fareProgress.stops[currentTrip.fareProgress.step].node;
    mapCtx.beginPath();
    mapCtx.arc(
      worldToScreenX(roadMap.nodeX[q]),
      worldToScreenY(roadMap.nodeY[q]),
      15,
      0,
      7,
    );
    mapCtx.strokeStyle = cssVariable("--yellow-d");
    mapCtx.lineWidth = 3;
    mapCtx.stroke();
  }
  [
    [startNode, "A", startColor, startPoint],
    [destinationNode, "B", destinationColor, destinationPoint],
  ].forEach(([i, l, c, ps]) => {
    if (i == null) return;
    const nx = worldToScreenX(roadMap.nodeX[i]),
      ny = worldToScreenY(roadMap.nodeY[i]),
      x = ps ? worldToScreenX(ps[0]) : nx,
      y = ps ? worldToScreenY(ps[1]) : ny;
    if (Math.hypot(x - nx, y - ny) > 6) {
      mapCtx.beginPath();
      mapCtx.setLineDash([4, 3]);
      mapCtx.moveTo(x, y);
      mapCtx.lineTo(nx, ny);
      mapCtx.strokeStyle = c;
      mapCtx.lineWidth = 2;
      mapCtx.stroke();
      mapCtx.setLineDash([]);
      mapCtx.beginPath();
      mapCtx.arc(nx, ny, 3.5, 0, 7);
      mapCtx.fillStyle = c;
      mapCtx.fill();
    }
    mapCtx.beginPath();
    mapCtx.arc(x, y, 11, 0, 7);
    mapCtx.fillStyle = c;
    mapCtx.fill();
    mapCtx.strokeStyle = "#fff";
    mapCtx.lineWidth = 2;
    mapCtx.stroke();
    mapCtx.fillStyle = "#10201a";
    mapCtx.font = "700 12px sans-serif";
    mapCtx.textAlign = "center";
    mapCtx.textBaseline = "middle";
    mapCtx.fillText(l, x, y + 0.5);
  });
  droppedPins.forEach((p, i) =>
    drawPinShape(
      worldToScreenX(p.x),
      worldToScreenY(p.y),
      i,
      cssVariable("--pin"),
    ),
  );
}
