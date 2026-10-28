import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerTransacaoAtalho, categoriaDoComerciante, contaDoCartao } from '../applepay.js';

test('lê o valor como o iPhone manda, em qualquer idioma', () => {
  assert.deepEqual(
    (({ valor, moeda, comerciante, cartao }) => ({ valor, moeda, comerciante, cartao }))(lerTransacaoAtalho({ Quantia: '12,50 €', Comerciante: 'REWE', 'Cartão ou Passe': 'Visa' })),
    { valor: 12.5, moeda: 'EUR', comerciante: 'REWE', cartao: 'Visa' },
  );
  assert.equal(lerTransacaoAtalho({ amount: '€1,234.56', merchant: 'IKEA' }).valor, 1234.56);
  assert.equal(lerTransacaoAtalho({ Betrag: '1.234,56 €', Händler: 'Lidl' }).valor, 1234.56);
  assert.equal(lerTransacaoAtalho({ Betrag: '1.234,56 €', Händler: 'Lidl' }).comerciante, 'Lidl');
  assert.equal(lerTransacaoAtalho({ valor: 'R$ 30,00' }).moeda, 'BRL');
  assert.equal(lerTransacaoAtalho({ valor: '$4.99' }).moeda, 'USD');
  assert.equal(lerTransacaoAtalho({ valor: 'CHF 8.40' }).moedaOutra, 'CHF');
  assert.equal(lerTransacaoAtalho({ valor: 8.4 }).valor, 8.4);
  assert.equal(lerTransacaoAtalho({ valor: '-5,00 €' }).estorno, true);
  assert.equal(lerTransacaoAtalho({ valor: '' }).erro, 'valor_invalido');
});

test('categoria: regra aprendida, depois a última usada, depois palavras conhecidas', () => {
  const categorias = [{ _id: 'mer', nome: 'Mercado', tipo: 'despesa' }, { _id: 'res', nome: 'Restaurantes', tipo: 'despesa' }, { _id: 'out', nome: 'Outros', tipo: 'despesa' }];
  assert.equal(categoriaDoComerciante('REWE Markt', { categorias }), 'mer');
  assert.equal(categoriaDoComerciante('Café Rosso', { categorias, historico: [{ tipo: 'despesa', descricao: 'Cafe Rosso', categoria: 'res', data: '2026-10-01' }] }), 'res');
  assert.equal(categoriaDoComerciante('REWE Markt', { categorias, regras: [{ texto: 'rewe', categoria: 'out' }] }), 'out');
  assert.equal(categoriaDoComerciante('Loja X', { categorias }), null);
});

test('conta do cartão: vínculo do cartão ou a padrão', () => {
  assert.equal(contaDoCartao('Visa', { conta: 'giro', cartoes: { Visa: 'card' } }), 'card');
  assert.equal(contaDoCartao('Girocard', { conta: 'giro', cartoes: { Visa: 'card' } }), 'giro');
});
