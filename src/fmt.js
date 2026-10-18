const cache = new Map();
const formatador = (moeda) => {
  if (!cache.has(moeda)) cache.set(moeda, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }));
  return cache.get(moeda);
};

export const dinheiro = (v, moeda = 'EUR') => formatador(moeda).format(Number(v) || 0);
export const compacto = (v, moeda = 'EUR') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda, notation: 'compact', maximumFractionDigits: 1 }).format(Number(v) || 0);
export const pct = (v, casas = 2) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const mesCurto = (m) => { const [y, mo] = m.split('-'); return `${MESES[Number(mo) - 1]}/${y.slice(2)}`; };
export const mesLongo = (m) => { const [y, mo] = m.split('-'); const n = MESES_LONGOS[Number(mo) - 1]; return `${n[0].toUpperCase()}${n.slice(1)} de ${y}`; };
export const data = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
export const dataCompleta = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

export const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const somarMes = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const paraInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const duracao = (meses) => {
  if (meses == null) return null;
  const a = Math.floor(meses / 12), m = meses % 12;
  return [a && `${a} ano${a > 1 ? 's' : ''}`, m && `${m} ${m > 1 ? 'meses' : 'mês'}`].filter(Boolean).join(' e ');
};

/** Lê "1.234,56", "1234.56" ou "1234,5" como número */
export const lerNumero = (s) => {
  if (typeof s === 'number') return s;
  const t = String(s || '').trim().replace(/\s/g, '');
  if (!t) return NaN;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return Number(normal);
};
