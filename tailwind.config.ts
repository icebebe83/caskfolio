import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#f3f4f6",
        shell: "#fbf7ef",
        brass: "#b7791f",
        cask: "#7c4a21",
        pine: "#183a37",
      },
      boxShadow: {
        panel: "0 18px 45px rgba(15, 23, 42, 0.08)",
      },
      backgroundImage: {
        grain:
          "radial-gradient(circle at 1px 1px, rgba(15, 23, 42, 0.04) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};

export default config;

