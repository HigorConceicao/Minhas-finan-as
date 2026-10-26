import { dinheiro, mesNaFrase, pct } from '../fmt.js';
import { useT } from '../i18n.js';
import { Barra, Carregando, IconeCategoria, SeletorMes } from './ui.jsx';
import Icone from './Icones.jsx';

export default function Visao({ mes, setMes, base, setBase, resumo, irPara, novoLancamento }) {
  const t = useT();
  if (!resumo) return <Carregando />;
  const atencao = resumo.orcamentos.filter((o) => o.estado === 'estourado' || o.estado === 'alerta');
  const topGastos = [...resumo.orcamentos].filter((o) => o.gasto > 0).sort((a, b) => b.gasto - a.gasto).slice(0, 5);
  const maxGasto = topGastos[0]?.gasto || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeletorMes mes={mes} aoMudar={setMes} />
        <div className="seg grid-cols-3" role="group" aria-label={t('comum.moedaExibicao')}>
          {['EUR', 'BRL', 'USD'].map((m) => (
            <button key={m} type="button" aria-pressed={base === m} className="seg-op px-3 py-1.5 text-xs" onClick={() => setBase(m)}>{m}</button>
          ))}
        </div>
      </div>

      {/* cartão principal, como o saldo de um app de banco */}
      <section className="overflow-hidden rounded-4xl bg-capa p-6 text-capa-texto shadow-flutua">
        <p className="text-sm font-semibold opacity-75">{t('visao.saldoMes')}</p>
        <p className="num mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{dinheiro(resumo.saldo, base)}</p>
        {resumo.receitas > 0 && <p className="mt-1 text-sm opacity-75">{t('visao.pctReceitas', { p: pct((resumo.saldo / resumo.receitas) * 100, 0) })}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold opacity-80"><Icone nome="seta" className="h-3.5 w-3.5 -rotate-45" forte /> {t('visao.receitas')}</p>
            <p className="num mt-1 text-lg font-bold">{dinheiro(resumo.receitas, base)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold opacity-80"><Icone nome="seta" className="h-3.5 w-3.5 rotate-[135deg]" forte /> {t('visao.despesas')}</p>
            <p className="num mt-1 text-lg font-bold">{dinheiro(resumo.despesas, base)}</p>
          </div>
        </div>
        <button className="btn mt-4 w-full bg-white text-capa hover:bg-white/90" onClick={novoLancamento}>
          <Icone nome="mais" className="h-4 w-4" forte /> {t('visao.novo').replace('+ ', '')}
        </button>
      </section>

      {atencao.length > 0 && <CartaoAtencao itens={atencao} base={base} aoAbrir={() => irPara('orcamento')} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cartao p-5">
          <h3 className="mb-4 text-base">{t('visao.paraOnde')}</h3>
          {!topGastos.length ? <p className="text-sm text-texto-2">{t('visao.nenhumaDespesa', { mes: mesNaFrase(mes) })}</p> : (
            <ul className="space-y-4">
              {topGastos.map((o) => (
                <li key={o.categoria} className="flex items-center gap-3">
                  <IconeCategoria cor={o.cor} icone={o.icone} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex justify-between gap-2 text-sm"><span className="truncate font-semibold">{o.nome}</span><span className="num font-semibold">{dinheiro(o.gasto, base)}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-sutil"><div className="h-full rounded-full" style={{ width: `${(o.gasto / maxGasto) * 100}%`, background: o.cor }} /></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cartao p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base">{t('visao.contas')}</h3>
            <button className="text-sm font-semibold text-marca" onClick={() => irPara('rendimento')}>{t('comum.abrir')} →</button>
          </div>
          {!resumo.contas.length ? (
            <button className="w-full rounded-2xl border-2 border-dashed border-linha p-4 text-sm font-semibold text-texto-2 hover:bg-sutil" onClick={() => irPara('rendimento')}>
              {t('visao.cadastrarConta')}
            </button>
          ) : (
            <ul className="space-y-3">
              {resumo.contas.map((c) => (
                <li key={c._id} className="flex items-center gap-3 rounded-2xl bg-sutil p-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-marca-suave text-marca"><Icone nome="rendimento" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-bold">{c.nome}</span>
                      <span className="num font-bold">{dinheiro(c.saldo, c.moeda)}</span>
                    </div>
                    <div className="num mt-0.5 flex justify-between gap-2 text-xs">
                      <span className="text-pos">{t('visao.jurosMes', { v: dinheiro(c.jurosMes, c.moeda) })}</span>
                      <span className="text-neg">{t('visao.saidasMes', { v: dinheiro(c.saidasMes, c.moeda) })}</span>
                    </div>
                    {c.moeda !== base && <p className="num mt-0.5 text-xs text-texto-3">≈ {dinheiro(c.saldoBase, base)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {resumo.metas?.length > 0 && (
        <section className="cartao p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base">{t('visao.metas')}</h3>
            <button className="text-sm font-semibold text-marca" onClick={() => irPara('metas')}>{t('metas.verTodas')}</button>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {resumo.metas.slice(0, 4).map((m) => (
              <li key={m._id} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg" style={{ background: `${m.cor}1f` }}>{m.icone}</span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex justify-between gap-2 text-sm"><span className="truncate font-semibold">{m.nome}</span><span className="num shrink-0 font-semibold">{Math.round(m.pct)}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sutil"><div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.cor }} /></div>
                  <p className="num mt-1 text-xs text-texto-3">{dinheiro(m.guardado, m.moeda)} / {dinheiro(m.valorAlvo, m.moeda)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {resumo.totalOrcado > 0 && (
        <section className="cartao p-5">
          <div className="mb-2.5 flex justify-between gap-2 text-sm"><span className="font-bold">{t('visao.orcamentoTotal')}</span><span className="num font-semibold">{dinheiro(resumo.gastoOrcado, base)} / {dinheiro(resumo.totalOrcado, base)}</span></div>
          <Barra valor={resumo.gastoOrcado} maximo={resumo.totalOrcado} estado={resumo.gastoOrcado > resumo.totalOrcado ? 'estourado' : 'ok'} />
        </section>
      )}

      <p className="text-center text-xs text-texto-3">
        {t('visao.cambio', { base, fonte: resumo.cambio.fonte === 'BCE' ? t('visao.cambioBce', { data: resumo.cambio.data }) : t('visao.cambioAprox') })}
      </p>
    </div>
  );
}

/** Categorias perto ou acima do limite do orçamento, em formato de tabela compacta */
function CartaoAtencao({ itens, base, aoAbrir }) {
  const t = useT();
  const lista = [...itens].map((o) => ({ ...o, excesso: Math.max(0, o.gasto - o.limite), sit: o.gasto > o.limite + 0.004 ? 'acima' : o.gasto >= o.limite - 0.004 ? 'limite' : 'perto' }))
    .sort((a, b) => b.pct - a.pct);
  const excessoTotal = lista.reduce((s, o) => s + o.excesso, 0);
  const ESTILO = {
    acima: { chip: 'bg-neg-suave text-neg', barra: 'bg-neg' },
    limite: { chip: 'bg-aviso-suave text-aviso', barra: 'bg-aviso' },
    perto: { chip: 'bg-sutil text-texto-2', barra: 'bg-aviso' },
  };
  return (
    <section className="cartao overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-aviso-suave text-aviso"><Icone nome="alerta" className="h-5 w-5" forte /></span>
          <div>
            <h3 className="text-base">{t('visao.atencao')}</h3>
            <p className="text-xs text-texto-3">
              {lista.length === 1 ? t('visao.atencaoSub1') : t('visao.atencaoSub', { n: lista.length })}
              {excessoTotal > 0 && <> · <span className="num font-semibold text-neg">{t('visao.excessoTotal', { v: dinheiro(excessoTotal, base) })}</span></>}
            </p>
          </div>
        </div>
        <button className="shrink-0 text-sm font-semibold text-marca" onClick={aoAbrir}>{t('visao.verOrcamento')}</button>
      </div>
      <ul className="divide-y divide-linha border-t border-linha">
        {lista.map((o) => {
          const e = ESTILO[o.sit];
          return (
            <li key={o.categoria}>
              <button className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 px-5 py-3.5 text-left hover:bg-sutil/60" onClick={aoAbrir}>
                <IconeCategoria cor={o.cor} icone={o.icone} tamanho="h-9 w-9 text-sm" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{o.nome}</span>
                    <span className={`chip shrink-0 px-2 py-0.5 text-[11px] ${e.chip}`}>{t(`visao.sit.${o.sit}`)}</span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sutil">
                    <span className={`block h-full rounded-full ${e.barra}`} style={{ width: `${Math.min(100, o.pct)}%` }} />
                  </span>
                </span>
                <span className="text-right">
                  <span className="num block text-sm font-bold">{dinheiro(o.gasto, base)}</span>
                  <span className="num block text-xs text-texto-3">
                    {o.excesso > 0 ? <span className="font-semibold text-neg">+{dinheiro(o.excesso, base)}</span> : `${pct(o.pct, 0)}`}
                    {' · '}{t('visao.deLimite', { v: dinheiro(o.limite, base) })}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
