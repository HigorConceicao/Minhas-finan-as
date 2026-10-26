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

// Cotações de um dia específico (BCE, via frankfurter), com cache permanente por data.
const porDia = new Map();
export async function taxasNaData(diaISO) {
  if (porDia.has(diaISO)) return porDia.get(diaISO);
  const hoje = new Date().toISOString().slice(0, 10);
  if (diaISO >= hoje) return (await obterTaxas()).taxas;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`https://api.frankfurter.app/${diaISO}?from=EUR&to=BRL,USD`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const taxas = { EUR: 1, ...j.rates };
    porDia.set(diaISO, taxas);
    return taxas;
  } catch {
    return (await obterTaxas()).taxas; // sem conexão: usa a cotação atual
  }
}

/** Prepara um conversor síncrono com as cotações de todos os dias pedidos */
export async function conversorPorDia(dias) {
  const unicos = [...new Set(dias)].slice(0, 400);
  const mapa = new Map(await Promise.all(unicos.map(async (d) => [d, await taxasNaData(d)])));
  const atual = (await obterTaxas()).taxas;
  return (valor, de, para, dia) => converter(valor, de, para, mapa.get(dia) || atual);
}
