import type { NextConfig } from "next";

let outputMode: NextConfig["output"] | undefined;
if (process.env.NEXT_STATIC_EXPORT === "true") {
  outputMode = "export";
} else if (process.env.NEXT_OUTPUT_STANDALONE === "true") {
  outputMode = "standalone";
}

const nextConfig: NextConfig = {
  ...(outputMode ? { output: outputMode } : {}),
  images: { unoptimized: true },
};

export default nextConfig;
