import type { MetadataRoute } from "next";

/**
 * Prompt 84 — PWA manifest (installable app on mobile / desktop).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgentForge Sales",
    short_name: "AgentForge",
    description: "Autonomous multi-agent B2B Sales Operating System",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0b1120",
    theme_color: "#0b1120",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
