import { portfolio } from "./content.js?v=276fa973";
import { initPlatform } from "./js/platform.js?v=276fa973";
import { initTheme } from "./js/theme.js?v=276fa973";
import { initLatest } from "./js/latest.js?v=276fa973";
import { initWeather } from "./js/weather.js?v=276fa973-weather-1";
import { initCommandPalette } from "./js/command-palette.js?v=276fa973-defer";
import { initHeroDither } from "./js/hero-dither.js?v=276fa973";
import { initSiteHeader } from "./js/site-header.js?v=276fa973-shell";

document.addEventListener("DOMContentLoaded", () => {
  initPlatform(portfolio);
  initCommandPalette();
  initSiteHeader();
  initWeather();
  initTheme();
  initHeroDither();
  void initLatest();
});
