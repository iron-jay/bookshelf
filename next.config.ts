import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The production image copies .next/standalone and runs server.js, so the
  // runtime stage needs no node_modules and no npm install.
  output: "standalone",

  experimental: {
    serverActions: {
      // The default is 1 MB, and past it Next answers with a 500 before any of
      // our code runs. A Goodreads export of a big library with reviews is
      // more than that; the import's own limit is 20 MB, so this sits just
      // above it and the import says "too large" in words instead.
      bodySizeLimit: "21mb",
    },
  },

  images: {
    // Search results show Open Library's own covers. Anything actually added to
    // the shelf gets its cover downloaded to COVERS_DIR and served locally, so
    // this pattern only ever covers transient search art.
    remotePatterns: [{ protocol: "https", hostname: "covers.openlibrary.org" }],
  },
};

export default nextConfig;
