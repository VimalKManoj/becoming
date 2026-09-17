import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  // This folder is an independent app even while nested inside the portfolio.
  turbopack: { root: path.resolve(process.cwd()) },
};
export default config;
