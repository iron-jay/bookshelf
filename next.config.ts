import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The production image copies .next/standalone and runs server.js, so the
  // runtime stage needs no node_modules and no npm install.
  output: "standalone",

  images: {
    // Search results show Open Library's own covers. Anything actually added to
    // the shelf gets its cover downloaded to COVERS_DIR and served locally, so
    // this pattern only ever covers transient search art.
    remotePatterns: [{ protocol: "https", hostname: "covers.openlibrary.org" }],
  },
};

export default nextConfig;
