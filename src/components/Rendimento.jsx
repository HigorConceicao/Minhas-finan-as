import { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../api.js';
import {
  dataCompleta, dataCurta, dinheiro, duracao, hojeISO, lerNumero, mesAtual, mesCurto, mesLongo, mesNaFrase, paraCampo, paraInput, pct, somarMes, ultimoDia,
} from '../fmt.js';
import { useT } from '../i18n.js';
import { BotaoConfirmar, Campo, Carregando, Estatistica, Modal, Segmentado, Vazio, useAviso } from './ui.jsx';
import { BarrasJurosSaidas, LinhaSaldo } from './Graficos.jsx';
import Icone from './Icones.jsx';

const SAIDAS = ['resgate', 'imposto', 'taxa'];
const CHIP = { rendimento: 'bg-pos-suave text-pos', aporte: 'bg-pos-suave text-pos', resgate: 'bg-neg-suave text-neg', imposto: 'bg-neg-suave text-neg', taxa: 'bg-neg-suave text-neg' };

export default function Rendimento() {
  const t = useT();
  const avisar = useAviso();
  const [contas, setContas] = useState(null);
  const [selecionada, setSelecionada] = useState(null);
  const [met, setMet] = useState(null);
  const [movs, setMovs] = useState([]);
  const [formConta, setFormConta] = useState(null);
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
    const m = await get(`/contas/${id}/metricas`); // sincroniza o automático antes de listar
    setMet(m);
    setMovs(await get(`/contas/${id}/movimentos`));
  }, []);

  useEffect(() => { carregarContas().catch((e) => avisar(e.message, 'erro')); }, [carregarContas, avisar]);
  useEffect(() => { carregarConta(selecionada).catch((e) => avisar(e.message, 'erro')); }, [selecionada, carregarConta, avisar]);
  const recarregar = async () => { await Promise.all([carregarContas(), carregarConta(selecionada)]); };

  if (!contas) return <Carregando />;
  if (!contas.length) {
    return (
      <>
        <Vazio icone="rendimento" titulo={t('rend.nenhuma')} texto={t('rend.vazio')}
          acao={<button className="btn-primario" onClick={() => setFormConta({})}>{t('rend.cadastrar')}</button>} />
        <FormConta aberto={formConta !== null} conta={formConta} aoFechar={() => setFormConta(null)}
          aoSalvar={async (c) => { setFormConta(null); await carregarContas(); setSelecionada(c._id); avisar(t('rend.criada')); }} />
      </>
    );
  }

  const conta = met?.conta;
  const moeda = conta?.moeda || 'BRL';
  const m = met;
  const automatico = conta?.rendimentoAutomatico && conta?.modo !== 'manual';

  return (
    <div className="space-y-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {contas.map((c) => (
          <button key={c._id} onClick={() => setSelecionada(c._id)} aria-pressed={c._id === selecionada}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${c._id === selecionada ? 'bg-texto text-cartao' : 'bg-cartao text-texto-2 shadow-cartao hover:text-texto'}`}>
            {c.nome}
          </button>
        ))}
        <button className="shrink-0 rounded-full border-2 border-dashed border-linha px-4 py-2 text-sm font-semibold text-texto-2 hover:bg-cartao" onClick={() => setFormConta({})}>{t('rend.novaConta')}</button>
      </div>

      {!m ? <Carregando /> : (
        <>
          <section className="overflow-hidden rounded-4xl bg-capa text-capa-texto shadow-flutua">
            <div className="p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold opacity-75">{conta.instituicao || t('rend.contaPadrao')} · {conta.nome}</p>
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20" onClick={() => setFormConta(conta)} aria-label={t('rend.editarConta')}>
                  <Icone nome="lapis" className="h-4 w-4" />
                </button>
              </div>
              <p className="num mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{dinheiro(m.saldoAtual, moeda)}</p>
              <p className="mt-1 text-sm opacity-75">
                {m.variacao >= 0 ? '▲' : '▼'} {t('rend.desde', { v: dinheiro(Math.abs(m.variacao), moeda), d: dataCompleta(conta.dataInicio), i: dinheiro(m.saldoInicial, moeda) })}
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2">
                {[
                  ['rendimento', t('rend.lancar').replace('+ ', ''), () => setModalRend(true)],
                  ['menos', t('rend.saida').replace('− ', ''), () => setFormMov({ tipo: 'resgate' })],
                  ['mais', t('rend.aporte').replace('+ ', ''), () => setFormMov({ tipo: 'aporte' })],
                ].map(([ic, txt, fn]) => (
                  <button key={ic} onClick={fn} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 px-2 py-3 text-xs font-semibold hover:bg-white/20">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-capa"><Icone nome={ic} className="h-4 w-4" forte /></span>
                    <span className="text-center leading-tight">{txt}</span>
                  </button>
                ))}
              </div>
            </div>
            {!m.mes.rendimentoLancado && conta.modo !== 'manual' && (
              automatico ? (
                <p className="flex items-center gap-2 bg-black/15 px-6 py-3 text-sm">
                  <Icone nome="relogio" className="h-4 w-4 shrink-0" />
                  <span>{t('rend.automaticoEm', { v: dinheiro(m.jurosEstimadoProximoMes, moeda), d: dataCurta(ultimoDia(m.mesAtual)) })}</span>
                </p>
              ) : (
                <button onClick={() => setModalRend(true)} className="flex w-full items-center justify-between gap-3 bg-black/15 px-6 py-3 text-left text-sm hover:bg-black/25">
                  <span>{t('rend.naoLancado', { mes: mesNaFrase(m.mesAtual), v: dinheiro(m.jurosEstimadoProximoMes, moeda) })}</span>
                  <span className="shrink-0 font-bold">{t('rend.lancarSeta')}</span>
                </button>
              )
            )}
          </section>

          <section>
            <h3 className="mb-2 px-1 text-base">{t('rend.esteMes')} <span className="text-sm font-semibold text-texto-3">· {mesLongo(m.mesAtual)}</span></h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Estatistica rotulo={t('rend.jurosMes')} valor={dinheiro(m.mes.juros, moeda)} tom="pos" detalhe={m.mes.rendimentoLancado ? t('rend.lancado') : t('rend.naoLancadoCurto')} />
              <Estatistica rotulo={t('rend.saidasMes')} valor={dinheiro(m.mes.saidas, moeda)} tom={m.mes.saidas ? 'neg' : undefined} detalhe={t('rend.tiposSaida')} />
              <Estatistica rotulo={t('rend.liquido')} valor={dinheiro(m.mes.liquido, moeda)} tom={m.mes.liquido >= 0 ? 'pos' : 'neg'} detalhe={t('rend.jurosMenosSaidas')} />
              <Estatistica rotulo={t('rend.proximo')} valor={dinheiro(m.jurosEstimadoProximoMes, moeda)} detalhe={t('rend.sobreSaldo', { t: pct(m.taxaMensalUsada, 3) })} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 px-1 text-base">{t('rend.acumulado')}</h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Estatistica rotulo={t('rend.jurosAcum')} valor={dinheiro(m.totais.juros, moeda)} tom="pos" detalhe={t('rend.ult12', { v: dinheiro(m.juros12m, moeda) })} />
              <Estatistica rotulo={t('rend.saidasAcum')} valor={dinheiro(m.totais.saidas, moeda)} tom={m.totais.saidas ? 'neg' : undefined}
                detalhe={t('rend.detalheSaidas', { r: dinheiro(m.totais.resgates, moeda), i: dinheiro(m.totais.impostos, moeda), t: dinheiro(m.totais.taxas, moeda) })} />
              <Estatistica rotulo={t('rend.taxa')} valor={`${pct(m.taxaMensalUsada, 3)} ${t('rend.am')}`}
                detalhe={t('rend.anual', { a: pct(m.taxaAnualEquivalente) }) + (m.rentabilidadeMediaReal != null ? t('rend.mediaReal', { m: pct(m.rentabilidadeMediaReal, 3) }) : '')} />
              <Estatistica rotulo={t('rend.sustentavel')} valor={dinheiro(m.saidaSustentavelMensal, moeda)} detalhe={t('rend.semReduzir')} />
            </div>
          </section>

          <section className={`flex gap-3 rounded-3xl p-5 ${m.rendimentoCobreSaidas ? 'bg-pos-suave' : 'bg-aviso-suave'}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cartao ${m.rendimentoCobreSaidas ? 'text-pos' : 'text-aviso'}`}>
              <Icone nome={m.rendimentoCobreSaidas ? 'rendimento' : 'relogio'} className="h-4 w-4" forte />
            </span>
            <div className="text-sm leading-relaxed">
              <p>
                {m.mediaSaidasMensal <= 0 ? t('rend.semSaidas')
                  : m.rendimentoCobreSaidas
                    ? t('rend.cobre', { s: dinheiro(m.mediaSaidasMensal, moeda), j: dinheiro(m.jurosEstimadoProximoMes, moeda), d: dinheiro(m.jurosEstimadoProximoMes - m.mediaSaidasMensal, moeda) })
                    : t('rend.naoCobre', { s: dinheiro(m.mediaSaidasMensal, moeda), j: dinheiro(m.jurosEstimadoProximoMes, moeda), t: duracao(m.duracaoMeses, t), r: dinheiro(m.saidaSustentavelMensal, moeda) })}
              </p>
              <p className="mt-1 text-xs text-texto-2">{t('rend.mediaNota')}</p>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="cartao p-5"><h3 className="mb-3 text-base">{t('rend.jurosXSaidas')}</h3><BarrasJurosSaidas serie={m.serie} moeda={moeda} /></div>
            <div className="cartao p-5"><h3 className="mb-3 text-base">{t('rend.saldoProjecao')}</h3><LinhaSaldo serie={m.serie} projecao={m.projecao12m} moeda={moeda} /></div>
          </section>

          <section className="cartao overflow-hidden">
            <div className="p-2">
              <Segmentado valor={aba} aoMudar={setAba} opcoes={[['meses', t('rend.mesAMes')], ['movimentos', t('rend.movimentos', { n: movs.length })], ['projecao', t('rend.projecao')]]} />
            </div>
            {aba === 'meses' && <TabelaMeses serie={m.serie} moeda={moeda} />}
            {aba === 'movimentos' && (
              <ListaMovimentos movs={movs} moeda={moeda} aoEditar={setFormMov}
                aoApagar={async (id) => { await del(`/movimentos/${id}`); await recarregar(); avisar(t('rend.movApagado')); }} />
            )}
            {aba === 'projecao' && <TabelaProjecao proj={m.projecao12m} moeda={moeda} saida={m.mediaSaidasMensal} />}
          </section>
        </>
      )}

      <FormConta aberto={formConta !== null} conta={formConta} aoFechar={() => setFormConta(null)}
        aoSalvar={async (c) => { setFormConta(null); await carregarContas(); setSelecionada(c._id); await carregarConta(c._id); avisar(t('rend.salva')); }}
        aoApagar={async (id) => { await del(`/contas/${id}`); setFormConta(null); setSelecionada(null); await carregarContas(); avisar(t('rend.apagada')); }} />
      <FormMovimento aberto={formMov !== null} mov={formMov} conta={conta} saldo={m?.saldoAtual} aoFechar={() => setFormMov(null)}
        aoSalvar={async () => { setFormMov(null); await recarregar(); avisar(t('rend.movRegistrado')); }} />
      {conta && (
        <ModalRendimento aberto={modalRend} conta={conta} metricas={m} movs={movs} aoFechar={() => setModalRend(false)}
          aoSalvar={async (v) => { setModalRend(false); await recarregar(); avisar(t('rend.rendLancado', { v: dinheiro(v, moeda) })); }} />
      )}
    </div>
  );
}

const th = 'px-3 py-3 text-right text-xs font-semibold text-texto-3';
function TabelaMeses({ serie, moeda }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead><tr className="border-b border-linha">
          <th className={`${th} pl-5 text-left`}>{t('rend.col.mes')}</th><th className={th}>{t('rend.col.abertura')}</th><th className={th}>{t('rend.col.juros')}</th>
          <th className={th}>{t('rend.col.rentab')}</th><th className={th}>{t('rend.col.aportes')}</th><th className={th}>{t('rend.col.saidas')}</th>
          <th className={th}>{t('rend.col.liquido')}</th><th className={`${th} pr-5`}>{t('rend.col.fechamento')}</th>
        </tr></thead>
        <tbody className="num">
          {[...serie].reverse().map((l) => (
            <tr key={l.mes} className="border-b border-linha last:border-0">
              <td className="py-3 pl-5 pr-3 font-semibold">{mesCurto(l.mes)}</td>
              <td className="px-3 py-3 text-right text-texto-2">{dinheiro(l.abertura, moeda)}</td>
              <td className="px-3 py-3 text-right text-pos">{l.juros ? dinheiro(l.juros, moeda) : '—'}</td>
              <td className="px-3 py-3 text-right text-texto-3">{l.juros ? pct(l.rentabilidade, 3) : '—'}</td>
              <td className="px-3 py-3 text-right">{l.aportes ? dinheiro(l.aportes, moeda) : '—'}</td>
              <td className="px-3 py-3 text-right text-neg">{l.saidas ? dinheiro(l.saidas, moeda) : '—'}</td>
              <td className={`px-3 py-3 text-right font-semibold ${l.liquido >= 0 ? 'text-pos' : 'text-neg'}`}>{dinheiro(l.liquido, moeda)}</td>
              <td className="py-3 pl-3 pr-5 text-right font-bold">{dinheiro(l.fechamento, moeda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaProjecao({ proj, moeda, saida }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <p className="px-5 pt-1 text-xs text-texto-3">{t('rend.projNota', { v: dinheiro(saida, moeda) })}</p>
      <table className="w-full min-w-[480px] text-sm">
        <thead><tr className="border-b border-linha">
          <th className={`${th} pl-5 text-left`}>{t('rend.col.mes')}</th><th className={th}>{t('rend.col.juros')}</th><th className={th}>{t('rend.col.saida')}</th>
          <th className={th}>{t('rend.col.jurosAcum')}</th><th className={`${th} pr-5`}>{t('rend.col.saldo')}</th>
        </tr></thead>
        <tbody className="num">
          {proj.map((p) => (
            <tr key={p.mes} className="border-b border-linha last:border-0">
              <td className="py-3 pl-5 pr-3 font-semibold">{mesCurto(p.mes)}</td>
              <td className="px-3 py-3 text-right text-pos">{dinheiro(p.juros, moeda)}</td>
              <td className="px-3 py-3 text-right text-neg">{dinheiro(p.saida, moeda)}</td>
              <td className="px-3 py-3 text-right">{dinheiro(p.jurosAcumulados, moeda)}</td>
              <td className="py-3 pl-3 pr-5 text-right font-bold">{dinheiro(p.saldo, moeda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListaMovimentos({ movs, moeda, aoEditar, aoApagar }) {
  const t = useT();
  if (!movs.length) return <p className="px-5 py-10 text-center text-sm text-texto-2">{t('rend.semMov')}</p>;
  return (
    <ul className="divide-y divide-linha">
      {movs.map((mv) => {
        const saida = SAIDAS.includes(mv.tipo);
        return (
          <li key={mv._id} className="flex items-center gap-3 px-5 py-3.5">
            <span className={`chip ${CHIP[mv.tipo]}`}>{t(`rend.tipo.${mv.tipo}`)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{mv.descricao || (mv.tipo === 'rendimento' ? mesCurto(mv.data.slice(0, 7)) : t(`rend.tipo.${mv.tipo}`))}</p>
              <p className="flex items-center gap-1 text-xs text-texto-3">{dataCompleta(mv.data)}{mv.automatico && <><span aria-hidden>·</span><Icone nome="relogio" className="h-3 w-3" />{t('rend.automatico')}</>}</p>
            </div>
            <span className={`num text-sm font-bold ${saida ? 'text-neg' : 'text-pos'}`}>{saida ? '−' : '+'}{dinheiro(mv.valor, moeda)}</span>
            <button className="rounded-full p-2 text-texto-3 hover:bg-sutil hover:text-texto" onClick={() => aoEditar(mv)} aria-label={t('comum.editar')}><Icone nome="lapis" className="h-4 w-4" /></button>
            <BotaoConfirmar className="rounded-full p-2 text-xs font-semibold text-texto-3 hover:bg-neg-suave hover:text-neg" rotulo={t('comum.apagar')} texto={t('comum.apagar')} aoConfirmar={() => aoApagar(mv._id)}>
              <Icone nome="lixo" className="h-4 w-4" />
            </BotaoConfirmar>
          </li>
        );
      })}
    </ul>
  );
}

function Interruptor({ id, ligado, aoMudar, rotulo, dica }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-sutil p-4">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{rotulo}</span>
        {dica && <span className="mt-0.5 block text-xs text-texto-3">{dica}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} className="peer sr-only" />
      <span className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-linha transition peer-checked:bg-marca peer-focus-visible:ring-4 peer-focus-visible:ring-marca/25">
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-cartao shadow transition-all ${ligado ? 'left-6' : 'left-1'}`} />
      </span>
    </label>
  );
}

function FormConta({ aberto, conta, aoFechar, aoSalvar, aoApagar }) {
  const t = useT();
  const avisar = useAviso();
  const novo = !conta?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    setF(conta?._id
      ? { ...conta, saldoInicial: paraCampo(conta.saldoInicial), taxa: paraCampo(conta.taxa), dataInicio: paraInput(conta.dataInicio), rendimentoAutomatico: conta.rendimentoAutomatico !== false }
      : { nome: '', instituicao: '', moeda: 'BRL', saldoInicial: '', dataInicio: `${mesAtual()}-01`, modo: 'mensal', taxa: '', nota: '', rendimentoAutomatico: true, incluirAnteriores: false });
  }, [aberto, conta]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const inicioPassado = f.dataInicio && f.dataInicio.slice(0, 7) < mesAtual();

  const salvar = async (e) => {
    e.preventDefault();
    const corpo = { ...f, saldoInicial: lerNumero(f.saldoInicial), taxa: f.modo === 'manual' ? 0 : lerNumero(f.taxa) };
    if (!corpo.nome) return avisar(t('rend.deNome'), 'erro');
    if (!(corpo.saldoInicial >= 0)) return avisar(t('rend.saldoInvalido'), 'erro');
    if (f.modo !== 'manual' && !(corpo.taxa >= 0)) return avisar(t('rend.taxaInvalida'), 'erro');
    try {
      const c = novo ? await post('/contas', corpo) : await put(`/contas/${conta._id}`, corpo);
      aoSalvar(c);
    } catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? t('rend.novaTitulo') : t('rend.editarTitulo')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="grid grid-cols-2 gap-4">
        <Campo rotulo={t('rend.nome')} className="col-span-2"><input id="conta-nome" className="campo" value={f.nome || ''} onChange={set('nome')} placeholder={t('rend.exNome')} /></Campo>
        <Campo rotulo={t('rend.instituicao')} className="col-span-2"><input id="conta-inst" className="campo" value={f.instituicao || ''} onChange={set('instituicao')} placeholder={t('rend.exInst')} /></Campo>
        <Campo rotulo={t('rend.saldoInicial')}><input id="conta-saldo" className="campo num" inputMode="decimal" value={f.saldoInicial ?? ''} onChange={set('saldoInicial')} placeholder="350.000" /></Campo>
        <Campo rotulo={t('comum.moeda')}><select id="conta-moeda" className="campo" value={f.moeda} onChange={set('moeda')}><option>BRL</option><option>EUR</option><option>USD</option></select></Campo>
        <Campo rotulo={t('rend.dataSaldo')} className="col-span-2" dica={t('rend.dataDica')}><input id="conta-data" type="date" className="campo" value={f.dataInicio || ''} onChange={set('dataInicio')} /></Campo>
        <Campo grupo rotulo={t('rend.comoRende')} className="col-span-2">
          <Segmentado valor={f.modo} aoMudar={(k) => setF((x) => ({ ...x, modo: k }))} opcoes={[['mensal', t('rend.pctMes')], ['anual', t('rend.pctAno')], ['manual', t('rend.extrato')]]} />
        </Campo>
        {f.modo !== 'manual' ? (
          <>
            <Campo rotulo={f.modo === 'anual' ? t('rend.taxaAnual') : t('rend.taxaMensal')} className="col-span-2" dica={f.modo === 'anual' ? t('rend.dicaAnual') : t('rend.dicaMensal')}>
              <input id="conta-taxa" className="campo num" inputMode="decimal" value={f.taxa ?? ''} onChange={set('taxa')} placeholder={f.modo === 'anual' ? '10,5' : '0,8'} />
            </Campo>
            <div className="col-span-2 space-y-2">
              <Interruptor id="conta-auto" ligado={!!f.rendimentoAutomatico} aoMudar={(v) => setF((x) => ({ ...x, rendimentoAutomatico: v }))} rotulo={t('rend.auto')} dica={t('rend.autoDica')} />
              {novo && f.rendimentoAutomatico && inicioPassado && (
                <Interruptor id="conta-anteriores" ligado={!!f.incluirAnteriores} aoMudar={(v) => setF((x) => ({ ...x, incluirAnteriores: v }))} rotulo={t('rend.incluirAnteriores')} />
              )}
            </div>
          </>
        ) : (
          <p className="col-span-2 rounded-2xl bg-sutil p-4 text-xs text-texto-2">{t('rend.manualNota')}</p>
        )}
        <Campo rotulo={t('rend.observacao')} className="col-span-2"><input id="conta-nota" className="campo" value={f.nota || ''} onChange={set('nota')} /></Campo>
        <div className="col-span-2 mt-2 flex flex-wrap justify-between gap-2">
          {!novo && aoApagar ? <BotaoConfirmar texto={t('rend.apagarContaConf')} aoConfirmar={() => aoApagar(conta._id)}>{t('rend.apagarConta')}</BotaoConfirmar> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
            <button className="btn-primario">{t('comum.salvar')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function FormMovimento({ aberto, mov, conta, saldo, aoFechar, aoSalvar }) {
  const t = useT();
  const avisar = useAviso();
  const novo = !mov?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    setF(mov?._id ? { ...mov, valor: paraCampo(mov.valor), data: paraInput(mov.data) } : { tipo: mov?.tipo || 'resgate', valor: '', data: hojeISO(), descricao: '' });
  }, [aberto, mov]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ehSaida = SAIDAS.includes(f.tipo);
  const tipos = ehSaida || !f.tipo ? SAIDAS : ['aporte', 'rendimento'];

  const salvar = async (e) => {
    e.preventDefault();
    const valor = lerNumero(f.valor);
    if (!(valor > 0)) return avisar(t('rend.informeValor'), 'erro');
    try {
      const corpo = { tipo: f.tipo, valor, data: f.data, descricao: f.descricao };
      novo ? await post(`/contas/${conta._id}/movimentos`, corpo) : await put(`/movimentos/${mov._id}`, corpo);
      aoSalvar();
    } catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? (ehSaida ? t('rend.regSaida') : t('rend.regEntrada')) : t('rend.editarMov')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Segmentado valor={f.tipo} aoMudar={(k) => setF((x) => ({ ...x, tipo: k }))} opcoes={tipos.map((k) => [k, t(`rend.tipo.${k}`)])} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={`${t('comum.valor')} (${conta?.moeda})`} dica={ehSaida && saldo != null ? t('rend.disponivel', { v: dinheiro(saldo, conta?.moeda) }) : undefined}>
            <input id="mov-valor" className="campo num text-xl font-bold" inputMode="decimal" value={f.valor ?? ''} onChange={set('valor')} autoFocus placeholder={t('comum.zero')} />
          </Campo>
          <Campo rotulo={t('comum.data')}><input id="mov-data" type="date" className="campo" value={f.data || ''} onChange={set('data')} /></Campo>
        </div>
        <Campo rotulo={t('comum.descricao')}><input id="mov-desc" className="campo" value={f.descricao || ''} onChange={set('descricao')} placeholder={ehSaida ? t('rend.exSaida') : ''} /></Campo>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
          <button className="btn-primario">{t('comum.salvar')}</button>
        </div>
      </form>
    </Modal>
  );
}

function ModalRendimento({ aberto, conta, metricas, movs, aoFechar, aoSalvar }) {
  const t = useT();
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
      if (!(v >= 0)) return avisar(t('rend.informeRend'), 'erro');
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
    <Modal titulo={t('rend.lancarTitulo')} aberto={aberto} aoFechar={aoFechar}
      rodape={<><button className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
        {duplicado
          ? <button className="btn bg-aviso text-cartao" onClick={() => salvar(true)}>{t('rend.lancarMesmo')}</button>
          : <button className="btn-primario" onClick={() => salvar()}>{t('rend.lancarBotao')}</button>}</>}>
      <div className="space-y-4">
        <Campo rotulo={t('rend.mesRef')} dica={pendentes.length > 1 ? t('rend.semRend', { n: pendentes.length }) : undefined}>
          <select id="rend-mes" className="campo" value={mes} onChange={(e) => setMes(e.target.value)}>
            {opcoes.map((m) => <option key={m} value={m}>{mesLongo(m)}{lancados.has(m) ? t('rend.jaLancado') : ''}</option>)}
          </select>
        </Campo>
        {!manual && <Segmentado valor={usarValor ? 'v' : 't'} aoMudar={(k) => setUsarValor(k === 'v')} opcoes={[['t', t('rend.calcTaxa')], ['v', t('rend.extrato')]]} />}
        {usarValor ? (
          <Campo rotulo={t('rend.creditado', { m: conta.moeda })}>
            <input id="rend-valor" className="campo num text-xl font-bold" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={t('comum.zero')} autoFocus />
          </Campo>
        ) : (
          <div className="rounded-2xl bg-pos-suave p-4 text-sm">
            <p className="text-texto-2">{t('rend.formula', { t: pct(r, 3), b: dinheiro(baseEst, conta.moeda) })}</p>
            <p className="num mt-1 text-2xl font-extrabold text-pos">≈ {dinheiro(baseEst * (r / 100), conta.moeda)}</p>
            <p className="mt-1 text-xs text-texto-2">{t('rend.exatoNota')}</p>
          </div>
        )}
        {duplicado && <p className="rounded-2xl bg-aviso-suave p-4 text-sm">{t('rend.duplicado', { mes: mesNaFrase(mes) })}</p>}
      </div>
    </Modal>
  );
}
