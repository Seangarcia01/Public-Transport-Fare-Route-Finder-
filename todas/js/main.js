/* Start-up: resize / theme listeners and the first loadMap() call. */

addEventListener("resize", fitCanvasToScreen);
matchMedia("(prefers-color-scheme:dark)").addEventListener(
  "change",
  refreshMap,
);
fitCanvasToScreen();
loadMap();
