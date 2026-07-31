/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: { primary: { 600: '#16a34a', 700: '#15803d' }, gold: { 500: '#f59e0b' } } } },
  plugins: [],
};
