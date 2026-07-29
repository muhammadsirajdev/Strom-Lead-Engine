import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Colors are declared as HSL channel triplets in src/index.css and consumed
 * here as `hsl(var(--token) / <alpha-value>)`, so Tailwind's opacity
 * modifiers (`bg-accent/10`) keep working and light/dark swap in one place.
 *
 * The data-visualization tokens (`chart.*`, `severity.*`, `status.*`) are a
 * validated palette, not ad-hoc picks -- see the palette note in index.css.
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem" },
    extend: {
      colors: {
        page: "hsl(var(--page) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          raised: "hsl(var(--surface-raised) / <alpha-value>)",
          inset: "hsl(var(--surface-inset) / <alpha-value>)",
        },
        line: {
          DEFAULT: "hsl(var(--line) / <alpha-value>)",
          strong: "hsl(var(--line-strong) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "hsl(var(--ink) / <alpha-value>)",
          secondary: "hsl(var(--ink-secondary) / <alpha-value>)",
          muted: "hsl(var(--ink-muted) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          hover: "hsl(var(--accent-hover) / <alpha-value>)",
          soft: "hsl(var(--accent-soft) / <alpha-value>)",
          ink: "hsl(var(--accent-ink) / <alpha-value>)",
        },
        // Ordinal ramp for the conversion funnel: one hue, monotone lightness.
        chart: {
          1: "hsl(var(--chart-1) / <alpha-value>)",
          2: "hsl(var(--chart-2) / <alpha-value>)",
          3: "hsl(var(--chart-3) / <alpha-value>)",
          4: "hsl(var(--chart-4) / <alpha-value>)",
        },
        // Lifecycle statuses. Always rendered with an icon + text label, never
        // color alone.
        status: {
          awaiting: "hsl(var(--status-awaiting) / <alpha-value>)",
          interested: "hsl(var(--status-interested) / <alpha-value>)",
          booked: "hsl(var(--status-booked) / <alpha-value>)",
          declined: "hsl(var(--status-declined) / <alpha-value>)",
          silent: "hsl(var(--status-silent) / <alpha-value>)",
          unsubscribed: "hsl(var(--status-unsubscribed) / <alpha-value>)",
        },
        severity: {
          severe: "hsl(var(--severity-severe) / <alpha-value>)",
          elevated: "hsl(var(--severity-elevated) / <alpha-value>)",
          calm: "hsl(var(--severity-calm) / <alpha-value>)",
          unknown: "hsl(var(--severity-unknown) / <alpha-value>)",
        },
      },
      borderColor: { DEFAULT: "hsl(var(--line))" },
      ringColor: { DEFAULT: "hsl(var(--accent))" },
      fontFamily: {
        sans: [
          "InterVariable",
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
      },
      borderRadius: {
        lg: "0.625rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 hsl(var(--shadow) / 0.28)",
        raised: "0 8px 24px -8px hsl(var(--shadow) / 0.45)",
        overlay: "0 24px 60px -12px hsl(var(--shadow) / 0.6)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
