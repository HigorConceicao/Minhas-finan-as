// Formatação de dinheiro, datas e números conforme o idioma escolhido.
let LOC = 'pt-BR';
const cache = new Map();
export const definirIdioma = (locale) => { LOC = locale; cache.clear(); };
export const localeAtual = () => LOC;
const usaPontoDecimal = () => LOC.startsWith('en');

const nf = (chave, opts) => {
  const k = `${chave}|${LOC}`;
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(LOC, opts));
  return cache.get(k);
};

export const dinheiro = (v, moeda = 'EUR') => nf(`m${moeda}`, { style: 'currency', currency: moeda }).format(Number(v) || 0);
export const compacto = (v, moeda = 'EUR') =>
  nf(`c${moeda}`, { style: 'currency', currency: moeda, notation: 'compact', maximumFractionDigits: 1 }).format(Number(v) || 0);
export const pct = (v, casas = 2) =>
  v == null ? '—' : `${nf(`p${casas}`, { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(Number(v))}%`;

const primeiraMaiuscula = (s) => s.charAt(0).toLocaleUpperCase(LOC) + s.slice(1);
const dataDoMes = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 15)); };

export const mesCurto = (m) => {
  const nome = new Intl.DateTimeFormat(LOC, { month: 'short', timeZone: 'UTC' }).format(dataDoMes(m)).replace('.', '');
  return `${primeiraMaiuscula(nome)}/${m.slice(2, 4)}`;
};
export const mesLongo = (m) => primeiraMaiuscula(new Intl.DateTimeFormat(LOC, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dataDoMes(m)));
/** Mês dentro de uma frase: minúsculo em português ("até abril de 2029"), como manda cada idioma nos outros */
export const mesNaFrase = (m) => { const s = mesLongo(m); return LOC.startsWith('pt') ? s.charAt(0).toLocaleLowerCase(LOC) + s.slice(1) : s; };
export const mesSoNome = (m) => primeiraMaiuscula(new Intl.DateTimeFormat(LOC, { month: 'long', timeZone: 'UTC' }).format(dataDoMes(m)));
export const data = (d) => primeiraMaiuscula(new Intl.DateTimeFormat(LOC, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d)));
export const dataCurta = (d) => new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d));
export const dataCompleta = (d) => new Intl.DateTimeFormat(LOC, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(d));

export const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const somarMes = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const paraInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const ultimoDia = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0, 12)); };

/** "2 anos e 3 meses" no idioma atual; recebe o tradutor */
export const duracao = (meses, t) => {
  if (meses == null) return null;
  const a = Math.floor(meses / 12), m = meses % 12;
  const partes = [a && t(a > 1 ? 'duracao.anos' : 'duracao.ano', { n: a }), m && t(m > 1 ? 'duracao.meses' : 'duracao.mes', { n: m })].filter(Boolean);
  return partes.join(t('duracao.e'));
};

/** Número para mostrar num campo de edição (vírgula ou ponto conforme o idioma) */
export const paraCampo = (n) => (n == null || n === '' ? '' : usaPontoDecimal() ? String(n) : String(n).replace('.', ','));

/**
 * Lê o que a pessoa digitou. PT/DE: "350.000", "1.234,56", "0,85". EN: "350,000", "1,234.56", "0.85".
 */
export const lerNumero = (s) => {
  if (typeof s === 'number') return s;
  const t = String(s || '').trim().replace(/\s/g, '');
  if (!t) return NaN;
  if (usaPontoDecimal()) return Number(t.replace(/,/g, ''));
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, '')); // "350.000" = trezentos e cinquenta mil
  return Number(t);
};
