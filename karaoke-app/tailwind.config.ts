import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        stage: {
          950: "#0a0512",
          900: "#120a24",
          800: "#1b1035",
          700: "#271347",
        },
        neon: {
          pink: "#ff3cac",
          purple: "#7c3aed",
          cyan: "#22d3ee",
          gold: "#facc15",
        },
      },
      backgroundImage: {
        "stage-gradient":
          "radial-gradient(circle at 20% 20%, rgba(124,58,237,0.35), transparent 45%), radial-gradient(circle at 80% 0%, rgba(255,60,172,0.28), transparent 40%), radial-gradient(circle at 50% 100%, rgba(34,211,238,0.2), transparent 45%), #0a0512",
        "card-glow":
          "linear-gradient(135deg, rgba(255,60,172,0.15), rgba(124,58,237,0.12))",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(255,60,172,0.45)",
        "glow-cyan": "0 0 40px -12px rgba(34,211,238,0.5)",
      },
      animation: {
        "pulse-slow": "pulse 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
