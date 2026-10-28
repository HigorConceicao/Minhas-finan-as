import { useCallback, useEffect, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { dataCompleta, dinheiro, hojeISO, lerNumero, mesAtual, mesCurto, mesNaFrase, paraCampo, paraInput } from '../fmt.js';
import { useT } from '../i18n.js';
import { BotaoConfirmar, Campo, Carregando, Modal, Segmentado, Vazio, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';
import { TIPOS_ORIGEM } from './Origem.jsx';
import { valorDaRegraSalario as valorDaRegra } from '../../server/contas.js';
import { useDados } from '../dados.jsx';

const ESTADO = {
  'no-ritmo': 'bg-pos-suave text-pos', concluida: 'bg-pos-suave text-pos', atrasada: 'bg-aviso-suave text-aviso',
  andamento: 'bg-marca-suave text-marca', parada: 'bg-sutil text-texto-2',
};
const CORES = ['#2952eb', '#0d8c54', '#e0672b', '#8b5cf6', '#db2777', '#0ea5a4', '#c47a0a', '#475569'];
const ICONES = ['🎯', '🐷', '💰', '🏠', '✈️', '🚗', '🛟', '🎓', '💍', '🏖️', '💻', '👶', '🐾', '🎁'];
// tons para separar as pessoas numa meta conjunta
const TONS = ['', 'opacity-60', 'opacity-35', 'opacity-20'];

export default function Metas() {
  const t = useT();
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(null);
  const [deposito, setDeposito] = useState(null); // { meta, tipo }
  const [detalhe, setDetalhe] = useState(null);
  const carregar = useCallback(async () => setLista(await get('/metas')), []);
  useEffect(() => { carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar]);

  if (!lista) return <Carregando />;
  const poupanca = lista.find((m) => m.tipo === 'poupanca' && !m.arquivada);
  const ativas = lista.filter((m) => !m.arquivada && m.tipo !== 'poupanca');
  const arquivadas = lista.filter((m) => m.arquivada);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl">{t('metas.titulo')}</h2>
          <p className="text-sm text-texto-2">{t('metas.sub')}</p>
        </div>
        <button className="btn-primario" onClick={() => setForm({})}><Icone nome="mais" className="h-4 w-4" forte />{t('metas.nova')}</button>
      </div>

      {poupanca && <CartaoPoupanca meta={poupanca} aoAbrir={() => setDetalhe(poupanca)} aoGuardar={(tipo) => setDeposito({ meta: poupanca, tipo })} aoConfigurar={() => setForm(poupanca)} />}

      {lista.some((m) => m.regraSalario?.ativo && !m.arquivada) && <CartaoDistribuicao aoMudar={carregar} aoEditar={(m) => setForm(lista.find((x) => x._id === m._id) || m)} />}

      {poupanca && <h3 className="px-1 pt-2 text-base">{t('metas.suasMetas')}</h3>}
      {!ativas.length && !arquivadas.length ? (
        <Vazio icone="meta" titulo={t('metas.nenhuma')} texto={t('metas.vazio')} acao={<button className="btn-primario" onClick={() => setForm({})}>{t('metas.criar')}</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ativas.map((m) => (
            <CartaoMeta key={m._id} meta={m} aoAbrir={() => setDetalhe(m)} aoGuardar={() => setDeposito({ meta: m, tipo: 'deposito' })} />
          ))}
        </div>
      )}

      {arquivadas.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-base text-texto-2">{t('metas.arquivadas')}</h3>
          <ul className="cartao divide-y divide-linha overflow-hidden">
            {arquivadas.map((m) => (
              <li key={m._id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm opacity-70 hover:bg-sutil/60 hover:opacity-100" onClick={() => setDetalhe(m)}>
                  <span className="text-lg">{m.icone}</span>
                  <span className="flex-1 font-semibold">{m.nome}</span>
                  <span className="num">{dinheiro(m.guardado, m.moeda)} / {dinheiro(m.valorAlvo, m.moeda)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <FormMeta aberto={form !== null} meta={form} aoFechar={() => setForm(null)}
        aoSalvar={async (novo) => { setForm(null); await carregar(); avisar(t(novo ? 'metas.criada' : 'metas.salva')); }}
        aoApagar={async (id) => { await del(`/metas/${id}`); setForm(null); setDetalhe(null); await carregar(); avisar(t('metas.apagada')); }} />
      <DetalheMeta meta={detalhe ? lista.find((x) => x._id === detalhe._id) || detalhe : null} aoFechar={() => setDetalhe(null)}
        aoEditar={(m) => { setDetalhe(null); setForm(m); }}
        aoGuardar={(m, tipo) => setDeposito({ meta: m, tipo })}
        aoMudar={carregar} />
      {/* depois dos detalhes, para abrir por cima deles */}
      <FormDeposito aberto={deposito !== null} meta={deposito?.meta} tipoInicial={deposito?.tipo} aoFechar={() => setDeposito(null)}
        aoSalvar={async () => { setDeposito(null); await carregar(); avisar(t('metas.registrado')); }} />
    </div>
  );
}

/** Distribuição do salário: as regras em ordem de prioridade, com o último salário como exemplo */
function CartaoDistribuicao({ aoMudar, aoEditar }) {
  const t = useT();
  const [d, setD] = useState(null);
  const [simulado, setSimulado] = useState('');
  const carregar = useCallback(async (sal) => setD(await get(`/distribuicao${sal ? `?salario=${sal}` : ''}`)), []);
  useEffect(() => { carregar().catch(() => {}); }, [carregar]);
  if (!d || !d.regras.length) return null;
  const moeda = d.salario?.moeda || d.regras[0].moeda;
  const mover = async (i, dir) => {
    const ids = d.regras.map((r) => r._id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await put('/distribuicao/ordem', { ids });
    await Promise.all([carregar(lerNumero(simulado) || undefined), aoMudar()]);
  };
  return (
    <section className="cartao p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base">{t('metas.dist.titulo')}</h3>
        <span className="num text-sm font-bold">{dinheiro(d.exemplo, moeda)}</span>
      </div>
      <p className="mb-3 text-xs text-texto-3">
        {simulado ? t('metas.dist.simulando') : d.salario ? t('metas.dist.ultimo', { d: dataCompleta(d.salario.data) }) : t('metas.dist.semSalario')}
      </p>
      <ol className="divide-y divide-linha rounded-2xl border border-linha">
        {d.regras.map((r, i) => (
          <li key={r._id} className="flex items-center gap-2 px-3 py-2.5">
            <span className="w-5 text-center text-xs font-bold text-texto-3">{i + 1}</span>
            <span className="text-lg">{r.icone}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => aoEditar(r)}>
              <span className="block truncate text-sm font-semibold">{r.nome}</span>
              <span className="block truncate text-xs text-texto-3">{textoRegra({ regraSalario: r.regra, moeda }, t).replace(/^[^:]+:\s*/, '')}</span>
            </button>
            <span className="text-right">
              <span className="num block text-sm font-bold">{dinheiro(r.valor, moeda)}</span>
              {r.cortado && <span className="num block text-[11px] font-semibold text-aviso">{t('metas.dist.cortado', { v: dinheiro(r.quer, moeda) })}</span>}
            </span>
            <span className="flex flex-col">
              <button className="grid h-6 w-7 place-items-center rounded text-texto-3 hover:bg-sutil disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={t('metas.dist.subir')}><Icone nome="esquerda" className="h-3.5 w-3.5 rotate-90" forte /></button>
              <button className="grid h-6 w-7 place-items-center rounded text-texto-3 hover:bg-sutil disabled:opacity-30" disabled={i === d.regras.length - 1} onClick={() => mover(i, 1)} aria-label={t('metas.dist.descer')}><Icone nome="direita" className="h-3.5 w-3.5 rotate-90" forte /></button>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3 space-y-1.5 text-sm">
        <p className="flex justify-between gap-2"><span className="text-texto-2">{t('metas.dist.livre')}</span><span className="num font-bold">{dinheiro(d.livre, moeda)}</span></p>
        {d.mensais.length > 0 && (
          <>
            <p className="flex justify-between gap-2 text-texto-2"><span>{t('metas.dist.fixos', { n: d.mensais.map((m) => `${m.icone} ${m.nome}`).join(', ') })}</span><span className="num">−{dinheiro(d.totalMensais, moeda)}</span></p>
            <p className={`flex justify-between gap-2 border-t border-linha pt-1.5 font-bold ${d.sobra < 0 ? 'text-neg' : ''}`}><span>{t('metas.dist.sobra')}</span><span className="num">{dinheiro(d.sobra, moeda)}</span></p>
          </>
        )}
      </div>
      {(d.sobra < 0 || d.regras.some((r) => r.cortado)) && <p className="mt-3 rounded-xl bg-aviso-suave p-3 text-xs font-semibold text-aviso">{t('metas.dist.aviso')}</p>}
      <div className="mt-3 flex items-center gap-2">
        <input className="campo num flex-1 py-2 text-sm" inputMode="decimal" placeholder={t('metas.dist.simular')} value={simulado}
          onChange={(e) => setSimulado(e.target.value)} onBlur={() => carregar(lerNumero(simulado) || undefined)}
          onKeyDown={(e) => { if (e.key === 'Enter') carregar(lerNumero(simulado) || undefined); }} aria-label={t('metas.dist.simular')} />
        {simulado && <button className="btn-secundario px-3 py-2 text-xs" onClick={() => { setSimulado(''); carregar(); }}>{t('metas.dist.limpar')}</button>}
      </div>
      <p className="mt-2 text-xs text-texto-3">{t('metas.dist.dica')}</p>
    </section>
  );
}

/** Resumo da regra do salário em uma frase */
function textoRegra(meta, t) {
  const r = meta.regraSalario;
  const l = dinheiro(r.limite, meta.moeda);
  if (r.modo === 'excedente') return t('metas.sal.resumo.excedente', { l });
  const v = r.modo === 'pct' ? `${r.valor}%` : dinheiro(r.valor, meta.moeda);
  return r.limite > 0 ? t('metas.sal.resumo.comLimite', { v, l }) : t('metas.sal.resumo.semLimite', { v });
}

/** Poupança: dinheiro guardado que acumula mês a mês (com objetivo opcional) */
function CartaoPoupanca({ meta, aoAbrir, aoGuardar, aoConfigurar }) {
  const t = useT();
  const { contas } = useDados();
  const serie = meta.serie || [];
  const esteMes = serie.length ? serie.at(-1).guardado - (serie.length > 1 ? serie.at(-2).guardado : 0) : 0;
  const m = meta.mensal;
  const conta = contas.find((c) => c._id === m?.conta);
  return (
    <section className="overflow-hidden rounded-4xl bg-capa p-6 text-capa-texto shadow-flutua">
      <button className="flex w-full items-start gap-3 text-left" onClick={aoAbrir}>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-2xl">{meta.icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{meta.nome}</span>
          <span className="block text-xs opacity-75">{t('metas.poupancaSub')}</span>
        </span>
        <Icone nome="direita" className="mt-1 h-4 w-4 opacity-70" forte />
      </button>
      <div className="mt-4 flex items-end justify-between gap-2">
        <p className="num text-4xl font-extrabold tracking-tight">{dinheiro(meta.guardado, meta.moeda)}</p>
        {meta.valorAlvo > 0 && <p className="num pb-1 text-sm opacity-75">{t('metas.de')} {dinheiro(meta.valorAlvo, meta.moeda)}</p>}
      </div>
      {meta.valorAlvo > 0 && (
        <div className="mt-3">
          <div className="h-2.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, meta.pct)}%` }} /></div>
          <p className="num mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs font-semibold opacity-85">
            <span>{Math.round(meta.pct)}%{meta.prazo ? ` · ${t('metas.prazo', { d: dataCompleta(meta.prazo) })}` : ''}</span>
            {meta.concluida ? <span>{t('metas.concluida')}</span>
              : meta.porMesNecessario != null ? <span>{t('metas.porMesCurto', { v: dinheiro(meta.porMesNecessario, meta.moeda) })}</span>
              : <span>{t('metas.faltam', { v: dinheiro(meta.falta, meta.moeda) })}</span>}
          </p>
        </div>
      )}
      {esteMes !== 0 && <p className="num mt-1 text-sm opacity-80">{t('metas.esteMes', { v: `${esteMes > 0 ? '+' : '−'}${dinheiro(Math.abs(esteMes), meta.moeda)}` })}</p>}
      <button className="mt-4 flex w-full items-center gap-2 rounded-2xl bg-white/10 p-3 text-left text-sm hover:bg-white/15" onClick={aoConfigurar}>
        <Icone nome="recorrente" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {m?.valor > 0
            ? <>{t('metas.todoMes', { v: dinheiro(m.valor, meta.moeda), d: m.dia })}{conta && <span className="opacity-75"> · {conta.nome}</span>}</>
            : t('metas.ativarMensal')}
        </span>
        <Icone nome="lapis" className="h-4 w-4 shrink-0 opacity-70" />
      </button>
      <button className="mt-2 flex w-full items-center gap-2 rounded-2xl bg-white/10 p-3 text-left text-sm hover:bg-white/15" onClick={aoConfigurar}>
        <Icone nome="rendimento" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">{meta.regraSalario?.ativo ? textoRegra(meta, t) : t('metas.sal.ativar')}</span>
        <Icone nome="lapis" className="h-4 w-4 shrink-0 opacity-70" />
      </button>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn bg-white text-capa hover:bg-white/90" onClick={() => aoGuardar('deposito')}><Icone nome="mais" className="h-4 w-4" forte />{t('metas.guardar')}</button>
        <button className="btn bg-white/15 text-capa-texto hover:bg-white/25" disabled={meta.guardado <= 0} onClick={() => aoGuardar('retirada')}><Icone nome="menos" className="h-4 w-4" forte />{t('metas.retirar')}</button>
      </div>
    </section>
  );
}

function BarraMeta({ meta }) {
  const t = useT();
  const total = Math.max(meta.valorAlvo, meta.guardado) || 1;
  const pessoas = meta.porPessoa?.filter((p) => p.valor > 0) || [];
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-sutil" role="img" aria-label={`${Math.round(meta.pct)}%`}>
      {pessoas.length > 1
        ? pessoas.map((p, i) => (
          <div key={p.pessoa || i} className={`h-full ${TONS[i] || 'opacity-20'}`} style={{ width: `${(p.valor / total) * 100}%`, background: meta.cor }} title={`${p.pessoa || t('metas.semNome')}: ${dinheiro(p.valor, meta.moeda)}`} />
        ))
        : <div className="h-full rounded-full" style={{ width: `${Math.min(100, (Math.max(0, meta.guardado) / total) * 100)}%`, background: meta.cor }} />}
    </div>
  );
}

function LegendaPessoas({ meta }) {
  const t = useT();
  const pessoas = meta.porPessoa?.filter((p) => p.valor !== 0) || [];
  if (pessoas.length < 2) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {pessoas.map((p, i) => (
        <span key={p.pessoa || i} className="flex items-center gap-1.5 text-texto-2">
          <i className={`inline-block h-2.5 w-2.5 rounded-full ${TONS[i] || 'opacity-20'}`} style={{ background: meta.cor }} />
          <span className="font-semibold text-texto">{p.pessoa || t('metas.semNome')}</span> <span className="num">{dinheiro(p.valor, meta.moeda)}</span>
        </span>
      ))}
    </div>
  );
}

function LinhaPlano({ meta }) {
  const t = useT();
  if (meta.concluida) return <p className="text-sm font-semibold text-pos">{t('metas.concluida')}</p>;
  const partes = [];
  const mesPrazo = meta.prazo ? String(meta.prazo).slice(0, 7) : null;
  if (mesPrazo && mesPrazo < mesAtual()) partes.push(t('metas.prazoPassou'));
  else if (mesPrazo && meta.porMesNecessario != null) partes.push(t('metas.porMes', { v: dinheiro(meta.porMesNecessario, meta.moeda), d: mesNaFrase(mesPrazo) }));
  return (
    <div className="min-w-0 flex-1 space-y-0.5 text-sm">
      {partes.map((p) => <p key={p} className="font-semibold">{p}</p>)}
      <p className="text-xs text-texto-3">
        {meta.ritmoMensal > 0
          ? `${t('metas.ritmo', { v: dinheiro(meta.ritmoMensal, meta.moeda) })}${meta.previsao ? ` · ${t('metas.previsao', { d: mesNaFrase(meta.previsao) })}` : ''}`
          : t('metas.semRitmo')}
      </p>
    </div>
  );
}

function CartaoMeta({ meta, aoAbrir, aoGuardar }) {
  const t = useT();
  return (
    <article className="cartao flex min-w-0 flex-col gap-4 p-5">
      <button className="flex items-start gap-3 text-left" onClick={aoAbrir}>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${meta.cor}1f` }}>{meta.icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{meta.nome}</span>
          <span className="block text-xs text-texto-3">{meta.prazo ? t('metas.prazo', { d: dataCompleta(meta.prazo) }) : t('metas.semPrazo')}</span>
        </span>
        <span className={`chip shrink-0 ${ESTADO[meta.estado]}`}>{t(`metas.estado.${meta.estado}`)}</span>
      </button>
      <div>
        <div className="mb-2 flex items-end justify-between gap-2">
          <p className="num text-2xl font-extrabold tracking-tight">{dinheiro(meta.guardado, meta.moeda)}</p>
          <p className="num pb-0.5 text-sm text-texto-3">{t('metas.de')} {dinheiro(meta.valorAlvo, meta.moeda)}</p>
        </div>
        <BarraMeta meta={meta} />
        <div className="mt-1.5 flex justify-between text-xs font-semibold text-texto-2">
          <span>{Math.round(meta.pct)}%</span>
          {!meta.concluida && <span>{t('metas.faltam', { v: dinheiro(meta.falta, meta.moeda) })}</span>}
        </div>
        <LegendaPessoas meta={meta} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <LinhaPlano meta={meta} />
        <button className="btn-primario shrink-0 px-4 py-2.5" onClick={aoGuardar}><Icone nome="mais" className="h-4 w-4" forte />{t('metas.guardar')}</button>
      </div>
    </article>
  );
}

function DetalheMeta({ meta, aoFechar, aoEditar, aoGuardar, aoMudar }) {
  const t = useT();
  const avisar = useAviso();
  const [contribs, setContribs] = useState(null);
  const { contas, recarregar } = useDados();
  const nomeConta = (cid) => contas.find((c) => c._id === cid)?.nome;
  const id = meta?._id;
  const carregar = useCallback(async () => { if (id) setContribs(await get(`/metas/${id}/contribuicoes`)); }, [id]);
  useEffect(() => { setContribs(null); carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar, meta?.guardado]);
  if (!meta) return null;

  const serie = meta.serie || [];
  const maxSerie = Math.max(meta.valorAlvo, ...serie.map((s) => s.guardado), 1);
  const ehPoupanca = meta.tipo === 'poupanca';

  return (
    <Modal titulo={`${meta.icone} ${meta.nome}`} aberto={!!meta} aoFechar={aoFechar}>
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <p className="num text-3xl font-extrabold tracking-tight">{dinheiro(meta.guardado, meta.moeda)}</p>
            {(!ehPoupanca || meta.valorAlvo > 0) && <p className="num pb-1 text-sm text-texto-3">{t('metas.de')} {dinheiro(meta.valorAlvo, meta.moeda)}</p>}
          </div>
          {(!ehPoupanca || meta.valorAlvo > 0) && <BarraMeta meta={meta} />}
          <LegendaPessoas meta={meta} />
        </div>
        {(!ehPoupanca || meta.valorAlvo > 0) && <LinhaPlano meta={meta} />}
        {ehPoupanca && (
          <div className="space-y-1 text-sm text-texto-2">
            {meta.mensal?.valor > 0 && <p>{t('metas.todoMes', { v: dinheiro(meta.mensal.valor, meta.moeda), d: meta.mensal.dia })}</p>}
            {meta.regraSalario?.ativo && <p>{textoRegra(meta, t)}</p>}
            {!meta.mensal?.valor && !meta.regraSalario?.ativo && <p>{t('metas.poupancaSub')}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primario" onClick={() => aoGuardar(meta, 'deposito')}><Icone nome="mais" className="h-4 w-4" forte />{t('metas.guardar')}</button>
          <button className="btn-secundario" onClick={() => aoGuardar(meta, 'retirada')} disabled={meta.guardado <= 0}><Icone nome="menos" className="h-4 w-4" forte />{t('metas.retirar')}</button>
        </div>

        {serie.length > 1 && (
          <div>
            <p className="rotulo mb-2">{t('metas.evolucao')}</p>
            <div className="flex h-24 items-end gap-1" role="img" aria-label={t('metas.evolucao')}>
              {serie.map((s) => (
                <div key={s.mes} className="group relative flex-1">
                  <div className="w-full rounded-t-md" style={{ height: `${Math.max(3, (s.guardado / maxSerie) * 96)}px`, background: meta.cor, opacity: 0.85 }} />
                  <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-texto px-2 py-0.5 text-[10px] text-cartao group-hover:block">{mesCurto(s.mes)} · {dinheiro(s.guardado, meta.moeda)}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-texto-3"><span>{mesCurto(serie[0].mes)}</span><span>{mesCurto(serie.at(-1).mes)}</span></div>
          </div>
        )}

        <div>
          <p className="rotulo mb-2">{t('metas.historico')}</p>
          {!contribs ? <Carregando /> : !contribs.length ? <p className="text-sm text-texto-2">{t('metas.semHistorico')}</p> : (
            <ul className="divide-y divide-linha rounded-2xl bg-sutil">
              {contribs.map((c) => (
                <li key={c._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {c.lancamento ? t('metas.pagou', { d: c.nota }) : c.salario ? t('metas.sal.doSalario') : c.nota || (c.automatica ? t('metas.automatico') : c.valor < 0 ? t('metas.retirada') : t('metas.deposito'))}
                      {c.pessoa && <span className="font-normal text-texto-3"> · {c.pessoa}</span>}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-texto-3">
                      <span>{dataCompleta(c.data)}</span>
                      {c.conta && nomeConta(c.conta) ? <span>· {c.valor < 0 ? '→' : '←'} {nomeConta(c.conta)}</span>
                        : c.lancamento || c.reservaViagem || c.salario || c.automatica ? null : (
                          // trocar entre "conta no saldo do mês" e "só registro"
                          <button type="button" className={`chip px-2 py-0.5 text-[11px] ${c.registro ? 'bg-cartao text-texto-2' : 'bg-marca-suave text-marca'}`}
                            title={t('metas.origem.trocar')}
                            onClick={async () => { await put(`/contribuicoes/${c._id}`, { registro: !c.registro }); await Promise.all([carregar(), aoMudar(), recarregar()]); }}>
                            {c.registro ? t('metas.origem.chipRegistro') : t('metas.origem.chipSaldo')}
                          </button>
                        )}
                    </p>
                  </div>
                  <span className={`num text-sm font-bold ${c.valor < 0 ? 'text-neg' : 'text-pos'}`}>{c.valor < 0 ? '−' : '+'}{dinheiro(Math.abs(c.valor), meta.moeda)}</span>
                  <BotaoConfirmar className="rounded-full p-2 text-xs font-semibold text-texto-3 hover:bg-neg-suave hover:text-neg" rotulo={t('metas.apagarDep')} texto={t('metas.apagarDep')}
                    aoConfirmar={async () => { await del(`/contribuicoes/${c._id}`); await Promise.all([carregar(), aoMudar(), recarregar()]); }}>
                    <Icone nome="lixo" className="h-4 w-4" />
                  </BotaoConfirmar>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-t border-linha pt-4">
          {!ehPoupanca ? (
            <button className="btn-secundario" onClick={async () => { await put(`/metas/${meta._id}`, { arquivada: !meta.arquivada }); await aoMudar(); aoFechar(); }}>
              {meta.arquivada ? t('metas.reativar') : t('metas.arquivar')}
            </button>
          ) : <span />}
          <button className="btn-secundario" onClick={() => aoEditar(meta)}><Icone nome="lapis" className="h-4 w-4" />{t('comum.editar')}</button>
        </div>
      </div>
    </Modal>
  );
}

function FormMeta({ aberto, meta, aoFechar, aoSalvar, aoApagar }) {
  const t = useT();
  const avisar = useAviso();
  const { contasAtivas } = useDados();
  const novo = !meta?._id;
  const ehPoupanca = meta?.tipo === 'poupanca';
  const [f, setF] = useState({});
  const [catsReceita, setCatsReceita] = useState([]);
  const [ultimoSalario, setUltimoSalario] = useState(null);
  useEffect(() => {
    if (!aberto) return;
    get('/categorias').then((cs) => {
      const rec = cs.filter((c) => c.tipo === 'receita');
      setCatsReceita(rec);
      // categoria do salário: a já escolhida, ou a que se chama Salário/Gehalt/Salary
      setF((x) => (x.salCategoria ? x : { ...x, salCategoria: (rec.find((c) => /sal[aá]r|gehalt|salary/i.test(c.nome)) || rec[0])?._id || '' }));
    }).catch(() => {});
    const r = meta?.regraSalario || {};
    const mensal = {
      mensalValor: paraCampo(meta?.mensal?.valor || ''), mensalDia: String(meta?.mensal?.dia || 1), mensalConta: meta?.mensal?.conta || '',
      salAtivo: !!r.ativo, salModo: r.modo || 'excedente', salValor: paraCampo(r.valor || ''), salLimite: paraCampo(r.limite || ''), salCategoria: r.categoria || '', salConta: r.conta || '',
    };
    setF(meta?._id
      ? { ...meta, valorAlvo: paraCampo(meta.valorAlvo), prazo: paraInput(meta.prazo), pessoas: (meta.pessoas || []).join(', '), ...mensal }
      : { nome: '', icone: '🎯', cor: CORES[0], valorAlvo: '', moeda: 'EUR', prazo: '', pessoas: '', jaGuardado: '', ...mensal });
  }, [aberto, meta]);
  const origens = contasAtivas.filter((c) => TIPOS_ORIGEM.includes(c.tipo));
  // último salário da categoria, para mostrar um exemplo da regra
  useEffect(() => {
    if (!aberto || !f.salCategoria) return;
    get(`/lancamentos?categoria=${f.salCategoria}`).then((ls) => setUltimoSalario(ls.find((l) => l.tipo === 'receita') || null)).catch(() => {});
  }, [aberto, f.salCategoria]);
  const regraAtual = { ativo: true, modo: f.salModo, valor: lerNumero(f.salValor) || 0, limite: lerNumero(f.salLimite) || 0 };
  const exemploBase = ultimoSalario && ultimoSalario.moeda === f.moeda ? Number(ultimoSalario.valor) : null;
  const exemplo = exemploBase != null ? valorDaRegra(regraAtual, exemploBase) : null;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    const alvo = lerNumero(f.valorAlvo);
    if (!f.nome?.trim()) return avisar(t('metas.deNome'), 'erro');
    if (!ehPoupanca && !(alvo > 0)) return avisar(t('metas.alvoInvalido'), 'erro');
    if (f.salAtivo && !f.salCategoria) return avisar(t('erro.categoria_salario'), 'erro');
    if (f.salAtivo && f.salModo === 'excedente' && !(lerNumero(f.salLimite) > 0)) return avisar(t('metas.sal.informeLimite'), 'erro');
    if (f.salAtivo && f.salModo !== 'excedente' && !(lerNumero(f.salValor) > 0)) return avisar(t('lanc.informeValor'), 'erro');
    const corpo = {
      regraSalario: { ativo: !!f.salAtivo, modo: f.salModo, valor: lerNumero(f.salValor) || 0, limite: lerNumero(f.salLimite) || 0, categoria: f.salCategoria || null, conta: f.salConta || null },
      mensal: { valor: lerNumero(f.mensalValor) || 0, dia: Number(f.mensalDia) || 1, conta: f.mensalConta || null },
      nome: f.nome, icone: f.icone, cor: f.cor, valorAlvo: alvo > 0 ? alvo : 0, moeda: f.moeda, prazo: f.prazo || null,
      pessoas: String(f.pessoas || '').split(',').map((p) => p.trim()).filter(Boolean),
      ...(novo ? { jaGuardado: lerNumero(f.jaGuardado) || 0 } : {}),
    };
    try { novo ? await post('/metas', corpo) : await put(`/metas/${meta._id}`, corpo); aoSalvar(novo); }
    catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={ehPoupanca ? f.nome || meta.nome : novo ? t('metas.novaTitulo') : t('metas.editarTitulo')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo={t('metas.nome')}><input id="meta-nome" className="campo" value={f.nome || ''} onChange={set('nome')} placeholder={t('metas.exNome')} /></Campo>
        <Campo grupo rotulo={t('metas.icone')}>
          <div className="flex flex-wrap gap-1.5">
            {ICONES.map((i) => (
              <button type="button" key={i} aria-pressed={f.icone === i} onClick={() => setF((x) => ({ ...x, icone: i }))}
                className={`grid h-10 w-10 place-items-center rounded-xl text-xl transition ${f.icone === i ? 'bg-marca-suave ring-2 ring-marca' : 'bg-sutil hover:bg-linha'}`}>{i}</button>
            ))}
          </div>
        </Campo>
        <Campo grupo rotulo={t('metas.cor')}>
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button type="button" key={c} onClick={() => setF((x) => ({ ...x, cor: c }))} aria-label={c} aria-pressed={f.cor === c}
                className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-cartao ${f.cor === c ? 'ring-2 ring-texto' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </Campo>
        {ehPoupanca && <p className="-mb-1 text-sm font-bold">{t('metas.objetivoPoupanca')}</p>}
        {<div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo={ehPoupanca ? t('metas.alvoOpcional') : t('metas.alvo')}><input id="meta-alvo" className="campo num text-xl font-bold" inputMode="decimal" value={f.valorAlvo ?? ''} onChange={set('valorAlvo')} placeholder="10.000" /></Campo>
          <Campo rotulo={t('comum.moeda')}><select id="meta-moeda" className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
        </div>}
        <Campo rotulo={t('metas.prazoCampo')}><input id="meta-prazo" type="date" className="campo" value={f.prazo || ''} onChange={set('prazo')} /></Campo>
        <div className="space-y-3 rounded-2xl bg-sutil p-4">
          <label htmlFor="meta-sal-ativo" className="flex cursor-pointer items-start gap-3">
            <input id="meta-sal-ativo" type="checkbox" checked={!!f.salAtivo} onChange={(e) => setF((x) => ({ ...x, salAtivo: e.target.checked }))} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--marca))]" />
            <span><span className="block text-sm font-bold">{t('metas.sal.titulo')}</span><span className="block text-xs text-texto-3">{t('metas.sal.sub')}</span></span>
          </label>
          {f.salAtivo && (
            <>
              <Segmentado className="bg-cartao" valor={f.salModo} aoMudar={(k) => setF((x) => ({ ...x, salModo: k }))}
                opcoes={[['excedente', t('metas.sal.modo.excedente')], ['pct', t('metas.sal.modo.pct')], ['fixo', t('metas.sal.modo.fixo')]]} />
              <div className="grid grid-cols-2 gap-3">
                {f.salModo !== 'excedente' && (
                  <Campo rotulo={f.salModo === 'pct' ? t('metas.sal.pct') : `${t('comum.valor')} (${f.moeda})`}>
                    <input id="meta-sal-valor" className="campo num bg-cartao" inputMode="decimal" value={f.salValor ?? ''} onChange={set('salValor')} placeholder={f.salModo === 'pct' ? '10' : '200'} />
                  </Campo>
                )}
                <Campo rotulo={f.salModo === 'excedente' ? t('metas.sal.acimaDe', { m: f.moeda }) : t('metas.sal.aPartirDe', { m: f.moeda })} className={f.salModo === 'excedente' ? 'col-span-2' : ''}>
                  <input id="meta-sal-limite" className="campo num bg-cartao" inputMode="decimal" value={f.salLimite ?? ''} onChange={set('salLimite')} placeholder={f.salModo === 'excedente' ? '2.860' : t('metas.sal.qualquer')} />
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo={t('metas.sal.categoria')}>
                  <select id="meta-sal-cat" className="campo bg-cartao" value={f.salCategoria || ''} onChange={set('salCategoria')}>
                    {!catsReceita.length && <option value="">—</option>}
                    {catsReceita.map((c) => <option key={c._id} value={c._id}>{c.icone} {c.nome}</option>)}
                  </select>
                </Campo>
                <Campo rotulo={t('orig.deOnde')}>
                  <select id="meta-sal-conta" className="campo bg-cartao" value={f.salConta || ''} onChange={set('salConta')}>
                    <option value="">{t('metas.sal.semConta')}</option>
                    {origens.map((c) => <option key={c._id} value={c._id}>{c.nome}</option>)}
                  </select>
                </Campo>
              </div>
              <p className="rounded-xl bg-cartao p-3 text-sm">
                {exemplo != null
                  ? t('metas.sal.exemplo', { s: dinheiro(exemploBase, f.moeda), v: dinheiro(exemplo, f.moeda), n: f.nome || '' })
                  : t(`metas.sal.explica.${f.salModo}`, { l: dinheiro(lerNumero(f.salLimite) || 0, f.moeda), v: f.salModo === 'pct' ? `${lerNumero(f.salValor) || 0}%` : dinheiro(lerNumero(f.salValor) || 0, f.moeda) })}
              </p>
              <p className="text-xs text-texto-3">{t('metas.sal.dica')}</p>
            </>
          )}
        </div>
        <div className="space-y-3 rounded-2xl bg-sutil p-4">
          <p className="text-sm font-bold">{t('metas.mensalTitulo')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={`${t('comum.valor')} (${f.moeda || 'EUR'})`}><input id="meta-mensal-valor" className="campo num bg-cartao" inputMode="decimal" value={f.mensalValor ?? ''} onChange={set('mensalValor')} placeholder={t('metas.mensalNenhum')} /></Campo>
            <Campo rotulo={t('rec.diaDoMes')}><input id="meta-mensal-dia" type="number" min="1" max="31" className="campo num bg-cartao" value={f.mensalDia ?? ''} onChange={set('mensalDia')} /></Campo>
          </div>
          {origens.length > 0 && (
            <Campo rotulo={t('orig.deOnde')}>
              <select id="meta-mensal-conta" className="campo bg-cartao" value={f.mensalConta || ''} onChange={set('mensalConta')}>
                <option value="">{t('orig.nenhuma')}</option>
                {origens.map((c) => <option key={c._id} value={c._id}>{c.nome}</option>)}
              </select>
            </Campo>
          )}
          <p className="text-xs text-texto-3">{t('metas.mensalDica')}</p>
        </div>
        {novo && !ehPoupanca && (
          <Campo rotulo={t('metas.jaGuardado')} dica={t('metas.jaGuardadoDica')}>
            <input id="meta-ja" className="campo num" inputMode="decimal" value={f.jaGuardado ?? ''} onChange={set('jaGuardado')} placeholder={t('comum.zero')} />
          </Campo>
        )}
        {!ehPoupanca && <Campo rotulo={t('metas.pessoas')} dica={t('metas.pessoasDica')}><input id="meta-pessoas" className="campo" value={f.pessoas || ''} onChange={set('pessoas')} /></Campo>}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {!novo && !ehPoupanca ? <BotaoConfirmar texto={t('metas.apagarConf')} aoConfirmar={() => aoApagar(meta._id)}>{t('metas.apagar')}</BotaoConfirmar> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
            <button className="btn-primario">{t('comum.salvar')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function FormDeposito({ aberto, meta, tipoInicial = 'deposito', aoFechar, aoSalvar }) {
  const t = useT();
  const avisar = useAviso();
  const { contasAtivas, recarregar } = useDados();
  const [f, setF] = useState({});
  const [saldoMes, setSaldoMes] = useState(null);
  const contas = contasAtivas.filter((c) => TIPOS_ORIGEM.includes(c.tipo));
  useEffect(() => {
    if (!aberto || !meta) return;
    let ultima = '', origem = 'saldo';
    try { ultima = localStorage.getItem(`mf2-pessoa-${meta._id}`) || ''; origem = localStorage.getItem('mf2-origem-meta') || 'saldo'; } catch {}
    if (origem.startsWith('conta:') && !contas.some((c) => `conta:${c._id}` === origem)) origem = 'saldo';
    setF({ tipo: tipoInicial, valor: '', data: hojeISO(), pessoa: meta.pessoas?.includes(ultima) ? ultima : meta.pessoas?.[0] || '', nota: '', origem, valorConta: '' });
    get(`/resumo?base=${meta.moeda}`).then((r) => setSaldoMes(r.saldo)).catch(() => {});
  }, [aberto, meta, tipoInicial]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!meta) return null;
  const retirada = f.tipo === 'retirada';
  const [qual, cid] = String(f.origem || 'saldo').split(':');
  const conta = qual === 'conta' ? contas.find((c) => c._id === cid) : null;
  const outraMoeda = conta && conta.moeda !== meta.moeda;
  const v = lerNumero(f.valor) || 0;
  const sinal = retirada ? 1 : -1;
  const depois = qual === 'saldo' && saldoMes != null ? { n: t('lanc.saldoDoMesCurto'), v: saldoMes + sinal * v, m: meta.moeda }
    : conta && !outraMoeda ? { n: conta.nome, v: conta.saldo + sinal * v, m: conta.moeda } : null;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    if (!(v > 0)) return avisar(t('lanc.informeValor'), 'erro');
    try {
      const vc = lerNumero(f.valorConta);
      await post(`/metas/${meta._id}/contribuicoes`, {
        valor: retirada ? -v : v, data: f.data, pessoa: f.pessoa, nota: f.nota, registro: qual === 'registro',
        conta: conta?._id || null, valorConta: outraMoeda && vc > 0 ? (retirada ? -vc : vc) : null,
      });
      try { localStorage.setItem('mf2-origem-meta', f.origem); } catch {}
      recarregar();
      try { if (f.pessoa) localStorage.setItem(`mf2-pessoa-${meta._id}`, f.pessoa); } catch {}
      aoSalvar();
    } catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={t(f.tipo === 'retirada' ? 'metas.retirarTitulo' : 'metas.guardarTitulo', { n: meta.nome })} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Segmentado valor={f.tipo} aoMudar={(k) => setF((x) => ({ ...x, tipo: k }))} opcoes={[['deposito', t('metas.deposito')], ['retirada', t('metas.retirada')]]} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={`${t('comum.valor')} (${meta.moeda})`} dica={t('metas.guardado', { v: dinheiro(meta.guardado, meta.moeda) })}>
            <input id="dep-valor" className="campo num text-xl font-bold" inputMode="decimal" value={f.valor ?? ''} onChange={set('valor')} placeholder={t('comum.zero')} autoFocus />
          </Campo>
          <Campo rotulo={t('comum.data')}><input id="dep-data" type="date" className="campo" value={f.data || ''} onChange={set('data')} /></Campo>
        </div>
        {meta.pessoas?.length > 0 && (
          <Campo grupo rotulo={t('metas.quem')}>
            <Segmentado valor={f.pessoa} aoMudar={(k) => setF((x) => ({ ...x, pessoa: k }))} opcoes={meta.pessoas.map((p) => [p, p])} />
          </Campo>
        )}
        <div className="space-y-3 rounded-2xl bg-sutil p-4">
          <Campo rotulo={retirada ? t('orig.paraOnde') : t('orig.deOnde')}>
            <select id="dep-origem" className="campo bg-cartao" value={f.origem || 'saldo'} onChange={(e) => setF((x) => ({ ...x, origem: e.target.value, valorConta: '' }))}>
              <option value="saldo">{t('lanc.saldoDoMesCurto')}{saldoMes != null ? ` · ${dinheiro(saldoMes, meta.moeda)}` : ''}</option>
              {contas.length > 0 && (
                <optgroup label={t('viag.grupoContas')}>
                  {contas.map((c) => <option key={c._id} value={`conta:${c._id}`}>{c.nome} · {dinheiro(c.saldo, c.moeda)}</option>)}
                </optgroup>
              )}
              <option value="registro">{retirada ? t('metas.origem.registroRetirada') : t('metas.origem.registro')}</option>
            </select>
          </Campo>
          {outraMoeda && (
            <Campo rotulo={retirada ? t('orig.voltaNaConta', { m: conta.moeda }) : t('orig.saiDaConta', { m: conta.moeda })}>
              <input id="dep-valor-conta" className="campo num bg-cartao" inputMode="decimal" value={f.valorConta ?? ''} onChange={(e) => setF((x) => ({ ...x, valorConta: e.target.value }))} placeholder={t('lanc.cambioDoDia')} />
            </Campo>
          )}
          {depois && v > 0 && (
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-texto-2">{t('viag.ficaEm', { n: depois.n })}</span>
              <span className={`num font-bold ${depois.v < 0 ? 'text-neg' : ''}`}>{dinheiro(depois.v, depois.m)}</span>
            </p>
          )}
          <p className="text-xs text-texto-3">{t(`metas.origem.dica.${qual}${retirada ? 'Volta' : ''}`)}</p>
        </div>
        <Campo rotulo={t('comum.nota')}><input id="dep-nota" className="campo" value={f.nota || ''} onChange={set('nota')} /></Campo>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
          <button className="btn-primario">{t('comum.salvar')}</button>
        </div>
      </form>
    </Modal>
  );
}
