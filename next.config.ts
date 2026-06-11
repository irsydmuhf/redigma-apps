import type { NextConfig } from "next";

const nextConfig: NextConfig = {

experimental: {
  serverActions: {
    bodySizeLimit: "50mb",
  },
},

  // @react-pdf/renderer harus dijalankan di Node runtime, bukan di-bundle
  serverExternalPackages: ["@react-pdf/renderer"],

  /* config options here */
};

export default nextConfig;

