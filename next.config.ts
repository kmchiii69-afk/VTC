import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* A stray package-lock.json in the home directory makes Turbopack misdetect
   * the workspace root; pin it explicitly so module resolution (tailwindcss
   * etc.) always looks in this project's node_modules. */
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
