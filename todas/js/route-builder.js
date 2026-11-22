/* Turns the route directory into rideable road pieces (buildJeepneyRoutes, buildDrivenRoute). */

// Planner settings: walking and riding speed in metres per minute, and the minutes lost waiting at every pickup.
const TRAVEL_SPEEDS = {
  walk: 75,
  ride: 250,
  board: 5,
}; // metres per minute walking / riding, minutes lost to waiting at each pick-up

let jeepneyRoutes = [];

const normalizeRoadName = (text) =>
  String(text || "")
    .replace(/’/g, "'")
    .toLowerCase();
// BUILDS A DRAWN ROUTE (a route with `paths`): drives from point to point along the roads (one-way streets respected)
// and keeps only the road pieces it drove. A path without `oneWay` is also driven in reverse (its own way back).
function drivePathBetween(sourceNode, targetNode) {
  const cost = new Map([[sourceNode, 0]]),
    previous = new Map(),
    queue = new Heap();
  queue.push(0, sourceNode);
  while (queue.heapItems.length) {
    const [costSoFar, node] = queue.pop();
    if (costSoFar > cost.get(node)) continue;
    if (node === targetNode) break;
    for (const [neighbor, edgeLength] of roadMap.outgoingEdges[node]) {
      if (!roadMap.inMainNetwork[neighbor]) continue;
      const newCost = costSoFar + edgeLength;
      if (newCost < (cost.has(neighbor) ? cost.get(neighbor) : Infinity)) {
        cost.set(neighbor, newCost);
        previous.set(neighbor, node);
        queue.push(newCost, neighbor);
      }
    }
  }
  if (!cost.has(targetNode)) return null;
  const path = [];
  for (let n = targetNode; n !== undefined; n = previous.get(n))
    path.unshift(n);
  return path;
}
function buildDrivenRoute(routeDef) {
  const routeEdges = new Map(),
    nodes = new Set(),
    roadNameIds = new Set(),
    seen = new Set();
  let totalEdgeLength = 0,
    approx = false,
    firstNode = -1,
    lastNode = -1;
  const addDrive = (viaNodes) => {
    for (let i = 0; i < viaNodes.length - 1; i++) {
      if (viaNodes[i] === viaNodes[i + 1]) continue;
      const path = drivePathBetween(viaNodes[i], viaNodes[i + 1]);
      if (!path) {
        approx = true; // this stretch cannot be driven: left out rather than invented
        continue;
      }
      for (let k = 0; k < path.length - 1; k++) {
        const u = path[k],
          v = path[k + 1];
        nodes.add(u);
        nodes.add(v);
        if (seen.has(u + "-" + v)) continue;
        seen.add(u + "-" + v);
        let best = null;
        for (const e of roadMap.outgoingEdges[u])
          if (e[0] === v && (!best || e[1] < best[1])) best = e;
        if (!best) continue;
        if (best[2]) roadNameIds.add(best[2]);
        let list = routeEdges.get(u);
        if (!list) routeEdges.set(u, (list = []));
        list.push([v, best[1]]);
        totalEdgeLength += best[1];
      }
    }
  };
  routeDef.paths.forEach((pathDef) => {
    const viaNodes = [];
    pathDef.via.forEach(([lat, lon]) => {
      const [x, y] = lonLatToMeters(lat, lon),
        node = nearestRoadNode(x, y, 400);
      if (node < 0) approx = true;
      else if (viaNodes[viaNodes.length - 1] !== node) viaNodes.push(node);
    });
    if (viaNodes.length < 2) return;
    if (firstNode < 0) firstNode = viaNodes[0];
    lastNode = viaNodes[viaNodes.length - 1];
    addDrive(viaNodes);
    if (!pathDef.oneWay) addDrive(viaNodes.slice().reverse());
  });
  return {
    ...routeDef,
    roadNameIds,
    nodes,
    routeEdges,
    approx,
    clipped: true,
    startNode: firstNode,
    endNode: lastNode,
    km: totalEdgeLength / 2000,
  };
}
// BUILDS EACH ROUTE'S ROAD PIECES from JEEPNEY_ROUTE_DIRECTORY and the road graph:
//   1. find the road names that match the route (roadNameIds) and the nodes lying on them
//   2. snap the route's start / end points onto those roads
//   3. find the drivable path between the ends (Dijkstra; off-route road costs 4x so the route sticks to its roads)
//   4. keep every named road piece within 120 m of that path (divided roads have one carriageway per direction)
//   5. store the result as routeEdges: node -> [[neighbour, metres], ...], the only edges a jeepney may ride
// A route whose road name is missing from the map falls back to the plain drivable path ("approx.").
function buildJeepneyRoutes() {
  jeepneyRoutes = JEEPNEY_ROUTE_DIRECTORY.map((routeDef) => {
    if (routeDef.paths) return buildDrivenRoute(routeDef);
    const roadNameIds = new Set();
    roadMap.roadNames.forEach((roadName, i) => {
      if (
        i &&
        routeDef.roads.some((roadMatcher) =>
          roadMatcher instanceof RegExp
            ? roadMatcher.test(roadName.replace(/’/g, "'"))
            : normalizeRoadName(roadName) ===
              normalizeRoadName(roadMatcher),
        )
      )
        roadNameIds.add(i);
    });
    const routeRoadNodes = new Set(); // nodes on the route's named roads
    for (let node = 0; node < roadMap.nodeCount; node++)
      if (roadMap.inMainNetwork[node])
        for (const [neighbor, edgeLength, roadNameId] of roadMap
          .outgoingEdges[node])
          if (
            roadNameIds.has(roadNameId) &&
            roadMap.inMainNetwork[neighbor]
          ) {
            routeRoadNodes.add(node);
            routeRoadNodes.add(neighbor);
          }
    // Roads can be split into pieces with other names at junctions, so the path may cross short gaps: off-route road costs 4x, on-route road 1x.
    const neighborsWithCost = (node) => {
      const a = [];
      for (const [neighbor, edgeLength, roadNameId] of roadMap
        .outgoingEdges[node])
        if (roadMap.inMainNetwork[neighbor])
          a.push([
            neighbor,
            roadNameIds.has(roadNameId) ? edgeLength : edgeLength * 4,
            edgeLength,
            roadNameIds.has(roadNameId),
          ]);
      for (const [neighbor, edgeLength, roadNameId] of roadMap
        .incomingEdges[node])
        if (roadMap.inMainNetwork[neighbor])
          a.push([
            neighbor,
            roadNameIds.has(roadNameId) ? edgeLength : edgeLength * 4,
            edgeLength,
            roadNameIds.has(roadNameId),
          ]);
      return a;
    };
    const costsUndirected = (sourceNode) => {
      const cost = new Map([[sourceNode, 0]]),
        previous = new Map(),
        queue = new Heap();
      queue.push(0, sourceNode);
      while (queue.heapItems.length) {
        const [costSoFar, node] = queue.pop();
        if (costSoFar > cost.get(node)) continue;
        for (const [neighbor, stepCost] of neighborsWithCost(node)) {
          const newCost = costSoFar + stepCost;
          if (
            newCost < (cost.has(neighbor) ? cost.get(neighbor) : Infinity)
          ) {
            cost.set(neighbor, newCost);
            previous.set(neighbor, node);
            queue.push(newCost, neighbor);
          }
        }
      }
      return {
        d: cost,
        pv: previous,
      };
    };
    const costsDriving = (sourceNode) => {
      const cost = new Map([[sourceNode, 0]]),
        previous = new Map(),
        queue = new Heap();
      queue.push(0, sourceNode); // the way a jeepney can really drive: one-way streets respected
      while (queue.heapItems.length) {
        const [costSoFar, node] = queue.pop();
        if (costSoFar > cost.get(node)) continue;
        for (const [neighbor, edgeLength, roadNameId] of roadMap
          .outgoingEdges[node]) {
          if (!roadMap.inMainNetwork[neighbor]) continue;
          const newCost =
            costSoFar +
            (roadNameIds.has(roadNameId) ? edgeLength : edgeLength * 4);
          if (
            newCost < (cost.has(neighbor) ? cost.get(neighbor) : Infinity)
          ) {
            cost.set(neighbor, newCost);
            previous.set(neighbor, node);
            queue.push(newCost, neighbor);
          }
        }
      }
      return {
        d: cost,
        pv: previous,
      };
    };
    const snapToRoute = (a) => {
      if (!a || a.length < 3)
        return {
          n: -1,
        };
      const [x, y] = lonLatToMeters(a[1], a[2]);
      let bestNode = -1,
        bestDistance = 700;
      for (const node of routeRoadNodes) {
        const q = Math.hypot(
          roadMap.nodeX[node] - x,
          roadMap.nodeY[node] - y,
        );
        if (q < bestDistance) {
          bestDistance = q;
          bestNode = node;
        }
      }
      if (bestNode >= 0)
        return {
          n: bestNode,
        };
      return {
        n: nearestRoadNode(x, y, 700),
        off: true,
      };
    };
    let startSnap = snapToRoute(routeDef.from),
      endSnap = snapToRoute(routeDef.to),
      startNode = startSnap.n,
      endNode = endSnap.n,
      fullPath = null,
      approx = !!(startSnap.off || endSnap.off) || !roadNameIds.size;
    const farthestFrom = (sourceNode) => {
      const { d: cost } = costsUndirected(sourceNode),
        [sx0, sy0] = [
          roadMap.nodeX[sourceNode],
          roadMap.nodeY[sourceNode],
        ];
      let bestNode = -1,
        bestDistance = -1;
      routeRoadNodes.forEach((node) => {
        const straightDistance = Math.hypot(
            roadMap.nodeX[node] - sx0,
            roadMap.nodeY[node] - sy0,
          ),
          stepCost = cost.get(node);
        if (
          stepCost !== undefined &&
          stepCost <= straightDistance * 2.2 + 400 &&
          straightDistance > bestDistance
        ) {
          bestDistance = straightDistance;
          bestNode = node;
        }
      });
      return bestNode;
    };
    if (roadNameIds.size) {
      if (startNode < 0 && endNode >= 0)
        startNode = farthestFrom(endNode);
      else if (endNode < 0 && startNode >= 0)
        endNode = farthestFrom(startNode);
    }
    let drivenPaths = [];
    if (startNode >= 0 && endNode >= 0 && startNode !== endNode)
      [
        [startNode, endNode],
        [endNode, startNode],
      ].forEach(([a, z]) => {
        const { pv: previous, d: cost } = costsDriving(a);
        if (cost.has(z)) {
          const q = [];
          for (
            let neighbor = z;
            neighbor !== undefined;
            neighbor = previous.get(neighbor)
          )
            q.unshift(neighbor);
          drivenPaths.push(q);
        }
      });
    if (drivenPaths.length) fullPath = [].concat(...drivenPaths);
    // Divided roads have one carriageway per direction, so the route takes every named road piece within 120 m of the path, plus short connectors (<=100 m)
    const corridorNodes = new Set(fullPath || []),
      drivenPairs = new Set();
    drivenPaths.forEach((q) => {
      for (let i = 0; i < q.length - 1; i++)
        drivenPairs.add(q[i] + "-" + q[i + 1]);
    });
    if (fullPath && roadNameIds.size) {
      const gridCells = new Map(),
        cellKey = (x, y) =>
          Math.floor(x / 120) + "," + Math.floor(y / 120);
      [...corridorNodes].forEach((node) => {
        const k = cellKey(roadMap.nodeX[node], roadMap.nodeY[node]);
        (gridCells.get(k) || gridCells.set(k, []).get(k)).push(node);
      });
      const isNearDrivenPath = (node) => {
        const cx = Math.floor(roadMap.nodeX[node] / 120),
          cy = Math.floor(roadMap.nodeY[node] / 120);
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++)
            for (const w of gridCells.get(cx + i + "," + (cy + j)) || [])
              if (
                Math.hypot(
                  roadMap.nodeX[w] - roadMap.nodeX[node],
                  roadMap.nodeY[w] - roadMap.nodeY[node],
                ) <= 120
              )
                return true;
        return false;
      };
      const extraNodes = [];
      routeRoadNodes.forEach((node) => {
        if (!corridorNodes.has(node) && isNearDrivenPath(node))
          extraNodes.push(node);
      });
      extraNodes.forEach((node) => corridorNodes.add(node));
    }
    const routeEdges = new Map();
    let totalEdgeLength = 0;
    for (const node of corridorNodes)
      for (const [neighbor, edgeLength, roadNameId] of roadMap
        .outgoingEdges[node])
        if (
          corridorNodes.has(neighbor) &&
          roadMap.inMainNetwork[node] &&
          roadMap.inMainNetwork[neighbor] &&
          (drivenPairs.has(node + "-" + neighbor) ||
            roadNameIds.has(roadNameId) ||
            edgeLength <= 100)
        ) {
          let a = routeEdges.get(node);
          if (!a) routeEdges.set(node, (a = []));
          a.push([neighbor, edgeLength]);
          totalEdgeLength += edgeLength;
        }
    return {
      ...routeDef,
      roadNameIds,
      nodes: corridorNodes,
      routeEdges,
      approx,
      clipped: !!fullPath,
      startNode,
      endNode,
      km: totalEdgeLength / 2000,
    };
  });
}
