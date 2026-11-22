/* Shared constants and state: place groups, landmark search words, drivable road types. */

/*
 * ToDas - jeepney route and fare finder for Dasmariñas City
 *
 * HOW THE DATA FLOWS (read in this order)
 *   1. MAP:      data/road-network.json (OpenStreetMap roads) -> readRoadWays -> buildRoadMap  -> roadMap
 *   2. PLACES:   data/places.json (barangays, landmarks) -> readPlaces -> placePointsOnMap -> places
 *   3. ROUTES:   JEEPNEY_ROUTE_DIRECTORY (R01-R07, R10, jr01-jr05) -> buildJeepneyRoutes            -> jeepneyRoutes
 *   4. TRIP:     planJeepneyTrip(startNode, destinationNode)  -> currentTrip (list of walk / ride legs)
 *   5. FARE:     showFarePanel -> jeepneyFareForDistance, one call per ride (metres ridden along the route)
 *   6. SCREEN:   drawMap paints roads (cached layer), places, the trip line and the A / B markers
 *
 * VOCABULARY
 *   node       = one road junction / road point in roadMap (an index, 0 .. nodeCount-1)
 *   x, y       = metres east / north of the map origin (see lonLatToMeters). Screen pixels are screenX / screenY.
 *   leg        = one part of a trip: kind "walk" (any road) or kind "ride" (along one jeepney route)
 */
// Place groups, in the order they are listed (the first four are drawn on the map)
const PLACE_GROUPS = ["Barangays", "Landmarks"];
// Landmarks added from data/places.json by OSM id (alternate spellings help the search): "type/id" -> search words
const LANDMARK_SEARCH_WORDS = {
  "relation/8646163": "sm dasmarinas dasma smd",
  "relation/8505494": "dlsu-d dlsud dlsu d de la salle university",
  "relation/8202453":
    "delasallehsi de la salle hsi dlshsi dlsmhsi dls hsi health sciences institute",
  "relation/13433287": "avida sta catalina santa residences",
  "node/9200001": "pala pala palapala sm city dasmarinas",
  "node/9200002": "robinsons place dasmarinas pala pala palapala",
  "node/9200003": "walter mart waltermart dasmarinas",
  "node/9200004": "kadiwa",
  "node/9200005": "fcie",
  "node/9200006": "golden city avenue",
  "node/9200007": "dbb 1 area 1 dbb1",
  "node/9200008": "dbb c area c dbbc",
  "node/9200009": "dbb d area d dbbd helping",
  "node/9200010": "dbb g area g dbbg",
  "node/9200011": "paliparan 3 iii",
};

const DRIVABLE_ROAD_TYPES =
  /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$/;
let roadMap = null,
  places = [];
const withCurlyApostrophe = (s) => String(s || "").replace(/'/g, "’");
