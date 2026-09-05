/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        panel2: "rgb(var(--c-panel2) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        neon: "rgb(var(--c-neon) / <alpha-value>)",
        neon2: "rgb(var(--c-neon2) / <alpha-value>)",
        teal: "rgb(var(--c-teal) / <alpha-value>)",
        coral: "rgb(var(--c-coral) / <alpha-value>)",
        mist: "rgb(var(--c-mist) / <alpha-value>)",
        paper: "rgb(var(--c-paper) / <alpha-value>)"
      },
      fontFamily: {
        display: ["'Cabinet Grotesk'", "Satoshi", "sans-serif"],
        body: ["Satoshi", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"]
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "14px"
      }
    }
  },
  plugins: []
};
