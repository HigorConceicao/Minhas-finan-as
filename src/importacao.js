// Leitura de extratos CSV dos bancos (Sparkasse, N26, ING, DKB, Commerzbank e genéricos).
// Funções puras: rodam no navegador e nos testes do Node.

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Divide o texto em linhas de campos, respeitando aspas ("a;b" fica num campo só) */
export function lerCsv(texto, sep) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

/** Separador mais provável: o que aparece de forma consistente nas primeiras linhas */
export function detectarSeparador(texto) {
  const amostra = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40);
  let melhor = ';', nota = -1;
  for (const sep of [';', ',', '\t', '|']) {
    const contagens = amostra.map((l) => l.split(sep).length - 1).filter((n) => n > 0);
    if (!contagens.length) continue;
    const moda = contagens.sort((a, b) => contagens.filter((x) => x === b).length - contagens.filter((x) => x === a).length)[0];
    const n = contagens.filter((x) => x === moda).length * moda;
    if (n > nota) { nota = n; melhor = sep; }
  }
  return melhor;
}

// sinônimos por campo, em ordem de preferência
const SINONIMOS = {
  data: ['buchungstag', 'buchungsdatum', 'buchung', 'booking date', 'date', 'datum', 'data', 'transaction date', 'valutadatum', 'wertstellung', 'valuta'],
  valor: ['betrag', 'amount', 'valor', 'umsatz', 'betrag (eur)', 'betrag (€)'],
  favorecido: ['beguenstigter/zahlungspflichtiger', 'begunstigter/zahlungspflichtiger', 'zahlungsempfanger*in', 'zahlungsempfanger', 'auftraggeber/empfanger', 'auftraggeber / empfanger', 'empfanger', 'partner name', 'payee', 'counterparty', 'name', 'favorecido'],
  pagador: ['zahlungspflichtige*r', 'zahlungspflichtiger', 'auftraggeber'],
  descricao: ['verwendungszweck', 'payment reference', 'buchungstext', 'beschreibung', 'description', 'descricao', 'reference', 'umsatztyp', 'transaction type'],
  moeda: ['waehrung', 'wahrung', 'currency', 'moeda'],
};

// casa só a palavra inteira: "date" não casa com "Datei", "umsatz" não casa com "Umsatzanzeige"
const contemPalavra = (cab, sin) => {
  const i = cab.indexOf(sin);
  if (i < 0) return false;
  const antes = cab[i - 1], depois = cab[i + sin.length];
  return (!antes || !/[a-z]/.test(antes)) && (!depois || !/[a-z]/.test(depois));
};
function pontuar(cab, sin) {
  if (cab === sin) return 3;
  if (contemPalavra(cab, sin)) return cab.startsWith(sin) ? 2 : 1;
  return 0;
}

/** Descobre qual coluna é data, valor, favorecido etc. a partir do cabeçalho */
export function mapearColunas(cabecalho) {
  const cab = cabecalho.map(semAcento);
  const usado = new Set();
  const mapa = {};
  for (const campo of ['valor', 'data', 'descricao', 'favorecido', 'pagador']) {
    for (const sin of SINONIMOS[campo]) {
      let melhor = -1, nota = 0;
      cab.forEach((c, i) => { if (usado.has(i)) return; const p = pontuar(c, sin); if (p > nota) { nota = p; melhor = i; } });
      if (melhor >= 0) { mapa[campo] = melhor; usado.add(melhor); break; }
    }
  }
  // moeda: a coluna de moeda mais perto da coluna de valor (a ING tem duas)
  const moedas = cab.map((c, i) => (SINONIMOS.moeda.some((s) => c.includes(s)) ? i : -1)).filter((i) => i >= 0 && !usado.has(i));
  if (moedas.length) mapa.moeda = mapa.valor == null ? moedas[0] : moedas.sort((a, b) => Math.abs(a - mapa.valor) - Math.abs(b - mapa.valor))[0];
  // "Saldo"/"Kontostand" nunca é o valor do lançamento
  if (mapa.valor != null && /saldo|kontostand|balance/.test(cab[mapa.valor])) delete mapa.valor;
  return mapa;
}

export function detectarBanco(cabecalho) {
  const c = cabecalho.map(semAcento).join('|');
  if (c.includes('beguenstigter/zahlungspflichtiger') || c.includes('begunstigter/zahlungspflichtiger')) return 'Sparkasse';
  if (c.includes('partner name') || (c.includes('payee') && c.includes('amount (eur)'))) return 'N26';
  if (c.includes('auftraggeber/empfanger')) return 'ING';
  if (c.includes('zahlungsempfanger*in') || c.includes('zahlungspflichtige*r')) return 'DKB';
  if (c.includes('buchungstag') && c.includes('umsatzart')) return 'Commerzbank';
  return null;
}

/** "-1.234,56 €" → -1234.56 ; "1,234.56" → 1234.56 */
export function lerValor(s) {
  let t = String(s ?? '').replace(/[€$\s]|EUR|BRL|USD|R\$/gi, '').trim();
  if (!t) return NaN;
  let neg = false;
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (t.startsWith('(') && t.endsWith(')')) { neg = true; t = t.slice(1, -1); }
  if (t.startsWith('+')) t = t.slice(1);
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
  const v = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  let n;
  if (v === -1) n = Number(t);
  else {
    const dec = t[v];
    const casas = t.length - v - 1;
    if (casas === 3 && t.indexOf(dec) === v && !t.includes(dec === ',' ? '.' : ',')) n = Number(t.replace(/[.,]/g, '')); // "1.234" = mil
    else n = Number(t.slice(0, v).replace(/[.,]/g, '') + '.' + t.slice(v + 1));
  }
  return neg ? -n : n;
}

/** "31.10.2026", "31.10.26", "2026-10-31", "31/10/2026" → "2026-10-31" */
export function lerData(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return valida(y, +m[2], +m[1]); }
  return null;
}
const valida = (y, mo, d) => {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Impressão digital curta (FNV-1a) para reconhecer linhas já importadas */
export function impressao(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const limpar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Lê o arquivo inteiro. Devolve o cabeçalho, o mapa de colunas, o banco detectado e os lançamentos.
 * `mapaManual` permite à pessoa corrigir as colunas na tela.
 */
export function interpretarExtrato(texto, mapaManual = null) {
  const limpo = texto.replace(/^﻿/, '');
  const sep = detectarSeparador(limpo);
  const linhas = lerCsv(limpo, sep);
  // o cabeçalho é a primeira linha (entre as 30 primeiras) que tem data e valor reconhecíveis
  // e cujas linhas seguintes têm mesmo uma data e um valor nessas colunas
  let iCab = -1, mapa = null;
  for (let i = 0; i < Math.min(30, linhas.length); i++) {
    const m = mapearColunas(linhas[i]);
    if (m.data == null || m.valor == null) continue;
    const confirma = linhas.slice(i + 1, i + 6).some((l) => lerData(l[m.data]) && Number.isFinite(lerValor(l[m.valor])));
    if (confirma) { iCab = i; mapa = m; break; }
  }
  if (iCab === -1) {
    // sem cabeçalho conhecido: usa a primeira linha com mais colunas e deixa a pessoa escolher
    iCab = linhas.findIndex((l) => l.length === Math.max(...linhas.slice(0, 30).map((x) => x.length)));
    mapa = {};
  }
  if (mapaManual) mapa = { ...mapa, ...mapaManual };
  const cabecalho = (linhas[iCab] || []).map(limpar);
  const banco = detectarBanco(cabecalho);

  const vistos = new Map();
  const lancamentos = [];
  let ignoradas = 0;
  for (const l of linhas.slice(iCab + 1)) {
    const data = mapa.data != null ? lerData(l[mapa.data]) : null;
    const valor = mapa.valor != null ? lerValor(l[mapa.valor]) : NaN;
    if (!data || !Number.isFinite(valor) || valor === 0) { ignoradas++; continue; }
    const tipo = valor < 0 ? 'despesa' : 'receita';
    // DKB tem colunas separadas para quem pagou e quem recebeu
    const contraparte = limpar(tipo === 'receita' && mapa.pagador != null ? l[mapa.pagador] : l[mapa.favorecido] ?? '') || limpar(l[mapa.pagador] ?? '');
    const detalhe = limpar(mapa.descricao != null ? l[mapa.descricao] : '');
    const descricao = (contraparte || detalhe || '—').slice(0, 120);
    const moedaLida = mapa.moeda != null ? limpar(l[mapa.moeda]).toUpperCase() : '';
    const moeda = ['EUR', 'BRL', 'USD'].includes(moedaLida) ? moedaLida : null;
    const base = `${data}|${valor.toFixed(2)}|${semAcento(descricao)}|${semAcento(detalhe)}`;
    const n = (vistos.get(base) || 0) + 1; // dois cafés iguais no mesmo dia são dois lançamentos
    vistos.set(base, n);
    lancamentos.push({
      importId: impressao(`${base}|${n}`), data, tipo, valor: Math.abs(Math.round(valor * 100) / 100),
      descricao, nota: contraparte && detalhe && detalhe !== contraparte ? detalhe.slice(0, 200) : '', moeda, textoBusca: semAcento(`${contraparte} ${detalhe}`),
    });
  }
  return { separador: sep, cabecalho, mapa, banco, lancamentos, ignoradas };
}

// ---------- categorização ----------

// palavras-chave por nome de categoria padrão
export const PALAVRAS = {
  Mercado: ['rewe', 'edeka', 'lidl', 'aldi', 'netto', 'penny', 'kaufland', 'norma', 'globus', 'tegut', 'dm-drogerie', 'dm drogerie', 'rossmann', 'muller handels', 'mueller handels', 'denns', 'alnatura', 'supermarkt', 'carrefour', 'pao de acucar'],
  Restaurantes: ['lieferando', 'wolt', 'uber eats', 'mcdonald', 'burger king', 'starbucks', 'restaurant', 'ristorante', 'pizzeria', 'cafe', 'baeckerei', 'backerei', 'padaria', 'bakery', 'kebab', 'doner', 'sushi', 'kfc', 'subway', 'vapiano', 'ifood'],
  Transporte: ['deutsche bahn', 'db vertrieb', 'db fernverkehr', 'bahn.de', 'flixbus', 'flixtrain', 'uber', 'bolt', 'tier', 'lime', 'bvg', 'mvv', 'hvv', 'vvs', 'tankstelle', 'aral', 'shell', 'esso', 'deutschlandticket', 'stadtbus', 'sbb'],
  Assinaturas: ['spotify', 'netflix', 'disney', 'amazon prime', 'prime video', 'apple.com', 'icloud', 'youtube', 'google storage', 'google one', 'openai', 'chatgpt', 'anthropic', 'claude.ai', 'adobe', 'microsoft', 'vodafone', 'telekom', 'o2 ', 'congstar', 'dazn', 'audible'],
  Moradia: ['miete', 'vermieter', 'nebenkosten', 'hausverwaltung', 'wohnung', 'strom', 'stadtwerke', 'rundfunk', 'beitragsservice', 'ikea', 'gas '],
  'Saúde': ['apotheke', 'arzt', 'zahnarzt', 'krankenkasse', 'physiotherapie', 'klinik', 'praxis', 'optiker', 'farmacia', 'drogasil'],
  Lazer: ['fitness', 'mcfit', 'urban sports', 'kino', 'cinema', 'theater', 'steam', 'playstation', 'nintendo', 'eventim', 'museum', 'bar '],
  Viagens: ['lufthansa', 'ryanair', 'easyjet', 'eurowings', 'condor', 'tap air', 'latam', 'airbnb', 'booking.com', 'hotel', 'hostel', 'expedia', 'swiss air', 'flughafen'],
  'Educação': ['udemy', 'coursera', 'thalia', 'hugendubel', 'hochschule', 'universitat', 'universitaet', 'volkshochschule', 'sprachschule', 'goethe'],
  'Salário': ['gehalt', 'lohn', 'salary', 'bezuge', 'bezuege', 'salario'],
};

const temPalavra = (texto, p) => {
  const q = p.trim();
  if (q.length <= 4) return new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(texto);
  return texto.includes(q);
};

/** Chave curta para lembrar a categoria de um favorecido: "REWE Markt GmbH 1234" → "rewe markt gmbh" */
export const chaveRegra = (descricao) => semAcento(descricao).replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');

/** Sugere a categoria: primeiro as regras aprendidas, depois as palavras-chave */
export function sugerirCategoria(lanc, categorias, regras = []) {
  const doTipo = categorias.filter((c) => c.tipo === lanc.tipo);
  const texto = ` ${lanc.textoBusca || semAcento(lanc.descricao)} `;
  for (const r of regras) {
    if (r.texto && texto.includes(r.texto) && doTipo.some((c) => c._id === r.categoria)) return r.categoria;
  }
  for (const c of doTipo) {
    const palavras = PALAVRAS[c.nome];
    if (palavras?.some((p) => temPalavra(texto, p))) return c._id;
  }
  return null;
}

/** Lê bytes do arquivo como texto: tenta UTF-8 e cai para Windows-1252 (comum nos CSV da Sparkasse) */
export function decodificar(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1252').decode(buffer); }
}

// extrato de exemplo (formato Sparkasse) para a demonstração
export const EXEMPLO_SPARKASSE = [
  '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"',
  '"DE00";"02.{M}";"02.{M}";"KARTENZAHLUNG";"REWE SAGT DANKE 4711";"REWE Markt GmbH";"DE11";"X";"-54,32";"EUR";"Umsatz gebucht"',
  '"DE00";"03.{M}";"03.{M}";"LASTSCHRIFT";"Monatsbeitrag";"McFit GmbH";"DE12";"X";"-24,90";"EUR";"Umsatz gebucht"',
  '"DE00";"05.{M}";"05.{M}";"KARTENZAHLUNG";"Bestellung 99812";"Lieferando.de";"DE13";"X";"-23,80";"EUR";"Umsatz gebucht"',
  '"DE00";"06.{M}";"06.{M}";"KARTENZAHLUNG";"Ticket Konstanz-Zuerich";"DB Vertrieb GmbH";"DE14";"X";"-39,90";"EUR";"Umsatz gebucht"',
  '"DE00";"08.{M}";"08.{M}";"KARTENZAHLUNG";"Filiale 2231";"Lidl sagt Danke";"DE15";"X";"-31,17";"EUR";"Umsatz gebucht"',
  '"DE00";"09.{M}";"09.{M}";"KARTENZAHLUNG";"Apotheke am Markt";"Apotheke am Markt";"DE16";"X";"-12,49";"EUR";"Umsatz gebucht"',
  '"DE00";"11.{M}";"11.{M}";"KARTENZAHLUNG";"Rechnung 2026";"Thalia Buecher GmbH";"DE17";"X";"-18,99";"EUR";"Umsatz gebucht"',
  '"DE00";"12.{M}";"12.{M}";"KARTENZAHLUNG";"Cafe";"Starbucks Konstanz";"DE18";"X";"-4,60";"EUR";"Umsatz gebucht"',
  '"DE00";"12.{M}";"12.{M}";"KARTENZAHLUNG";"Cafe";"Starbucks Konstanz";"DE18";"X";"-4,60";"EUR";"Umsatz gebucht"',
  '"DE00";"14.{M}";"14.{M}";"UEBERWEISUNG";"Geschenk";"Maria Silva";"DE19";"X";"-50,00";"EUR";"Umsatz gebucht"',
  '"DE00";"15.{M}";"15.{M}";"GUTSCHRIFT";"Rueckerstattung Bestellung";"Amazon EU S.a.r.L.";"DE20";"X";"19,99";"EUR";"Umsatz gebucht"',
  '"DE00";"16.{M}";"16.{M}";"KARTENZAHLUNG";"Flug";"Eurowings GmbH";"DE21";"X";"-129,00";"EUR";"Umsatz gebucht"',
].join('\r\n');
