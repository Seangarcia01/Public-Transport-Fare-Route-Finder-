/* Trip planner: cheapest walk + jeepney trip (planJeepneyTrip). */

// TRIP PLANNER: cheapest trip in MINUTES, found with Dijkstra on a layered graph.
//   state = layer * nodeCount + node
//   layer 0       = walking: any road, both directions, at TRAVEL_SPEEDS.walk
//   layer 1..N    = sitting on jeepney route 1..N: only along that route's routeEdges, at TRAVEL_SPEEDS.ride
//   boarding      = step from layer 0 to a route layer at a node on that route; costs TRAVEL_SPEEDS.board minutes
//   getting off   = step back to layer 0 at the same node; free
// A transfer is simply "get off, then board another route". Returns legs { kind, routeIndex, nodes, meters };
// `meters` of a ride leg is the distance ridden, which is what the fare is based on. Returns null if unreachable.
function planJeepneyTrip(startNode, targetNode) {
  // cheapest trip in minutes: walk on any road, ride only along the jeepney routes, wait TRAVEL_SPEEDS.board minutes at each pickup
  const nodeCount = roadMap.nodeCount,
    routeCount = jeepneyRoutes.length,
    bestCost = new Float64Array((routeCount + 1) * nodeCount).fill(
      Infinity,
    ),
    previousState = new Int32Array((routeCount + 1) * nodeCount).fill(-1),
    queue = new Heap();
  const relax = (toState, cost, fromState) => {
    if (cost < bestCost[toState]) {
      bestCost[toState] = cost;
      previousState[toState] = fromState;
      queue.push(cost, toState);
    }
  };
  bestCost[startNode] = 0;
  queue.push(0, startNode);
  let finalState = -1;
  while (queue.heapItems.length) {
    const [costSoFar, state] = queue.pop();
    if (costSoFar > bestCost[state]) continue;
    const layer = (state / nodeCount) | 0,
      node = state - layer * nodeCount;
    if (layer === 0) {
      if (node === targetNode) {
        finalState = state;
        break;
      }
      for (const [neighbor, edgeLength] of roadMap.outgoingEdges[node])
        if (roadMap.inMainNetwork[neighbor])
          relax(
            neighbor,
            costSoFar + edgeLength / TRAVEL_SPEEDS.walk,
            state,
          );
      for (const [neighbor, edgeLength] of roadMap.incomingEdges[node])
        if (roadMap.inMainNetwork[neighbor])
          relax(
            neighbor,
            costSoFar + edgeLength / TRAVEL_SPEEDS.walk,
            state,
          );
      for (let routeIndex = 0; routeIndex < routeCount; routeIndex++)
        if (
          jeepneyRoutes[routeIndex].routeEdges.has(node) ||
          jeepneyRoutes[routeIndex].nodes.has(node)
        )
          relax(
            (routeIndex + 1) * nodeCount + node,
            costSoFar + TRAVEL_SPEEDS.board,
            state,
          );
    } else {
      const routeIndex = layer - 1;
      for (const [neighbor, edgeLength] of jeepneyRoutes[
        routeIndex
      ].routeEdges.get(node) || [])
        relax(
          layer * nodeCount + neighbor,
          costSoFar + edgeLength / TRAVEL_SPEEDS.ride,
          state,
        );
      relax(node, costSoFar, state);
    }
  }
  if (finalState < 0) return null;
  const statePath = [];
  for (let state = finalState; state !== -1; state = previousState[state])
    statePath.unshift(state);
  const rawSegments = [];
  let currentSegment = null;
  for (const state of statePath) {
    const layer = (state / nodeCount) | 0,
      node = state - layer * nodeCount;
    if (!currentSegment || currentSegment.layer !== layer) {
      if (currentSegment && currentSegment.layer === 0 && layer === 0) {
      }
      currentSegment = {
        layer,
        nodes: [node],
      };
      rawSegments.push(currentSegment);
    } else if (
      currentSegment.nodes[currentSegment.nodes.length - 1] !== node
    )
      currentSegment.nodes.push(node);
  }
  const tripSegments = [];
  rawSegments.forEach((segment) => {
    let meters = 0;
    for (let i = 0; i < segment.nodes.length - 1; i++) {
      const fromNode = segment.nodes[i],
        toNode = segment.nodes[i + 1],
        edge = (
          segment.layer
            ? jeepneyRoutes[segment.layer - 1].routeEdges.get(fromNode) ||
              []
            : [
                ...roadMap.outgoingEdges[fromNode],
                ...roadMap.incomingEdges[fromNode],
              ]
        )
          .filter((x) => x[0] === toNode)
          .sort((p, q) => p[1] - q[1])[0];
      meters += edge
        ? edge[1]
        : Math.hypot(
            roadMap.nodeX[fromNode] - roadMap.nodeX[toNode],
            roadMap.nodeY[fromNode] - roadMap.nodeY[toNode],
          );
    }
    if (
      segment.layer === 0 &&
      meters < 1 &&
      tripSegments.length &&
      tripSegments.length < rawSegments.length - 1
    )
      return;
    tripSegments.push({
      kind: segment.layer ? "ride" : "walk",
      routeIndex: segment.layer ? segment.layer - 1 : -1,
      nodes: segment.nodes,
      meters,
    });
  });
  return {
    segs: tripSegments,
    mins: bestCost[finalState],
    walk: tripSegments
      .filter((x) => x.kind === "walk")
      .reduce((fromNode, x) => fromNode + x.meters, 0),
    ride: tripSegments
      .filter((x) => x.kind === "ride")
      .reduce((fromNode, x) => fromNode + x.meters, 0),
    pickups: tripSegments.filter((x) => x.kind === "ride").length,
  };
}
