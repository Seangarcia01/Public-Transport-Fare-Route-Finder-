/* Legacy shortest-road search (no longer called by the page). */

// LEGACY: the original shortest-ROAD search (bidirectional Dijkstra, one search from each end until they meet).
// The page now plans trips with planJeepneyTrip instead; this function is no longer called.
function bidirectionalShortestPath(sourceNode, targetNode) {
  const nodeCount = roadMap.nodeCount,
    distances = [
      new Float64Array(nodeCount).fill(Infinity),
      new Float64Array(nodeCount).fill(Infinity),
    ],
    previousNode = [
      new Int32Array(nodeCount).fill(-1),
      new Int32Array(nodeCount).fill(-1),
    ],
    dn = [new Uint8Array(nodeCount), new Uint8Array(nodeCount)],
    queues = [new Heap(), new Heap()],
    adjacency = [roadMap.outgoingEdges, roadMap.incomingEdges],
    sk = [],
    su = [],
    sp = [];
  distances[0][sourceNode] = 0;
  distances[1][targetNode] = 0;
  queues[0].push(0, sourceNode);
  queues[1].push(0, targetNode);
  let bestMeetingCost = Infinity,
    meetingNode = -1;
  const clean = (k) => {
    while (queues[k].heapItems.length && dn[k][queues[k].heapItems[0][1]])
      queues[k].pop();
  };
  for (;;) {
    clean(0);
    clean(1);
    if (!queues[0].heapItems.length || !queues[1].heapItems.length) break;
    const tf = queues[0].heapItems[0][0],
      tb = queues[1].heapItems[0][0];
    if (tf + tb >= bestMeetingCost) break;
    const k = tf <= tb ? 0 : 1,
      [du, u] = queues[k].pop();
    dn[k][u] = 1;
    sk.push(k);
    su.push(u);
    sp.push(previousNode[k][u]);
    for (const [v, w] of adjacency[k][u]) {
      const nd = du + w;
      if (nd < distances[k][v]) {
        distances[k][v] = nd;
        previousNode[k][v] = u;
        queues[k].push(nd, v);
      }
      if (
        distances[1 - k][v] < Infinity &&
        nd + distances[1 - k][v] < bestMeetingCost
      ) {
        bestMeetingCost = nd + distances[1 - k][v];
        meetingNode = v;
      }
    }
  }
  if (meetingNode < 0) return null;
  const L = [];
  for (let v = meetingNode; v !== -1; v = previousNode[0][v])
    L.unshift(v);
  for (
    let v = previousNode[1][meetingNode];
    v !== -1;
    v = previousNode[1][v]
  )
    L.push(v);
  let nf = 0,
    nb = 0;
  sk.forEach((k) => (k ? nb++ : nf++));
  return {
    sk,
    su,
    sp,
    path: L,
    meet: meetingNode,
    meters: bestMeetingCost,
    nf,
    nb,
  };
}
