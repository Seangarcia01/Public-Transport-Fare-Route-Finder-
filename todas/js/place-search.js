/* Barangays and landmarks: reading places, snapping them to roads, searching them. */

// Lower-cases and removes accents so searches like "dasmarinas" match "Dasmariñas".
const normalizeText = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function placeGroupOf(tags) {
  // only barangays: OSM place nodes tagged admin_level=10
  return tags.admin_level === "10" &&
    ["neighbourhood", "suburb", "quarter", "village", "hamlet"].includes(
      tags.place,
    )
    ? 0
    : -1;
}
// Barangays from the OpenStreetMap export (data/places.json), placed at their mapped coordinates.
const hasAmenity = (t, ...v) => v.includes(t.amenity);
// PLACES: reads barangays (OSM admin_level 10) and the landmarks listed in LANDMARK_SEARCH_WORDS.
// Numbered barangays (Salitran 1-4 ...) are merged into one point; duplicates closer than 300 m are dropped.
// Groups: 0 = barangay (purple square on the map), 1 = key landmark (red circle).
function readPlaces(osmJson) {
  const rawPlaces = [];
  for (const element of osmJson.elements || []) {
    const tags = element.tags || {},
      name = (tags.name || "").trim(),
      landmarkWords =
        LANDMARK_SEARCH_WORDS[element.type + "/" + element.id],
      groupId = landmarkWords != null ? 1 : placeGroupOf(tags);
    if (
      !name ||
      name.length < 3 ||
      groupId < 0 ||
      /^(annex|main|carpark) building|^unitop building \d|\bsecurity$/i.test(
        name,
      )
    )
      continue;
    const center = element.center || element,
      lat = center.lat,
      lon = center.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const label = name;
    const alternateNames = [
      tags.alt_name,
      tags.short_name,
      tags.official_name,
      tags["name:en"],
      tags.old_name,
      tags["name:tl"],
    ]
      .filter(Boolean)
      .join(" ; ");
    const rank = 0;
    rawPlaces.push({
      label,
      groupId,
      lat,
      lon,
      rank,
      alias: normalizeText(
        alternateNames + " ; " + (landmarkWords || ""),
      ),
    });
  }
  // Numbered barangays (Salitran 1–4, Sampaloc 1–5 …) are merged into one point at the middle of their mapped positions, named without the number
  {
    const numberedGroups = new Map();
    rawPlaces
      .filter((place) => place.groupId === 0)
      .forEach((place) => {
        let b =
          place.label.replace(/\s+\d+(-[A-Za-z])?$/, "").trim() ||
          place.label;
        if (/^zone$/i.test(b)) b = "Poblacion";
        (numberedGroups.get(b) || numberedGroups.set(b, []).get(b)).push(
          place,
        );
      });
    const landmarkPlaces = rawPlaces.filter(
      (place) => place.groupId !== 0,
    );
    rawPlaces.length = 0;
    landmarkPlaces.forEach((place) => rawPlaces.push(place));
    numberedGroups.forEach((members, b) =>
      rawPlaces.push({
        label: b,
        groupId: 0,
        rank: 0,
        lat:
          members.reduce((sum, place) => sum + place.lat, 0) /
          members.length,
        lon:
          members.reduce((sum, place) => sum + place.lon, 0) /
          members.length,
        alias: normalizeText(
          members.map((place) => place.label).join(" ; "),
        ),
      }),
    );
  }
  rawPlaces.sort(
    (a, b) =>
      a.groupId - b.groupId ||
      a.rank - b.rank ||
      a.label.localeCompare(b.label),
  );
  const keep = [];
  for (const place of rawPlaces) {
    const nameKey = normalizeText(place.label);
    if (
      !keep.some(
        (keptPlace) =>
          normalizeText(keptPlace.label) === nameKey &&
          Math.hypot(
            (keptPlace.lat - place.lat) * 110600,
            (keptPlace.lon - place.lon) * 107300,
          ) < 300,
      )
    )
      keep.push(place);
  }
  return keep;
}
// Turns raw places into map places: converts to x / y metres and snaps each one to its nearest road node.
// Places with no road within maxSnapMeters are left out. The result is stored in `places`
// (this is the list behind the A / B search boxes).
function placePointsOnMap(rawPlaces) {
  const placed = [],
    maxSnapMeters = {
      0: 900,
      1: 600,
    };
  (rawPlaces || []).forEach((place) => {
    const [x, y] = lonLatToMeters(place.lat, place.lon),
      nearestNode = nearestRoadNode(
        x,
        y,
        maxSnapMeters[place.groupId] ?? 400,
      );
    if (nearestNode >= 0)
      placed.push({
        label: place.label,
        groupName: PLACE_GROUPS[place.groupId],
        groupId: place.groupId,
        rank: place.rank,
        node: nearestNode,
        x,
        y,
        alias: place.alias,
      });
  });
  places = placed;
  const labelCounts = {};
  placed.forEach((place) => {
    const labelKey = normalizeText(place.label);
    labelCounts[labelKey] = (labelCounts[labelKey] || 0) + 1;
  });
  const seen = {};
  placed.forEach((place) => {
    const labelKey = normalizeText(place.label);
    seen[labelKey] = (seen[labelKey] || 0) + 1;
    if (seen[labelKey] > 1) place.label += " (" + seen[labelKey] + ")";
  });
  return placed;
}
// Nearest place of the given groups within maxMeters (used to say "in Barangay ...").
function nearestPlaceInGroups(x, y, groupIds, maxMeters, excludePlace) {
  let best = null,
    bestDistance = maxMeters;
  for (const place of places) {
    if (place === excludePlace || !groupIds.includes(place.groupId))
      continue;
    const distance = Math.hypot(place.x - x, place.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = place;
    }
  }
  return best;
}

function describeBarangay(x, y) {
  // the barangay whose mapped point is closest
  const barangay = nearestPlaceInGroups(x, y, [0], 5000);
  return barangay ? "in Barangay " + barangay.label : "in Dasmariñas";
}

function describeLocalStreet(x, y) {
  const barangay = nearestPlaceInGroups(x, y, [0], 5000);
  return barangay
    ? "Local street in Barangay " + barangay.label
    : "Local street";
}
// Search: every typed word must start a word of the name (or an alternate name). Better matches first.
function searchPlaces(query, limit) {
  const queryWords = normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!queryWords.length) {
    const countPerGroup = {},
      items = [];
    places.forEach((place) => {
      countPerGroup[place.groupId] =
        (countPerGroup[place.groupId] || 0) + 1;
      if (countPerGroup[place.groupId] <= 6) items.push(place);
    });
    return {
      items,
      more: places.length > items.length,
    };
  }
  const joinedQuery = queryWords.join(""),
    hits = [];
  for (const place of places) {
    const normalizedLabel = normalizeText(place.label),
      words = normalizedLabel.split(/[^a-z0-9]+/),
      aliasWords = (place.alias || "").split(/[^a-z0-9]+/),
      byWord = queryWords.every((w) =>
        words.some((x) => x.startsWith(w)),
      ),
      byAlias = queryWords.every((w) =>
        aliasWords.some((x) => x.startsWith(w)),
      ),
      byJoined = normalizedLabel
        .replace(/[^a-z0-9]/g, "")
        .startsWith(joinedQuery);
    if (!byWord && !byAlias && !byJoined) continue;
    hits.push([
      normalizedLabel.startsWith(queryWords.join(" ")) ||
      byAlias ||
      byJoined
        ? 0
        : 1,
      place,
    ]);
  }
  hits.sort(
    (a, b) =>
      a[0] - b[0] ||
      a[1].groupId - b[1].groupId ||
      a[1].rank - b[1].rank ||
      a[1].label.localeCompare(b[1].label),
  );
  return {
    items: hits.slice(0, limit || 60).map((h) => h[1]),
    more: hits.length > (limit || 60),
  };
}
