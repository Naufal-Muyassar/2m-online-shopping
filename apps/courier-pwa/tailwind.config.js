import preset from "@2m/config/tailwind-preset";

export default {
  presets: [preset],
  // Couriers work on phones, where a tapped control would otherwise keep its hover colour.
  future: { hoverOnlyWhenSupported: true },
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
};
