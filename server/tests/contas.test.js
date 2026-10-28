import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  saldoConta, faturaDaCompra, vencimentoDaFatura, faturasCartao, resumoCartao, gerarParcelas,
  patrimonio, seriePatrimonio, resumoViagem, relatorioAnual, lembretes,
} from '../contas.js';

const d = (s) => new Date(`${s}T12:00:00Z`);
const giro = { _id: 'g', tipo: 'corrente', moeda: 'EUR', saldoInicial: 1000, dataInicio: d('2026-09-01') };
const brl = { _id: 'b', tipo: 'corrente', moeda: 'BRL', saldoInicial: 5000, dataInicio: d('2026-09-01') };
const divida = { _id: 'dv', tipo: 'divida', moeda: 'EUR', saldoInicial: -2000, dataInicio: d('2026-09-01') };
const cartao = { _id: 'c', tipo: 'cartao', moeda: 'EUR', saldoInicial: 0, dataInicio: d('2026-09-01'), limite: 2000, diaFechamento: 25, diaVencimento: 5, contaPagamento: 'g' };
const conv = (v, m) => (m === 'BRL' ? v / 6 : v);

test('saldo de conta com receitas, despesas, transferências e câmbio', () => {
  const L = [
    { tipo: 'receita', valor: 2400, data: d('2026-09-28'), conta: 'g' },
    { tipo: 'despesa', valor: 850, data: d('2026-10-01'), conta: 'g' },
    { tipo: 'transferencia', valor: 300, valorDestino: 1800, data: d('2026-10-02'), conta: 'g', contaDestino: 'b' },
    { tipo: 'transferencia', valor: 500, data: d('2026-10-03'), conta: 'g', contaDestino: 'dv' },
    { tipo: 'despesa', valor: 99, data: d('2026-08-01'), conta: 'g' }, // antes da data inicial: ignora
  ];
  assert.equal(saldoConta(giro, L), 1000 + 2400 - 850 - 300 - 500);
  assert.equal(saldoConta(brl, L), 6800);
  assert.equal(saldoConta(divida, L), -1500);
  assert.equal(saldoConta(giro, L, d('2026-09-30')), 3400);
});

test('fatura do cartão: fechamento dia 25, vencimento dia 5 do mês seguinte', () => {
  assert.equal(faturaDaCompra(d('2026-10-25'), 25), '2026-10');
  assert.equal(faturaDaCompra(d('2026-10-26'), 25), '2026-11');
  assert.equal(vencimentoDaFatura('2026-10', 25, 5).toISOString().slice(0, 10), '2026-11-05');
  assert.equal(vencimentoDaFatura('2026-10', 3, 20).toISOString().slice(0, 10), '2026-10-20');
  assert.equal(faturaDaCompra(d('2026-02-28'), 31), '2026-02'); // fechamento 31 vira último dia
});

test('faturas, pagamento, limite usado e parcelas futuras', () => {
  const parcelas = gerarParcelas({ tipo: 'despesa', valor: 100, data: d('2026-10-10').toISOString(), conta: 'c', descricao: 'TV' }, 3, 'p1');
  assert.deepEqual(parcelas.map((p) => [p.valor, p.data.slice(0, 7), p.parcela.numero]), [[33.34, '2026-10', 1], [33.33, '2026-11', 2], [33.33, '2026-12', 3]]);
  const L = [
    { tipo: 'despesa', valor: 200, data: d('2026-09-20'), conta: 'c' },
    { tipo: 'despesa', valor: 50, data: d('2026-09-28'), conta: 'c' }, // vai para outubro
    { tipo: 'receita', valor: 20, data: d('2026-10-02'), conta: 'c' }, // estorno
    ...parcelas,
    { tipo: 'transferencia', valor: 200, data: d('2026-10-04'), conta: 'g', contaDestino: 'c' }, // paga setembro
  ];
  const fs = faturasCartao(cartao, L, d('2026-10-26'));
  const set = fs.find((f) => f.mes === '2026-09'), out = fs.find((f) => f.mes === '2026-10');
  assert.deepEqual([set.total, set.restante, set.estado], [200, 0, 'paga']);
  assert.deepEqual([out.total, out.restante, out.estado], [63.34, 63.34, 'fechada']); // 50 − 20 + 33,34; fechou dia 25
  const r = resumoCartao(cartao, L, d('2026-10-26'));
  assert.equal(r.usado, 63.34 + 33.33 + 33.33);
  assert.equal(r.disponivel, 2000 - 130);
  assert.equal(r.proximaAPagar.mes, '2026-10');
  assert.equal(saldoConta(cartao, L), -130); // o saldo do cartão é a dívida com ele
  assert.equal(faturasCartao(cartao, L, d('2026-11-06')).find((f) => f.mes === '2026-10').estado, 'vencida');
});

test('patrimônio soma ativos, desconta dívidas e cartões e acompanha a evolução', () => {
  const L = [{ tipo: 'despesa', valor: 300, data: d('2026-10-10'), conta: 'c' }];
  const contasRend = [{ _id: 'r', moeda: 'BRL', saldoInicial: 60000, dataInicio: d('2026-09-01') }];
  const movsRend = [{ conta: 'r', tipo: 'rendimento', valor: 600, data: d('2026-09-30') }];
  const p = patrimonio({ contas: [giro, brl, divida, cartao], lancamentos: L, contasRend, movsRend, conv, ate: d('2026-10-26') });
  assert.equal(p.ativos, round(1000 + 5000 / 6 + 60600 / 6));
  assert.equal(p.passivos, 2300);
  assert.equal(p.porTipo.rendimento, 10100);
  const s = seriePatrimonio({ contas: [giro, brl, divida, cartao], lancamentos: L, contasRend, movsRend, conv }, 3, d('2026-10-26'));
  assert.deepEqual(s.map((x) => x.mes), ['2026-08', '2026-09', '2026-10']);
  assert.equal(s[0].liquido, 0); // nada existia em agosto
  assert.equal(s[2].liquido, p.liquido);
});
const round = (x) => Math.round(x * 100) / 100;

test('viagem: câmbio do dia, reembolso, estado e quanto gastar por dia', () => {
  const viagem = { _id: 'v', moeda: 'EUR', orcamento: 1000, inicio: d('2026-11-01'), fim: d('2026-11-10') };
  const taxas = { '2026-11-02': 6, '2026-11-03': 6.5 };
  const convNaData = (v, de, para, dia) => (de === para ? v : de === 'BRL' ? v / (taxas[dia] || 6.2) : v * (taxas[dia] || 6.2));
  const L = [
    { tipo: 'despesa', valor: 600, moeda: 'BRL', data: d('2026-11-02'), viagem: 'v', categoria: 'res' },
    { tipo: 'despesa', valor: 650, moeda: 'BRL', data: d('2026-11-03'), viagem: 'v', categoria: 'res' },
    { tipo: 'despesa', valor: 400, moeda: 'EUR', data: d('2026-10-15'), viagem: 'v', categoria: 'voo' },
    { tipo: 'receita', valor: 50, moeda: 'EUR', data: d('2026-11-04'), viagem: 'v', categoria: 'voo' },
    { tipo: 'despesa', valor: 999, moeda: 'EUR', data: d('2026-11-04') }, // fora da viagem
  ];
  const r = resumoViagem(viagem, L, convNaData, [{ _id: 'res', nome: 'Restaurantes' }], d('2026-11-05'));
  assert.equal(r.gasto, 100 + 100 + 400 - 50);
  assert.equal(r.restante, 450);
  assert.equal(r.estado, 'ok');
  assert.equal(r.fase, 'em-andamento');
  assert.deepEqual(r.porMoeda, [{ moeda: 'BRL', valor: 1250 }, { moeda: 'EUR', valor: 350 }]);
  assert.equal(r.porCategoria.find((c) => c.categoria === 'res').nome, 'Restaurantes');
  assert.equal(r.porDiaRestante, round(450 / 6)); // dias 5 a 10
});

test('relatório anual ignora transferências e ajustes e separa dedutíveis', () => {
  const cats = [{ _id: 'trab', nome: 'Trabalho', dedutivel: true }, { _id: 'mer', nome: 'Mercado' }];
  const L = [
    { tipo: 'receita', valor: 2400, moeda: 'EUR', data: d('2026-01-28') },
    { tipo: 'despesa', valor: 120, moeda: 'EUR', data: d('2026-01-10'), categoria: 'mer' },
    { tipo: 'despesa', valor: 600, moeda: 'BRL', data: d('2026-03-10'), categoria: 'trab', descricao: 'Curso SAP' },
    { tipo: 'transferencia', valor: 500, moeda: 'EUR', data: d('2026-02-01') },
    { tipo: 'receita', valor: 80, moeda: 'EUR', data: d('2026-02-01'), ajuste: true },
    { tipo: 'despesa', valor: 10, moeda: 'EUR', data: d('2025-12-31'), categoria: 'mer' },
  ];
  const r = relatorioAnual({ ano: 2026, lancamentos: L, categorias: cats, movsRend: [{ conta: 'r', tipo: 'rendimento', valor: 600, data: d('2026-01-31') }], contasRend: [{ _id: 'r', moeda: 'BRL' }], conv });
  assert.equal(r.totais.entradas, 2400);
  assert.equal(r.totais.saidas, 220);
  assert.equal(r.totais.rendimentos, 100);
  assert.equal(r.entradas[0], 2400);
  assert.equal(r.saidas[2], 100);
  assert.equal(r.totais.dedutiveis, 100);
  assert.equal(r.dedutiveis[0].descricao, 'Curso SAP');
  assert.equal(r.categorias.find((c) => c.categoria === 'mer').total, 120);
});

test('lembretes: recorrente e fatura nos próximos dias, orçamento em alerta', () => {
  const rec = [{ _id: 'al', ativo: true, tipo: 'despesa', descricao: 'Aluguel', valor: 850, moeda: 'EUR', diaDoMes: 1, frequencia: 'mensal', inicio: d('2026-01-01') },
    { _id: 'sal', ativo: true, tipo: 'receita', descricao: 'Salário', valor: 2400, moeda: 'EUR', diaDoMes: 28, frequencia: 'mensal', inicio: d('2026-01-01') }];
  const L = [{ tipo: 'despesa', valor: 100, data: d('2026-10-10'), conta: 'c' }];
  const itens = lembretes({ recorrentes: rec, cartoes: [cartao], lancamentos: L, orcamentos: [{ categoria: 'mer', nome: 'Mercado', estado: 'alerta', gasto: 330, limite: 400, pct: 82.5 }], hoje: d('2026-10-29'), dias: 7 });
  assert.deepEqual(itens.map((i) => i.chave), ['orc:mer:2026-10:alerta', 'rec:al:2026-11', 'fat:c:2026-10']);
  assert.equal(itens.find((i) => i.tipo === 'fatura').valor, 100);
});

test('compra em outra moeda usa o valor cobrado na conta', async () => {
  const { saldoConta, faturasCartao, gerarParcelas } = await import('../contas.js');
  const cartao = { _id: 'k', tipo: 'cartao', moeda: 'EUR', saldoInicial: 0, dataInicio: '2026-01-01T12:00:00Z', diaFechamento: 20, diaVencimento: 5 };
  const l = [{ tipo: 'despesa', valor: 620, moeda: 'BRL', valorConta: 100, conta: 'k', data: '2026-03-10T12:00:00Z' }];
  assert.equal(saldoConta(cartao, l), -100);
  assert.equal(faturasCartao(cartao, l, new Date('2026-03-11'))[0].total, 100);
  const p = gerarParcelas({ tipo: 'despesa', valor: 100, valorConta: 16.66, data: '2026-03-10T12:00:00Z' }, 3, 'g');
  assert.deepEqual(p.map((x) => x.valorConta), [5.56, 5.55, 5.55]);
});

test('dinheiro separado para meta e viagem sai da conta sem mudar o patrimônio', async () => {
  const { movimentosSeparados, saldoConta, patrimonio, resumoViagem } = await import('../contas.js');
  const conta = { _id: 'c', tipo: 'corrente', moeda: 'EUR', saldoInicial: 1000, dataInicio: '2026-01-01T12:00:00Z' };
  const meta = { _id: 'm', nome: 'Casa', moeda: 'EUR' };
  const viagem = { _id: 'v', nome: 'Rio', moeda: 'BRL', orcamento: 0 };
  const contribuicoes = [
    { _id: 'k1', meta: 'm', conta: 'c', valor: 100, data: '2026-02-01T12:00:00Z' },
    { _id: 'k2', meta: 'm', conta: 'c', valor: -30, data: '2026-02-02T12:00:00Z' },
    { _id: 'k3', meta: 'm', conta: null, valor: 500, data: '2026-02-02T12:00:00Z' }, // só registro
  ];
  const reservasViagem = [{ _id: 'r1', viagem: 'v', conta: 'c', valor: 200, valorViagem: 1200, data: '2026-02-03T12:00:00Z' }];
  const gastos = [{ _id: 'g1', tipo: 'despesa', viagem: 'v', reservaViagem: true, valor: 300, moeda: 'BRL', data: '2026-02-04T12:00:00Z' }];
  const sep = movimentosSeparados({ contribuicoes, metas: [meta], reservasViagem, viagens: [viagem], gastosReserva: gastos, contas: [conta] });
  assert.equal(saldoConta(conta, sep.lancamentos), 1000 - 100 + 30 - 200);
  const conv = (v, m) => (m === 'BRL' ? v / 6 : v);
  const p = patrimonio({ contas: [conta], lancamentos: sep.lancamentos, reservas: sep.reservas.filter((r) => r.tipo === 'meta' || true), conv, ate: new Date('2026-02-03T23:00:00Z') });
  assert.equal(p.liquido, 1000); // antes do gasto na viagem: só mudou de lugar
  const r = resumoViagem(viagem, gastos, (v) => v, [], new Date('2026-02-05'), reservasViagem);
  assert.deepEqual([r.reservado, r.gastoReserva, r.saldoReserva], [1200, 300, 900]);
});

test('depósitos em metas saem do saldo do mês e do relatório', async () => {
  const { guardadoNoMes, relatorioAnual } = await import('../contas.js');
  const metas = [{ _id: 'm', moeda: 'EUR' }, { _id: 'b', moeda: 'BRL' }];
  const contribuicoes = [
    { meta: 'm', valor: 100, data: '2026-03-05T12:00:00Z' },
    { meta: 'm', valor: -30, data: '2026-03-20T12:00:00Z' },
    { meta: 'b', valor: 600, data: '2026-03-21T12:00:00Z' },
    { meta: 'm', valor: 50, data: '2026-04-01T12:00:00Z' },
  ];
  const conv = (v, m) => (m === 'BRL' ? v / 6 : v);
  assert.equal(guardadoNoMes(contribuicoes, metas, conv, '2026-03'), 170);
  const r = relatorioAnual({ ano: 2026, lancamentos: [{ tipo: 'receita', valor: 1000, moeda: 'EUR', data: '2026-03-01T12:00:00Z' }], categorias: [], contribuicoes, metas, conv });
  assert.equal(r.saldo[2], 830);
  assert.equal(r.totais.metas, 220);
  assert.equal(r.totais.saldo, 780);
});

test('depósito automático mensal: só a partir de quando foi ligado, sem repetir', async () => {
  const { depositosAutomaticosDevidos } = await import('../contas.js');
  const meta = { _id: 'p', mensal: { valor: 200, dia: 5, conta: null, desde: '2026-03-10T09:00:00Z' }, ignoradas: ['2026-05'] };
  const d = depositosAutomaticosDevidos(meta, [{ automatica: true, competencia: '2026-04' }], new Date('2026-06-07T12:00:00Z'));
  assert.deepEqual(d.map((x) => x.competencia), ['2026-06']); // março: dia 5 antes de ligar; abril feito; maio apagado
  assert.equal(d[0].valor, 200);
  assert.deepEqual(depositosAutomaticosDevidos({ ...meta, mensal: { ...meta.mensal, valor: 0 } }, [], new Date()), []);
});
