const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

export const sessao = {
  get token() { return ler('mf2-token'); },
  set token(v) { gravar('mf2-token', v); },
};

export class ErroApi extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

export async function api(caminho, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (sessao.token) headers.authorization = `Bearer ${sessao.token}`;
  const r = await fetch(`/api${caminho}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401 && caminho !== '/login') {
    sessao.token = null;
    window.dispatchEvent(new Event('mf2-sair'));
  }
  if (r.status === 204) return null;
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new ErroApi(r.status, dados?.erro || `Erro ${r.status}`);
  return dados;
}

export const get = (c) => api(c);
export const post = (c, body) => api(c, { method: 'POST', body });
export const put = (c, body) => api(c, { method: 'PUT', body });
export const del = (c) => api(c, { method: 'DELETE' });
