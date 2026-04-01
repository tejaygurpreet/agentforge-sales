import type { Config } from "tailwindcss";

// Prompt 138 — Onyx Copper palette locked (see globals.css).
const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      transitionDuration: {
        premium: "240ms",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 12px 40px -10px hsl(221 25% 8% / 0.08), 0 4px 16px hsl(221 20% 6% / 0.05)",
        card: "0 12px 40px -10px hsl(221 25% 8% / 0.08), 0 4px 16px hsl(221 20% 6% / 0.05)",
        lift: "0 22px 56px -14px hsl(221 30% 6% / 0.12), 0 0 40px -12px hsl(21 91% 38% / 0.14)",
        inner: "inset 0 2px 8px hsl(221 25% 8% / 0.06), inset 0 1px 0 hsl(0 0% 100% / 0.92)",
        glow: "0 0 48px -8px hsl(21 91% 38% / 0.32), 0 0 28px -4px hsl(221 39% 11% / 0.18)",
        "glow-copper": "0 0 44px -6px hsl(21 91% 40% / 0.42)",
        "glow-onyx": "0 0 36px -8px hsl(221 39% 8% / 0.35)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sage: "hsl(var(--sage) / <alpha-value>)",
        terracotta: "hsl(var(--terracotta) / <alpha-value>)",
        highlight: "hsl(var(--highlight) / <alpha-value>)",
        warm: {
          cream: "#F9F6F0",
          card: "#FFFFFF",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "shimmer-slide": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "content-settle": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-sage": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(21 91% 38% / 0.4)" },
          "50%": { boxShadow: "0 0 0 14px hsl(21 91% 38% / 0)" },
        },
        "float-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-mail": {
          "0%, 100%": {
            transform: "scale(1)",
            filter: "drop-shadow(0 0 0 transparent)",
          },
          "50%": {
            transform: "scale(1.08)",
            filter: "drop-shadow(0 0 10px hsl(21 91% 38% / 0.38))",
          },
        },
        "glow-orb": {
          "0%, 100%": { opacity: "0.38", transform: "scale(1)" },
          "50%": { opacity: "0.72", transform: "scale(1.06)" },
        },
        "fab-energetic": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 0 hsl(221 39% 11% / 0.35), 0 0 0 0 hsl(21 91% 38% / 0.28), 0 18px 48px -12px hsl(221 25% 8% / 0.16)",
          },
          "50%": {
            boxShadow:
              "0 0 0 10px hsl(221 39% 11% / 0), 0 0 0 14px hsl(21 91% 38% / 0), 0 22px 56px -10px hsl(221 25% 8% / 0.16)",
          },
        },
        "hero-fly-a": {
          "0%, 100%": { transform: "translate(0, 0) rotate(-12deg) scale(1)" },
          "50%": { transform: "translate(28px, -22px) rotate(6deg) scale(1.05)" },
        },
        "hero-fly-b": {
          "0%, 100%": { transform: "translate(0, 0) rotate(8deg)" },
          "50%": { transform: "translate(-32px, 18px) rotate(-10deg)" },
        },
        "hero-fly-c": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(14px, -30px) scale(1.08)" },
          "66%": { transform: "translate(-10px, 8px) scale(0.96)" },
        },
        "badge-energetic-pulse": {
          "0%, 100%": {
            boxShadow: "0 0 0 0 hsl(21 91% 38% / 0.28), inset 0 1px 0 hsl(0 0% 100% / 0.5)",
            transform: "scale(1)",
          },
          "50%": {
            boxShadow: "0 0 0 8px hsl(21 91% 38% / 0), inset 0 1px 0 hsl(0 0% 100% / 0.55)",
            transform: "scale(1.02)",
          },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "shimmer-slide": "shimmer-slide 2.2s ease-in-out infinite",
        "content-settle": "content-settle 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-sage": "pulse-sage 2.4s ease-in-out infinite",
        "float-y": "float-y 4.5s ease-in-out infinite",
        "pulse-mail": "pulse-mail 2s ease-in-out infinite",
        "glow-orb": "glow-orb 3.5s ease-in-out infinite",
        "fab-energetic": "fab-energetic 2.8s ease-in-out infinite",
        "hero-fly-a": "hero-fly-a 5s ease-in-out infinite",
        "hero-fly-b": "hero-fly-b 6.2s ease-in-out infinite",
        "hero-fly-c": "hero-fly-c 4.4s ease-in-out infinite",
        "badge-energetic-pulse": "badge-energetic-pulse 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
