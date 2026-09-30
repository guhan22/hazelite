/** iPhone or iPad (iPadOS reports itself as a Mac, so touch support is checked too). Client-only. */
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Running as an installed app (Home Screen / standalone window). Client-only. */
export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
