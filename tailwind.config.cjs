/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Bebas Neue"', 'sans-serif'],
        body: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink: '#1a1a1a',
        paper: '#f5f0e8',
        accent: '#c1121f',
      },
    },
  },
  plugins: [],
};
