import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Memory creation allows photo attachments up to 10 MB; multipart/form-data
  // overhead pushes the raw body above that, so raise Next's default 1 MB
  // server action limit or every upload-bearing submission fails with a 500.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
export default nextConfig;
