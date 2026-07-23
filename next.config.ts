import type { NextConfig } from "next";

const STATIC_ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // A 2 MB ZIP is about 2.7 MB after base64 encoding, leaving margin
      // below Vercel's 4.5 MB function request cap.
      bodySizeLimit: "4mb",
    },
  },
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
