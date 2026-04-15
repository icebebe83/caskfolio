import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caskfolio",
    short_name: "Caskfolio",
    description: "Collector-focused bottle price index and market archive for spirits.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e8",
    theme_color: "#111111",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
