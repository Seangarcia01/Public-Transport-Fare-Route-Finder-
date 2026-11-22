/* DOM references and the page state shared by the UI files. */

const byId = (id) => document.getElementById(id),
  mapCanvas = byId("map"),
  mapCtx = mapCanvas.getContext("2d"),
  cssVariable = (n) =>
    getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let canvasWidth = 1,
  canvasHeight = 1,
  view = {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  startNode = null,
  destinationNode = null,
  legacySearchResult = null,
  currentTrip = null,
  legacyShownSteps = 0,
  legacyTimer = null,
  offscreenBaseLayer = document.createElement("canvas"),
  baseLayerStale = true,
  pinModeOn = false,
  droppedPins = [],
  draggedPinIndex = null,
  startPoint = null,
  destinationPoint = null;
