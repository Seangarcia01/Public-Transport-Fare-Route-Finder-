/* Mouse, touch and button pan / zoom handlers. */

// ---------- Pan and zoom ----------
const ptrs = new Map();

let moved = 0;
mapCanvas.addEventListener("pointerdown", (e) => {
  mapCanvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  moved = 0;
  draggedPinIndex = null;
  if (roadMap && pinModeOn && ptrs.size === 1) {
    const i = pinAt(e.offsetX, e.offsetY);
    if (i >= 0) draggedPinIndex = i;
  }
});
mapCanvas.addEventListener("pointermove", (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p || !roadMap) return;
  const np = [e.offsetX, e.offsetY];
  if (draggedPinIndex != null && ptrs.size === 1) {
    droppedPins[draggedPinIndex].x = screenToWorldX(np[0]);
    droppedPins[draggedPinIndex].y = screenToWorldY(np[1] + 13);
    moved += 99;
    ptrs.set(e.pointerId, np);
    drawMap();
    return;
  }
  if (ptrs.size === 1) {
    view.panX += np[0] - p[0];
    view.panY += np[1] - p[1];
    moved += Math.abs(np[0] - p[0]) + Math.abs(np[1] - p[1]);
  } else if (ptrs.size === 2) {
    const o = [...ptrs.entries()].find(([id]) => id !== e.pointerId)[1],
      d0 = Math.hypot(p[0] - o[0], p[1] - o[1]),
      d1 = Math.hypot(np[0] - o[0], np[1] - o[1]);
    if (d0 > 0)
      zoomAtPoint((np[0] + o[0]) / 2, (np[1] + o[1]) / 2, d1 / d0);
    moved += 99;
  }
  ptrs.set(e.pointerId, np);
  refreshMap();
});
mapCanvas.addEventListener("pointerup", (e) => {
  const was = ptrs.size === 1;
  if (draggedPinIndex != null) {
    draggedPinIndex = null;
    renderPins();
    drawMap();
  } else if (was && moved < 6 && roadMap) {
    if (pinModeOn) addPin(e.offsetX, e.offsetY);
    else handleMapClick(e.offsetX, e.offsetY);
  }
  ptrs.delete(e.pointerId);
});
mapCanvas.addEventListener("pointercancel", (e) => {
  ptrs.delete(e.pointerId);
  draggedPinIndex = null;
});
mapCanvas.addEventListener(
  "wheel",
  (e) => {
    if (!roadMap) return;
    e.preventDefault();
    zoomAtPoint(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
    refreshMap();
  },
  {
    passive: false,
  },
);

byId("zi").onclick = () => {
  if (roadMap) {
    zoomAtPoint(canvasWidth / 2, canvasHeight / 2, 1.5);
    refreshMap();
  }
};

byId("zo").onclick = () => {
  if (roadMap) {
    zoomAtPoint(canvasWidth / 2, canvasHeight / 2, 1 / 1.5);
    refreshMap();
  }
};

byId("zf").onclick = () => {
  view = {
    zoom: 1,
    panX: 0,
    panY: 0,
  };
  if (roadMap) refreshMap();
};
