/* Temporary pins on the map. */

// ---------- Pin mode (temporary pins; never changes A, B or the route) ----------
// LEGACY PIN TOOLS: temporary pins used to be placed with a button that has been removed from the page.
// The functions below are kept but are no longer reachable from the interface.
function setPinMode(on) {
  pinModeOn = on;
  const b = byId("pinbtn");
  b.setAttribute("aria-pressed", on);
  b.textContent = "Pin mode: " + (on ? "on" : "off");
  b.classList.toggle("on", on);
  mapCanvas.style.cursor = on ? "crosshair" : "grab";
  statusMessage.textContent = on
    ? "Pin mode is on. Click the map to drop a pin and drag a pin to move it. Your location, destination and route stay unchanged."
    : defaultStatusText();
}
addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    pinModeOn &&
    document.activeElement.tagName !== "INPUT"
  )
    setPinMode(false);
});

function pinAt(px, py) {
  for (let i = droppedPins.length - 1; i >= 0; i--) {
    const x = worldToScreenX(droppedPins[i].x),
      y = worldToScreenY(droppedPins[i].y);
    if (Math.hypot(px - x, py - y + 13) < 16) return i;
  }
  return -1;
}

function pinLabel(p) {
  const la = (
      roadMap.originLat +
      p.y / roadMap.metersPerDegreeLat
    ).toFixed(5),
    lo = (roadMap.originLon + p.x / roadMap.metersPerDegreeLon).toFixed(
      5,
    );
  return (
    describeBarangay(p.x, p.y).replace(/^in/, "In") +
    " · " +
    la +
    ", " +
    lo
  );
}

function renderPins() {
  const box = byId("pins");
  box.innerHTML = "";
  box.hidden = !droppedPins.length;
  if (!droppedPins.length) return;
  const h = document.createElement("h2");
  h.textContent = "Pins";
  box.appendChild(h);
  droppedPins.forEach((p, i) => {
    const r = document.createElement("div");
    r.className = "pin";
    const s = document.createElement("span");
    s.textContent = i + 1 + ". " + pinLabel(p);
    const b = document.createElement("button");
    b.textContent = "Remove";
    b.setAttribute("aria-label", "Remove pin " + (i + 1));
    b.onclick = () => {
      droppedPins.splice(i, 1);
      renderPins();
      drawMap();
    };
    r.append(s, b);
    box.appendChild(r);
  });
  const c = document.createElement("button");
  c.textContent = "Clear all pins";
  c.style.marginTop = "8px";
  c.onclick = () => {
    droppedPins = [];
    renderPins();
    drawMap();
  };
  box.appendChild(c);
}

function addPin(px, py) {
  if (droppedPins.length >= 8) {
    statusMessage.textContent =
      "You can place up to 8 pins. Remove one to add another.";
    return;
  }
  droppedPins.push({
    x: screenToWorldX(px),
    y: screenToWorldY(py),
  });
  renderPins();
  drawMap();
}
