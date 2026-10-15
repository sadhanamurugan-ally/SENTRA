/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#142b46',
        ink: '#213247',
        muted: '#758398',
        canvas: '#f5f7fa',
        teal: '#16a085',
      },
    },
  },
  plugins: [],
}
