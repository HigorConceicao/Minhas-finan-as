import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarExtrato, lerValor, lerData, sugerirCategoria, chaveRegra, EXEMPLO_SPARKASSE } from '../../src/importacao.js';
import { metricasMeta } from '../finance.js';

const CATS = [
  { _id: 'mer', nome: 'Mercado', tipo: 'despesa' }, { _id: 'res', nome: 'Restaurantes', tipo: 'despesa' },
  { _id: 'tra', nome: 'Transporte', tipo: 'despesa' }, { _id: 'mor', nome: 'Moradia', tipo: 'despesa' },
  { _id: 'sal', nome: 'Salário', tipo: 'receita' }, { _id: 'ass', nome: 'Assinaturas', tipo: 'despesa' },
];

test('valores em formatos diferentes', () => {
  assert.equal(lerValor('-1.234,56'), -1234.56);
  assert.equal(lerValor('1,234.56'), 1234.56);
  assert.equal(lerValor('-12,5 €'), -12.5);
  assert.equal(lerValor('+2.400,00'), 2400);
  assert.equal(lerValor('-4.60'), -4.6);
  assert.equal(lerValor('1.234'), 1234);
  assert.equal(lerValor('12,50-'), -12.5);
  assert.ok(Number.isNaN(lerValor('')));
});

test('datas em formatos diferentes', () => {
  assert.equal(lerData('31.10.2026'), '2026-10-31');
  assert.equal(lerData('01.02.26'), '2026-02-01');
  assert.equal(lerData('2026-10-05'), '2026-10-05');
  assert.equal(lerData('5/3/2026'), '2026-03-05');
  assert.equal(lerData('Saldo'), null);
});

test('Sparkasse (CSV-CAMT, ponto e vírgula, aspas)', () => {
  const r = interpretarExtrato(EXEMPLO_SPARKASSE.replaceAll('{M}', '10.26'));
  assert.equal(r.banco, 'Sparkasse');
  assert.equal(r.lancamentos.length, 12);
  const rewe = r.lancamentos[0];
  assert.deepEqual([rewe.data, rewe.tipo, rewe.valor, rewe.descricao, rewe.moeda], ['2026-10-02', 'despesa', 54.32, 'REWE Markt GmbH', 'EUR']);
  const amazon = r.lancamentos.find((l) => l.descricao.startsWith('Amazon'));
  assert.equal(amazon.tipo, 'receita');
  // dois cafés iguais no mesmo dia viram dois lançamentos com impressões diferentes
  const cafes = r.lancamentos.filter((l) => l.descricao === 'Starbucks Konstanz');
  assert.equal(cafes.length, 2);
  assert.notEqual(cafes[0].importId, cafes[1].importId);
  // reimportar o mesmo arquivo dá as mesmas impressões
  assert.deepEqual(interpretarExtrato(EXEMPLO_SPARKASSE.replaceAll('{M}', '10.26')).lancamentos.map((l) => l.importId), r.lancamentos.map((l) => l.importId));
});

test('N26 (vírgula, ponto decimal)', () => {
  const csv = [
    '"Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"',
    '2026-10-01,2026-10-01,"Spotify AB",,Presentment,-,"Main Account",-10.99,,,',
    '2026-10-28,2026-10-28,"HARBR Hotel GmbH",DE00,Credit Transfer,"Gehalt Oktober","Main Account",2400.00,,,',
  ].join('\n');
  const r = interpretarExtrato(csv);
  assert.equal(r.banco, 'N26');
  assert.equal(r.lancamentos.length, 2);
  assert.deepEqual(r.lancamentos.map((l) => [l.tipo, l.valor, l.descricao]), [['despesa', 10.99, 'Spotify AB'], ['receita', 2400, 'HARBR Hotel GmbH']]);
  assert.equal(sugerirCategoria(r.lancamentos[0], CATS), 'ass');
  assert.equal(sugerirCategoria(r.lancamentos[1], CATS), 'sal'); // "Gehalt" na referência
});

test('ING (metadados antes do cabeçalho, duas colunas de moeda, saldo)', () => {
  const csv = [
    'Umsatzanzeige;Datei erstellt am: 26.10.2026 21:00', ';', 'IBAN;DE00 0000', 'Kontoname;Girokonto', 'Bank;ING', 'Kunde;Higor', 'Zeitraum;01.10.2026 - 26.10.2026', 'Saldo;3.210,55;EUR', '',
    'Buchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung',
    '01.10.2026;01.10.2026;Hausverwaltung Seeblick;Dauerauftrag;Miete Oktober;2.360,55;EUR;-850,00;EUR',
    '04.10.2026;04.10.2026;EDEKA Center;Lastschrift;Einkauf;2.316,10;EUR;-44,45;EUR',
  ].join('\n');
  const r = interpretarExtrato(csv);
  assert.equal(r.banco, 'ING');
  assert.equal(r.lancamentos.length, 2);
  assert.equal(r.lancamentos[0].valor, 850); // não confunde com a coluna Saldo
  assert.equal(sugerirCategoria(r.lancamentos[0], CATS), 'mor');
  assert.equal(sugerirCategoria(r.lancamentos[1], CATS), 'mer');
});

test('DKB (pagador e recebedor em colunas separadas)', () => {
  const csv = [
    '"Girokonto";"DE00"', '""', '"Kontostand vom 26.10.2026:";"1.000,00 €"', '""',
    '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"',
    '"20.10.26";"20.10.26";"Gebucht";"Higor";"FlixBus DACH GmbH";"Ticket";"Ausgang";"DE1";"-19,99";"";"";""',
    '"21.10.26";"21.10.26";"Gebucht";"Maria Silva";"Higor";"Pizza";"Eingang";"DE2";"15,00";"";"";""',
  ].join('\n');
  const r = interpretarExtrato(csv);
  assert.equal(r.banco, 'DKB');
  assert.deepEqual(r.lancamentos.map((l) => [l.data, l.tipo, l.descricao]), [['2026-10-20', 'despesa', 'FlixBus DACH GmbH'], ['2026-10-21', 'receita', 'Maria Silva']]);
  assert.equal(sugerirCategoria(r.lancamentos[0], CATS), 'tra');
});

test('regras aprendidas vencem as palavras-chave; palavras curtas não casam dentro de outras', () => {
  const l = { tipo: 'despesa', descricao: 'REWE To Go Bahnhof 22', textoBusca: 'rewe to go bahnhof 22' };
  assert.equal(chaveRegra(l.descricao), 'rewe to go');
  assert.equal(sugerirCategoria(l, CATS, [{ texto: 'rewe to go', categoria: 'res' }]), 'res');
  assert.equal(sugerirCategoria(l, CATS), 'mer');
  // "tier" (patinete) não pode casar com "Tierarzt"
  assert.equal(sugerirCategoria({ tipo: 'despesa', descricao: 'Tierarztpraxis', textoBusca: 'tierarztpraxis' }, CATS), null);
});

test('arquivo sem cabeçalho reconhecido não quebra', () => {
  const r = interpretarExtrato('a;b;c\n1;2;3\n');
  assert.equal(r.lancamentos.length, 0);
  assert.deepEqual(r.mapa, {});
  const r2 = interpretarExtrato('a;b;c\n01.10.2026;x;-5,00\n', { data: 0, valor: 2, descricao: 1 });
  assert.equal(r2.lancamentos.length, 1);
});

const d = (s) => new Date(`${s}T12:00:00Z`);
test('meta com prazo: falta, por mês, ritmo, previsão e por pessoa', () => {
  const meta = { valorAlvo: 10000, prazo: d('2027-09-30'), pessoas: ['Eu', 'Ana'] };
  const contribs = [
    { valor: 1000, data: d('2026-05-10'), pessoa: 'Eu' },
    { valor: 500, data: d('2026-08-10'), pessoa: 'Eu' }, { valor: 500, data: d('2026-08-12'), pessoa: 'Ana' },
    { valor: 500, data: d('2026-09-10'), pessoa: 'Eu' }, { valor: 500, data: d('2026-09-12'), pessoa: 'Ana' },
    { valor: 500, data: d('2026-10-10'), pessoa: 'Eu' }, { valor: 500, data: d('2026-10-12'), pessoa: 'Ana' },
    { valor: -200, data: d('2026-10-20'), pessoa: 'Eu' },
  ];
  const m = metricasMeta(meta, contribs, d('2026-10-26'));
  assert.equal(m.guardado, 3800);
  assert.equal(m.falta, 6200);
  assert.equal(m.pct, 38);
  assert.equal(m.mesesRestantes, 12); // out/26 … set/27
  assert.equal(m.porMesNecessario, 516.67);
  assert.equal(m.ritmoMensal, 933.33); // (1000+1000+800)/3
  assert.equal(m.previsao, '2027-04'); // 7 meses contando o atual
  assert.equal(m.estado, 'no-ritmo');
  assert.deepEqual(m.porPessoa.map((p) => [p.pessoa, p.valor]), [['Eu', 2300], ['Ana', 1500]]);
  assert.equal(m.serie.at(-1).guardado, 3800);
  assert.equal(m.serie[0].mes, '2026-05');
});

test('meta concluída, parada e atrasada', () => {
  assert.equal(metricasMeta({ valorAlvo: 100 }, [{ valor: 150, data: d('2026-01-01') }], d('2026-10-26')).estado, 'concluida');
  assert.equal(metricasMeta({ valorAlvo: 100 }, [{ valor: 10, data: d('2026-01-01') }], d('2026-10-26')).estado, 'parada');
  assert.equal(metricasMeta({ valorAlvo: 1000, prazo: d('2026-12-31') }, [{ valor: 10, data: d('2026-10-01') }], d('2026-10-26')).estado, 'atrasada');
  assert.equal(metricasMeta({ valorAlvo: 1000, prazo: d('2026-08-31') }, [], d('2026-10-26')).estado, 'atrasada');
});
