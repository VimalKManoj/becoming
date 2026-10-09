import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  // This folder is an independent app even while nested inside the portfolio.
  turbopack: { root: path.resolve(process.cwd()) },
  // Proof lives inside Journey in the Ritual design. Old links keep their query (e.g. ?publish=).
  async redirects() {
    return [{ source: "/proof", destination: "/journey?tab=proof", permanent: false }];
  },
};
export default config;
