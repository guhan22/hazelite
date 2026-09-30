import type { MetadataRoute } from "next";

/** Web app manifest: lets browsers install Hazelite to the home screen as a standalone app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Hazelite — Singapore haze monitor",
    short_name: "Hazelite",
    description: "Live PSI and PM2.5 readings across Singapore's five regions, from NEA.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9f9f7",
    theme_color: "#f9f9f7",
    categories: ["weather", "health"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
