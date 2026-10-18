import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { mesLongo, somarMes } from '../fmt.js';

export function Modal({ titulo, aberto, aoFechar, children, rodape }) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-couro-escuro/40 backdrop-blur-[2px] sm:items-center" onClick={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="animar-subir max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-linha bg-papel-claro p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{titulo}</h2>
          <button className="rounded-full p-1 text-2xl leading-none text-tinta-fraca hover:text-tinta" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        {children}
        {rodape && <div className="mt-5 flex flex-wrap justify-end gap-2">{rodape}</div>}
      </div>
    </div>
  );
}

export const Campo = ({ rotulo, dica, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="rotulo mb-1 block">{rotulo}</span>
    {children}
    {dica && <span className="mt-1 block text-xs text-tinta-fraca">{dica}</span>}
  </label>
);

export const Vazio = ({ titulo, texto, acao }) => (
  <div className="folha flex flex-col items-center gap-2 px-6 py-10 text-center">
    <p className="font-titulo text-lg">{titulo}</p>
    {texto && <p className="max-w-sm text-sm text-tinta-suave">{texto}</p>}
    {acao && <div className="mt-2">{acao}</div>}
  </div>
);

export function Barra({ valor, maximo, estado, ritmo }) {
  const p = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  const pr = maximo > 0 && ritmo ? Math.min(100, (ritmo / maximo) * 100) : null;
  const cor = estado === 'estourado' ? 'bg-vermelho' : estado === 'alerta' ? 'bg-ambar' : 'bg-verde';
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-papel-escuro">
      <div className={`h-full rounded-full ${cor} transition-all`} style={{ width: `${p}%` }} />
      {pr !== null && pr > p && (
        <div className="absolute top-0 h-full border-r-2 border-dashed border-tinta-fraca/60" style={{ left: `${pr}%` }} title="Projeção no fim do mês" />
      )}
    </div>
  );
}

export const Estatistica = ({ rotulo, valor, detalhe, tom }) => (
  <div className="folha p-4">
    <p className="rotulo">{rotulo}</p>
    <p className={`num mt-1 text-xl font-medium sm:text-2xl ${tom === 'pos' ? 'text-verde' : tom === 'neg' ? 'text-vermelho' : ''}`}>{valor}</p>
    {detalhe && <p className="mt-1 text-xs text-tinta-fraca">{detalhe}</p>}
  </div>
);

export function SeletorMes({ mes, aoMudar }) {
  return (
    <div className="flex items-center gap-1">
      <button className="btn-secundario px-3" onClick={() => aoMudar(somarMes(mes, -1))} aria-label="Mês anterior">‹</button>
      <span className="min-w-[10.5rem] text-center font-titulo text-lg">{mesLongo(mes)}</span>
      <button className="btn-secundario px-3" onClick={() => aoMudar(somarMes(mes, 1))} aria-label="Próximo mês">›</button>
    </div>
  );
}

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
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {lista.map((a) => (
          <div key={a.id} className={`animar-subir rounded-lg px-4 py-2 text-sm shadow-lg ${a.tipo === 'erro' ? 'bg-vermelho text-white' : 'bg-couro-escuro text-papel-claro'}`}>
            {a.texto}
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

export const Carregando = () => (
  <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-couro border-t-transparent" /></div>
);

/** Botão que pede confirmação no segundo toque */
export function BotaoConfirmar({ aoConfirmar, children, texto = 'Confirmar?', className = 'btn-perigo' }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => { if (!armado) return; const t = setTimeout(() => setArmado(false), 3000); return () => clearTimeout(t); }, [armado]);
  return (
    <button type="button" className={className} onClick={() => (armado ? (setArmado(false), aoConfirmar()) : setArmado(true))}>
      {armado ? texto : children}
    </button>
  );
}
