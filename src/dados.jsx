import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get } from './api.js';

// Contas e viagens usadas pelos formulários (lançamento, recorrência, importação)
const Ctx = createContext({ contas: [], viagens: [], metas: [], recarregar: async () => {} });

export function ProvedorDados({ children }) {
  const [contas, setContas] = useState([]);
  const [viagens, setViagens] = useState([]);
  const [metas, setMetas] = useState([]);
  const recarregar = useCallback(async () => {
    const [c, v, m] = await Promise.all([get('/carteira').catch(() => null), get('/viagens').catch(() => []), get('/metas').catch(() => null)]);
    if (c) setContas(c.contas);
    setViagens(v || []);
    if (m) setMetas(m);
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  const valor = useMemo(() => ({
    contas, viagens, metas, recarregar,
    metasAtivas: metas.filter((m) => !m.arquivada),
    contasAtivas: contas.filter((c) => !c.arquivada),
    viagensAtivas: viagens.filter((v) => !v.arquivada),
  }), [contas, viagens, metas, recarregar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useDados = () => useContext(Ctx);

const ler = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v || ''); } catch {} };
export const ultimaConta = { get: () => ler('mf2-conta'), set: (v) => gravar('mf2-conta', v) };
