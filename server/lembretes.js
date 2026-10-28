// Notificações no celular (Web Push): contas a vencer, faturas e orçamento acima do alerta.
// Funciona no iPhone com o app instalado na tela de início (iOS 16.4 ou mais novo).
import webpush from 'web-push';
import { Config, InscricaoPush, LembreteEnviado, Recorrente, Conta, Lancamento, Categoria, ReservaViagem, Viagem } from './models.js';
import { lembretes, movimentosSeparados } from './contas.js';
import { mesDe, round2, periodoDoMes, mesFinanceiro, diaValido } from './finance.js';
import { obterTaxas, converter } from './cambio.js';

const FUSO = process.env.TZ_LEMBRETES || 'Europe/Berlin';
let pronto = null;

/** Chaves VAPID: das variáveis de ambiente ou geradas uma vez e guardadas no banco */
async function configurar() {
  if (pronto) return pronto;
  pronto = (async () => {
    let pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      const salvo = await Config.findOne({ chave: 'vapid' }).lean();
      if (salvo?.valor?.publicKey) ({ publicKey: pub, privateKey: priv } = salvo.valor);
      else {
        const novas = webpush.generateVAPIDKeys();
        await Config.updateOne({ chave: 'vapid' }, { $set: { valor: novas } }, { upsert: true });
        ({ publicKey: pub, privateKey: priv } = novas);
      }
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:financas@example.com', pub, priv);
    return pub;
  })();
  return pronto;
}

export const chavePublica = () => configurar();

export async function inscrever(inscricao, { idioma = 'pt', dias = 2 } = {}) {
  if (!inscricao?.endpoint || !inscricao?.keys?.p256dh || !inscricao?.keys?.auth) return false;
  await InscricaoPush.updateOne(
    { endpoint: inscricao.endpoint },
    { $set: { keys: inscricao.keys, idioma: ['pt', 'de', 'en'].includes(idioma) ? idioma : 'pt', dias: Math.min(7, Math.max(0, Number(dias) || 2)) } },
    { upsert: true }
  );
  return true;
}
export const cancelarInscricao = (endpoint) => InscricaoPush.deleteOne({ endpoint: String(endpoint || '') });

const TXT = {
  pt: {
    teste: ['Notificações ativadas', 'Você vai receber avisos de contas a vencer e do orçamento.'],
    recorrente: (i, q) => [`${i.titulo} vence ${q}`, i.valorTxt], fatura: (i, q) => [`Fatura ${i.titulo} vence ${q}`, `${i.valorTxt} a pagar`],
    'fatura-vencida': (i) => [`Fatura ${i.titulo} venceu`, `${i.valorTxt} em aberto`],
    orcamento: (i) => [`${i.titulo}: ${Math.round(i.pct)}% do orçamento`, `${i.valorTxt} de ${i.limiteTxt}`],
    'orcamento-estourado': (i) => [`${i.titulo}: orçamento estourado`, `${i.valorTxt} de ${i.limiteTxt}`],
    hoje: 'hoje', amanha: 'amanhã', em: (d) => `em ${d} dias`,
  },
  de: {
    teste: ['Benachrichtigungen aktiv', 'Du wirst an fällige Zahlungen und dein Budget erinnert.'],
    recorrente: (i, q) => [`${i.titulo} fällig ${q}`, i.valorTxt], fatura: (i, q) => [`Kreditkartenabrechnung ${i.titulo} fällig ${q}`, `${i.valorTxt} zu zahlen`],
    'fatura-vencida': (i) => [`Abrechnung ${i.titulo} überfällig`, `${i.valorTxt} offen`],
    orcamento: (i) => [`${i.titulo}: ${Math.round(i.pct)} % des Budgets`, `${i.valorTxt} von ${i.limiteTxt}`],
    'orcamento-estourado': (i) => [`${i.titulo}: Budget überschritten`, `${i.valorTxt} von ${i.limiteTxt}`],
    hoje: 'heute', amanha: 'morgen', em: (d) => `in ${d} Tagen`,
  },
  en: {
    teste: ['Notifications on', 'You’ll be reminded of upcoming bills and your budget.'],
    recorrente: (i, q) => [`${i.titulo} due ${q}`, i.valorTxt], fatura: (i, q) => [`${i.titulo} statement due ${q}`, `${i.valorTxt} to pay`],
    'fatura-vencida': (i) => [`${i.titulo} statement overdue`, `${i.valorTxt} outstanding`],
    orcamento: (i) => [`${i.titulo}: ${Math.round(i.pct)}% of budget`, `${i.valorTxt} of ${i.limiteTxt}`],
    'orcamento-estourado': (i) => [`${i.titulo}: over budget`, `${i.valorTxt} of ${i.limiteTxt}`],
    hoje: 'today', amanha: 'tomorrow', em: (d) => `in ${d} days`,
  },
};
const LOCALE = { pt: 'pt-BR', de: 'de-DE', en: 'en-GB' };

async function enviar(inscricao, titulo, corpo, url = '/') {
  try {
    await webpush.sendNotification({ endpoint: inscricao.endpoint, keys: inscricao.keys }, JSON.stringify({ titulo, corpo, url }), { TTL: 6 * 3600 });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) await InscricaoPush.deleteOne({ endpoint: inscricao.endpoint }); // aparelho desinscrito
    return false;
  }
}

export async function enviarTeste(endpoint) {
  await configurar();
  const lista = endpoint ? await InscricaoPush.find({ endpoint }).lean() : await InscricaoPush.find().lean();
  let n = 0;
  for (const i of lista) { const [a, b] = TXT[i.idioma]?.teste || TXT.pt.teste; if (await enviar(i, a, b)) n++; }
  return n;
}

const horaLocal = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: FUSO }).format(d));
const diasAte = (iso) => {
  const hoje = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date()) + 'T12:00:00Z');
  return Math.round((new Date(String(iso).slice(0, 10) + 'T12:00:00Z') - hoje) / 86400000);
};

/** Verifica e envia o que estiver pendente. Roda de tempos em tempos (só entre 8h e 21h). */
export async function verificarLembretes({ forcar = false } = {}) {
  const inscricoes = await InscricaoPush.find().lean();
  if (!inscricoes.length) return 0;
  const h = horaLocal();
  if (!forcar && (h < 8 || h > 21)) return 0;
  await configurar();

  const hoje = new Date();
  const [recorrentes, cartoes, categorias] = await Promise.all([Recorrente.find({ ativo: true }).lean(), Conta.find({ tipo: 'cartao', arquivada: false }).lean(), Categoria.find({ tipo: 'despesa' }).lean()]);
  const lancCartoes = cartoes.length ? await Lancamento.find({ $or: [{ conta: { $in: cartoes.map((c) => c._id) } }, { contaDestino: { $in: cartoes.map((c) => c._id) } }] }).lean() : [];
  // dinheiro tirado do cartão para viagens também entra na fatura
  const reservasCartao = cartoes.length ? await ReservaViagem.find({ conta: { $in: cartoes.map((c) => c._id) } }).lean() : [];
  if (reservasCartao.length) lancCartoes.push(...movimentosSeparados({ reservasViagem: reservasCartao, viagens: await Viagem.find().lean(), contas: cartoes }).lancamentos);

  // orçamento do mês por categoria, na moeda de cada categoria
  // no mês financeiro (começa no dia escolhido); gastos de viagem ficam no orçamento da viagem
  const dia = diaValido((await Config.findOne({ chave: 'preferencias' }).lean())?.valor?.diaInicioMes || 1);
  const { inicio, fim } = periodoDoMes(mesFinanceiro(hoje, dia), dia);
  const doMes = await Lancamento.find({ tipo: 'despesa', ajuste: { $ne: true }, viagem: null, data: { $gte: inicio, $lt: fim } }).lean();
  const { taxas } = await obterTaxas();
  const orcamentos = categorias.filter((c) => c.orcamentoMensal > 0).map((c) => {
    const gasto = round2(doMes.filter((l) => String(l.categoria) === String(c._id)).reduce((s, l) => s + converter(l.valor, l.moeda, c.moeda, taxas), 0));
    const pct = (gasto / c.orcamentoMensal) * 100;
    return { categoria: c._id, nome: c.nome, gasto, limite: c.orcamentoMensal, moeda: c.moeda, pct, estado: pct >= 100 ? 'estourado' : pct >= c.alertaPct ? 'alerta' : 'ok' };
  });

  const maxDias = Math.max(...inscricoes.map((i) => i.dias ?? 2));
  const itens = lembretes({ recorrentes, cartoes, lancamentos: lancCartoes, orcamentos, hoje, dias: maxDias + 1 });
  let enviados = 0;
  for (const item of itens) {
    const faltam = item.tipo.startsWith('orcamento') || item.tipo === 'fatura-vencida' ? 0 : diasAte(item.data);
    for (const insc of inscricoes) {
      if (faltam > (insc.dias ?? 2)) continue;
      const chave = `${item.chave}|${insc.endpoint.slice(-24)}`;
      if (await LembreteEnviado.exists({ chave })) continue;
      const tx = TXT[insc.idioma] || TXT.pt;
      const fmt = (v, moeda) => new Intl.NumberFormat(LOCALE[insc.idioma] || 'pt-BR', { style: 'currency', currency: moeda || 'EUR' }).format(v);
      const moedaItem = item.moeda || orcamentos.find((o) => String(o.categoria) === item.ref)?.moeda || 'EUR';
      const quando = faltam <= 0 ? tx.hoje : faltam === 1 ? tx.amanha : tx.em(faltam);
      const [titulo, corpo] = tx[item.tipo]({ ...item, valorTxt: fmt(item.valor, moedaItem), limiteTxt: fmt(item.limite || 0, moedaItem) }, quando);
      const url = item.tipo.startsWith('fatura') ? '/#contas' : item.tipo.startsWith('orcamento') ? '/#orcamento' : '/#recorrentes';
      if (await enviar(insc, titulo, corpo, url)) {
        await LembreteEnviado.create({ chave }).catch(() => {});
        enviados++;
      }
    }
  }
  return enviados;
}

/** Liga a verificação periódica (a cada 30 min) */
export function iniciarLembretes() {
  const rodar = () => verificarLembretes().catch((e) => console.error('Lembretes:', e.message));
  setTimeout(rodar, 60 * 1000);
  setInterval(rodar, 30 * 60 * 1000);
}
