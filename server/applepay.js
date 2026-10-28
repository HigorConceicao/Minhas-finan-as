// Lançamento automático pelo Apple Pay (automação "Transação" do app Atalhos do iPhone).
// Funções puras: ler o que o Atalhos manda e sugerir a categoria. Usadas pelo servidor e pela demonstração.
import { lerValor, chaveRegra, sugerirCategoria } from '../src/importacao.js';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const idDe = (x) => (x == null ? null : String(x._id ?? x));

/** Moeda pelo texto do valor ("12,50 €", "R$ 30,00", "$4.99", "EUR 12.50") */
export function moedaDoTexto(s) {
  const t = String(s ?? '').toUpperCase();
  if (/R\$|BRL/.test(t)) return 'BRL';
  if (/€|EUR/.test(t)) return 'EUR';
  if (/US\$|USD|\$/.test(t)) return 'USD';
  const outra = t.match(/\b(CHF|GBP|£|DKK|SEK|NOK|PLN|CZK|HUF|JPY|¥)\b|£|¥/);
  return outra ? { outra: outra[0] === '£' ? 'GBP' : outra[0] === '¥' ? 'JPY' : outra[0] } : null;
}

/**
 * Lê o corpo enviado pelo Atalhos. Aceita nomes em português, inglês ou alemão, porque cada um
 * monta o atalho no idioma do iPhone: valor/amount/betrag, comerciante/merchant/handler, cartao/card/karte.
 */
export function lerTransacaoAtalho(corpo = {}) {
  const pegar = (...nomes) => {
    for (const n of nomes) for (const k of Object.keys(corpo)) if (semAcento(k) === n && corpo[k] != null && corpo[k] !== '') return corpo[k];
    return null;
  };
  const bruto = pegar('valor', 'quantia', 'amount', 'betrag', 'value');
  const valorTexto = typeof bruto === 'number' ? String(bruto) : String(bruto ?? '');
  // tira símbolos de outras moedas antes de ler o número
  const n = typeof bruto === 'number' ? bruto : lerValor(valorTexto.replace(/[A-Za-z£¥]+\.?/g, ''));
  if (!Number.isFinite(n) || n === 0) return { erro: 'valor_invalido' };
  const moedaInformada = String(pegar('moeda', 'currency', 'wahrung') || '').toUpperCase();
  const moeda = ['EUR', 'BRL', 'USD'].includes(moedaInformada) ? moedaInformada : moedaDoTexto(valorTexto);
  const comerciante = String(pegar('comerciante', 'merchant', 'handler', 'estabelecimento', 'loja', 'descricao') || '').trim().slice(0, 120);
  const cartao = String(pegar('cartao', 'cartao ou passe', 'card', 'card or pass', 'karte', 'karte oder ticket') || '').trim().slice(0, 80);
  return {
    valor: Math.round(Math.abs(n) * 100) / 100,
    estorno: n < 0, // valor negativo: devolução
    moeda: typeof moeda === 'string' ? moeda : null,
    moedaOutra: moeda && typeof moeda === 'object' ? moeda.outra : null,
    comerciante, cartao, valorTexto,
  };
}

/**
 * Categoria para um estabelecimento: 1) regras aprendidas (importações e correções),
 * 2) a categoria usada da última vez com o mesmo nome, 3) palavras conhecidas (Rewe → Mercado…).
 */
export function categoriaDoComerciante(comerciante, { categorias = [], regras = [], historico = [] } = {}) {
  if (!comerciante) return null;
  const cats = categorias.map((c) => ({ ...c, _id: idDe(c) }));
  const despesas = new Set(cats.filter((c) => c.tipo === 'despesa').map((c) => c._id));
  const texto = ` ${semAcento(comerciante)} `;
  for (const r of regras) {
    const cat = idDe(r.categoria);
    if (r.texto && texto.includes(r.texto) && despesas.has(cat)) return cat;
  }
  const chave = chaveRegra(comerciante);
  const anterior = historico
    .filter((l) => l.tipo === 'despesa' && l.categoria && despesas.has(idDe(l.categoria)) && chaveRegra(l.descricao) === chave)
    .sort((a, b) => new Date(b.data) - new Date(a.data))[0];
  if (anterior) return idDe(anterior.categoria);
  return sugerirCategoria({ tipo: 'despesa', descricao: comerciante }, cats, []);
}

/** A conta de um cartão: o vínculo escolhido para aquele cartão, senão a conta padrão */
export function contaDoCartao(cartao, config = {}) {
  const mapa = config.cartoes || {};
  if (cartao && mapa[cartao]) return mapa[cartao];
  return config.conta || null;
}
