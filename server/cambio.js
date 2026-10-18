// Cotações com cache de 6 h (frankfurter.app, dados do BCE). Valores de reserva se a API falhar.
const RESERVA = { EUR: 1, BRL: 6.2, USD: 1.08 }; // unidades por 1 EUR
let cache = { taxas: RESERVA, em: 0, fonte: 'reserva' };
const SEIS_HORAS = 6 * 60 * 60 * 1000;

export async function obterTaxas() {
  if (Date.now() - cache.em < SEIS_HORAS && cache.fonte !== 'reserva') return cache;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=BRL,USD', { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    cache = { taxas: { EUR: 1, ...j.rates }, em: Date.now(), fonte: 'BCE', data: j.date };
  } catch {
    cache = { ...cache, em: Date.now() - SEIS_HORAS + 10 * 60 * 1000 }; // tenta de novo em 10 min
  }
  return cache;
}

/** Converte valor de uma moeda para outra usando taxas por 1 EUR */
export const converter = (valor, de, para, taxas) =>
  de === para ? valor : (Number(valor) / (taxas[de] || 1)) * (taxas[para] || 1);
