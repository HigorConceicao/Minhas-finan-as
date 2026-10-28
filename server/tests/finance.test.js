import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricasConta, taxaMensal, mesesDeDuracao, competenciasDevidas, serieMensal, diaNoMes } from '../finance.js';

const d = (s) => new Date(`${s}T12:00:00Z`);

test('taxa anual vira taxa mensal equivalente', () => {
  const r = taxaMensal({ modo: 'anual', taxa: 12 });
  assert.ok(Math.abs(Math.pow(1 + r, 12) - 1.12) < 1e-12);
  assert.equal(taxaMensal({ modo: 'mensal', taxa: 0.8 }), 0.008);
  assert.equal(taxaMensal({ modo: 'manual', taxa: 1 }), null);
});

test('conta de 350 mil: saldo, juros e saídas por mês', () => {
  const conta = { saldoInicial: 350000, dataInicio: d('2026-07-01'), modo: 'mensal', taxa: 0.8 };
  const movs = [
    { tipo: 'rendimento', valor: 2800, data: d('2026-07-31') },
    { tipo: 'resgate', valor: 1500, data: d('2026-08-10') },
    { tipo: 'imposto', valor: 200, data: d('2026-08-10') },
    { tipo: 'rendimento', valor: 2810.4, data: d('2026-08-31') },
    { tipo: 'resgate', valor: 1500, data: d('2026-09-10') },
    { tipo: 'rendimento', valor: 2822.88, data: d('2026-09-30') },
  ];
  const m = metricasConta(conta, movs, d('2026-10-18'));
  assert.equal(m.saldoAtual, 350000 + 2800 + 2810.4 + 2822.88 - 1500 - 200 - 1500);
  assert.equal(m.totais.juros, 8433.28);
  assert.equal(m.totais.saidas, 3200);
  assert.equal(m.totais.impostos, 200);
  assert.equal(m.serie.length, 4); // jul, ago, set, out
  assert.equal(m.serie[1].abertura, 352800);
  assert.equal(m.serie[1].saidas, 1700);
  assert.equal(m.serie[1].liquido, 2810.4 - 1700);
  assert.equal(m.taxaMensalUsada, 0.8);
  assert.equal(m.jurosEstimadoProximoMes, Math.round(m.saldoAtual * 0.008 * 100) / 100);
  assert.equal(m.rendimentoCobreSaidas, true); // ~2,8 mil de juros vs ~1,07 mil de saída média
  assert.equal(m.duracaoMeses, null);
  assert.equal(m.projecao12m.length, 12);
  assert.equal(m.projecao12m[0].mes, '2026-11');
});

test('modo manual usa a rentabilidade média real', () => {
  const conta = { saldoInicial: 100000, dataInicio: d('2026-08-01'), modo: 'manual' };
  const movs = [
    { tipo: 'rendimento', valor: 1000, data: d('2026-08-31') }, // 1%
    { tipo: 'rendimento', valor: 1010, data: d('2026-09-30') }, // 1%
  ];
  const m = metricasConta(conta, movs, d('2026-10-05'));
  assert.equal(m.taxaMensalConfigurada, null);
  assert.equal(m.rentabilidadeMediaReal, 1);
  assert.equal(m.taxaMensalUsada, 1);
});

test('duração do saldo quando as saídas superam os juros', () => {
  assert.equal(mesesDeDuracao(1000, 100, 0), 10);
  assert.equal(mesesDeDuracao(350000, 2000, 0.008), Infinity);
  assert.ok(mesesDeDuracao(350000, 5000, 0.008) > 70);
});

test('recorrência mensal gera só os meses devidos, sem passar do último dia', () => {
  const rec = { inicio: d('2026-07-15'), diaDoMes: 31, frequencia: 'mensal' };
  assert.deepEqual(competenciasDevidas(rec, d('2026-10-18')), ['2026-07', '2026-08', '2026-09']);
  assert.equal(diaNoMes('2026-09', 31).toISOString().slice(0, 10), '2026-09-30');
  const rec2 = { inicio: d('2026-07-20'), diaDoMes: 5, frequencia: 'mensal' };
  assert.deepEqual(competenciasDevidas(rec2, d('2026-10-18')), ['2026-08', '2026-09', '2026-10']);
  const tri = { inicio: d('2026-01-01'), diaDoMes: 1, frequencia: 'trimestral' };
  assert.deepEqual(competenciasDevidas(tri, d('2026-10-18')), ['2026-01', '2026-04', '2026-07', '2026-10']);
});

test('série mensal soma corretamente sem movimentos', () => {
  const s = serieMensal({ saldoInicial: 500, dataInicio: d('2026-09-01') }, [], '2026-10');
  assert.equal(s.length, 2);
  assert.equal(s[1].fechamento, 500);
});

import { rendimentosAutomaticos } from '../finance.js';

test('rendimento automático: só meses encerrados, desde que foi ligado, em sequência', () => {
  const conta = { _id: 'c1', saldoInicial: 100000, dataInicio: d('2026-06-01'), modo: 'mensal', taxa: 1,
    rendimentoAutomatico: true, autoDesde: d('2026-08-15') };
  const novos = rendimentosAutomaticos(conta, [], d('2026-10-18'));
  // jun e jul são antes de ligar; ago e set encerrados; out ainda não terminou
  assert.deepEqual(novos.map((m) => m.data.toISOString().slice(0, 7)), ['2026-08', '2026-09']);
  assert.equal(novos[0].valor, 1000);
  assert.equal(novos[1].valor, 1010); // rende sobre o saldo já com os juros de agosto
  assert.ok(novos.every((m) => m.automatico));
});

test('rendimento automático respeita meses já lançados, apagados e o modo manual', () => {
  const base = { _id: 'c1', saldoInicial: 1000, dataInicio: d('2026-08-01'), modo: 'mensal', taxa: 1, rendimentoAutomatico: true, autoDesde: d('2026-08-01') };
  const ja = [{ tipo: 'rendimento', valor: 5, data: d('2026-08-31') }];
  assert.deepEqual(rendimentosAutomaticos(base, ja, d('2026-09-30')).map((m) => m.valor), [10.05]);
  assert.equal(rendimentosAutomaticos({ ...base, rendimentoIgnorado: ['2026-08', '2026-09'] }, [], d('2026-10-01')).length, 0);
  assert.equal(rendimentosAutomaticos({ ...base, modo: 'manual' }, [], d('2026-10-01')).length, 0);
  assert.equal(rendimentosAutomaticos({ ...base, rendimentoAutomatico: false }, [], d('2026-10-01')).length, 0);
  // no último dia (depois do meio-dia UTC) o mês já conta
  assert.equal(rendimentosAutomaticos(base, [], new Date('2026-08-31T13:00:00Z')).length, 1);
  assert.equal(rendimentosAutomaticos(base, [], new Date('2026-08-30T23:00:00Z')).length, 0);
});

test('mês financeiro: começa no dia do salário', async () => {
  const { periodoDoMes, mesFinanceiro, fracaoDoPeriodo } = await import('../finance.js');
  const p = periodoDoMes('2026-11', 28);
  assert.equal(p.inicio.toISOString().slice(0, 10), '2026-10-28');
  assert.equal(p.fim.toISOString().slice(0, 10), '2026-11-28'); // exclusivo: vai até 27/nov
  assert.equal(periodoDoMes('2026-01', 28).inicio.toISOString().slice(0, 10), '2025-12-28');
  assert.equal(periodoDoMes('2026-11', 5).inicio.toISOString().slice(0, 10), '2026-11-05');
  assert.equal(periodoDoMes('2026-11', 1).inicio.toISOString().slice(0, 10), '2026-11-01');
  assert.equal(mesFinanceiro('2026-10-28T09:00:00Z', 28), '2026-11');
  assert.equal(mesFinanceiro('2026-10-27T23:00:00Z', 28), '2026-10');
  assert.equal(mesFinanceiro('2026-12-30T12:00:00Z', 28), '2027-01');
  assert.equal(mesFinanceiro('2026-11-04T12:00:00Z', 5), '2026-10');
  assert.equal(mesFinanceiro('2026-11-05T12:00:00Z', 5), '2026-11');
  assert.equal(mesFinanceiro('2026-11-15T12:00:00Z', 1), '2026-11');
  assert.equal(fracaoDoPeriodo('2026-11', 28, new Date('2026-10-28T00:00:00Z')), 0);
  assert.ok(Math.abs(fracaoDoPeriodo('2026-11', 28, new Date('2026-11-12T12:00:00Z')) - 15.5 / 31) < 0.01);
});
