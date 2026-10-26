/** @type {import('tailwindcss').Config} */
// Cores vêm de variáveis CSS (src/index.css): claro, escuro ou automático.
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ['./index.html', './demo.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        fundo: c('fundo'), cartao: c('cartao'), sutil: c('sutil'), linha: c('linha'),
        texto: { DEFAULT: c('texto'), 2: c('texto-2'), 3: c('texto-3') },
        marca: { DEFAULT: c('marca'), forte: c('marca-forte'), suave: c('marca-suave') },
        'sobre-marca': c('sobre-marca'),
        capa: { DEFAULT: c('capa'), texto: c('capa-texto') },
        pos: { DEFAULT: c('pos'), suave: c('pos-suave') },
        neg: { DEFAULT: c('neg'), suave: c('neg-suave') },
        aviso: { DEFAULT: c('aviso'), suave: c('aviso-suave') },
      },
      fontFamily: { sans: ['"Manrope"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'] },
      borderRadius: { '4xl': '1.75rem' },
      boxShadow: {
        cartao: '0 1px 2px rgb(var(--sombra) / 0.04), 0 4px 16px -6px rgb(var(--sombra) / 0.10)',
        flutua: '0 12px 40px -12px rgb(var(--sombra) / 0.35)',
      },
    },
  },
  plugins: [],
};
