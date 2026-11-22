/* The A and B pickers: search boxes, suggestions, map clicks. */

// ---------- Choosing A and B ----------
const statusMessage = byId("msg");

let finalStatusText = "";

const defaultStatusText = () =>
  finalStatusText ||
  "Search for a barangay or click two spots on the map.";

function clearTripResult() {
  clearInterval(legacyTimer);
  legacySearchResult = null;
  currentTrip = null;
  legacyShownSteps = 0;
  finalStatusText = "";
  byId("out").innerHTML = "";
  byId("fare").hidden = true;
  byId("go").disabled = !roadMap;
}
// Sets the start (which = "A") or destination ("B"). `node` is the road node used for routing; `exactPoint` is
// where the user really picked (a place or a click) so the walk from / to the road can be shown.
function setTripPoint(which, node, label, exactPoint) {
  clearTripResult();
  if (which === "A") {
    startNode = node;
    startPoint = node == null ? null : exactPoint || null;
  } else {
    destinationNode = node;
    destinationPoint = node == null ? null : exactPoint || null;
  }
  if (label != null)
    (which === "A" ? startPicker : destinationPicker).set(label);
  drawMap();
}

function createPlacePicker(inp, list, which) {
  let shownItems = [],
    act = -1,
    cur = "";
  const norm = (s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  function render() {
    const r = searchPlaces(inp.value === cur ? "" : inp.value);
    shownItems = r.items;
    list.innerHTML = "";
    let g = "";
    shownItems.forEach((p, i) => {
      if (p.groupName !== g) {
        g = p.groupName;
        const h = document.createElement("li");
        h.className = "grp";
        h.setAttribute("role", "presentation");
        h.textContent = g;
        list.appendChild(h);
      }
      const li = document.createElement("li");
      li.id = list.id + "-" + i;
      li.setAttribute("role", "option");
      li.dataset.i = i;
      li.textContent = p.label;
      if (i === act) li.className = "act";
      list.appendChild(li);
    });
    if (!shownItems.length) {
      const li = document.createElement("li");
      li.className = "none";
      li.textContent = "No matching places";
      list.appendChild(li);
    } else if (r.more) {
      const li = document.createElement("li");
      li.className = "none";
      li.textContent = "Keep typing to narrow the list";
      list.appendChild(li);
    }
    inp.setAttribute(
      "aria-activedescendant",
      act >= 0 ? list.id + "-" + act : "",
    );
  }
  const open = () => {
      list.hidden = false;
      inp.setAttribute("aria-expanded", "true");
      render();
    },
    close = () => {
      list.hidden = true;
      inp.setAttribute("aria-expanded", "false");
    };
  function pick(p) {
    if (!p) return;
    cur = p.label;
    inp.value = cur;
    close();
    setTripPoint(which, p.node, null, [p.x, p.y]);
  }
  inp.addEventListener("focus", () => {
    act = -1;
    open();
  });
  inp.addEventListener("click", () => {
    if (list.hidden) open();
  });
  inp.addEventListener("input", () => {
    if (inp.value === "") {
      cur = "";
      if (which === "A" ? startNode != null : destinationNode != null)
        setTripPoint(which, null);
    }
    act = inp.value && shownItems ? 0 : -1;
    open();
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) open();
      act = Math.max(
        0,
        Math.min(
          shownItems.length - 1,
          act + (e.key === "ArrowDown" ? 1 : -1),
        ),
      );
      render();
      const el = byId(list.id + "-" + act);
      if (el)
        el.scrollIntoView({
          block: "nearest",
        });
    } else if (e.key === "Enter") {
      if (!list.hidden) {
        e.preventDefault();
        pick(shownItems[Math.max(act, 0)]);
      }
    } else if (e.key === "Escape") {
      close();
      inp.value = cur;
    }
  });
  inp.addEventListener("blur", () =>
    setTimeout(() => {
      close();
      inp.value = cur;
    }, 150),
  );
  list.addEventListener("pointerdown", (e) => {
    const li = e.target.closest("[data-i]");
    if (!li) return;
    e.preventDefault();
    pick(shownItems[+li.dataset.i]);
  });
  return {
    set(l) {
      cur = l;
      inp.value = l;
    },
    clear() {
      cur = "";
      inp.value = "";
    },
    enable(on) {
      inp.disabled = !on;
    },
  };
}

const startPicker = createPlacePicker(byId("inA"), byId("lbA"), "A"),
  destinationPicker = createPlacePicker(byId("inB"), byId("lbB"), "B");
// A click on the map picks the nearest road node: first click sets A, the next sets B, then it starts over.
function handleMapClick(screenX, screenY) {
  // normal mode only: choose A, then B
  if (!roadMap || pinModeOn) return;
  const x = screenToWorldX(screenX),
    y = screenToWorldY(screenY),
    node = nearestRoadNode(x, y, 30 / pixelsPerMeter());
  if (node < 0) return;
  const label =
    "Map point " +
    describeBarangay(roadMap.nodeX[node], roadMap.nodeY[node]);
  if (startNode == null || destinationNode != null) {
    setTripPoint("A", node, label);
    destinationNode = null;
    destinationPoint = null;
    destinationPicker.clear();
  } else setTripPoint("B", node, label);
}

byId("reset").onclick = () => {
  startNode = destinationNode = null;
  startPoint = destinationPoint = null;
  startPicker.clear();
  destinationPicker.clear();
  clearTripResult();
  statusMessage.textContent = defaultStatusText();
  drawMap();
};
