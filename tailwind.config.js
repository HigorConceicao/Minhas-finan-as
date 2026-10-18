/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        papel: { DEFAULT: '#f6f0e4', claro: '#fbf8f1', escuro: '#ece3d1' },
        tinta: { DEFAULT: '#2b2520', suave: '#5c5248', fraca: '#8f8476' },
        linha: '#d9cdb6',
        verde: { DEFAULT: '#2f6b4f', claro: '#e3eee6' },
        vermelho: { DEFAULT: '#a33a2c', claro: '#f6e3df' },
        ambar: { DEFAULT: '#b07a1f', claro: '#f6ead2' },
        couro: { DEFAULT: '#6e4a2e', escuro: '#4e3320' },
      },
      fontFamily: {
        titulo: ['"Fraunces"', 'Georgia', 'serif'],
        corpo: ['"Inter"', 'system-ui', 'sans-serif'],
        num: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: { folha: '0 1px 0 #d9cdb6, 0 8px 24px -12px rgba(78,51,32,.25)' },
    },
  },
  plugins: [],
};
