import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { del, get, post, put } from '../api.js';
import { dinheiro, hojeISO, lerNumero, paraCampo } from '../fmt.js';
import { useIdioma, useT } from '../i18n.js';
import { useDados } from '../dados.jsx';
import { Barra, BotaoConfirmar, Campo, Carregando, Modal, Segmentado, useAviso } from './ui.jsx';
import { FormLancamento } from './Lancamentos.jsx';
import Icone from './Icones.jsx';

const IDEIAS = 'ideias';
const TIPOS = ['passeio', 'refeicao', 'transporte', 'hospedagem', 'compras', 'outro'];
const EMOJI = { passeio: '📍', refeicao: '🍽️', transporte: '🚕', hospedagem: '🛏️', compras: '🛍️', outro: '📝' };
const EMOJI_MODO = { uber: '🚗', taxi: '🚕', metro: '🚇', onibus: '🚌', ape: '🚶', carro: '🚙', barco: '⛴️', aviao: '✈️', outro: '➡️' };
const MODOS = ['', 'uber', 'taxi', 'metro', 'onibus', 'ape', 'carro', 'barco', 'aviao', 'outro'];
const MOMENTOS = ['cafe', 'almoco', 'jantar', 'lanche'];
const LOCALE = { pt: 'pt-BR', de: 'de-DE', en: 'en-GB' };
// palavras para sugerir a categoria do gasto a partir do tipo do item
const PISTAS = { refeicao: ['restaur', 'aliment', 'comida', 'essen'], transporte: ['transp', 'uber', 'mobil', 'verkehr'], hospedagem: ['hosped', 'hotel', 'unterkunft'], compras: ['compra', 'shopping', 'einkauf'], passeio: ['lazer', 'passeio', 'freizeit', 'viag'], outro: ['viag'] };

export const previstoDe = (i) => Number(i.valor || 0) + Number(i.transporte?.valor || 0);
const emojiDe = (i) => (i.tipo === 'refeicao' && i.refeicao?.onde === 'casa' ? '🏠' : EMOJI[i.tipo] || '📝');

/** Os dias da viagem, de ida a volta (no máximo 60) */
function diasDaViagem(v) {
  if (!v?.inicio) return [];
  const ini = new Date(String(v.inicio).slice(0, 10) + 'T00:00:00Z');
  const fim = v.fim ? new Date(String(v.fim).slice(0, 10) + 'T00:00:00Z') : ini;
  const dias = [];
  for (let d = ini; d <= fim && dias.length < 60; d = new Date(d.getTime() + 86400000)) dias.push(d.toISOString().slice(0, 10));
  return dias;
}

/** Colunas (ideias + dias) com os ids na ordem */
function montarColunas(itens, dias) {
  const c = { [IDEIAS]: [] };
  for (const d of dias) c[d] = [];
  for (const i of [...itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))) (c[i.dia] && i.dia ? c[i.dia] : c[IDEIAS]).push(i._id);
  return c;
}

export default function Roteiro({ id, categorias, aoVoltar, aoEditarViagem }) {
  const t = useT();
  const avisar = useAviso();
  const { idioma } = useIdioma();
  const { recarregar } = useDados();
  const [v, setV] = useState(null);
  const [itens, setItens] = useState(null);
  const [colunas, setColunas] = useState({});
  const [form, setForm] = useState(null); // item (novo ou existente)
  const [gasto, setGasto] = useState(null); // lançamento a registrar
  const [ativo, setAtivo] = useState(null);
  const antes = useRef(null);
  const trilho = useRef(null);

  const carregar = useCallback(async () => {
    const [via, rot] = await Promise.all([get(`/viagens/${id}`), get(`/viagens/${id}/roteiro`)]);
    setV(via);
    setItens(rot.itens);
    setColunas(montarColunas(rot.itens, diasDaViagem(via)));
  }, [id]);
  useEffect(() => { carregar().catch((e) => { avisar(e.message, 'erro'); aoVoltar(); }); }, [carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const porId = useMemo(() => new Map((itens || []).map((i) => [i._id, i])), [itens]);
  const dias = useMemo(() => diasDaViagem(v), [v]);
  const fmtDia = useMemo(() => {
    const f = new Intl.DateTimeFormat(LOCALE[idioma] || 'pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return (d) => { const x = f.format(new Date(d + 'T12:00:00Z')).replace(/\./g, ''); return x.charAt(0).toLocaleUpperCase() + x.slice(1); };
  }, [idioma]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!v || !itens) return <Carregando />;
  const moeda = v.moeda;
  const colunaDe = (x) => (x in colunas ? x : Object.keys(colunas).find((k) => colunas[k].includes(x)));

  // ---------- totais ----------
  const agendados = itens.filter((i) => i.dia && colunas[i.dia]);
  const previsto = agendados.reduce((s, i) => s + previstoDe(i), 0);
  const semDia = itens.filter((i) => !(i.dia && colunas[i.dia])).reduce((s, i) => s + previstoDe(i), 0);
  const porTipo = TIPOS.map((tp) => ({ tp, v: agendados.filter((i) => i.tipo === tp).reduce((s, i) => s + previstoDe(i), 0) })).filter((x) => x.v > 0);
  const refeicoes = agendados.filter((i) => i.tipo === 'refeicao');
  const fora = refeicoes.filter((i) => i.refeicao?.onde !== 'casa').length, casa = refeicoes.length - fora;
  const orc = Number(v.orcamento || 0);

  // ---------- arrastar ----------
  const aoComecar = ({ active }) => { antes.current = colunas; setAtivo(active.id); };
  const aoPassar = ({ active, over }) => {
    if (!over) return;
    const de = colunaDe(active.id), para = colunaDe(over.id);
    if (!de || !para || de === para) return;
    setColunas((c) => {
      const alvo = c[para].filter((x) => x !== active.id);
      const idx = over.id in c ? alvo.length : alvo.indexOf(over.id);
      alvo.splice(idx < 0 ? alvo.length : idx, 0, active.id);
      return { ...c, [de]: c[de].filter((x) => x !== active.id), [para]: alvo };
    });
  };
  const aoSoltar = async ({ active, over }) => {
    setAtivo(null);
    let novo = colunas;
    const col = colunaDe(active.id);
    if (over && col && over.id !== active.id && !(over.id in colunas) && colunaDe(over.id) === col) {
      const lista = colunas[col];
      novo = { ...colunas, [col]: arrayMove(lista, lista.indexOf(active.id), lista.indexOf(over.id)) };
      setColunas(novo);
    }
    const mudou = Object.fromEntries(Object.entries(novo).filter(([k, ids]) => (antes.current?.[k] || []).join() !== ids.join()));
    if (!Object.keys(mudou).length) return;
    // dia novo nos itens, já na tela
    setItens((lista) => lista.map((i) => {
      const k = Object.keys(mudou).find((c) => mudou[c].includes(i._id));
      return k ? { ...i, dia: k === IDEIAS ? null : k, ordem: mudou[k].indexOf(i._id) } : i;
    }));
    try { await put(`/viagens/${id}/roteiro/ordem`, { colunas: mudou }); }
    catch (e) { avisar(e.message, 'erro'); setColunas(antes.current); await carregar(); }
  };
  const aoCancelar = () => { setAtivo(null); if (antes.current) setColunas(antes.current); };

  const alternarFeito = async (i) => {
    setItens((l) => l.map((x) => (x._id === i._id ? { ...x, feito: !x.feito } : x)));
    try { await put(`/roteiro/${i._id}`, { feito: !i.feito }); } catch (e) { avisar(e.message, 'erro'); await carregar(); }
  };
  const irPara = (k) => document.getElementById(`col-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' });
  const registrar = (i) => {
    const pistas = PISTAS[i.tipo] || [];
    const cat = categorias.find((c) => c.tipo === 'despesa' && pistas.some((p) => c.nome.toLowerCase().includes(p)));
    setForm(null);
    setGasto({
      tipo: 'despesa', viagem: v._id, roteiro: i._id, descricao: i.titulo, moeda, data: i.dia || hojeISO(),
      valor: previstoDe(i) > 0 && !i.gasto ? paraCampo(previstoDe(i)) : '', categoria: cat?._id || '',
      ...(v.temReserva && v.saldoReserva > 0 ? { conta: '__reserva' } : {}),
    });
  };

  const colunasVisiveis = [IDEIAS, ...dias];
  return (
    <div className="space-y-4">
      <button className="-ml-1 flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-marca hover:bg-marca-suave" onClick={aoVoltar}>
        <Icone nome="esquerda" className="h-4 w-4" />{t('rot.voltar')}
      </button>

      {/* resumo do dinheiro */}
      <section className="cartao p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${v.cor}1f` }}>{v.icone}</span>
            <div>
              <h2 className="text-2xl leading-tight">{v.nome}</h2>
              <p className="text-sm text-texto-2">{t('rot.roteiro')}{dias.length ? ` · ${fmtDia(dias[0])} – ${fmtDia(dias[dias.length - 1])} · ${t('viag.dias', { n: dias.length })}` : ''}</p>
            </div>
          </div>
          <button className="btn-secundario px-3 py-2 text-sm" onClick={() => aoEditarViagem(v)}><Icone nome="lapis" className="h-4 w-4" />{t('comum.editar')}</button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[[t('rot.orcamento'), orc ? dinheiro(orc, moeda) : '—'], [t('rot.previsto'), dinheiro(previsto, moeda)], [t('rot.gasto'), dinheiro(v.gasto, moeda)]].map(([r, val]) => (
            <div key={r} className="rounded-2xl bg-sutil px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-texto-3 sm:text-[11px]">{r}</p>
              <p className="num text-sm font-extrabold leading-tight sm:text-lg">{val}</p>
            </div>
          ))}
        </div>
        {orc > 0 ? (
          <div className="mt-3">
            <Barra valor={previsto} maximo={orc} estado={previsto > orc ? 'estourado' : previsto > orc * 0.9 ? 'alerta' : 'ok'} />
            <p className={`mt-1.5 text-sm font-semibold ${previsto > orc ? 'text-neg' : 'text-texto-2'}`}>
              {previsto > orc ? t('rot.passou', { v: dinheiro(previsto - orc, moeda) }) : t('rot.livre', { v: dinheiro(orc - previsto, moeda) })}
            </p>
          </div>
        ) : <p className="mt-3 text-sm text-texto-3">{t('rot.semOrcamento')}</p>}
        {(porTipo.length > 0 || refeicoes.length > 0 || semDia > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {porTipo.map(({ tp, v: val }) => <span key={tp} className="chip bg-sutil px-2.5 py-1 text-texto-2">{EMOJI[tp]} {t(`rot.tipos.${tp}`)} <span className="num font-bold text-texto">{dinheiro(val, moeda)}</span></span>)}
            {refeicoes.length > 0 && <span className="chip bg-sutil px-2.5 py-1 text-texto-2">{t('rot.refeicoes', { f: fora, c: casa })}</span>}
            {semDia > 0 && <span className="chip bg-sutil px-2.5 py-1 text-texto-3">{t('rot.naoAgendado', { v: dinheiro(semDia, moeda) })}</span>}
          </div>
        )}
      </section>

      {!dias.length ? (
        <div className="cartao space-y-3 p-5 text-center">
          <p className="text-sm text-texto-2">{t('rot.semDatas')}</p>
          <button className="btn-primario" onClick={() => aoEditarViagem(v)}>{t('rot.definirDatas')}</button>
        </div>
      ) : (
        <nav aria-label={t('rot.irPara')} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {colunasVisiveis.map((k) => (
            <button key={k} onClick={() => irPara(k)} className="chip shrink-0 bg-cartao px-3 py-1.5 text-xs font-semibold text-texto-2 shadow-sm ring-1 ring-linha hover:text-texto">
              {k === IDEIAS ? `💡 ${t('rot.ideias')}` : fmtDia(k)}
              {k !== IDEIAS && colunas[k]?.length > 0 && <span className="ml-1 text-texto-3">· {colunas[k].length}</span>}
            </button>
          ))}
        </nav>
      )}
      <p className="px-1 text-xs text-texto-3">{t('rot.arraste')}</p>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={aoComecar} onDragOver={aoPassar} onDragEnd={aoSoltar} onDragCancel={aoCancelar}>
        <div ref={trilho} className="flex flex-col gap-3 md:-mx-4 md:flex-row md:items-start md:overflow-x-auto md:px-4 md:pb-4">
          {colunasVisiveis.map((k) => (
            <Coluna key={k} chave={k} ids={colunas[k] || []} porId={porId} moeda={moeda} ativo={ativo}
              titulo={k === IDEIAS ? `💡 ${t('rot.ideias')}` : fmtDia(k)} numero={k === IDEIAS ? null : dias.indexOf(k) + 1}
              aoAbrir={setForm} aoFeito={alternarFeito}
              aoNovo={(extra) => setForm({ dia: k === IDEIAS ? null : k, tipo: k === IDEIAS ? 'passeio' : 'passeio', ...extra })} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{ativo && porId.get(ativo) ? <Cartao i={porId.get(ativo)} moeda={moeda} flutuando /> : null}</DragOverlay>
      </DndContext>

      <FormItem aberto={!!form} item={form} viagem={v} dias={dias} fmtDia={fmtDia} aoFechar={() => setForm(null)}
        aoSalvar={async (msg) => { setForm(null); await carregar(); avisar(msg); }} aoRegistrar={registrar} />
      <FormLancamento aberto={gasto !== null} item={gasto} categorias={categorias} aoFechar={() => setGasto(null)}
        aoSalvar={async () => { setGasto(null); await Promise.all([carregar(), recarregar()]); avisar(t('lanc.salvo')); }}
        aoApagar={async () => setGasto(null)} />
    </div>
  );
}

function Coluna({ chave, titulo, numero, ids, porId, moeda, ativo, aoAbrir, aoFeito, aoNovo }) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: chave });
  const itens = ids.map((x) => porId.get(x)).filter(Boolean);
  const prev = itens.reduce((s, i) => s + previstoDe(i), 0);
  const gasto = itens.reduce((s, i) => s + Number(i.gasto || 0), 0);
  const ideias = chave === IDEIAS;
  return (
    <section id={`col-${chave}`} className={`cartao flex scroll-mt-20 flex-col p-3 md:w-72 md:shrink-0 ${ideias ? 'bg-sutil/70' : ''}`}>
      <header className="mb-2 flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-base font-bold">{titulo}{numero ? <span className="ml-1.5 text-xs font-semibold normal-case text-texto-3">{t('rot.diaN', { n: numero })}</span> : null}</h3>
        {(prev > 0 || gasto > 0) && <span className="num shrink-0 text-xs font-semibold text-texto-2">{dinheiro(prev, moeda)}</span>}
      </header>
      {ideias && <p className="mb-2 px-1 text-xs text-texto-3">{t('rot.ideiasDica')}</p>}
      <SortableContext id={chave} items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={`min-h-[3.25rem] space-y-2 rounded-xl transition ${isOver || (ativo && !ids.length) ? 'bg-marca-suave/60 ring-1 ring-dashed ring-marca/40' : ''}`}>
          {itens.map((i) => <ItemArrastavel key={i._id} i={i} moeda={moeda} aoAbrir={aoAbrir} aoFeito={aoFeito} />)}
          {!itens.length && <li className="grid h-[3.25rem] place-items-center text-xs text-texto-3">{ativo ? t('rot.soltar') : ideias ? '' : t('rot.vazioDia')}</li>}
        </ul>
      </SortableContext>
      {gasto > 0 && <p className="num mt-2 px-1 text-[11px] text-texto-3">{t('rot.totalDia', { p: dinheiro(prev, moeda), g: dinheiro(gasto, moeda) })}</p>}
      <div className="mt-2 flex gap-1.5">
        <button className="flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold text-marca hover:bg-marca-suave" onClick={() => aoNovo({})}>
          <Icone nome="mais" className="h-3.5 w-3.5" forte />{t('rot.adicionar')}
        </button>
        {!ideias && (
          <button className="flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold text-texto-2 hover:bg-sutil" onClick={() => aoNovo({ tipo: 'refeicao', refeicao: { momento: 'almoco', onde: 'fora' } })}>
            🍽️ {t('rot.refeicao')}
          </button>
        )}
      </div>
    </section>
  );
}

const ItemArrastavel = memo(function ItemArrastavel({ i, moeda, aoAbrir, aoFeito }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: i._id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={isDragging ? 'opacity-30' : ''} {...attributes} {...listeners}>
      <Cartao i={i} moeda={moeda} aoAbrir={() => aoAbrir(i)} aoFeito={() => aoFeito(i)} />
    </li>
  );
});

function Cartao({ i, moeda, aoAbrir, aoFeito, flutuando }) {
  const t = useT();
  const prev = previstoDe(i);
  const modo = i.transporte?.modo;
  return (
    <div className={`flex select-none items-start gap-2.5 rounded-xl border border-linha bg-cartao p-2.5 text-left ${flutuando ? 'rotate-1 shadow-xl ring-2 ring-marca' : 'shadow-sm'}`}
      style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none' }}>
      <button type="button" aria-label={i.feito ? t('rot.feitoNao') : t('rot.feitoSim')} aria-pressed={i.feito} onClick={(e) => { e.stopPropagation(); aoFeito?.(); }}
        onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-base ${i.feito ? 'bg-pos-suave text-pos' : 'bg-sutil'}`}>
        {i.feito ? <Icone nome="check" className="h-4 w-4" forte /> : emojiDe(i)}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={aoAbrir}>
        <span className={`flex items-baseline gap-1.5 text-sm font-semibold ${i.feito ? 'text-texto-3 line-through' : ''}`}>
          {i.hora && <span className="num shrink-0 text-xs font-bold text-marca">{i.hora}</span>}
          <span className="truncate">{i.titulo}</span>
        </span>
        {(i.local || (i.tipo === 'refeicao' && i.refeicao?.momento)) && (
          <span className="block truncate text-xs text-texto-3">
            {i.tipo === 'refeicao' && i.refeicao?.momento ? `${t(`rot.momentos.${i.refeicao.momento}`)} · ${t(`rot.onde.${i.refeicao.onde || 'fora'}`)}` : ''}
            {i.tipo === 'refeicao' && i.refeicao?.momento && i.local ? ' · ' : ''}{i.local}
          </span>
        )}
        {(modo || prev > 0 || i.gasto > 0) && (
          <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
            {modo && <span className="chip bg-sutil px-2 py-0.5 text-texto-2">{EMOJI_MODO[modo]} {t(`rot.modos.${modo}`)}{i.transporte.valor > 0 ? ` · ${dinheiro(i.transporte.valor, moeda)}` : ''}</span>}
            {Number(i.valor) > 0 && <span className="chip num bg-sutil px-2 py-0.5 font-semibold text-texto">{dinheiro(i.valor, moeda)}</span>}
            {i.gasto > 0 && <span className={`chip num px-2 py-0.5 font-semibold ${i.gasto > prev && prev > 0 ? 'bg-neg-suave text-neg' : 'bg-pos-suave text-pos'}`}>✓ {dinheiro(i.gasto, moeda)}</span>}
          </span>
        )}
      </button>
    </div>
  );
}

function FormItem({ aberto, item, viagem, dias, fmtDia, aoFechar, aoSalvar, aoRegistrar }) {
  const t = useT();
  const avisar = useAviso();
  const novo = !item?._id;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!aberto) return;
    const i = item || {};
    setF({
      tipo: i.tipo || 'passeio', titulo: i.titulo || '', dia: i.dia || '', hora: i.hora || '', local: i.local || '', link: i.link || '',
      valor: paraCampo(i.valor || ''), nota: i.nota || '', feito: !!i.feito,
      momento: i.refeicao?.momento || 'almoco', onde: i.refeicao?.onde || 'fora',
      modo: i.transporte?.modo || '', valorTransporte: paraCampo(i.transporte?.valor || ''),
    });
  }, [aberto, item]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const prev = (lerNumero(f.valor) || 0) + (lerNumero(f.valorTransporte) || 0);
  const corpo = () => ({
    tipo: f.tipo, titulo: f.titulo.trim() || (f.tipo === 'refeicao' ? t(`rot.momentos.${f.momento}`) : ''), dia: f.dia || null, hora: f.hora, local: f.local, link: f.link,
    valor: lerNumero(f.valor) || 0, nota: f.nota, feito: f.feito,
    refeicao: f.tipo === 'refeicao' ? { momento: f.momento, onde: f.onde } : { momento: '', onde: '' },
    transporte: { modo: f.modo, valor: f.modo ? lerNumero(f.valorTransporte) || 0 : 0 },
  });
  const salvar = async (e) => {
    e?.preventDefault();
    const c = corpo();
    if (!c.titulo) return avisar(t('rot.deNome'), 'erro');
    try {
      const r = novo ? await post(`/viagens/${viagem._id}/roteiro`, c) : await put(`/roteiro/${item._id}`, c);
      return r;
    } catch (err) { avisar(err.message, 'erro'); return null; }
  };
  const moeda = viagem.moeda;
  return (
    <Modal titulo={novo ? t('rot.novo') : t('rot.editar')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={async (e) => { if (await salvar(e)) aoSalvar(t('rot.salvo')); }} className="space-y-4">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {TIPOS.map((tp) => (
            <button type="button" key={tp} aria-pressed={f.tipo === tp} onClick={() => setF((x) => ({ ...x, tipo: tp }))}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-semibold transition ${f.tipo === tp ? 'bg-marca-suave text-marca ring-2 ring-marca' : 'bg-sutil text-texto-2 hover:bg-linha'}`}>
              <span className="text-lg">{EMOJI[tp]}</span>{t(`rot.tipo.${tp}`)}
            </button>
          ))}
        </div>
        <Campo rotulo={t('rot.titulo')}><input id="rot-titulo" className="campo" value={f.titulo || ''} onChange={set('titulo')} placeholder={f.tipo === 'refeicao' ? t(`rot.momentos.${f.momento}`) : t('rot.exTitulo')} autoFocus={novo} /></Campo>
        {f.tipo === 'refeicao' && (
          <div className="space-y-3 rounded-2xl bg-sutil p-3">
            <Campo rotulo={t('rot.momento')}>
              <select id="rot-momento" className="campo bg-cartao" value={f.momento} onChange={set('momento')}>{MOMENTOS.map((m) => <option key={m} value={m}>{t(`rot.momentos.${m}`)}</option>)}</select>
            </Campo>
            <Segmentado valor={f.onde} aoMudar={set('onde')} opcoes={[['fora', `🍽️ ${t('rot.onde.fora')}`], ['casa', `🏠 ${t('rot.onde.casa')}`]]} />
          </div>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Campo rotulo={t('rot.dia')}>
            <select id="rot-dia" className="campo" value={f.dia || ''} onChange={set('dia')}>
              <option value="">{t('rot.semDia')}</option>
              {dias.map((d, n) => <option key={d} value={d}>{t('rot.diaN', { n: n + 1 })} · {fmtDia(d)}</option>)}
            </select>
          </Campo>
          <Campo rotulo={t('rot.hora')}><input id="rot-hora" type="time" className="campo w-28" value={f.hora || ''} onChange={set('hora')} /></Campo>
        </div>
        <Campo rotulo={t('rot.local')}><input id="rot-local" className="campo" value={f.local || ''} onChange={set('local')} /></Campo>
        <Campo rotulo={`${t('rot.valor')} (${moeda})`} dica={t('rot.valorDica', { m: moeda })}>
          <input id="rot-valor" className="campo num text-lg font-bold" inputMode="decimal" value={f.valor ?? ''} onChange={set('valor')} placeholder={t('comum.zero')} />
        </Campo>
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-sutil p-3">
          <Campo rotulo={t('rot.transporte')}>
            <select id="rot-modo" className="campo bg-cartao" value={f.modo} onChange={set('modo')}>{MODOS.map((m) => <option key={m} value={m}>{m ? `${EMOJI_MODO[m]} ` : ''}{t(`rot.modos.${m}`)}</option>)}</select>
          </Campo>
          <Campo rotulo={`${t('rot.valorTransporte')} (${moeda})`}>
            <input id="rot-valor-transp" className="campo num bg-cartao" inputMode="decimal" disabled={!f.modo} value={f.valorTransporte ?? ''} onChange={set('valorTransporte')} placeholder={t('comum.zero')} />
          </Campo>
        </div>
        {prev > 0 && <p className="flex justify-between text-sm"><span className="text-texto-2">{t('rot.previsto')}</span><span className="num font-bold">{dinheiro(prev, moeda)}</span></p>}
        <Campo rotulo={t('rot.link')}><input id="rot-link" type="url" className="campo" value={f.link || ''} onChange={set('link')} placeholder="https://" /></Campo>
        <Campo rotulo={t('rot.nota')}><textarea id="rot-nota" className="campo min-h-[4.5rem]" value={f.nota || ''} onChange={set('nota')} /></Campo>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-[var(--marca,#2952eb)]" checked={!!f.feito} onChange={(e) => setF((x) => ({ ...x, feito: e.target.checked }))} />{t('rot.feito')}</label>

        {!novo && (
          <div className="rounded-2xl border border-linha p-3">
            <p className="mb-2 text-sm text-texto-2">{item.lancamentos ? t('rot.gastosItem', { n: item.lancamentos, v: dinheiro(item.gasto, moeda) }) : t('rot.semGastoItem')}</p>
            <button type="button" className="btn-secundario w-full" onClick={async () => { const r = await salvar(); if (r) aoRegistrar({ ...item, ...r }); }}>
              <Icone nome="mais" className="h-4 w-4" forte />{t('rot.registrar')}
            </button>
          </div>
        )}
        {item?.link && <a className="block truncate text-sm font-semibold text-marca underline" href={item.link} target="_blank" rel="noreferrer">{item.link}</a>}

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {!novo ? (
            <BotaoConfirmar texto={t('rot.apagarConf')} aoConfirmar={async () => { await del(`/roteiro/${item._id}`); aoSalvar(t('rot.apagado')); }}>{t('rot.apagar')}</BotaoConfirmar>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button>
            <button className="btn-primario">{t('comum.salvar')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
