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
      dedutivel: { type: Boolean, default: false }, // aparece no relatório para a declaração de imposto
    },
    opts
  )
);

export const Lancamento = model(
  'Lancamento',
  new Schema(
    {
      tipo: { type: String, enum: ['despesa', 'receita', 'transferencia'], required: true },
      descricao: { type: String, required: true, trim: true },
      valor: { type: Number, required: true, min: 0 },
      moeda: { type: String, enum: MOEDAS, default: 'EUR' },
      data: { type: Date, required: true },
      categoria: { type: Schema.Types.ObjectId, ref: 'Categoria', default: null },
      nota: { type: String, default: '' },
      conta: { type: Schema.Types.ObjectId, ref: 'Conta', default: null, index: true },
      // transferência: sai de `conta` e entra em `contaDestino` (valorDestino quando as moedas diferem)
      contaDestino: { type: Schema.Types.ObjectId, ref: 'Conta', default: null, index: true },
      valorDestino: { type: Number, default: null },
      // compra numa moeda diferente da conta: quanto foi cobrado na moeda da conta
      valorConta: { type: Number, default: null },
      // gasto pago com o dinheiro separado para a viagem (não mexe em nenhuma conta)
      reservaViagem: { type: Boolean, default: false },
      // gasto pago com dinheiro guardado numa meta/poupança (gera a retirada ligada)
      meta: { type: Schema.Types.ObjectId, ref: 'Meta', default: null },
      fatura: { type: String, default: null }, // pagamento de cartão: 'AAAA-MM' da fatura paga
      ajuste: { type: Boolean, default: false }, // correção de saldo: não conta como receita/despesa
      viagem: { type: Schema.Types.ObjectId, ref: 'Viagem', default: null, index: true },
      parcela: { type: { numero: Number, total: Number, grupo: String, valorTotal: Number, _id: false }, default: null },
      recorrente: { type: Schema.Types.ObjectId, ref: 'Recorrente', default: null },
      competencia: { type: String, default: null }, // 'YYYY-MM' quando gerado por recorrência
      importId: { type: String, default: null }, // impressão digital da linha do extrato importado
    },
    opts
  )
    .index({ recorrente: 1, competencia: 1 }, { unique: true, partialFilterExpression: { recorrente: { $type: 'objectId' } } })
    .index({ importId: 1 }, { unique: true, partialFilterExpression: { importId: { $type: 'string' } } })
);

export const Conta = model(
  'Conta',
  new Schema(
    {
      nome: { type: String, required: true, trim: true },
      tipo: { type: String, enum: ['corrente', 'dinheiro', 'investimento', 'divida', 'cartao'], default: 'corrente' },
      instituicao: { type: String, default: '' },
      moeda: { type: String, enum: MOEDAS, default: 'EUR' },
      saldoInicial: { type: Number, default: 0 }, // dívida: negativo
      dataInicio: { type: Date, default: () => new Date() },
      cor: { type: String, default: '#2952eb' },
      arquivada: { type: Boolean, default: false },
      // cartão de crédito
      limite: { type: Number, default: 0, min: 0 },
      diaFechamento: { type: Number, min: 1, max: 31, default: 25 },
      diaVencimento: { type: Number, min: 1, max: 31, default: 5 },
      contaPagamento: { type: Schema.Types.ObjectId, ref: 'Conta', default: null },
    },
    opts
  )
);

export const Viagem = model(
  'Viagem',
  new Schema(
    {
      nome: { type: String, required: true, trim: true },
      icone: { type: String, default: '✈️' },
      cor: { type: String, default: '#e0672b' },
      moeda: { type: String, enum: MOEDAS, default: 'EUR' },
      orcamento: { type: Number, default: 0, min: 0 },
      inicio: { type: Date, default: null },
      fim: { type: Date, default: null },
      arquivada: { type: Boolean, default: false },
    },
    opts
  )
);

// notificações no celular (Web Push)
export const InscricaoPush = model(
  'InscricaoPush',
  new Schema(
    {
      endpoint: { type: String, required: true, unique: true },
      keys: { p256dh: String, auth: String },
      idioma: { type: String, default: 'pt' },
      dias: { type: Number, default: 2 }, // avisar X dias antes do vencimento
    },
    opts
  )
);
export const LembreteEnviado = model('LembreteEnviado', new Schema({ chave: { type: String, required: true, unique: true } }, opts));
export const Config = model('Config', new Schema({ chave: { type: String, required: true, unique: true }, valor: Schema.Types.Mixed }, opts));

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
      // 'poupanca': dinheiro guardado sem valor-alvo, que se acumula mês a mês
      tipo: { type: String, enum: ['meta', 'poupanca'], default: 'meta' },
      // depósito automático todo mês (a partir de `desde`); meses apagados à mão ficam em `ignoradas`
      mensal: {
        valor: { type: Number, default: 0, min: 0 },
        dia: { type: Number, default: 1, min: 1, max: 31 },
        conta: { type: Schema.Types.ObjectId, ref: 'Conta', default: null },
        desde: { type: Date, default: null },
      },
      ignoradas: { type: [String], default: [] },
      // distribuição do salário (Einkommensverteiler): quando cai um salário, parte vai para cá
      regraSalario: {
        ativo: { type: Boolean, default: false },
        modo: { type: String, enum: ['excedente', 'pct', 'fixo'], default: 'excedente' },
        valor: { type: Number, default: 0, min: 0 }, // % ou valor fixo
        limite: { type: Number, default: 0, min: 0 }, // excedente: acima de quanto; pct/fixo: salário mínimo
        categoria: { type: Schema.Types.ObjectId, ref: 'Categoria', default: null },
        conta: { type: Schema.Types.ObjectId, ref: 'Conta', default: null },
        desde: { type: Date, default: null },
      },
      ignoradosSalario: { type: [String], default: [] }, // salários cujo depósito foi apagado à mão
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
      // de qual conta saiu (ou para qual voltou, na retirada); sem conta, é só um registro
      conta: { type: Schema.Types.ObjectId, ref: 'Conta', default: null, index: true },
      valorConta: { type: Number, default: null }, // na moeda da conta, quando difere da meta
      // retirada para pagar um gasto (o lançamento ligado)
      lancamento: { type: Schema.Types.ObjectId, ref: 'Lancamento', default: null, index: true },
      // retirada para separar dinheiro para uma viagem
      reservaViagem: { type: Schema.Types.ObjectId, ref: 'ReservaViagem', default: null, index: true },
      // depósito automático do mês `competencia`
      automatica: { type: Boolean, default: false },
      // só registro (dinheiro que já estava guardado): não mexe no saldo do mês nem em conta
      registro: { type: Boolean, default: false },
      // depósito vindo da regra do salário (o lançamento do salário)
      salario: { type: Schema.Types.ObjectId, ref: 'Lancamento', default: null, index: true },
      competencia: { type: String, default: null },
      pessoa: { type: String, default: '' },
      nota: { type: String, default: '' },
    },
    opts
  )
);

// dinheiro separado de uma conta para gastar numa viagem (negativo = devolvido à conta)
export const ReservaViagem = model(
  'ReservaViagem',
  new Schema(
    {
      viagem: { type: Schema.Types.ObjectId, ref: 'Viagem', required: true, index: true },
      // de onde veio: uma conta (inclusive cartão), uma meta/poupança, ou nenhuma = saldo do mês
      conta: { type: Schema.Types.ObjectId, ref: 'Conta', default: null, index: true },
      meta: { type: Schema.Types.ObjectId, ref: 'Meta', default: null },
      valor: { type: Number, required: true }, // na moeda da conta (sem conta: na moeda da viagem)
      valorViagem: { type: Number, default: null }, // na moeda da viagem, quando difere
      data: { type: Date, required: true },
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
      conta: { type: Schema.Types.ObjectId, ref: 'Conta', default: null },
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
