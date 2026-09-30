export const THEME_STORAGE_KEY = "hazelite:theme";

/** Runs in <head> before first paint so a saved choice never flashes the other theme. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
