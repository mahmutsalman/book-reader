/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Warm cream/sepia palette for eye-friendly dark mode reading
        cream: {
          100: '#E8DCC8', // Primary reading text
          200: '#D5CBBA', // Secondary text, labels
          300: '#C9BDAB', // Tertiary text, hints
          400: '#A89F8F', // Muted/disabled text
          500: '#8A8175', // Subtle/faint text
        },
        // Book card palette - warm earthy tones
        book: {
          paper: '#F5ECD7',      // Light mode - warm cream paper
          spine: '#D4C4A8',      // Light mode - spine accent
          cover: '#3D3630',      // Dark mode - warm dark brown
          accent: '#5C4F42',     // Dark mode - book spine color
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
