export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f7f5",
          100: "#e3ebe6",
          200: "#c7d6cd",
          300: "#9fb7a9",
          400: "#6d8f7b",
          500: "#4d715e",
          600: "#3b5b4b",
          700: "#304a3e",
          800: "#293d34",
          900: "#1c2a25",
          950: "#0c1713"
        },
        pulse: {
          50: "#f7fee7",
          100: "#ecfccb",
          200: "#d9f99d",
          300: "#bef264",
          400: "#a3e635",
          500: "#84cc16",
          600: "#65a30d",
          700: "#4d7c0f",
          800: "#3f6212",
          900: "#365314",
          950: "#1a2e05"
        },
        clay: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c"
        }
      },
      fontFamily: {
        sans: ["Inter", "Avenir Next", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Avenir Next", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 30px 80px -55px rgba(12, 23, 19, 0.65)",
        lift: "0 16px 40px -28px rgba(12, 23, 19, 0.65)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" }
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.65" },
          "100%": { transform: "scale(1.35)", opacity: "0" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        float: "float 7s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2.4s ease-out infinite"
      }
    }
  },
  plugins: []
};
