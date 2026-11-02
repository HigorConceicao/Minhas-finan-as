import { useCallback, useEffect, useState } from 'react';
import { get, post, put, del } from '../api.js';
import { dataCompleta } from '../fmt.js';
import { useIdioma, useT } from '../i18n.js';
import { BotaoConfirmar, Campo, Carregando, Modal, useAviso } from './ui.jsx';
import Icone from './Icones.jsx';

const copiar = async (texto) => { try { await navigator.clipboard.writeText(texto); return true; } catch { return false; } };

/** Trocar a própria senha (os outros aparelhos saem) */
export function ModalSenha({ aberto, aoFechar }) {
  const t = useT();
  const avisar = useAviso();
  const [f, setF] = useState({ atual: '', nova: '', nova2: '' });
  const [erro, setErro] = useState('');
  useEffect(() => { if (aberto) { setF({ atual: '', nova: '', nova2: '' }); setErro(''); } }, [aberto]);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErro(''); };
  const salvar = async (e) => {
    e.preventDefault();
    if (f.nova !== f.nova2) return setErro(t('acesso.naoConferem'));
    try { await post('/auth/senha', { atual: f.atual, nova: f.nova }); avisar(t('conta.senhaTrocada')); aoFechar(); }
    catch (err) { setErro(err.message); }
  };
  return (
    <Modal titulo={t('conta.trocarSenha')} aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo={t('conta.senhaAtual')}><input id="sn-atual" type="password" className="campo" autoComplete="current-password" value={f.atual} onChange={set('atual')} required autoFocus /></Campo>
        <Campo rotulo={t('acesso.novaSenha')} dica={t('acesso.minimo')}><input id="sn-nova" type="password" className="campo" autoComplete="new-password" minLength={8} value={f.nova} onChange={set('nova')} required /></Campo>
        <Campo rotulo={t('acesso.repetir')}><input id="sn-nova2" type="password" className="campo" autoComplete="new-password" minLength={8} value={f.nova2} onChange={set('nova2')} required /></Campo>
        {erro && <p className="rounded-xl bg-neg-suave p-3 text-sm font-semibold text-neg">{erro}</p>}
        <p className="text-xs text-texto-3">{t('conta.senhaDica')}</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secundario" onClick={aoFechar}>{t('comum.cancelar')}</button><button className="btn-primario">{t('comum.salvar')}</button></div>
      </form>
    </Modal>
  );
}

/** Administrador: convidar pessoas, ver contas, gerar link de nova senha, desativar */
export function ModalUsuarios({ aberto, aoFechar, eu }) {
  const t = useT();
  const avisar = useAviso();
  const { idioma } = useIdioma();
  const [d, setD] = useState(null);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState(null); // { texto, link }
  const carregar = useCallback(async () => setD(await get('/admin/usuarios')), []);
  useEffect(() => { if (aberto) { setLink(null); setEmail(''); carregar().catch((e) => avisar(e.message, 'erro')); } }, [aberto, carregar, avisar]);

  const convidar = async (e) => {
    e.preventDefault();
    try {
      const e = email.trim();
      const r = await post('/admin/convites', { email: e, enviar: !!e, idioma });
      setLink({ texto: r.enviado ? t('conta.conviteEnviado', { e }) : t(e && d.emailConfigurado ? 'conta.conviteFalhou' : 'conta.conviteLink'), link: r.link });
      setEmail(''); await carregar();
    } catch (err) { avisar(err.message, 'erro'); }
  };
  const linkSenha = async (u) => {
    try { const r = await post(`/admin/usuarios/${u._id}/redefinir`); setLink({ texto: t('conta.linkSenha', { n: u.nome }), link: r.link }); }
    catch (err) { avisar(err.message, 'erro'); }
  };

  return (
    <Modal titulo={t('conta.usuarios')} aberto={aberto} aoFechar={aoFechar}>
      {!d ? <Carregando /> : (
        <div className="space-y-5">
          <form onSubmit={convidar} className="space-y-2 rounded-2xl bg-sutil p-4">
            <p className="text-sm font-bold">{t('conta.convidar')}</p>
            <div className="flex gap-2">
              <input id="cv-email" type="email" className="campo flex-1 bg-cartao" placeholder={t('conta.emailOpcional')} value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn-primario shrink-0 px-4">{t('conta.gerar')}</button>
            </div>
            <p className="text-xs text-texto-3">{d.emailConfigurado ? t('conta.conviteDica') : t('conta.conviteDicaSemEmail')}</p>
          </form>

          {link && (
            <div className="space-y-2 rounded-2xl border border-marca/40 bg-marca-suave p-4">
              <p className="text-sm font-semibold">{link.texto}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-cartao px-3 py-2 text-xs">{link.link}</code>
                <button type="button" className="btn-secundario shrink-0 px-3 py-2 text-xs" onClick={async () => avisar((await copiar(link.link)) ? t('ap.copiado') : t('ap.copieManual'))}>{t('ap.copiar')}</button>
              </div>
              <p className="text-xs text-texto-3">{t('conta.linkValidade')}</p>
            </div>
          )}

          <div>
            <p className="rotulo mb-2">{t('conta.contas')}</p>
            <ul className="divide-y divide-linha rounded-2xl border border-linha">
              {d.usuarios.map((u) => (
                <li key={u._id} className={`flex flex-wrap items-center gap-2 px-4 py-3 ${u.ativo ? '' : 'opacity-60'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{u.nome}</span>
                      {u.admin && <span className="chip bg-marca-suave px-2 py-0.5 text-[11px] text-marca">{t('conta.admin')}</span>}
                      {!u.ativo && <span className="chip bg-sutil px-2 py-0.5 text-[11px] text-texto-2">{t('conta.desativada')}</span>}
                    </span>
                    <span className="block truncate text-xs text-texto-3">{u.email}{u.ultimoAcesso ? ` · ${t('conta.ultimoAcesso', { d: dataCompleta(u.ultimoAcesso) })}` : ''}</span>
                  </span>
                  {String(u._id) !== String(eu._id) && (
                    <span className="flex gap-1">
                      <button className="btn-secundario px-3 py-1.5 text-xs" onClick={() => linkSenha(u)}>{t('conta.novaSenha')}</button>
                      <BotaoConfirmar className="btn-secundario px-3 py-1.5 text-xs" texto={t('comum.confirmar')}
                        aoConfirmar={async () => { await put(`/admin/usuarios/${u._id}`, { ativo: !u.ativo }); await carregar(); }}>
                        {u.ativo ? t('conta.desativar') : t('conta.reativar')}
                      </BotaoConfirmar>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {d.convites.length > 0 && (
            <div>
              <p className="rotulo mb-2">{t('conta.convitesAbertos')}</p>
              <ul className="divide-y divide-linha rounded-2xl border border-linha text-sm">
                {d.convites.map((c) => (
                  <li key={c._id} className="flex items-center gap-2 px-4 py-2.5">
                    <Icone nome="relogio" className="h-4 w-4 shrink-0 text-texto-3" />
                    <span className="min-w-0 flex-1 truncate">{c.email || t('conta.semEmail')} <span className="text-xs text-texto-3">· {t('conta.expira', { d: dataCompleta(c.expira) })}</span></span>
                    <BotaoConfirmar className="rounded-full p-2 text-texto-3 hover:bg-neg-suave hover:text-neg" rotulo={t('comum.apagar')} texto={t('comum.apagar')}
                      aoConfirmar={async () => { await del(`/admin/convites/${c._id}`); await carregar(); }}>
                      <Icone nome="lixo" className="h-4 w-4" />
                    </BotaoConfirmar>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-texto-3">{t('conta.privacidade')}</p>
        </div>
      )}
    </Modal>
  );
}
