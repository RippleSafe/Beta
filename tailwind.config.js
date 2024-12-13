/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#AB9FF2', // Soft purple
        'primary-dark': '#9B8CE0', // Darker purple
        'surface': '#1B1B1F', // Near black
        'surface-light': '#2B2B30', // Lighter surface
        'background': '#14141A', // Dark background
        'success': '#36BF76', // Green for success states
        'error': '#FF6B6B', // Red for errors
        'warning': '#FFB155', // Orange for warnings
        'muted': '#6E6E76', // Muted text
      },
      boxShadow: {
        'glow': '0 0 20px rgba(171, 159, 242, 0.15)',
      },
    },
  },
  plugins: [],
} 