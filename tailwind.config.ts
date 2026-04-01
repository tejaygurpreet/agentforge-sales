import type { Config } from "tailwindcss";

// Prompt 136 — Sage + terracotta + coral; glow shadows + energetic motion.
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
        premium: "200ms",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 12px 40px -10px hsl(30 10% 18% / 0.1), 0 4px 16px hsl(30 8% 12% / 0.06)",
        card: "0 12px 40px -10px hsl(30 10% 18% / 0.1), 0 4px 16px hsl(30 8% 12% / 0.06)",
        lift: "0 22px 56px -14px hsl(30 12% 15% / 0.16), 0 0 40px -12px hsl(9 100% 77% / 0.2)",
        inner: "inset 0 2px 8px hsl(30 10% 18% / 0.07), inset 0 1px 0 hsl(0 0% 100% / 0.9)",
        glow: "0 0 52px -8px hsl(9 100% 77% / 0.45), 0 0 28px -4px hsl(82 14% 56% / 0.25)",
        "glow-coral": "0 0 36px -6px hsl(9 100% 77% / 0.55)",
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
        coral: "hsl(var(--coral) / <alpha-value>)",
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
        /** Prompt 111 — soft loading sheen (skeletons, placeholders). */
        "shimmer-slide": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        /** Prompt 113 — gentle content entrance (sections, fallbacks). */
        "content-settle": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        /** Prompt 135 — FAB / emphasis pulse (sage glow) */
        "pulse-sage": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(82 14% 56% / 0.45)" },
          "50%": { boxShadow: "0 0 0 14px hsl(82 14% 56% / 0)" },
        },
        "float-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        /** Prompt 136 — header mail icon life */
        "pulse-mail": {
          "0%, 100%": {
            transform: "scale(1)",
            filter: "drop-shadow(0 0 0 transparent)",
          },
          "50%": {
            transform: "scale(1.12)",
            filter: "drop-shadow(0 0 10px hsl(9 100% 77% / 0.65))",
          },
        },
        "glow-orb": {
          "0%, 100%": { opacity: "0.45", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.08)" },
        },
        "fab-energetic": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 0 hsl(82 14% 56% / 0.5), 0 0 0 0 hsl(9 100% 77% / 0.35), 0 18px 48px -12px hsl(30 12% 15% / 0.2)",
          },
          "50%": {
            boxShadow:
              "0 0 0 10px hsl(82 14% 56% / 0), 0 0 0 16px hsl(9 100% 77% / 0), 0 22px 56px -10px hsl(30 12% 15% / 0.22)",
          },
        },
        /** Prompt 136 — flying mail paths in hero */
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
            boxShadow: "0 0 0 0 hsl(9 100% 77% / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.5)",
            transform: "scale(1)",
          },
          "50%": {
            boxShadow: "0 0 0 8px hsl(9 100% 77% / 0), inset 0 1px 0 hsl(0 0% 100% / 0.55)",
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
