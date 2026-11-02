import { traduzir } from './i18n.js';
import { dinheiro } from './fmt.js';

// a sessão fica num cookie seguro (HttpOnly) que o navegador manda sozinho; o app nunca vê o segredo
try { localStorage.removeItem('mf2-token'); } catch {} // token das versões antigas

export class ErroApi extends Error {
  constructor(status, mensagem, codigo) { super(mensagem); this.status = status; this.codigo = codigo; }
}

/** Mensagem no idioma do app a partir do código enviado pelo servidor */
function mensagem(dados, status) {
  const cod = dados?.codigo;
  if (cod) {
    const vars = { ...(dados.dados || {}) };
    if (vars.saldo != null) vars.saldo = dinheiro(vars.saldo, vars.moeda || 'EUR');
    const txt = traduzir(`erro.${cod}`, vars);
    if (txt && txt !== `erro.${cod}`) return txt;
  }
  return dados?.erro || traduzir('erro.erro_interno') || `Erro ${status}`;
}

export async function api(caminho, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  const r = await fetch(`/api${caminho}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  // sessão expirou ou foi encerrada: volta para o login (as telas de acesso tratam o próprio erro)
  if (r.status === 401 && !caminho.startsWith('/auth/') && caminho !== '/status') window.dispatchEvent(new Event('mf2-sair'));
  if (r.status === 204) return null;
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new ErroApi(r.status, mensagem(dados, r.status), dados?.codigo);
  return dados;
}

export const get = (c) => api(c);
export const post = (c, body) => api(c, { method: 'POST', body });
export const put = (c, body) => api(c, { method: 'PUT', body });
export const del = (c) => api(c, { method: 'DELETE' });
