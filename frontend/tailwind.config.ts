import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: false,
      padding: '1.5rem',
      screens: {
        xl: '1600px',
        '2xl': '1920px',
      },
    },
    extend: {
      colors: {
        ink: '#1C2333',
        paper: '#F6F4EE',
        amber: {
          DEFAULT: '#E8A33D',
          dark: '#C6852A',
        },
        brick: {
          DEFAULT: '#C1473F',
          dark: '#9E382F',
        },
        moss: {
          DEFAULT: '#3E7C6B',
          dark: '#2F6153',
        },
        flag: {
          DEFAULT: '#B8842E',
          light: '#EFD9AE',
        },
        slate: {
          100: '#E8E6DE',
          200: '#D3D1C7',
          300: '#ABAFBB',
          400: '#868C9E',
          500: '#656B82',
          600: '#4B5169',
        },
      },
      fontFamily: {
        display: ['"Archivo Narrow"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xs': ['14px', { lineHeight: '18px', fontWeight: '600' }],
        'display-sm': ['16px', { lineHeight: '20px', fontWeight: '600' }],
        'display-md': ['20px', { lineHeight: '24px', fontWeight: '700' }],
        'display-lg': ['28px', { lineHeight: '32px', fontWeight: '700' }],
        'display-xl': ['40px', { lineHeight: '44px', fontWeight: '700' }],
        'body-xs': ['13px', { lineHeight: '18px' }],
        'body-sm': ['14px', { lineHeight: '20px' }],
        'body-md': ['16px', { lineHeight: '24px' }],
        'body-lg': ['18px', { lineHeight: '28px' }],
      },
      boxShadow: {
        board: '0 1px 2px rgba(28, 35, 51, 0.06), 0 4px 12px rgba(28, 35, 51, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config
