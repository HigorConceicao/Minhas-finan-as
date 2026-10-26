import { useEffect, useState } from 'react';
import { get, post } from '../api.js';
import { useIdioma, useT } from '../i18n.js';
import { Campo, Modal, Segmentado, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';

const DEMO = import.meta.env.MODE === 'demo';

export default function Mais({ irPara, abrirAjustes }) {
  const t = useT();
  const [lembretes, setLembretes] = useState(false);
  const itens = [
    { id: 'recorrentes', icone: 'recorrente', titulo: t('abas.recorrentes'), desc: t('mais.recorrentes'), acao: () => irPara('recorrentes') },
    { id: 'viagens', icone: 'aviao', titulo: t('abas.viagens'), desc: t('mais.viagens'), acao: () => irPara('viagens') },
    { id: 'relatorio', icone: 'grafico', titulo: t('abas.relatorio'), desc: t('mais.relatorio'), acao: () => irPara('relatorio') },
    { id: 'lembretes', icone: 'sino', titulo: t('mais.lembretes'), desc: t('mais.lembretesDesc'), acao: () => setLembretes(true) },
    { id: 'ajustes', icone: 'ajustes', titulo: t('ajustes.titulo'), desc: t('mais.ajustes'), acao: abrirAjustes },
  ];
  return (
    <div className="space-y-4">
      <h2 className="text-2xl">{t('mais.titulo')}</h2>
      <ul className="cartao divide-y divide-linha overflow-hidden">
        {itens.map((i) => (
          <li key={i.id}>
            <button className="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-sutil/60" onClick={i.acao}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-marca-suave text-marca"><Icone nome={i.icone} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{i.titulo}</span>
                <span className="block text-sm text-texto-2">{i.desc}</span>
              </span>
              <Icone nome="direita" className="h-4 w-4 shrink-0 text-texto-3" forte />
            </button>
          </li>
        ))}
      </ul>
      <Lembretes aberto={lembretes} aoFechar={() => setLembretes(false)} />
    </div>
  );
}

const suporta = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const lerDias = () => { try { return localStorage.getItem('mf2-lemb-dias') || '2'; } catch { return '2'; } };
const gravarDias = (v) => { try { localStorage.setItem('mf2-lemb-dias', v); } catch {} };

function paraUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const bin = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function Lembretes({ aberto, aoFechar }) {
  const t = useT();
  const avisar = useAviso();
  const { idioma } = useIdioma();
  const [inscricao, setInscricao] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [dias, setDias] = useState(lerDias);
  const [permissao, setPermissao] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'));

  useEffect(() => {
    if (!aberto || DEMO || !suporta()) return;
    navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription()).then((s) => setInscricao(s || null)).catch(() => {});
  }, [aberto]);

  const enviarInscricao = (s, d = dias) => post('/push/inscrever', { inscricao: s.toJSON(), idioma, dias: Number(d) });

  const ativar = async () => {
    setOcupado(true);
    try {
      const perm = await Notification.requestPermission();
      setPermissao(perm);
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const { chave } = await get('/push/chave');
      const s = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraUint8(chave) }));
      await enviarInscricao(s);
      setInscricao(s);
      avisar(t('lemb.ativadas'));
    } catch { avisar(t('lemb.erro'), 'erro'); }
    finally { setOcupado(false); }
  };
  const desativar = async () => {
    setOcupado(true);
    try {
      await post('/push/cancelar', { endpoint: inscricao.endpoint }).catch(() => {});
      await inscricao.unsubscribe();
      setInscricao(null);
      avisar(t('lemb.desativadas'));
    } finally { setOcupado(false); }
  };
  const teste = async () => {
    try { await post('/push/teste', { endpoint: inscricao.endpoint }); avisar(t('lemb.testeOk')); }
    catch (e) { avisar(e.message, 'erro'); }
  };
  const mudarDias = async (v) => {
    setDias(v); gravarDias(v);
    if (inscricao) await enviarInscricao(inscricao, v).catch(() => {});
  };

  let aviso = null;
  if (DEMO) aviso = t('lemb.demo');
  else if (ehIOS() && !instalado()) aviso = t('lemb.iphone');
  else if (!suporta()) aviso = t('lemb.naoSuporta');
  else if (permissao === 'denied') aviso = t('lemb.negado');

  return (
    <Modal titulo={t('lemb.titulo')} aberto={aberto} aoFechar={aoFechar}>
      <div className="space-y-5">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-marca-suave text-marca"><Icone nome="sino" className="h-6 w-6" /></span>
          <p className="text-sm text-texto-2">{t('lemb.oque')}</p>
        </div>
        {aviso && <p className="rounded-2xl bg-aviso-suave p-4 text-sm font-semibold text-aviso">{aviso}</p>}
        <Campo grupo rotulo={t('lemb.dias')}>
          <Segmentado valor={dias} aoMudar={mudarDias} opcoes={['0', '1', '2', '3'].map((d) => [d, t(`lemb.diasOp.${d}`)])} />
        </Campo>
        {inscricao ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-pos"><Icone nome="check" className="h-4 w-4" forte />{t('lemb.ativas')}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secundario" onClick={teste}>{t('lemb.teste')}</button>
              <button className="btn-perigo" disabled={ocupado} onClick={desativar}>{t('lemb.desativar')}</button>
            </div>
          </div>
        ) : (
          <button className="btn-primario w-full" disabled={ocupado || !!aviso} onClick={ativar}><Icone nome="sino" className="h-4 w-4" />{t('lemb.ativar')}</button>
        )}
      </div>
    </Modal>
  );
}
