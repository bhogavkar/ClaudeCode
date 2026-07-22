/** @type {import('tailwindcss').Config} */
export default {
  // MUI owns component styling; Tailwind is used for layout utilities.
  // `important` scopes utilities under #root so they can win against MUI where needed.
  corePlugins: { preflight: false },
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
      backdropBlur: { xs: '2px' },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'flip-in': {
          '0%': { transform: 'rotateY(90deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'flip-in': 'flip-in 0.4s ease-out',
      },
    },
  },
  plugins: [],
};
