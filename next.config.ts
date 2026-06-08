import type { NextConfig } from "next";

const nextConfig: NextConfig = {

experimental: {
  serverActions: {
    bodySizeLimit: "50mb",
  },
},

  /* config options here */
};

export default nextConfig;

