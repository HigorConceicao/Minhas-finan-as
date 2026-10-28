import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, put } from './api.js';
import { mesFinanceiro } from '../server/finance.js';

// Contas e viagens usadas pelos formulários (lançamento, recorrência, importação)
const Ctx = createContext({ contas: [], viagens: [], metas: [], recarregar: async () => {}, diaInicioMes: 1, mesAtualFin: () => mesFinanceiro(new Date(), 1) });
const lerDia = () => { try { return Number(localStorage.getItem('mf2-dia-mes')) || 1; } catch { return 1; } };

export function ProvedorDados({ children }) {
  const [contas, setContas] = useState([]);
  const [viagens, setViagens] = useState([]);
  const [metas, setMetas] = useState([]);
  // mês financeiro: dia em que o mês começa (guardado no servidor; uma cópia local abre o app já certo)
  const [diaInicioMes, setDia] = useState(lerDia);
  useEffect(() => { get('/preferencias').then((p) => { setDia(p.diaInicioMes); try { localStorage.setItem('mf2-dia-mes', String(p.diaInicioMes)); } catch {} }).catch(() => {}); }, []);
  const salvarDiaInicio = useCallback(async (d) => {
    const p = await put('/preferencias', { diaInicioMes: d });
    setDia(p.diaInicioMes);
    try { localStorage.setItem('mf2-dia-mes', String(p.diaInicioMes)); } catch {}
  }, []);
  const recarregar = useCallback(async () => {
    const [c, v, m] = await Promise.all([get('/carteira').catch(() => null), get('/viagens').catch(() => []), get('/metas').catch(() => null)]);
    if (c) setContas(c.contas);
    setViagens(v || []);
    if (m) setMetas(m);
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  const valor = useMemo(() => ({
    contas, viagens, metas, recarregar, diaInicioMes, salvarDiaInicio,
    mesAtualFin: () => mesFinanceiro(new Date(), diaInicioMes),
    mesDaData: (d) => mesFinanceiro(d, diaInicioMes),
    metasAtivas: metas.filter((m) => !m.arquivada),
    contasAtivas: contas.filter((c) => !c.arquivada),
    viagensAtivas: viagens.filter((v) => !v.arquivada),
  }), [contas, viagens, metas, recarregar, diaInicioMes, salvarDiaInicio]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useDados = () => useContext(Ctx);

const ler = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v || ''); } catch {} };
export const ultimaConta = { get: () => ler('mf2-conta'), set: (v) => gravar('mf2-conta', v) };
