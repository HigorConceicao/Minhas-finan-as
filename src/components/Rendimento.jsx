import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { dataCompleta, dinheiro, duracao, hojeISO, lerNumero, mesAtual, mesCurto, mesLongo, paraInput, pct, somarMes } from '../fmt.js';
import { BotaoConfirmar, Campo, Carregando, Estatistica, Modal, Vazio, useAviso } from './ui.jsx';
import { BarrasJurosSaidas, LinhaSaldo } from './Graficos.jsx';

const TIPOS = {
  rendimento: { nome: 'Rendimento', sinal: '+', cor: 'text-verde', chip: 'bg-verde-claro text-verde' },
  aporte: { nome: 'Aporte', sinal: '+', cor: 'text-verde', chip: 'bg-verde-claro text-verde' },
  resgate: { nome: 'Resgate', sinal: '−', cor: 'text-vermelho', chip: 'bg-vermelho-claro text-vermelho' },
  imposto: { nome: 'Imposto', sinal: '−', cor: 'text-vermelho', chip: 'bg-vermelho-claro text-vermelho' },
  taxa: { nome: 'Taxa', sinal: '−', cor: 'text-vermelho', chip: 'bg-vermelho-claro text-vermelho' },
};

export default function Rendimento() {
  const avisar = useAviso();
  const [contas, setContas] = useState(null);
  const [selecionada, setSelecionada] = useState(null);
  const [met, setMet] = useState(null);
  const [movs, setMovs] = useState([]);
  const [formConta, setFormConta] = useState(null); // null | {} | conta
  const [formMov, setFormMov] = useState(null);
  const [modalRend, setModalRend] = useState(false);
  const [aba, setAba] = useState('meses');

  const carregarContas = useCallback(async () => {
    const cs = await get('/contas');
    setContas(cs);
    setSelecionada((s) => (cs.find((c) => c._id === s) ? s : cs[0]?._id || null));
  }, []);

  const carregarConta = useCallback(async (id) => {
    if (!id) { setMet(null); setMovs([]); return; }
    const [m, mv] = await Promise.all([get(`/contas/${id}/metricas`), get(`/contas/${id}/movimentos`)]);
    setMet(m); setMovs(mv);
  }, []);

  useEffect(() => { carregarContas().catch((e) => avisar(e.message, 'erro')); }, [carregarContas, avisar]);
  useEffect(() => { carregarConta(selecionada).catch((e) => avisar(e.message, 'erro')); }, [selecionada, carregarConta, avisar]);

  const recarregar = async () => { await Promise.all([carregarContas(), carregarConta(selecionada)]); };

  if (!contas) return <Carregando />;
  if (!contas.length) {
    return (
      <>
        <Vazio
          titulo="Nenhuma conta de rendimento"
          texto="Cadastre a conta com o saldo inicial e a taxa. O app calcula os juros de cada mês, registra as saídas e mostra quanto você pode retirar sem reduzir o montante."
          acao={<button className="btn-primario" onClick={() => setFormConta({})}>Cadastrar conta</button>}
        />
        <FormConta aberto={formConta !== null} conta={formConta} aoFechar={() => setFormConta(null)}
          aoSalvar={async (c) => { setFormConta(null); await carregarContas(); setSelecionada(c._id); avisar('Conta criada'); }} />
      </>
    );
  }

  const conta = met?.conta;
  const moeda = conta?.moeda || 'BRL';
  const m = met;

  return (
    <div className="space-y-5">
      {/* seletor de contas */}
      <div className="flex flex-wrap items-center gap-2">
        {contas.map((c) => (
          <button key={c._id} onClick={() => setSelecionada(c._id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${c._id === selecionada ? 'border-couro bg-couro text-papel-claro' : 'border-linha bg-papel-claro hover:bg-papel-escuro'}`}>
            {c.nome}
          </button>
        ))}
        <button className="rounded-full border border-dashed border-linha px-3 py-1.5 text-sm text-tinta-suave hover:bg-papel-escuro" onClick={() => setFormConta({})}>+ Nova conta</button>
      </div>

      {!m ? <Carregando /> : (
        <>
          {/* cabeçalho */}
          <section className="folha overflow-hidden">
            <div className="bg-couro-escuro px-5 py-5 text-papel-claro">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-papel/70">{conta.instituicao || 'Conta de rendimento'} · {conta.nome}</p>
                  <p className="num mt-1 text-3xl font-medium sm:text-4xl">{dinheiro(m.saldoAtual, moeda)}</p>
                  <p className="mt-1 text-sm text-papel/80">
                    {m.variacao >= 0 ? '▲' : '▼'} {dinheiro(Math.abs(m.variacao), moeda)} desde {dataCompleta(conta.dataInicio)} · início {dinheiro(m.saldoInicial, moeda)}
                  </p>
                </div>
                <button className="rounded-lg border border-papel/30 px-3 py-1.5 text-sm hover:bg-white/10" onClick={() => setFormConta(conta)}>Editar conta</button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn bg-papel-claro text-couro-escuro hover:bg-white" onClick={() => setModalRend(true)}>
                  + Lançar rendimento
                </button>
                <button className="btn border border-papel/40 text-papel-claro hover:bg-white/10" onClick={() => setFormMov({ tipo: 'resgate' })}>− Registrar saída</button>
                <button className="btn border border-papel/40 text-papel-claro hover:bg-white/10" onClick={() => setFormMov({ tipo: 'aporte' })}>+ Aporte</button>
              </div>
            </div>
            {!m.mes.rendimentoLancado && conta.modo !== 'manual' && (
              <button onClick={() => setModalRend(true)} className="flex w-full items-center justify-between gap-3 bg-ambar-claro px-5 py-2.5 text-left text-sm text-tinta hover:brightness-95">
                <span>O rendimento de <b>{mesLongo(m.mesAtual).toLowerCase()}</b> ainda não foi lançado — estimativa de <b className="num">{dinheiro(m.jurosEstimadoProximoMes, moeda)}</b>.</span>
                <span className="text-couro">Lançar →</span>
              </button>
            )}
          </section>

          {/* métricas do mês */}
          <section>
            <h3 className="mb-2 text-lg">Este mês <span className="font-corpo text-sm font-normal text-tinta-fraca">· {mesLongo(m.mesAtual)}</span></h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Estatistica rotulo="Juros do mês" valor={dinheiro(m.mes.juros, moeda)} tom="pos" detalhe={m.mes.rendimentoLancado ? 'lançado' : 'ainda não lançado'} />
              <Estatistica rotulo="Saídas do mês" valor={dinheiro(m.mes.saidas, moeda)} tom={m.mes.saidas ? 'neg' : undefined} detalhe="resgates, impostos e taxas" />
              <Estatistica rotulo="Resultado líquido" valor={dinheiro(m.mes.liquido, moeda)} tom={m.mes.liquido >= 0 ? 'pos' : 'neg'} detalhe="juros − saídas" />
              <Estatistica rotulo="Próximo rendimento" valor={dinheiro(m.jurosEstimadoProximoMes, moeda)} detalhe={`${pct(m.taxaMensalUsada, 3)} a.m. sobre o saldo atual`} />
            </div>
          </section>

          {/* métricas acumuladas */}
          <section>
            <h3 className="mb-2 text-lg">Acumulado</h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Estatistica rotulo="Juros acumulados" valor={dinheiro(m.totais.juros, moeda)} tom="pos" detalhe={`${dinheiro(m.juros12m, moeda)} nos últimos 12 meses`} />
              <Estatistica rotulo="Saídas acumuladas" valor={dinheiro(m.totais.saidas, moeda)} tom={m.totais.saidas ? 'neg' : undefined}
                detalhe={`Resgates ${dinheiro(m.totais.resgates, moeda)} · Impostos ${dinheiro(m.totais.impostos, moeda)} · Taxas ${dinheiro(m.totais.taxas, moeda)}`} />
              <Estatistica rotulo="Taxa" valor={`${pct(m.taxaMensalUsada, 3)} a.m.`}
                detalhe={`${pct(m.taxaAnualEquivalente)} a.a. equivalente${m.rentabilidadeMediaReal != null ? ` · média real ${pct(m.rentabilidadeMediaReal, 3)} a.m.` : ''}`} />
              <Estatistica rotulo="Retirada sustentável" valor={`${dinheiro(m.saidaSustentavelMensal, moeda)}/mês`} detalhe="máximo sem reduzir o montante" />
            </div>
          </section>

          {/* diagnóstico */}
          <section className={`folha flex gap-3 p-4 ${m.rendimentoCobreSaidas ? 'border-verde/40' : 'border-vermelho/40'}`}>
            <span className="text-2xl" aria-hidden>{m.rendimentoCobreSaidas ? '🌱' : '⏳'}</span>
            <div className="text-sm">
              {m.mediaSaidasMensal <= 0 ? (
                <p>Sem saídas recentes: todo o rendimento está ficando na conta.</p>
              ) : m.rendimentoCobreSaidas ? (
                <p>
                  Suas saídas médias (<b className="num">{dinheiro(m.mediaSaidasMensal, moeda)}/mês</b>) estão abaixo dos juros estimados
                  (<b className="num">{dinheiro(m.jurosEstimadoProximoMes, moeda)}</b>). O montante continua crescendo — sobram
                  <b className="num"> {dinheiro(m.jurosEstimadoProximoMes - m.mediaSaidasMensal, moeda)}</b> por mês.
                </p>
              ) : (
                <p>
                  Suas saídas médias (<b className="num">{dinheiro(m.mediaSaidasMensal, moeda)}/mês</b>) superam os juros
                  (<b className="num">{dinheiro(m.jurosEstimadoProximoMes, moeda)}</b>). Nesse ritmo o saldo dura cerca de
                  <b> {duracao(m.duracaoMeses)}</b>. Para preservar o montante, retire até <b className="num">{dinheiro(m.saidaSustentavelMensal, moeda)}</b> por mês.
                </p>
              )}
              <p className="mt-1 text-xs text-tinta-fraca">Média de saídas calculada nos últimos 3 meses fechados.</p>
            </div>
          </section>

          {/* gráficos */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="folha p-4">
              <h3 className="mb-2 text-lg">Juros × saídas</h3>
              <BarrasJurosSaidas serie={m.serie} moeda={moeda} />
            </div>
            <div className="folha p-4">
              <h3 className="mb-2 text-lg">Saldo e projeção</h3>
              <LinhaSaldo serie={m.serie} projecao={m.projecao12m} moeda={moeda} />
            </div>
          </section>

          {/* tabelas */}
          <section className="folha overflow-hidden">
            <div className="flex border-b border-linha">
              {[['meses', 'Mês a mês'], ['movimentos', `Movimentos (${movs.length})`], ['projecao', 'Projeção']].map(([k, t]) => (
                <button key={k} onClick={() => setAba(k)} className={`flex-1 px-3 py-3 text-sm font-medium ${aba === k ? 'border-b-2 border-couro text-couro' : 'text-tinta-suave'}`}>{t}</button>
              ))}
            </div>
            {aba === 'meses' && <TabelaMeses serie={m.serie} moeda={moeda} />}
            {aba === 'movimentos' && (
              <ListaMovimentos movs={movs} moeda={moeda} aoEditar={setFormMov}
                aoApagar={async (id) => { await del(`/movimentos/${id}`); await recarregar(); avisar('Movimento apagado'); }} />
            )}
            {aba === 'projecao' && <TabelaProjecao proj={m.projecao12m} moeda={moeda} saida={m.mediaSaidasMensal} />}
          </section>
        </>
      )}

      <FormConta aberto={formConta !== null} conta={formConta} aoFechar={() => setFormConta(null)}
        aoSalvar={async (c) => { setFormConta(null); await carregarContas(); setSelecionada(c._id); await carregarConta(c._id); avisar('Conta salva'); }}
        aoApagar={async (id) => { await del(`/contas/${id}`); setFormConta(null); setSelecionada(null); await carregarContas(); avisar('Conta apagada'); }} />
      <FormMovimento aberto={formMov !== null} mov={formMov} conta={conta} saldo={m?.saldoAtual} aoFechar={() => setFormMov(null)}
        aoSalvar={async () => { setFormMov(null); await recarregar(); avisar('Movimento registrado'); }} />
      {conta && (
        <ModalRendimento aberto={modalRend} conta={conta} metricas={m} movs={movs} aoFechar={() => setModalRend(false)}
          aoSalvar={async (v) => { setModalRend(false); await recarregar(); avisar(`Rendimento de ${dinheiro(v, moeda)} lançado`); }} />
      )}
    </div>
  );
}

function TabelaMeses({ serie, moeda }) {
  const linhas = [...serie].reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-papel-escuro/50 text-left">
          <tr className="rotulo">
            <th className="px-4 py-2 font-semibold">Mês</th>
            <th className="px-3 py-2 text-right font-semibold">Abertura</th>
            <th className="px-3 py-2 text-right font-semibold">Juros</th>
            <th className="px-3 py-2 text-right font-semibold">Rentab.</th>
            <th className="px-3 py-2 text-right font-semibold">Aportes</th>
            <th className="px-3 py-2 text-right font-semibold">Saídas</th>
            <th className="px-3 py-2 text-right font-semibold">Líquido</th>
            <th className="px-4 py-2 text-right font-semibold">Fechamento</th>
          </tr>
        </thead>
        <tbody className="num">
          {linhas.map((l) => (
            <tr key={l.mes} className="border-t border-linha/70">
              <td className="px-4 py-2 font-corpo capitalize">{mesCurto(l.mes)}</td>
              <td className="px-3 py-2 text-right">{dinheiro(l.abertura, moeda)}</td>
              <td className="px-3 py-2 text-right text-verde">{l.juros ? dinheiro(l.juros, moeda) : '—'}</td>
              <td className="px-3 py-2 text-right text-tinta-suave">{l.juros ? pct(l.rentabilidade, 3) : '—'}</td>
              <td className="px-3 py-2 text-right">{l.aportes ? dinheiro(l.aportes, moeda) : '—'}</td>
              <td className="px-3 py-2 text-right text-vermelho" title={`Resgates ${l.resgates} · Impostos ${l.impostos} · Taxas ${l.taxas}`}>{l.saidas ? dinheiro(l.saidas, moeda) : '—'}</td>
              <td className={`px-3 py-2 text-right ${l.liquido >= 0 ? 'text-verde' : 'text-vermelho'}`}>{dinheiro(l.liquido, moeda)}</td>
              <td className="px-4 py-2 text-right font-medium">{dinheiro(l.fechamento, moeda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaProjecao({ proj, moeda, saida }) {
  return (
    <div className="overflow-x-auto">
      <p className="px-4 pt-3 text-xs text-tinta-fraca">Considera a taxa atual e saída mensal média de {dinheiro(saida, moeda)}.</p>
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-left"><tr className="rotulo">
          <th className="px-4 py-2 font-semibold">Mês</th><th className="px-3 py-2 text-right font-semibold">Juros</th>
          <th className="px-3 py-2 text-right font-semibold">Saída</th><th className="px-3 py-2 text-right font-semibold">Juros acum.</th>
          <th className="px-4 py-2 text-right font-semibold">Saldo</th>
        </tr></thead>
        <tbody className="num">
          {proj.map((p) => (
            <tr key={p.mes} className="border-t border-linha/70">
              <td className="px-4 py-2 font-corpo capitalize">{mesCurto(p.mes)}</td>
              <td className="px-3 py-2 text-right text-verde">{dinheiro(p.juros, moeda)}</td>
              <td className="px-3 py-2 text-right text-vermelho">{dinheiro(p.saida, moeda)}</td>
              <td className="px-3 py-2 text-right">{dinheiro(p.jurosAcumulados, moeda)}</td>
              <td className="px-4 py-2 text-right font-medium">{dinheiro(p.saldo, moeda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListaMovimentos({ movs, moeda, aoEditar, aoApagar }) {
  if (!movs.length) return <p className="px-4 py-8 text-center text-sm text-tinta-suave">Nenhum movimento ainda.</p>;
  return (
    <ul className="divide-y divide-linha/70">
      {movs.map((mv) => {
        const t = TIPOS[mv.tipo];
        return (
          <li key={mv._id} className="flex items-center gap-3 px-4 py-3">
            <span className={`chip ${t.chip}`}>{t.nome}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{mv.descricao || t.nome}</p>
              <p className="text-xs text-tinta-fraca">{dataCompleta(mv.data)}</p>
            </div>
            <span className={`num text-sm font-medium ${t.cor}`}>{t.sinal} {dinheiro(mv.valor, moeda)}</span>
            <button className="text-sm text-tinta-fraca hover:text-tinta" onClick={() => aoEditar(mv)} aria-label="Editar">✎</button>
            <BotaoConfirmar className="text-sm text-tinta-fraca hover:text-vermelho" texto="Apagar?" aoConfirmar={() => aoApagar(mv._id)}>🗑</BotaoConfirmar>
          </li>
        );
      })}
    </ul>
  );
}

function FormConta({ aberto, conta, aoFechar, aoSalvar, aoApagar }) {
  const avisar = useAviso();
  const novo = !conta?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    setF(conta?._id
      ? { ...conta, saldoInicial: String(conta.saldoInicial).replace('.', ','), taxa: String(conta.taxa).replace('.', ','), dataInicio: paraInput(conta.dataInicio) }
      : { nome: '', instituicao: '', moeda: 'BRL', saldoInicial: '', dataInicio: `${mesAtual()}-01`, modo: 'mensal', taxa: '', nota: '' });
  }, [aberto, conta]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    const corpo = { ...f, saldoInicial: lerNumero(f.saldoInicial), taxa: f.modo === 'manual' ? 0 : lerNumero(f.taxa) };
    if (!corpo.nome) return avisar('Dê um nome à conta', 'erro');
    if (!(corpo.saldoInicial >= 0)) return avisar('Saldo inicial inválido', 'erro');
    if (f.modo !== 'manual' && !(corpo.taxa >= 0)) return avisar('Taxa inválida', 'erro');
    try {
      const c = novo ? await post('/contas', corpo) : await put(`/contas/${conta._id}`, corpo);
      aoSalvar(c);
    } catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? 'Nova conta de rendimento' : 'Editar conta'} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
        <Campo rotulo="Nome" className="col-span-2"><input className="campo" value={f.nome || ''} onChange={set('nome')} placeholder="Ex.: Reserva" autoFocus /></Campo>
        <Campo rotulo="Instituição" className="col-span-2"><input className="campo" value={f.instituicao || ''} onChange={set('instituicao')} placeholder="Banco ou corretora" /></Campo>
        <Campo rotulo="Saldo inicial"><input className="campo num" inputMode="decimal" value={f.saldoInicial ?? ''} onChange={set('saldoInicial')} placeholder="350.000,00" /></Campo>
        <Campo rotulo="Moeda">
          <select className="campo" value={f.moeda} onChange={set('moeda')}><option>BRL</option><option>EUR</option><option>USD</option></select>
        </Campo>
        <Campo rotulo="Data do saldo inicial" className="col-span-2" dica="O histórico mês a mês começa nesta data.">
          <input type="date" className="campo" value={f.dataInicio || ''} onChange={set('dataInicio')} />
        </Campo>
        <Campo rotulo="Como rende" className="col-span-2">
          <div className="grid grid-cols-3 gap-2">
            {[['mensal', '% ao mês'], ['anual', '% ao ano'], ['manual', 'Valor do extrato']].map(([k, t]) => (
              <button type="button" key={k} onClick={() => setF((x) => ({ ...x, modo: k }))}
                className={`rounded-lg border px-2 py-2 text-sm ${f.modo === k ? 'border-couro bg-couro text-papel-claro' : 'border-linha bg-white/60'}`}>{t}</button>
            ))}
          </div>
        </Campo>
        {f.modo !== 'manual' ? (
          <Campo rotulo={f.modo === 'anual' ? 'Taxa anual (%)' : 'Taxa mensal (%)'} className="col-span-2"
            dica={f.modo === 'anual' ? 'Convertida para a taxa mensal equivalente: (1 + a)^(1/12) − 1.' : 'Ex.: 0,8 para 0,8% ao mês.'}>
            <input className="campo num" inputMode="decimal" value={f.taxa ?? ''} onChange={set('taxa')} placeholder={f.modo === 'anual' ? '10,5' : '0,8'} />
          </Campo>
        ) : (
          <p className="col-span-2 rounded-lg bg-papel-escuro/60 p-3 text-xs text-tinta-suave">Você lança todo mês o valor que veio no extrato. As projeções usam a rentabilidade média real dos meses lançados.</p>
        )}
        <Campo rotulo="Observação" className="col-span-2"><input className="campo" value={f.nota || ''} onChange={set('nota')} /></Campo>
        <div className="col-span-2 mt-2 flex flex-wrap justify-between gap-2">
          {!novo && aoApagar ? <BotaoConfirmar texto="Apagar conta e movimentos?" aoConfirmar={() => aoApagar(conta._id)}>Apagar conta</BotaoConfirmar> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>Cancelar</button>
            <button className="btn-primario">Salvar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function FormMovimento({ aberto, mov, conta, saldo, aoFechar, aoSalvar }) {
  const avisar = useAviso();
  const novo = !mov?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    setF(mov?._id ? { ...mov, valor: String(mov.valor).replace('.', ','), data: paraInput(mov.data) } : { tipo: mov?.tipo || 'resgate', valor: '', data: hojeISO(), descricao: '' });
  }, [aberto, mov]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ehSaida = ['resgate', 'imposto', 'taxa'].includes(f.tipo);
  const tipos = ehSaida || !f.tipo ? ['resgate', 'imposto', 'taxa'] : ['aporte', 'rendimento'];

  const salvar = async (e) => {
    e.preventDefault();
    const valor = lerNumero(f.valor);
    if (!(valor > 0)) return avisar('Informe um valor', 'erro');
    try {
      const corpo = { tipo: f.tipo, valor, data: f.data, descricao: f.descricao };
      novo ? await post(`/contas/${conta._id}/movimentos`, corpo) : await put(`/movimentos/${mov._id}`, corpo);
      aoSalvar();
    } catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? (ehSaida ? 'Registrar saída' : 'Registrar entrada') : 'Editar movimento'} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-3">
        <div className={`grid gap-2 ${tipos.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {tipos.map((t) => (
            <button type="button" key={t} onClick={() => setF((x) => ({ ...x, tipo: t }))}
              className={`rounded-lg border px-2 py-2 text-sm ${f.tipo === t ? 'border-couro bg-couro text-papel-claro' : 'border-linha bg-white/60'}`}>{TIPOS[t].nome}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={`Valor (${conta?.moeda})`} dica={ehSaida && saldo != null ? `Saldo disponível: ${dinheiro(saldo, conta?.moeda)}` : undefined}>
            <input className="campo num" inputMode="decimal" value={f.valor ?? ''} onChange={set('valor')} autoFocus placeholder="0,00" />
          </Campo>
          <Campo rotulo="Data"><input type="date" className="campo" value={f.data || ''} onChange={set('data')} /></Campo>
        </div>
        <Campo rotulo="Descrição"><input className="campo" value={f.descricao || ''} onChange={set('descricao')} placeholder={ehSaida ? 'Ex.: retirada para viagem' : ''} /></Campo>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>Cancelar</button>
          <button className="btn-primario">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

function ModalRendimento({ aberto, conta, metricas, movs, aoFechar, aoSalvar }) {
  const avisar = useAviso();
  const manual = conta.modo === 'manual';
  const [mes, setMes] = useState(mesAtual());
  const [valor, setValor] = useState('');
  const [usarValor, setUsarValor] = useState(manual);
  const [duplicado, setDuplicado] = useState(false);
  useEffect(() => { if (aberto) { setMes(mesAtual()); setValor(''); setUsarValor(manual); setDuplicado(false); } }, [aberto, manual]);
  useEffect(() => setDuplicado(false), [mes]);

  const lancados = useMemo(() => new Set(movs.filter((m) => m.tipo === 'rendimento').map((m) => m.data.slice(0, 7))), [movs]);
  const inicio = String(conta.dataInicio).slice(0, 7);
  const opcoes = useMemo(() => {
    const out = [];
    for (let m = mesAtual(); m >= inicio && out.length < 36; m = somarMes(m, -1)) out.push(m);
    return out;
  }, [inicio]);
  const pendentes = opcoes.filter((m) => !lancados.has(m));
  const estimativa = metricas?.serie.find((s) => s.mes === mes);
  const r = metricas.taxaMensalConfigurada;
  const baseEst = estimativa ? estimativa.fechamento - estimativa.juros : metricas.saldoAtual;

  const salvar = async (forcar = false) => {
    const corpo = { mes, forcar };
    if (usarValor) {
      const v = lerNumero(valor);
      if (!(v >= 0)) return avisar('Informe o valor do rendimento', 'erro');
      corpo.valor = v;
    }
    try {
      const res = await post(`/contas/${conta._id}/aplicar-rendimento`, corpo);
      aoSalvar(res.movimento.valor);
    } catch (e) {
      if (e.status === 409) return setDuplicado(true);
      avisar(e.message, 'erro');
    }
  };

  return (
    <Modal titulo="Lançar rendimento" aberto={aberto} aoFechar={aoFechar}
      rodape={<><button className="btn-secundario" onClick={aoFechar}>Cancelar</button>
        {duplicado
          ? <button className="btn bg-ambar text-white" onClick={() => salvar(true)}>Lançar mesmo assim</button>
          : <button className="btn-primario" onClick={() => salvar()}>Lançar</button>}</>}>
      <div className="space-y-4">
        <Campo rotulo="Mês de referência" dica={pendentes.length > 1 ? `${pendentes.length} meses sem rendimento lançado` : undefined}>
          <select className="campo" value={mes} onChange={(e) => setMes(e.target.value)}>
            {opcoes.map((m) => <option key={m} value={m}>{mesLongo(m)}{lancados.has(m) ? ' ✓ lançado' : ''}</option>)}
          </select>
        </Campo>
        {!manual && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setUsarValor(false)} className={`rounded-lg border px-2 py-2 text-sm ${!usarValor ? 'border-couro bg-couro text-papel-claro' : 'border-linha bg-white/60'}`}>Calcular pela taxa</button>
            <button type="button" onClick={() => setUsarValor(true)} className={`rounded-lg border px-2 py-2 text-sm ${usarValor ? 'border-couro bg-couro text-papel-claro' : 'border-linha bg-white/60'}`}>Valor do extrato</button>
          </div>
        )}
        {usarValor ? (
          <Campo rotulo={`Rendimento creditado (${conta.moeda})`}>
            <input className="campo num" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" autoFocus />
          </Campo>
        ) : (
          <div className="rounded-lg bg-verde-claro p-3 text-sm">
            <p>{pct(r, 3)} × saldo no fim do mês ({dinheiro(baseEst, conta.moeda)})</p>
            <p className="num mt-1 text-xl font-medium text-verde">≈ {dinheiro(baseEst * (r / 100), conta.moeda)}</p>
            <p className="mt-1 text-xs text-tinta-suave">O valor exato é calculado com os movimentos registrados até o último dia do mês.</p>
          </div>
        )}
        {duplicado && (
          <p className="rounded-lg bg-ambar-claro p-3 text-sm">Já existe rendimento lançado em {mesLongo(mes).toLowerCase()}. Para corrigir, apague o anterior na lista de movimentos, ou lance outro mesmo assim.</p>
        )}
      </div>
    </Modal>
  );
}
