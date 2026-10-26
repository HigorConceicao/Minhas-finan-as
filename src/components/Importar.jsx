import { useMemo, useRef, useState } from 'react';
import { get, post } from '../api.js';
import { dataCompleta, dataCurta, dinheiro } from '../fmt.js';
import { useT } from '../i18n.js';
import { chaveRegra, decodificar, EXEMPLO_SPARKASSE, interpretarExtrato, sugerirCategoria } from '../importacao.js';
import { Campo, Carregando, Modal, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';

const DEMO = import.meta.env.MODE === 'demo';

export default function Importar({ aberto, aoFechar, categorias, aoImportar }) {
  const t = useT();
  const avisar = useAviso();
  const entrada = useRef(null);
  const [texto, setTexto] = useState(null);
  const [res, setRes] = useState(null); // resultado da leitura
  const [linhas, setLinhas] = useState([]); // { ...lanc, marcado, categoria, sugerida, ja, talvez }
  const [moeda, setMoeda] = useState('EUR');
  const [lembrar, setLembrar] = useState(true);
  const [estado, setEstado] = useState('arquivo'); // arquivo | lendo | previa | importando
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);

  const fechar = () => { setTexto(null); setRes(null); setLinhas([]); setEstado('arquivo'); setErro(''); aoFechar(); };

  const processar = async (txt, mapaManual = null) => {
    setEstado('lendo'); setErro('');
    try {
      const r = interpretarExtrato(txt, mapaManual);
      setTexto(txt); setRes(r);
      const moedaArq = r.lancamentos.find((l) => l.moeda)?.moeda || 'EUR';
      setMoeda(moedaArq);
      const [regras, previa] = await Promise.all([
        get('/regras').catch(() => []),
        r.lancamentos.length
          ? post('/importar/previa', { linhas: r.lancamentos.map(({ importId, data, tipo, valor }) => ({ importId, data, tipo, valor })) })
          : { jaImportados: [], possiveis: {} },
      ]);
      const regrasLimpa = regras.map((x) => ({ texto: x.texto, categoria: String(x.categoria) }));
      const ja = new Set(previa.jaImportados);
      setLinhas(r.lancamentos.map((l) => {
        const sug = sugerirCategoria(l, categorias, regrasLimpa);
        const talvez = previa.possiveis[l.importId] || null;
        return { ...l, categoria: sug || '', sugerida: sug || '', ja: ja.has(l.importId), talvez, marcado: !ja.has(l.importId) && !talvez };
      }));
      setEstado('previa');
    } catch {
      setErro(t('imp.erroArquivo')); setEstado('arquivo');
    }
  };

  const lerArquivo = async (arquivo) => {
    if (!arquivo) return;
    setEstado('lendo');
    try { processar(decodificar(await arquivo.arrayBuffer())); }
    catch { setErro(t('imp.erroArquivo')); setEstado('arquivo'); }
  };

  const usarExemplo = () => {
    const d = new Date();
    processar(EXEMPLO_SPARKASSE.replaceAll('{M}', `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`));
  };

  const marcados = linhas.filter((l) => l.marcado);
  const periodo = useMemo(() => {
    if (!linhas.length) return null;
    const ds = linhas.map((l) => l.data).sort();
    return [ds[0], ds.at(-1)];
  }, [linhas]);
  const mudar = (i, campos) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...campos } : l)));

  const importar = async () => {
    if (!marcados.length) return avisar(t('imp.nadaSel'), 'erro');
    setEstado('importando');
    // categorias trocadas à mão viram regras
    const regras = lembrar
      ? [...new Map(marcados.filter((l) => l.categoria && l.categoria !== l.sugerida).map((l) => [chaveRegra(l.descricao), { texto: chaveRegra(l.descricao), categoria: l.categoria }])).values()].filter((r) => r.texto.length >= 3)
      : [];
    try {
      const r = await post('/importar', {
        linhas: marcados.map(({ importId, data, tipo, valor, descricao, nota, categoria, moeda: m }) => ({ importId, data, tipo, valor, descricao, nota, categoria: categoria || null, moeda: m || moeda })),
        regras,
      });
      avisar(t('imp.importados', { n: r.criados }));
      const ultimoMes = marcados.map((l) => l.data.slice(0, 7)).sort().at(-1);
      fechar();
      aoImportar(ultimoMes);
    } catch (e) { avisar(e.message, 'erro'); setEstado('previa'); }
  };

  const opcoesColuna = (res?.cabecalho || []).map((c, i) => [i, c || `#${i + 1}`]);
  const SelColuna = ({ campo, rotulo }) => (
    <Campo rotulo={rotulo}>
      <select id={`imp-col-${campo}`} className="campo py-2 text-sm" value={res?.mapa?.[campo] ?? ''}
        onChange={(e) => processar(texto, { ...res.mapa, [campo]: e.target.value === '' ? undefined : Number(e.target.value) })}>
        <option value="">{t('imp.nenhumaColuna')}</option>
        {opcoesColuna.map(([i, c]) => <option key={i} value={i}>{c}</option>)}
      </select>
    </Campo>
  );

  const rodape = estado === 'previa' || estado === 'importando' ? (
    <>
      <button className="btn-secundario" onClick={() => { setRes(null); setLinhas([]); setEstado('arquivo'); }}>{t('imp.voltar')}</button>
      <button className="btn-primario" onClick={importar} disabled={estado === 'importando' || !marcados.length}>
        <Icone nome="download" className="h-4 w-4" forte />{t('imp.importar', { n: marcados.length })}
      </button>
    </>
  ) : null;

  return (
    <Modal titulo={t('imp.titulo')} aberto={aberto} aoFechar={fechar} largo rodape={rodape}>
      {(estado === 'arquivo' || estado === 'lendo') && (
        <div className="space-y-4">
          <label
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); lerArquivo(e.dataTransfer.files?.[0]); }}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${arrastando ? 'border-marca bg-marca-suave' : 'border-linha hover:bg-sutil'}`}>
            {estado === 'lendo' ? <><Carregando /><span className="text-sm text-texto-2">{t('imp.lendo')}</span></> : (
              <>
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-marca-suave text-marca"><Icone nome="download" className="h-7 w-7" /></span>
                <span className="btn-primario pointer-events-none">{t('imp.escolher')}</span>
                <span className="text-sm text-texto-3">{t('imp.soltar')}</span>
              </>
            )}
            <input ref={entrada} id="imp-arquivo" type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => lerArquivo(e.target.files?.[0])} />
          </label>
          {erro && <p className="rounded-2xl bg-neg-suave p-4 text-sm font-semibold text-neg">{erro}</p>}
          <div className="space-y-1 text-sm text-texto-2">
            <p>{t('imp.bancos')}</p>
            <p className="text-texto-3">{t('imp.comoBaixar')}</p>
          </div>
          {DEMO && <button className="btn-secundario w-full" onClick={usarExemplo}>{t('imp.exemplo')}</button>}
        </div>
      )}

      {(estado === 'previa' || estado === 'importando') && res && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="chip bg-marca-suave text-marca">{res.banco ? t('imp.banco', { b: res.banco }) : t('imp.bancoGenerico')}</span>
            <span className="chip bg-sutil text-texto-2">{t('imp.resumo', { n: linhas.length })}</span>
            {periodo && <span className="chip bg-sutil text-texto-2">{t('imp.periodo', { a: dataCurta(periodo[0]), b: dataCurta(periodo[1]) })}</span>}
            {linhas.some((l) => l.ja) && <span className="chip bg-sutil text-texto-3">{t('imp.ja', { n: linhas.filter((l) => l.ja).length })}</span>}
            {linhas.some((l) => l.talvez) && <span className="chip bg-aviso-suave text-aviso">{t('imp.duvida', { n: linhas.filter((l) => l.talvez).length })}</span>}
          </div>

          {!linhas.length && <p className="rounded-2xl bg-aviso-suave p-4 text-sm">{t('imp.nenhuma')}</p>}

          <details className="rounded-2xl bg-sutil p-4" open={!linhas.length}>
            <summary className="cursor-pointer text-sm font-semibold">{t('imp.colunas')}</summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SelColuna campo="data" rotulo={t('imp.colData')} />
              <SelColuna campo="valor" rotulo={t('imp.colValor')} />
              <SelColuna campo="favorecido" rotulo={t('imp.colFav')} />
              <SelColuna campo="descricao" rotulo={t('imp.colDesc')} />
              <Campo rotulo={t('imp.moedaArquivo')}>
                <select id="imp-moeda" className="campo py-2 text-sm" value={moeda} onChange={(e) => setMoeda(e.target.value)}><option>EUR</option><option>BRL</option><option>USD</option></select>
              </Campo>
            </div>
          </details>

          {linhas.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secundario px-3 py-2 text-xs" onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, marcado: !l.ja })))}>{t('imp.todas')}</button>
                <button className="btn-secundario px-3 py-2 text-xs" onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, marcado: false })))}>{t('imp.nenhumaSel')}</button>
              </div>
              <ul className="divide-y divide-linha overflow-hidden rounded-2xl border border-linha">
                {linhas.map((l, i) => {
                  const cats = categorias.filter((c) => c.tipo === l.tipo);
                  return (
                    <li key={l.importId} className={`flex gap-3 px-3 py-3 sm:items-center ${l.ja ? 'opacity-45' : ''}`}>
                      <input type="checkbox" id={`imp-l-${i}`} checked={l.marcado} disabled={l.ja} onChange={(e) => mudar(i, { marcado: e.target.checked })}
                        className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--marca))] sm:mt-0" aria-label={l.descricao} />
                      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                        <label htmlFor={`imp-l-${i}`} className="block min-w-0 flex-1 cursor-pointer">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-bold">{l.descricao}</span>
                            <span className={`num shrink-0 text-sm font-bold sm:hidden ${l.tipo === 'receita' ? 'text-pos' : ''}`}>{l.tipo === 'receita' ? '+' : '−'}{dinheiro(l.valor, l.moeda || moeda)}</span>
                          </span>
                          <span className="block truncate text-xs text-texto-3">{dataCurta(l.data)}{l.nota ? ` · ${l.nota}` : ''}</span>
                          {l.ja && <span className="mt-0.5 block text-xs font-semibold text-texto-3">{t('imp.jaImportado')}</span>}
                          {l.talvez && <span className="mt-0.5 block text-xs font-semibold text-aviso">{t('imp.talvez', { d: l.talvez.descricao, data: dataCompleta(l.talvez.data) })}</span>}
                        </label>
                        <select id={`imp-cat-${i}`} className="campo mt-2 py-2 text-sm sm:mt-0 sm:w-48" value={l.categoria} disabled={l.ja}
                          onChange={(e) => mudar(i, { categoria: e.target.value, marcado: true })} aria-label={t('comum.categoria')}>
                          <option value="">{t('imp.semCategoria')}</option>
                          {cats.map((c) => <option key={c._id} value={c._id}>{c.icone} {c.nome}</option>)}
                        </select>
                        <span className={`num hidden w-28 shrink-0 text-right text-sm font-bold sm:block ${l.tipo === 'receita' ? 'text-pos' : ''}`}>{l.tipo === 'receita' ? '+' : '−'}{dinheiro(l.valor, l.moeda || moeda)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <label className="flex items-center gap-3 rounded-2xl bg-sutil p-3 text-sm font-semibold">
                <input id="imp-lembrar" type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--marca))]" />
                {t('imp.lembrar')}
              </label>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
