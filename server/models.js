import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const MOEDAS = ['EUR', 'BRL', 'USD'];
const opts = { timestamps: true, versionKey: false };

export const Categoria = model(
  'Categoria',
  new Schema(
    {
      nome: { type: String, required: true, trim: true },
      tipo: { type: String, enum: ['despesa', 'receita'], default: 'despesa' },
      cor: { type: String, default: '#7a5c3e' },
      icone: { type: String, default: '•' },
      orcamentoMensal: { type: Number, default: 0, min: 0 }, // 0 = sem orçamento
      moeda: { type: String, enum: MOEDAS, default: 'EUR' },
      alertaPct: { type: Number, default: 80, min: 1, max: 100 }, // aviso ao atingir X% do orçamento
    },
    opts
  )
);

export const Lancamento = model(
  'Lancamento',
  new Schema(
    {
      tipo: { type: String, enum: ['despesa', 'receita'], required: true },
      descricao: { type: String, required: true, trim: true },
      valor: { type: Number, required: true, min: 0 },
      moeda: { type: String, enum: MOEDAS, default: 'EUR' },
      data: { type: Date, required: true },
      categoria: { type: Schema.Types.ObjectId, ref: 'Categoria', default: null },
      nota: { type: String, default: '' },
      recorrente: { type: Schema.Types.ObjectId, ref: 'Recorrente', default: null },
      competencia: { type: String, default: null }, // 'YYYY-MM' quando gerado por recorrência
      importId: { type: String, default: null }, // impressão digital da linha do extrato importado
    },
    opts
  )
    .index({ recorrente: 1, competencia: 1 }, { unique: true, partialFilterExpression: { recorrente: { $type: 'objectId' } } })
    .index({ importId: 1 }, { unique: true, partialFilterExpression: { importId: { $type: 'string' } } })
);

export const Meta = model(
  'Meta',
  new Schema(
    {
      nome: { type: String, required: true, trim: true },
      icone: { type: String, default: '🎯' },
      cor: { type: String, default: '#2952eb' },
      valorAlvo: { type: Number, required: true, min: 0 },
      moeda: { type: String, enum: MOEDAS, default: 'EUR' },
      prazo: { type: Date, default: null },
      pessoas: { type: [String], default: [] }, // quem participa (meta conjunta)
      arquivada: { type: Boolean, default: false },
    },
    opts
  )
);

export const ContribuicaoMeta = model(
  'ContribuicaoMeta',
  new Schema(
    {
      meta: { type: Schema.Types.ObjectId, ref: 'Meta', required: true, index: true },
      valor: { type: Number, required: true }, // negativo = retirada
      data: { type: Date, required: true },
      pessoa: { type: String, default: '' },
      nota: { type: String, default: '' },
    },
    opts
  )
);

// "quando o extrato disser X, use a categoria Y" — aprendido nas importações
export const RegraCategoria = model(
  'RegraCategoria',
  new Schema(
    {
      texto: { type: String, required: true, unique: true, trim: true, lowercase: true },
      categoria: { type: Schema.Types.ObjectId, ref: 'Categoria', required: true },
    },
    opts
  )
);

export const Recorrente = model(
  'Recorrente',
  new Schema(
    {
      tipo: { type: String, enum: ['despesa', 'receita'], required: true },
      descricao: { type: String, required: true, trim: true },
      valor: { type: Number, required: true, min: 0 },
      moeda: { type: String, enum: MOEDAS, default: 'EUR' },
      categoria: { type: Schema.Types.ObjectId, ref: 'Categoria', default: null },
      frequencia: { type: String, enum: ['mensal', 'trimestral', 'anual'], default: 'mensal' },
      diaDoMes: { type: Number, min: 1, max: 31, default: 1 },
      inicio: { type: Date, required: true },
      fim: { type: Date, default: null },
      ativo: { type: Boolean, default: true },
      // meses cujo lançamento gerado foi apagado à mão — não gerar de novo
      ignoradas: { type: [String], default: [] },
    },
    opts
  )
);

export const ContaRendimento = model(
  'ContaRendimento',
  new Schema(
    {
      nome: { type: String, required: true, trim: true },
      instituicao: { type: String, default: '' },
      moeda: { type: String, enum: MOEDAS, default: 'BRL' },
      saldoInicial: { type: Number, required: true, min: 0 },
      dataInicio: { type: Date, required: true },
      modo: { type: String, enum: ['mensal', 'anual', 'manual'], default: 'mensal' },
      taxa: { type: Number, default: 0, min: 0 }, // % ao mês ou % ao ano, conforme o modo
      nota: { type: String, default: '' },
      // lança o juro sozinho no último dia de cada mês (modos mensal/anual)
      rendimentoAutomatico: { type: Boolean, default: true },
      autoDesde: { type: Date, default: () => new Date() },
      rendimentoIgnorado: { type: [String], default: [] }, // meses 'AAAA-MM' cujo rendimento foi apagado à mão
    },
    opts
  )
);

export const Movimento = model(
  'Movimento',
  new Schema(
    {
      conta: { type: Schema.Types.ObjectId, ref: 'ContaRendimento', required: true, index: true },
      tipo: { type: String, enum: ['rendimento', 'aporte', 'resgate', 'imposto', 'taxa'], required: true },
      valor: { type: Number, required: true, min: 0 },
      data: { type: Date, required: true },
      descricao: { type: String, default: '' },
      automatico: { type: Boolean, default: false }, // gerado por "aplicar rendimento"
    },
    opts
  )
);

export const MOEDAS_ACEITAS = MOEDAS;
