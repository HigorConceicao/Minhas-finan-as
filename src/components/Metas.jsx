import { useCallback, useEffect, useState } from 'react';
import { del, get, post, put } from '../api.js';
import { dataCompleta, dinheiro, hojeISO, lerNumero, mesAtual, mesCurto, mesNaFrase, paraCampo, paraInput } from '../fmt.js';
import { useT } from '../i18n.js';
import { BotaoConfirmar, Campo, Carregando, Modal, Segmentado, Vazio, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';

const ESTADO = {
  'no-ritmo': 'bg-pos-suave text-pos', concluida: 'bg-pos-suave text-pos', atrasada: 'bg-aviso-suave text-aviso',
  andamento: 'bg-marca-suave text-marca', parada: 'bg-sutil text-texto-2',
};
const CORES = ['#2952eb', '#0d8c54', '#e0672b', '#8b5cf6', '#db2777', '#0ea5a4', '#c47a0a', '#475569'];
const ICONES = ['🎯', '🏠', '✈️', '🚗', '🛟', '🎓', '💍', '🏖️', '💻', '👶', '🐾', '🎁'];
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
  const ativas = lista.filter((m) => !m.arquivada);
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
  const id = meta?._id;
  const carregar = useCallback(async () => { if (id) setContribs(await get(`/metas/${id}/contribuicoes`)); }, [id]);
  useEffect(() => { setContribs(null); carregar().catch((e) => avisar(e.message, 'erro')); }, [carregar, avisar, meta?.guardado]);
  if (!meta) return null;

  const serie = meta.serie || [];
  const maxSerie = Math.max(meta.valorAlvo, ...serie.map((s) => s.guardado), 1);

  return (
    <Modal titulo={`${meta.icone} ${meta.nome}`} aberto={!!meta} aoFechar={aoFechar}>
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <p className="num text-3xl font-extrabold tracking-tight">{dinheiro(meta.guardado, meta.moeda)}</p>
            <p className="num pb-1 text-sm text-texto-3">{t('metas.de')} {dinheiro(meta.valorAlvo, meta.moeda)}</p>
          </div>
          <BarraMeta meta={meta} />
          <LegendaPessoas meta={meta} />
        </div>
        <LinhaPlano meta={meta} />

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
                    <p className="truncate text-sm font-semibold">{c.nota || (c.valor < 0 ? t('metas.retirada') : t('metas.deposito'))}{c.pessoa && <span className="font-normal text-texto-3"> · {c.pessoa}</span>}</p>
                    <p className="text-xs text-texto-3">{dataCompleta(c.data)}</p>
                  </div>
                  <span className={`num text-sm font-bold ${c.valor < 0 ? 'text-neg' : 'text-pos'}`}>{c.valor < 0 ? '−' : '+'}{dinheiro(Math.abs(c.valor), meta.moeda)}</span>
                  <BotaoConfirmar className="rounded-full p-2 text-xs font-semibold text-texto-3 hover:bg-neg-suave hover:text-neg" rotulo={t('metas.apagarDep')} texto={t('metas.apagarDep')}
                    aoConfirmar={async () => { await del(`/contribuicoes/${c._id}`); await Promise.all([carregar(), aoMudar()]); }}>
                    <Icone nome="lixo" className="h-4 w-4" />
                  </BotaoConfirmar>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-t border-linha pt-4">
          <button className="btn-secundario" onClick={async () => { await put(`/metas/${meta._id}`, { arquivada: !meta.arquivada }); await aoMudar(); aoFechar(); }}>
            {meta.arquivada ? t('metas.reativar') : t('metas.arquivar')}
          </button>
          <button className="btn-secundario" onClick={() => aoEditar(meta)}><Icone nome="lapis" className="h-4 w-4" />{t('comum.editar')}</button>
        </div>
      </div>
    </Modal>
  );
}

function FormMeta({ aberto, meta, aoFechar, aoSalvar, aoApagar }) {
  const t = useT();
  const avisar = useAviso();
  const novo = !meta?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    setF(meta?._id
      ? { ...meta, valorAlvo: paraCampo(meta.valorAlvo), prazo: paraInput(meta.prazo), pessoas: (meta.pessoas || []).join(', ') }
      : { nome: '', icone: '🎯', cor: CORES[0], valorAlvo: '', moeda: 'EUR', prazo: '', pessoas: '', jaGuardado: '' });
  }, [aberto, meta]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    const alvo = lerNumero(f.valorAlvo);
    if (!f.nome?.trim()) return avisar(t('metas.deNome'), 'erro');
    if (!(alvo > 0)) return avisar(t('metas.alvoInvalido'), 'erro');
    const corpo = {
      nome: f.nome, icone: f.icone, cor: f.cor, valorAlvo: alvo, moeda: f.moeda, prazo: f.prazo || null,
      pessoas: String(f.pessoas || '').split(',').map((p) => p.trim()).filter(Boolean),
      ...(novo ? { jaGuardado: lerNumero(f.jaGuardado) || 0 } : {}),
    };
    try { novo ? await post('/metas', corpo) : await put(`/metas/${meta._id}`, corpo); aoSalvar(novo); }
    catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={novo ? t('metas.novaTitulo') : t('metas.editarTitulo')} aberto={aberto} aoFechar={aoFechar}>
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
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo={t('metas.alvo')}><input id="meta-alvo" className="campo num text-xl font-bold" inputMode="decimal" value={f.valorAlvo ?? ''} onChange={set('valorAlvo')} placeholder="10.000" /></Campo>
          <Campo rotulo={t('comum.moeda')}><select id="meta-moeda" className="campo" value={f.moeda} onChange={set('moeda')}><option>EUR</option><option>BRL</option><option>USD</option></select></Campo>
        </div>
        <Campo rotulo={t('metas.prazoCampo')}><input id="meta-prazo" type="date" className="campo" value={f.prazo || ''} onChange={set('prazo')} /></Campo>
        {novo && (
          <Campo rotulo={t('metas.jaGuardado')} dica={t('metas.jaGuardadoDica')}>
            <input id="meta-ja" className="campo num" inputMode="decimal" value={f.jaGuardado ?? ''} onChange={set('jaGuardado')} placeholder={t('comum.zero')} />
          </Campo>
        )}
        <Campo rotulo={t('metas.pessoas')} dica={t('metas.pessoasDica')}><input id="meta-pessoas" className="campo" value={f.pessoas || ''} onChange={set('pessoas')} /></Campo>
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {!novo ? <BotaoConfirmar texto={t('metas.apagarConf')} aoConfirmar={() => aoApagar(meta._id)}>{t('metas.apagar')}</BotaoConfirmar> : <span />}
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
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto || !meta) return;
    let ultima = '';
    try { ultima = localStorage.getItem(`mf2-pessoa-${meta._id}`) || ''; } catch {}
    setF({ tipo: tipoInicial, valor: '', data: hojeISO(), pessoa: meta.pessoas?.includes(ultima) ? ultima : meta.pessoas?.[0] || '', nota: '' });
  }, [aberto, meta, tipoInicial]);
  if (!meta) return null;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    const v = lerNumero(f.valor);
    if (!(v > 0)) return avisar(t('lanc.informeValor'), 'erro');
    try {
      await post(`/metas/${meta._id}/contribuicoes`, { valor: f.tipo === 'retirada' ? -v : v, data: f.data, pessoa: f.pessoa, nota: f.nota });
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
        <Campo rotulo={t('comum.nota')}><input id="dep-nota" className="campo" value={f.nota || ''} onChange={set('nota')} /></Campo>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
          <button className="btn-primario">{t('comum.salvar')}</button>
        </div>
      </form>
    </Modal>
  );
}
