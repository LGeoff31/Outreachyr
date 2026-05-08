import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const color = (name: string) => `hsl(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        border: color("--border"),
        input: color("--input"),
        ring: color("--ring"),
        background: color("--background"),
        foreground: color("--foreground"),
        primary: {
          DEFAULT: color("--primary"),
          foreground: color("--primary-foreground"),
        },
        secondary: {
          DEFAULT: color("--secondary"),
          foreground: color("--secondary-foreground"),
        },
        destructive: {
          DEFAULT: color("--destructive"),
          foreground: color("--destructive-foreground"),
        },
        muted: {
          DEFAULT: color("--muted"),
          foreground: color("--muted-foreground"),
        },
        accent: {
          DEFAULT: color("--accent"),
          foreground: color("--accent-foreground"),
        },
        popover: {
          DEFAULT: color("--popover"),
          foreground: color("--popover-foreground"),
        },
        card: {
          DEFAULT: color("--card"),
          foreground: color("--card-foreground"),
        },
        ink: { 950: "#0c0c0e", 900: "#18181b", 600: "#52525b", 400: "#a1a1aa" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "4xl": "2rem",
      },
      ringWidth: {
        3: "3px",
      },
      backgroundImage: {
        mesh:
          "radial-gradient(at 40% 20%, hsla(228, 100%, 74%, 0.15) 0, transparent 50%), radial-gradient(at 80% 0%, hsla(189, 100%, 56%, 0.12) 0, transparent 50%), radial-gradient(at 0% 50%, hsla(355, 100%, 93%, 0.08) 0, transparent 50%)",
      },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      addVariant("data-checked", [
        "&:where([data-state='checked'])",
        "&:where([data-checked]:not([data-checked='false']))",
      ]);
      addVariant("data-horizontal", "&:where([data-orientation='horizontal'])");
      addVariant("data-vertical", "&:where([data-orientation='vertical'])");
    }),
  ],
};

export default config;
