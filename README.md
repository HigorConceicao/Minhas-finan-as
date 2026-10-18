# Minhas Finanças v2

App pessoal de finanças (PWA) com:

- **Lançamentos** de receitas e despesas em EUR, BRL ou USD
- **Orçamento por categoria**, com alerta configurável e projeção do gasto no fim do mês
- **Lançamentos recorrentes** (mensal, trimestral, anual), que entram sozinhos na data
- **Conta de rendimento** com métricas de juros e registro de saídas (resgates, impostos, taxas)
- Visão geral com conversão de moedas (cotação do BCE) e backup em JSON

## Conta de rendimento: como funciona

Você cadastra o saldo inicial, a data e o tipo de rendimento:

| Modo | Como o juro do mês é calculado |
|---|---|
| % ao mês | saldo no fim do mês × taxa |
| % ao ano | saldo no fim do mês × taxa mensal equivalente, `(1 + a)^(1/12) − 1` |
| Valor do extrato | você informa o valor creditado; projeções usam a média real |

Métricas exibidas: saldo atual, juros e saídas do mês, resultado líquido, juros acumulados e dos últimos 12 meses, rentabilidade real mês a mês, taxa anual equivalente, **retirada sustentável** (máximo por mês sem reduzir o montante), quanto tempo o saldo dura no ritmo atual de saídas e projeção de 12 meses.

## Rodar localmente

```bash
npm install
npm run dev        # API na porta 3001 + Vite na 5173
npm test           # testes dos cálculos
```

Sem `MONGODB_URI`, o servidor tenta subir um MongoDB em memória (dados temporários).

## Deploy no Railway

1. **New Project → Deploy from GitHub repo** → escolha este repositório.
2. Em **Variables**, adicione:
   - `MONGODB_URI` — string de conexão do MongoDB Atlas (use um banco novo, ex.: `.../minhas-financas-v2`)
   - `APP_PASSWORD` — senha para entrar no app (recomendado: o repositório é público, mas os dados ficam só no banco)
   - `APP_SECRET` — opcional, qualquer texto longo aleatório
3. O Railway roda `npm install` e `npm start`. A pasta `dist/` já vai compilada no repositório.
4. Em **Settings → Networking**, gere um domínio.

Depois de alterar o frontend, rode `npm run build` e faça commit da pasta `dist/`.

## Estrutura

```
server/
  index.js      Express + conexão MongoDB + arquivos do frontend
  routes.js     API (/api/...)
  models.js     Mongoose: Categoria, Lancamento, Recorrente, ContaRendimento, Movimento
  finance.js    cálculos puros (juros, séries, projeções, recorrências)
  cambio.js     cotações EUR/BRL/USD com cache
  tests/        testes (node --test)
src/            React + Tailwind (abas: Visão geral, Lançamentos, Orçamento, Recorrentes, Rendimento)
dist/           build pronto para produção
```
