/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#fdfcf5",
          100: "#faf8da",
          200: "#f5f1c0",
          300: "#ede69a",
          400: "#e4d76f",
          500: "#d9c64a",
          600: "#c4ab35",
          700: "#a3892b",
          800: "#856e28",
          900: "#6e5a25"
        },
        brand: {
          50: "#fef1f3",
          100: "#fee5e9",
          200: "#fccfd7",
          300: "#f9a8b7",
          400: "#f47591",
          500: "#ea456c",
          600: "#de0136",
          700: "#b8002d",
          800: "#9a032a",
          900: "#840628"
        },
        carbon: {
          50: "#f6f5f5",
          100: "#e7e6e6",
          200: "#d1d0d0",
          300: "#b1afaf",
          400: "#898787",
          500: "#6e6c6c",
          600: "#5e5c5c",
          700: "#504f4f",
          800: "#464545",
          900: "#3d3c3c",
          950: "#221d1e"
        }
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
};
