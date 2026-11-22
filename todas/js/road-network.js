/* Road graph: Heap, reading OSM roads, building the network, nearest-node lookup. */

class Heap {
  constructor() {
    this.heapItems = [];
  }
  push(priority, value) {
    const heapItems = this.heapItems;
    heapItems.push([priority, value]);
    let i = heapItems.length - 1;
    while (i > 0) {
      const parentIndex = (i - 1) >> 1;
      if (heapItems[parentIndex][0] <= heapItems[i][0]) break;
      [heapItems[parentIndex], heapItems[i]] = [
        heapItems[i],
        heapItems[parentIndex],
      ];
      i = parentIndex;
    }
  }
  pop() {
    const heapItems = this.heapItems,
      top = heapItems[0],
      last = heapItems.pop();
    if (heapItems.length) {
      heapItems[0] = last;
      let i = 0;
      for (;;) {
        let childIndex = 2 * i + 1;
        if (childIndex >= heapItems.length) break;
        if (
          childIndex + 1 < heapItems.length &&
          heapItems[childIndex + 1][0] < heapItems[childIndex][0]
        )
          childIndex++;
        if (heapItems[i][0] <= heapItems[childIndex][0]) break;
        [heapItems[i], heapItems[childIndex]] = [
          heapItems[childIndex],
          heapItems[i],
        ];
        i = childIndex;
      }
    }
    return top;
  }
}

// Reads the compact road file, Overpass JSON, or GeoJSON (data/road-network.json). Keeps drivable roads only.
function readRoadWays(mapJson) {
  const ways = [],
    addWay = (coords, tags) => {
      if (
        tags &&
        tags.highway &&
        DRIVABLE_ROAD_TYPES.test(tags.highway) &&
        coords &&
        coords.length > 1
      )
        ways.push({
          coords,
          tags,
        });
    };
  if (mapJson.w)
    mapJson.w.forEach(([highwayIndex, onewayCode, nameIndex, f]) => {
      const coords = [];
      for (let i = 0; i < f.length; i += 2) coords.push([f[i], f[i + 1]]);
      addWay(coords, {
        highway: mapJson.h[highwayIndex],
        name: mapJson.n[nameIndex] || "",
        oneway:
          onewayCode === 1 ? "yes" : onewayCode === -1 ? "-1" : undefined,
      });
    });
  else if (mapJson.elements)
    mapJson.elements.forEach((element) => {
      if (element.type === "way" && element.geometry)
        addWay(
          element.geometry.map((g) => [g.lon, g.lat]),
          element.tags,
        );
    });
  else
    (mapJson.features || []).forEach((f) => {
      const g = f.geometry;
      if (!g) return;
      const properties = f.properties || {},
        tags = properties.tags || properties;
      if (g.type === "LineString") addWay(g.coordinates, tags);
      else if (g.type === "MultiLineString")
        g.coordinates.forEach((coords) => addWay(coords, tags));
    });
  return ways;
}

// ROAD GRAPH CLEAN-UP (Kosaraju's algorithm for strongly connected components).
// Pass 1: depth-first search to record the order nodes finish. Pass 2: walk the reversed graph in reverse
// finishing order; each walk finds one component. Only the LARGEST component is kept ("main network"),
// so every place that is snapped to it can reach every other one (one-way streets included).
function findMainRoadNetwork(outgoingEdges, incomingEdges, nodeCount) {
  // largest strongly connected set: every node in it can reach every other, so a route always exists
  const visited = new Uint8Array(nodeCount),
    finishOrder = [];
  for (let startNode = 0; startNode < nodeCount; startNode++) {
    if (visited[startNode]) continue;
    const stack = [startNode],
      edgeCursor = [0];
    visited[startNode] = 1;
    while (stack.length) {
      const node = stack[stack.length - 1],
        i = edgeCursor[edgeCursor.length - 1];
      if (i < outgoingEdges[node].length) {
        edgeCursor[edgeCursor.length - 1]++;
        const neighbor = outgoingEdges[node][i][0];
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
          edgeCursor.push(0);
        }
      } else {
        finishOrder.push(node);
        stack.pop();
        edgeCursor.pop();
      }
    }
  }
  const componentOf = new Int32Array(nodeCount).fill(-1),
    componentSize = [];
  let componentCount = 0;
  for (let position = nodeCount - 1; position >= 0; position--) {
    const startNode = finishOrder[position];
    if (componentOf[startNode] >= 0) continue;
    let count = 0;
    const stack = [startNode];
    componentOf[startNode] = componentCount;
    while (stack.length) {
      const node = stack.pop();
      count++;
      for (const edge of incomingEdges[node]) {
        const neighbor = edge[0];
        if (componentOf[neighbor] < 0) {
          componentOf[neighbor] = componentCount;
          stack.push(neighbor);
        }
      }
    }
    componentSize.push(count);
    componentCount++;
  }
  let largestComponent = 0;
  componentSize.forEach((c, i) => {
    if (c > componentSize[largestComponent]) largestComponent = i;
  });
  return new Uint8Array(nodeCount).map((_, i) =>
    componentOf[i] === largestComponent ? 1 : 0,
  );
}

// BUILDS THE ROAD GRAPH from the drivable OpenStreetMap ways.
//   - every distinct lon/lat becomes a node; positions are converted to metres around the map centre
//   - an edge is [neighbourNode, lengthInMetres, roadNameId]; outgoingEdges follow traffic direction
//     (one-way streets respected), incomingEdges is the same graph reversed
//   - drawSegments is a flat list [fromNode, toNode, roadClass, ...] used only for painting
//   - roadLabels keeps the longest main roads so their names can be written on the map
function buildRoadMap(ways) {
  let minLon = 1e9,
    maxLon = -1e9,
    minLat = 1e9,
    maxLat = -1e9;
  ways.forEach((way) =>
    way.coords.forEach(([lo, la]) => {
      minLon = Math.min(minLon, lo);
      maxLon = Math.max(maxLon, lo);
      minLat = Math.min(minLat, la);
      maxLat = Math.max(maxLat, la);
    }),
  );
  const originLon = (minLon + maxLon) / 2,
    originLat = (minLat + maxLat) / 2,
    metersPerDegreeLon =
      (Math.PI / 180) * 6371009 * Math.cos((originLat * Math.PI) / 180),
    metersPerDegreeLat = (Math.PI / 180) * 6371009;
  const nodeIdByKey = new Map(),
    nodeX = [],
    nodeY = [],
    outgoingEdges = [],
    incomingEdges = [],
    drawSegments = [],
    roadNames = [""],
    roadNameIndex = new Map([["", 0]]),
    longRoadsByName = new Map(),
    roadClassRank = {
      motorway: 2,
      trunk: 2,
      primary: 2,
      secondary: 2,
      tertiary: 1,
    };
  const nodeIdFor = (lo, la) => {
    const coordKey = lo.toFixed(6) + "," + la.toFixed(6);
    let i = nodeIdByKey.get(coordKey);
    if (i === undefined) {
      i = nodeX.length;
      nodeIdByKey.set(coordKey, i);
      nodeX.push((lo - originLon) * metersPerDegreeLon);
      nodeY.push((la - originLat) * metersPerDegreeLat);
      outgoingEdges.push([]);
      incomingEdges.push([]);
    }
    return i;
  };
  ways.forEach((way) => {
    const tags = way.tags,
      roadClass = roadClassRank[tags.highway.replace("_link", "")] ?? 0,
      roadName = tags.name || tags.ref || "";
    let nameIndex = roadNameIndex.get(roadName);
    if (nameIndex === undefined) {
      nameIndex = roadNames.length;
      roadNames.push(roadName);
      roadNameIndex.set(roadName, nameIndex);
    }
    const onewayTag = tags.oneway,
      direction =
        onewayTag === "-1"
          ? -1
          : onewayTag === "yes" ||
              onewayTag === "1" ||
              onewayTag === "true" ||
              tags.junction === "roundabout"
            ? 1
            : 0;
    const wayNodeIds = way.coords.map((p) => nodeIdFor(p[0], p[1]));
    let wayLength = 0;
    for (let i = 0; i < wayNodeIds.length - 1; i++) {
      const p = wayNodeIds[i],
        q = wayNodeIds[i + 1];
      if (p === q) continue;
      const segmentLength = Math.hypot(
        nodeX[p] - nodeX[q],
        nodeY[p] - nodeY[q],
      );
      wayLength += segmentLength;
      if (direction >= 0) {
        outgoingEdges[p].push([q, segmentLength, nameIndex]);
        incomingEdges[q].push([p, segmentLength, nameIndex]);
      }
      if (direction <= 0) {
        outgoingEdges[q].push([p, segmentLength, nameIndex]);
        incomingEdges[p].push([q, segmentLength, nameIndex]);
      }
      drawSegments.push(p, q, roadClass);
    }
    if (roadClass === 2 && roadName) {
      const labelNode = wayNodeIds[wayNodeIds.length >> 1],
        roadPieces = longRoadsByName.get(roadName) || [];
      roadPieces.push([wayLength, labelNode]);
      longRoadsByName.set(roadName, roadPieces);
    }
  });
  const nodeCount = nodeX.length,
    inMainNetwork = findMainRoadNetwork(
      outgoingEdges,
      incomingEdges,
      nodeCount,
    ),
    roadLabels = [];
  longRoadsByName.forEach((roadPieces, roadName) => {
    roadPieces.sort((p, q) => q[0] - p[0]);
    roadPieces.slice(0, 2).forEach(([segmentLength, labelNode]) => {
      if (segmentLength > 500) roadLabels.push([roadName, labelNode]);
    });
  });
  const namedRoadNodes = [];
  for (let i = 0; i < nodeCount; i++) {
    if (
      outgoingEdges[i].some((e) => e[2]) ||
      incomingEdges[i].some((e) => e[2])
    )
      namedRoadNodes.push(i);
  }
  let minX = 1e12,
    maxX = -1e12,
    minY = 1e12,
    maxY = -1e12;
  for (let i = 0; i < nodeCount; i++) {
    minX = Math.min(minX, nodeX[i]);
    maxX = Math.max(maxX, nodeX[i]);
    minY = Math.min(minY, nodeY[i]);
    maxY = Math.max(maxY, nodeY[i]);
  }
  return {
    nodeX,
    nodeY,
    outgoingEdges,
    incomingEdges,
    drawSegments,
    roadNames,
    inMainNetwork,
    roadLabels,
    namedRoadNodes,
    originLon,
    originLat,
    metersPerDegreeLon,
    metersPerDegreeLat,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    nodeCount,
    segmentCount: drawSegments.length / 3,
  };
}

// MAP PROJECTION: converts latitude / longitude to local x / y metres (flat-earth approximation,
// accurate enough for one city). Every place and route coordinate goes through this function.
function lonLatToMeters(lat, lon) {
  return [
    (lon - roadMap.originLon) * roadMap.metersPerDegreeLon,
    (lat - roadMap.originLat) * roadMap.metersPerDegreeLat,
  ];
}
// SNAPPING: nearest node of the main network to a point (x, y), or -1 if none is within maxMeters.
// Used for barangays, landmarks, map clicks and route start / end points.
function nearestRoadNode(x, y, maxMeters) {
  let bestNode = -1,
    bestDistance = maxMeters ?? 1e12;
  for (let i = 0; i < roadMap.nodeCount; i++) {
    if (!roadMap.inMainNetwork[i]) continue;
    const distance = Math.hypot(
      roadMap.nodeX[i] - x,
      roadMap.nodeY[i] - y,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNode = i;
    }
  }
  return bestNode;
}
// Finds where two named roads cross: the mean position of nodes that touch both roads,
// snapped back onto the road network. Returns -1 when the roads do not meet.
function junctionOfRoads(roadNameA, roadNameB) {
  // mean position of nodes where both roads meet, snapped to a connected road node
  const roadIdA = roadMap.roadNames.indexOf(roadNameA),
    roadIdB = roadMap.roadNames.indexOf(roadNameB);
  if (roadIdA < 1 || roadIdB < 1) return -1;
  let sumX = 0,
    sumY = 0,
    count = 0;
  for (const node of roadMap.namedRoadNodes) {
    let touchesA = 0,
      touchesB = 0;
    for (const edge of roadMap.outgoingEdges[node]) {
      if (edge[2] === roadIdA) touchesA = 1;
      if (edge[2] === roadIdB) touchesB = 1;
    }
    for (const edge of roadMap.incomingEdges[node]) {
      if (edge[2] === roadIdA) touchesA = 1;
      if (edge[2] === roadIdB) touchesB = 1;
    }
    if (touchesA && touchesB) {
      sumX += roadMap.nodeX[node];
      sumY += roadMap.nodeY[node];
      count++;
    }
  }
  return count ? nearestRoadNode(sumX / count, sumY / count, 150) : -1;
}
