import type { MetadataRoute } from "next";

// Lets a phone's "Add to home screen" use the sticker icon on the room's
// ground rather than a screenshot of the page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "bookshelf",
    short_name: "bookshelf",
    description: "Self-hosted book tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#263034",
    theme_color: "#263034",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
