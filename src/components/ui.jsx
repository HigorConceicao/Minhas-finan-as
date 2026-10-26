import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { mesLongo, somarMes } from '../fmt.js';
import { useT } from '../i18n.js';
import Icone from './Icones.jsx';

export function Modal({ titulo, aberto, aoFechar, children, rodape, largo }) {
  const t = useT();
  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-texto/30 backdrop-blur-sm sm:items-center" onClick={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`animar-subir max-h-[92vh] w-full overflow-y-auto rounded-t-4xl bg-cartao px-5 pt-3 shadow-flutua sm:rounded-4xl sm:pt-5 ${largo ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        style={{ paddingBottom: rodape ? 0 : 'max(1.5rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-linha sm:hidden" aria-hidden />
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl">{titulo}</h2>
          <button className="rounded-full bg-sutil p-2 text-texto-2 hover:text-texto" onClick={aoFechar} aria-label={t('comum.fechar')}>
            <Icone nome="fechar" className="h-4 w-4" forte />
          </button>
        </div>
        {children}
        {rodape && (
          <div className="sticky bottom-0 -mx-5 mt-6 flex flex-wrap justify-end gap-2 border-t border-linha bg-cartao px-5 pt-4" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>{rodape}</div>
        )}
      </div>
    </div>
  );
}

/** Rótulo + campo. Com `grupo`, vira um grupo (para botões), para o rótulo não virar o nome do primeiro botão. */
export const Campo = ({ rotulo, dica, children, className = '', grupo }) => {
  const Tag = grupo ? 'div' : 'label';
  return (
    <Tag className={`block ${className}`} {...(grupo ? { role: 'group', 'aria-label': rotulo } : {})}>
      <span className="rotulo mb-1.5 block">{rotulo}</span>
      {children}
      {dica && <span className="mt-1.5 block text-xs text-texto-3">{dica}</span>}
    </Tag>
  );
};

/** Botões lado a lado para escolher uma opção (ex.: despesa / receita) */
export function Segmentado({ opcoes, valor, aoMudar, className = '' }) {
  return (
    <div className={`seg ${className}`} style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
      {opcoes.map(([k, rotulo]) => (
        <button type="button" key={k} aria-pressed={valor === k} className="seg-op" onClick={() => aoMudar(k)}>{rotulo}</button>
      ))}
    </div>
  );
}

export const Vazio = ({ titulo, texto, acao, icone = 'lista' }) => (
  <div className="cartao flex flex-col items-center gap-2 px-6 py-12 text-center">
    <span className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-marca-suave text-marca"><Icone nome={icone} className="h-6 w-6" /></span>
    <p className="text-lg font-bold">{titulo}</p>
    {texto && <p className="max-w-sm text-sm text-texto-2">{texto}</p>}
    {acao && <div className="mt-3">{acao}</div>}
  </div>
);

export function Barra({ valor, maximo, estado, ritmo }) {
  const p = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  const pr = maximo > 0 && ritmo ? Math.min(100, (ritmo / maximo) * 100) : null;
  const cor = estado === 'estourado' ? 'bg-neg' : estado === 'alerta' ? 'bg-aviso' : 'bg-marca';
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-sutil">
      <div className={`h-full rounded-full ${cor} transition-all`} style={{ width: `${p}%` }} />
      {pr !== null && pr > p && (
        <div className="absolute top-0 h-full border-r-2 border-dashed border-texto-3/70" style={{ left: `${pr}%` }} />
      )}
    </div>
  );
}

export const Estatistica = ({ rotulo, valor, detalhe, tom }) => (
  <div className="cartao p-4">
    <p className="rotulo">{rotulo}</p>
    <p className={`num mt-1.5 break-words text-lg font-bold sm:text-xl ${tom === 'pos' ? 'text-pos' : tom === 'neg' ? 'text-neg' : ''}`}>{valor}</p>
    {detalhe && <p className="mt-1 text-xs leading-snug text-texto-3">{detalhe}</p>}
  </div>
);

export function SeletorMes({ mes, aoMudar }) {
  const t = useT();
  return (
    <div className="flex items-center gap-1 rounded-full bg-cartao p-1 shadow-cartao">
      <button className="grid h-9 w-9 place-items-center rounded-full text-texto-2 hover:bg-sutil" onClick={() => aoMudar(somarMes(mes, -1))} aria-label={t('comum.mesAnterior')}>
        <Icone nome="esquerda" className="h-4 w-4" forte />
      </button>
      <span className="min-w-[9.5rem] text-center text-sm font-bold">{mesLongo(mes)}</span>
      <button className="grid h-9 w-9 place-items-center rounded-full text-texto-2 hover:bg-sutil" onClick={() => aoMudar(somarMes(mes, 1))} aria-label={t('comum.proximoMes')}>
        <Icone nome="direita" className="h-4 w-4" forte />
      </button>
    </div>
  );
}

/** Círculo colorido com o ícone da categoria */
export const IconeCategoria = ({ cor = '#8a92a3', icone = '•', tamanho = 'h-10 w-10 text-base' }) => (
  <span className={`grid shrink-0 place-items-center rounded-full ${tamanho}`} style={{ background: `${cor}22` }}>{icone}</span>
);

// ---------- avisos (toasts) ----------
const AvisoCtx = createContext(() => {});
export const useAviso = () => useContext(AvisoCtx);

export function ProvedorAvisos({ children }) {
  const [lista, setLista] = useState([]);
  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random();
    setLista((l) => [...l, { id, texto, tipo }]);
    setTimeout(() => setLista((l) => l.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-8" role="status" aria-live="polite">
        {lista.map((a) => (
          <div key={a.id} className={`animar-subir flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-flutua ${a.tipo === 'erro' ? 'bg-neg text-cartao' : 'bg-texto text-cartao'}`}>
            <Icone nome={a.tipo === 'erro' ? 'alerta' : 'check'} className="h-4 w-4" forte />
            {a.texto}
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

export const Carregando = () => (
  <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-marca border-t-transparent" /></div>
);

/** Botão que pede confirmação no segundo toque */
export function BotaoConfirmar({ aoConfirmar, children, texto, className = 'btn-perigo', rotulo }) {
  const t = useT();
  const [armado, setArmado] = useState(false);
  useEffect(() => { if (!armado) return; const x = setTimeout(() => setArmado(false), 3000); return () => clearTimeout(x); }, [armado]);
  return (
    <button type="button" className={className} aria-label={rotulo} onClick={() => (armado ? (setArmado(false), aoConfirmar()) : setArmado(true))}>
      {armado ? (texto || t('comum.confirmar')) : children}
    </button>
  );
}
