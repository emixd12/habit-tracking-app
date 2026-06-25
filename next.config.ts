import type { NextConfig } from "next";

const STATIC_ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
  async headers() {
    return [
      {
        source: "/brand/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: STATIC_ASSET_CACHE,
          },
        ],
      },
      {
        source: "/sounds/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: STATIC_ASSET_CACHE,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
