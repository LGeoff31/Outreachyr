import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: { 950: "#0c0c0e", 900: "#18181b", 600: "#52525b", 400: "#a1a1aa" },
      },
      backgroundImage: {
        mesh:
          "radial-gradient(at 40% 20%, hsla(228, 100%, 74%, 0.15) 0, transparent 50%), radial-gradient(at 80% 0%, hsla(189, 100%, 56%, 0.12) 0, transparent 50%), radial-gradient(at 0% 50%, hsla(355, 100%, 93%, 0.08) 0, transparent 50%)",
      },
    },
  },
  plugins: [],
};

export default config;
