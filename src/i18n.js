import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';
import { definirIdioma } from './fmt.js';

export const IDIOMAS = [
  { id: 'pt', nome: 'Português', curto: 'PT', locale: 'pt-BR' },
  { id: 'de', nome: 'Deutsch', curto: 'DE', locale: 'de-DE' },
  { id: 'en', nome: 'English', curto: 'EN', locale: 'en-GB' },
];

const pt = {
  app: { nome: 'Minhas Finanças', backup: 'Backup', backupDica: 'Baixar backup em JSON', backupErro: 'Não foi possível exportar', demo: 'Demonstração' },
  abas: { visao: 'Visão geral', lancamentos: 'Lançamentos', orcamento: 'Orçamento', recorrentes: 'Recorrentes', rendimento: 'Rendimento' },
  abasCurto: { visao: 'Início', lancamentos: 'Lançam.', orcamento: 'Orçam.', recorrentes: 'Recorr.', rendimento: 'Rende' },
  ajustes: { titulo: 'Ajustes', idioma: 'Idioma', tema: 'Aparência', sistema: 'Automático', claro: 'Claro', escuro: 'Escuro', sair: 'Sair' },
  login: { senha: 'Senha', entrar: 'Entrar' },
  comum: {
    cancelar: 'Cancelar', salvar: 'Salvar', apagar: 'Apagar', apagarMesmo: 'Apagar mesmo?', fechar: 'Fechar', editar: 'Editar',
    descricao: 'Descrição', valor: 'Valor', moeda: 'Moeda', data: 'Data', categoria: 'Categoria', semCategoria: 'Sem categoria',
    nota: 'Nota', despesa: 'Despesa', receita: 'Receita', mesAnterior: 'Mês anterior', proximoMes: 'Próximo mês',
    zero: '0,00', adicionar: 'Adicionar', abrir: 'Abrir', confirmar: 'Confirmar?', moedaExibicao: 'Moeda de exibição',
  },
  visao: {
    receitas: 'Receitas', despesas: 'Despesas', saldoMes: 'Saldo do mês', contas: 'Contas de rendimento', nContas: '{n} conta(s)',
    pctReceitas: '{p} das receitas', novo: '+ Lançamento', atencao: 'Atenção no orçamento', verOrcamento: 'Ver orçamento →',
    paraOnde: 'Para onde foi o dinheiro', nenhumaDespesa: 'Nenhuma despesa em {mes}.', cadastrarConta: '+ Cadastrar a conta que rende todo mês',
    jurosMes: 'juros do mês {v}', saidasMes: 'saídas {v}', orcamentoTotal: 'Orçamento total',
    cambio: 'Valores convertidos para {base} · câmbio {fonte}', cambioBce: 'BCE de {data}', cambioAprox: 'aproximado (sem conexão com a cotação)',
  },
  lanc: {
    novo: '+ Novo lançamento', novoTitulo: 'Novo lançamento', editarTitulo: 'Editar lançamento', buscar: 'Buscar descrição…',
    todasCategorias: 'Todas as categorias', nenhum: 'Nenhum lançamento', nadaFiltro: 'Nada com esse filtro.',
    vazio: 'Registre receitas e despesas deste mês. Contas fixas ficam melhor em Recorrentes.', recorrente: 'recorrente',
    geradoRecorrencia: 'Gerado por uma recorrência. Alterar aqui muda só este mês.', descreva: 'Descreva o lançamento',
    informeValor: 'Informe um valor', salvo: 'Lançamento salvo', apagado: 'Lançamento apagado',
  },
  orc: {
    categoria: '+ Categoria', doMes: 'Orçamento do mês', de: 'de', restam: 'Restam {v}', excedido: 'Excedido em {v}',
    mesPassou: '{p} do mês já passou · a linha tracejada mostra onde cada categoria deve terminar no ritmo atual.',
    resta: 'resta {v}', ritmo: 'No ritmo atual termina o mês em {v}.', semOrcamento: 'Sem orçamento definido', definir: 'definir →',
    todasComOrcamento: 'Todas as categorias de despesa têm orçamento.', catReceita: 'Categorias de receita',
    estado: { ok: 'Dentro', alerta: 'Atenção', estourado: 'Estourado' },
    novaCategoria: 'Nova categoria', icone: 'Ícone', nome: 'Nome', cor: 'Cor', orcamentoMensal: 'Orçamento mensal',
    semLimite: 'Deixe vazio para não limitar.', avisarEm: 'Avisar ao atingir {p}%', apagarCat: 'Apagar? Lançamentos ficam sem categoria',
    deNome: 'Dê um nome', invalido: 'Orçamento inválido', salva: 'Categoria salva', apagada: 'Categoria apagada',
  },
  rec: {
    titulo: 'Recorrentes', sub: 'Entram sozinhos como lançamento na data de cada mês.', nova: '+ Nova recorrência',
    porMes: 'Por mês · {m}', nenhuma: 'Nenhuma recorrência', vazio: 'Aluguel, salário, academia, streaming… Cadastre uma vez e o app lança todo mês.',
    cadastrar: 'Cadastrar', dia: 'dia', freq: { mensal: 'todo mês', trimestral: 'a cada 3 meses', anual: 'todo ano' },
    proximo: 'próximo {d}', encerrada: 'encerrada', pausada: 'pausada', novaTitulo: 'Nova recorrência', editarTitulo: 'Editar recorrência',
    exemplo: 'Ex.: Aluguel', frequencia: 'Frequência', mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual', diaDoMes: 'Dia do mês',
    ultimoDia: '31 = último dia do mês', comeca: 'Começa em', comecaDica: 'Meses passados são lançados ao salvar.', termina: 'Termina em (opcional)',
    ativa: 'Ativa (desmarque para pausar)', eOsLanc: 'E os lançamentos que ela já gerou?', manter: 'Manter lançamentos', apagarTambem: 'Apagar também',
    descreva: 'Descreva a recorrência', diaInvalido: 'Dia do mês entre 1 e 31', salva: 'Recorrência salva', apagada: 'Recorrência apagada',
  },
  rend: {
    nenhuma: 'Nenhuma conta de rendimento',
    vazio: 'Cadastre a conta com o saldo inicial e a taxa. O app calcula os juros de cada mês, registra as saídas e mostra quanto você pode retirar sem reduzir o montante.',
    cadastrar: 'Cadastrar conta', novaConta: '+ Nova conta', contaPadrao: 'Conta de rendimento', desde: '{v} desde {d} · início {i}',
    editarConta: 'Editar conta', lancar: '+ Lançar rendimento', saida: '− Registrar saída', aporte: '+ Aporte',
    naoLancado: 'O rendimento de {mes} ainda não foi lançado — estimativa de {v}.', lancarSeta: 'Lançar →',
    automaticoEm: 'Rendimento automático: {v} entra sozinho em {d}.',
    esteMes: 'Este mês', jurosMes: 'Juros do mês', lancado: 'lançado', naoLancadoCurto: 'ainda não lançado', saidasMes: 'Saídas do mês',
    tiposSaida: 'resgates, impostos e taxas', liquido: 'Resultado líquido', jurosMenosSaidas: 'juros − saídas', proximo: 'Próximo rendimento',
    sobreSaldo: '{t} a.m. sobre o saldo atual', acumulado: 'Acumulado', jurosAcum: 'Juros acumulados', ult12: '{v} nos últimos 12 meses',
    saidasAcum: 'Saídas acumuladas', detalheSaidas: 'Resgates {r} · Impostos {i} · Taxas {t}', taxa: 'Taxa', am: 'a.m.',
    anual: '{a} a.a. equivalente', mediaReal: ' · média real {m} a.m.', sustentavel: 'Retirada sustentável', porMes: '/mês',
    semReduzir: 'por mês, no máximo, sem reduzir o montante', semSaidas: 'Sem saídas recentes: todo o rendimento está ficando na conta.',
    cobre: 'Suas saídas médias ({s}/mês) estão abaixo dos juros estimados ({j}). O montante continua crescendo — sobram {d} por mês.',
    naoCobre: 'Suas saídas médias ({s}/mês) superam os juros ({j}). Nesse ritmo o saldo dura cerca de {t}. Para preservar o montante, retire até {r} por mês.',
    mediaNota: 'Média de saídas calculada nos últimos 3 meses fechados.', jurosXSaidas: 'Juros × saídas', saldoProjecao: 'Saldo e projeção',
    mesAMes: 'Mês a mês', movimentos: 'Movimentos ({n})', projecao: 'Projeção',
    col: { mes: 'Mês', abertura: 'Abertura', juros: 'Juros', rentab: 'Rentab.', aportes: 'Aportes', saidas: 'Saídas', liquido: 'Líquido', fechamento: 'Fechamento', saida: 'Saída', jurosAcum: 'Juros acum.', saldo: 'Saldo' },
    projNota: 'Considera a taxa atual e saída mensal média de {v}.', semMov: 'Nenhum movimento ainda.', automatico: 'automático',
    tipo: { rendimento: 'Rendimento', aporte: 'Aporte', resgate: 'Resgate', imposto: 'Imposto', taxa: 'Taxa' },
    novaTitulo: 'Nova conta de rendimento', editarTitulo: 'Editar conta', nome: 'Nome', exNome: 'Ex.: Reserva', instituicao: 'Instituição',
    exInst: 'Banco ou corretora', saldoInicial: 'Saldo inicial', dataSaldo: 'Data do saldo inicial', dataDica: 'O histórico mês a mês começa nesta data.',
    comoRende: 'Como rende', pctMes: '% ao mês', pctAno: '% ao ano', extrato: 'Valor do extrato', taxaAnual: 'Taxa anual (%)', taxaMensal: 'Taxa mensal (%)',
    dicaAnual: 'Convertida para a taxa mensal equivalente: (1 + a)^(1/12) − 1.', dicaMensal: 'Ex.: 0,8 para 0,8% ao mês.',
    manualNota: 'Você lança todo mês o valor que veio no extrato. As projeções usam a rentabilidade média real dos meses lançados.',
    auto: 'Lançar o rendimento sozinho no último dia de cada mês', autoDica: 'Você ainda pode editar o valor depois, se o extrato vier diferente.',
    incluirAnteriores: 'Calcular também os meses desde a data do saldo inicial', observacao: 'Observação',
    apagarConta: 'Apagar conta', apagarContaConf: 'Apagar conta e movimentos?', deNome: 'Dê um nome à conta', saldoInvalido: 'Saldo inicial inválido',
    taxaInvalida: 'Taxa inválida', criada: 'Conta criada', salva: 'Conta salva', apagada: 'Conta apagada',
    regSaida: 'Registrar saída', regEntrada: 'Registrar entrada', editarMov: 'Editar movimento', disponivel: 'Saldo disponível: {v}',
    exSaida: 'Ex.: retirada para viagem', informeValor: 'Informe um valor', movRegistrado: 'Movimento registrado', movApagado: 'Movimento apagado',
    lancarTitulo: 'Lançar rendimento', mesRef: 'Mês de referência', semRend: '{n} meses sem rendimento lançado', jaLancado: ' ✓ lançado',
    calcTaxa: 'Calcular pela taxa', creditado: 'Rendimento creditado ({m})', formula: '{t} × saldo no fim do mês ({b})',
    exatoNota: 'O valor exato é calculado com os movimentos registrados até o último dia do mês.', lancarBotao: 'Lançar',
    duplicado: 'Já existe rendimento lançado em {mes}. Para corrigir, apague o anterior na lista de movimentos, ou lance outro mesmo assim.',
    lancarMesmo: 'Lançar mesmo assim', informeRend: 'Informe o valor do rendimento', rendLancado: 'Rendimento de {v} lançado',
    legJuros: 'Juros', legSaidas: 'Saídas', legSaldo: 'Saldo real', legProj: 'Projeção 12 meses', projecaoTag: '(projeção)',
    ariaBarras: 'Juros e saídas por mês', ariaLinha: 'Evolução e projeção do saldo',
  },
  duracao: { ano: '{n} ano', anos: '{n} anos', mes: '{n} mês', meses: '{n} meses', e: ' e ' },
  erro: {
    senha_incorreta: 'Senha incorreta', nao_autorizado: 'Sessão expirada. Entre de novo.',
    saida_maior_saldo: 'Saída maior que o saldo disponível ({saldo})', mes_anterior_inicio: 'Mês anterior ao início da conta',
    rendimento_duplicado: 'Já existe rendimento lançado neste mês', informe_valor: 'Conta em modo manual: informe o valor do rendimento',
    dados_invalidos: 'Dados inválidos. Confira os campos.', erro_interno: 'Algo deu errado no servidor. Tente de novo.',
  },
  demo: { aviso: 'Demonstração com dados de exemplo. Pode lançar, editar e apagar à vontade: nada é salvo, e ao recarregar a página tudo volta ao início.', restaurar: 'Restaurar exemplo' },
};

const de = {
  app: { nome: 'Meine Finanzen', backup: 'Backup', backupDica: 'Backup als JSON herunterladen', backupErro: 'Export nicht möglich', demo: 'Demo' },
  abas: { visao: 'Übersicht', lancamentos: 'Buchungen', orcamento: 'Budget', recorrentes: 'Daueraufträge', rendimento: 'Zinskonto' },
  abasCurto: { visao: 'Start', lancamentos: 'Buchung.', orcamento: 'Budget', recorrentes: 'Dauer', rendimento: 'Zinsen' },
  ajustes: { titulo: 'Einstellungen', idioma: 'Sprache', tema: 'Darstellung', sistema: 'Automatisch', claro: 'Hell', escuro: 'Dunkel', sair: 'Abmelden' },
  login: { senha: 'Passwort', entrar: 'Anmelden' },
  comum: {
    cancelar: 'Abbrechen', salvar: 'Speichern', apagar: 'Löschen', apagarMesmo: 'Wirklich löschen?', fechar: 'Schließen', editar: 'Bearbeiten',
    descricao: 'Beschreibung', valor: 'Betrag', moeda: 'Währung', data: 'Datum', categoria: 'Kategorie', semCategoria: 'Ohne Kategorie',
    nota: 'Notiz', despesa: 'Ausgabe', receita: 'Einnahme', mesAnterior: 'Vorheriger Monat', proximoMes: 'Nächster Monat',
    zero: '0,00', adicionar: 'Hinzufügen', abrir: 'Öffnen', confirmar: 'Bestätigen?', moedaExibicao: 'Anzeigewährung',
  },
  visao: {
    receitas: 'Einnahmen', despesas: 'Ausgaben', saldoMes: 'Saldo im Monat', contas: 'Zinskonten', nContas: '{n} Konto/Konten',
    pctReceitas: '{p} der Einnahmen', novo: '+ Buchung', atencao: 'Budget im Blick', verOrcamento: 'Zum Budget →',
    paraOnde: 'Wohin das Geld ging', nenhumaDespesa: 'Keine Ausgaben im {mes}.', cadastrarConta: '+ Konto anlegen, das monatlich Zinsen bringt',
    jurosMes: 'Zinsen im Monat {v}', saidasMes: 'Abgänge {v}', orcamentoTotal: 'Gesamtbudget',
    cambio: 'Werte umgerechnet in {base} · Kurs {fonte}', cambioBce: 'EZB vom {data}', cambioAprox: 'ungefähr (keine Verbindung zum Kurs)',
  },
  lanc: {
    novo: '+ Neue Buchung', novoTitulo: 'Neue Buchung', editarTitulo: 'Buchung bearbeiten', buscar: 'Beschreibung suchen…',
    todasCategorias: 'Alle Kategorien', nenhum: 'Keine Buchungen', nadaFiltro: 'Nichts mit diesem Filter.',
    vazio: 'Erfasse Einnahmen und Ausgaben dieses Monats. Fixkosten passen besser zu Daueraufträgen.', recorrente: 'Dauerauftrag',
    geradoRecorrencia: 'Von einem Dauerauftrag erzeugt. Änderungen gelten nur für diesen Monat.', descreva: 'Beschreibe die Buchung',
    informeValor: 'Gib einen Betrag ein', salvo: 'Buchung gespeichert', apagado: 'Buchung gelöscht',
  },
  orc: {
    categoria: '+ Kategorie', doMes: 'Budget im Monat', de: 'von', restam: 'Noch {v} übrig', excedido: 'Um {v} überschritten',
    mesPassou: '{p} des Monats sind vorbei · die gestrichelte Linie zeigt, wo jede Kategorie im aktuellen Tempo landet.',
    resta: 'noch {v}', ritmo: 'Im aktuellen Tempo endet der Monat bei {v}.', semOrcamento: 'Ohne Budget', definir: 'festlegen →',
    todasComOrcamento: 'Alle Ausgabenkategorien haben ein Budget.', catReceita: 'Einnahmekategorien',
    estado: { ok: 'Im Rahmen', alerta: 'Achtung', estourado: 'Überschritten' },
    novaCategoria: 'Neue Kategorie', icone: 'Symbol', nome: 'Name', cor: 'Farbe', orcamentoMensal: 'Monatsbudget',
    semLimite: 'Leer lassen für kein Limit.', avisarEm: 'Warnen bei {p}%', apagarCat: 'Löschen? Buchungen verlieren die Kategorie',
    deNome: 'Gib einen Namen ein', invalido: 'Ungültiges Budget', salva: 'Kategorie gespeichert', apagada: 'Kategorie gelöscht',
  },
  rec: {
    titulo: 'Daueraufträge', sub: 'Werden an ihrem Tag jeden Monat automatisch gebucht.', nova: '+ Neuer Dauerauftrag',
    porMes: 'Pro Monat · {m}', nenhuma: 'Keine Daueraufträge', vazio: 'Miete, Gehalt, Fitnessstudio, Streaming… Einmal anlegen, die App bucht jeden Monat.',
    cadastrar: 'Anlegen', dia: 'Tag', freq: { mensal: 'monatlich', trimestral: 'alle 3 Monate', anual: 'jährlich' },
    proximo: 'nächster {d}', encerrada: 'beendet', pausada: 'pausiert', novaTitulo: 'Neuer Dauerauftrag', editarTitulo: 'Dauerauftrag bearbeiten',
    exemplo: 'z. B. Miete', frequencia: 'Rhythmus', mensal: 'Monatlich', trimestral: 'Vierteljährlich', anual: 'Jährlich', diaDoMes: 'Tag im Monat',
    ultimoDia: '31 = letzter Tag des Monats', comeca: 'Beginnt am', comecaDica: 'Vergangene Monate werden beim Speichern gebucht.', termina: 'Endet am (optional)',
    ativa: 'Aktiv (abwählen zum Pausieren)', eOsLanc: 'Und die bereits erzeugten Buchungen?', manter: 'Buchungen behalten', apagarTambem: 'Auch löschen',
    descreva: 'Beschreibe den Dauerauftrag', diaInvalido: 'Tag zwischen 1 und 31', salva: 'Dauerauftrag gespeichert', apagada: 'Dauerauftrag gelöscht',
  },
  rend: {
    nenhuma: 'Kein Zinskonto',
    vazio: 'Lege das Konto mit Anfangssaldo und Zinssatz an. Die App berechnet die Zinsen jedes Monats, erfasst Abgänge und zeigt, wie viel du entnehmen kannst, ohne das Kapital zu verringern.',
    cadastrar: 'Konto anlegen', novaConta: '+ Neues Konto', contaPadrao: 'Zinskonto', desde: '{v} seit {d} · Start {i}',
    editarConta: 'Konto bearbeiten', lancar: '+ Zinsen buchen', saida: '− Abgang erfassen', aporte: '+ Einzahlung',
    naoLancado: 'Die Zinsen für {mes} sind noch nicht gebucht — Schätzung {v}.', lancarSeta: 'Buchen →',
    automaticoEm: 'Automatische Zinsen: {v} werden am {d} gebucht.',
    esteMes: 'Dieser Monat', jurosMes: 'Zinsen im Monat', lancado: 'gebucht', naoLancadoCurto: 'noch nicht gebucht', saidasMes: 'Abgänge im Monat',
    tiposSaida: 'Entnahmen, Steuern und Gebühren', liquido: 'Nettoergebnis', jurosMenosSaidas: 'Zinsen − Abgänge', proximo: 'Nächste Zinsen',
    sobreSaldo: '{t} p. M. auf den aktuellen Saldo', acumulado: 'Gesamt', jurosAcum: 'Zinsen gesamt', ult12: '{v} in den letzten 12 Monaten',
    saidasAcum: 'Abgänge gesamt', detalheSaidas: 'Entnahmen {r} · Steuern {i} · Gebühren {t}', taxa: 'Zinssatz', am: 'p. M.',
    anual: '{a} p. a. effektiv', mediaReal: ' · Ø real {m} p. M.', sustentavel: 'Nachhaltige Entnahme', porMes: '/Monat',
    semReduzir: 'pro Monat, ohne das Kapital zu verringern', semSaidas: 'Keine Abgänge zuletzt: alle Zinsen bleiben auf dem Konto.',
    cobre: 'Deine durchschnittlichen Abgänge ({s}/Monat) liegen unter den erwarteten Zinsen ({j}). Das Kapital wächst weiter — es bleiben {d} pro Monat.',
    naoCobre: 'Deine durchschnittlichen Abgänge ({s}/Monat) übersteigen die Zinsen ({j}). In diesem Tempo reicht der Saldo etwa {t}. Um das Kapital zu erhalten, entnimm höchstens {r} pro Monat.',
    mediaNota: 'Durchschnitt der Abgänge aus den letzten 3 abgeschlossenen Monaten.', jurosXSaidas: 'Zinsen × Abgänge', saldoProjecao: 'Saldo und Prognose',
    mesAMes: 'Monat für Monat', movimentos: 'Bewegungen ({n})', projecao: 'Prognose',
    col: { mes: 'Monat', abertura: 'Anfang', juros: 'Zinsen', rentab: 'Rendite', aportes: 'Einzahl.', saidas: 'Abgänge', liquido: 'Netto', fechamento: 'Ende', saida: 'Abgang', jurosAcum: 'Zinsen kum.', saldo: 'Saldo' },
    projNota: 'Mit aktuellem Zinssatz und durchschnittlichem Abgang von {v} pro Monat.', semMov: 'Noch keine Bewegungen.', automatico: 'automatisch',
    tipo: { rendimento: 'Zinsen', aporte: 'Einzahlung', resgate: 'Entnahme', imposto: 'Steuer', taxa: 'Gebühr' },
    novaTitulo: 'Neues Zinskonto', editarTitulo: 'Konto bearbeiten', nome: 'Name', exNome: 'z. B. Rücklage', instituicao: 'Institut',
    exInst: 'Bank oder Broker', saldoInicial: 'Anfangssaldo', dataSaldo: 'Datum des Anfangssaldos', dataDica: 'Die Monatsübersicht beginnt an diesem Datum.',
    comoRende: 'Verzinsung', pctMes: '% pro Monat', pctAno: '% pro Jahr', extrato: 'Betrag laut Auszug', taxaAnual: 'Jahreszins (%)', taxaMensal: 'Monatszins (%)',
    dicaAnual: 'Umgerechnet in den gleichwertigen Monatszins: (1 + a)^(1/12) − 1.', dicaMensal: 'z. B. 0,8 für 0,8 % pro Monat.',
    manualNota: 'Du trägst jeden Monat den Betrag aus dem Kontoauszug ein. Prognosen nutzen die tatsächliche Durchschnittsrendite.',
    auto: 'Zinsen am letzten Tag jedes Monats automatisch buchen', autoDica: 'Du kannst den Betrag später anpassen, falls der Auszug abweicht.',
    incluirAnteriores: 'Auch die Monate seit dem Datum des Anfangssaldos berechnen', observacao: 'Bemerkung',
    apagarConta: 'Konto löschen', apagarContaConf: 'Konto und Bewegungen löschen?', deNome: 'Gib dem Konto einen Namen', saldoInvalido: 'Ungültiger Anfangssaldo',
    taxaInvalida: 'Ungültiger Zinssatz', criada: 'Konto angelegt', salva: 'Konto gespeichert', apagada: 'Konto gelöscht',
    regSaida: 'Abgang erfassen', regEntrada: 'Zugang erfassen', editarMov: 'Bewegung bearbeiten', disponivel: 'Verfügbarer Saldo: {v}',
    exSaida: 'z. B. Entnahme für Reise', informeValor: 'Gib einen Betrag ein', movRegistrado: 'Bewegung erfasst', movApagado: 'Bewegung gelöscht',
    lancarTitulo: 'Zinsen buchen', mesRef: 'Monat', semRend: '{n} Monate ohne gebuchte Zinsen', jaLancado: ' ✓ gebucht',
    calcTaxa: 'Mit Zinssatz berechnen', creditado: 'Gutgeschriebene Zinsen ({m})', formula: '{t} × Saldo am Monatsende ({b})',
    exatoNota: 'Der genaue Betrag ergibt sich aus den bis Monatsende erfassten Bewegungen.', lancarBotao: 'Buchen',
    duplicado: 'Für {mes} sind schon Zinsen gebucht. Lösche zum Korrigieren den vorherigen Eintrag in den Bewegungen oder buche trotzdem.',
    lancarMesmo: 'Trotzdem buchen', informeRend: 'Gib den Zinsbetrag ein', rendLancado: 'Zinsen von {v} gebucht',
    legJuros: 'Zinsen', legSaidas: 'Abgänge', legSaldo: 'Tatsächlicher Saldo', legProj: 'Prognose 12 Monate', projecaoTag: '(Prognose)',
    ariaBarras: 'Zinsen und Abgänge pro Monat', ariaLinha: 'Saldoverlauf und Prognose',
  },
  duracao: { ano: '{n} Jahr', anos: '{n} Jahre', mes: '{n} Monat', meses: '{n} Monate', e: ' und ' },
  erro: {
    senha_incorreta: 'Falsches Passwort', nao_autorizado: 'Sitzung abgelaufen. Bitte neu anmelden.',
    saida_maior_saldo: 'Abgang größer als der verfügbare Saldo ({saldo})', mes_anterior_inicio: 'Monat liegt vor dem Kontostart',
    rendimento_duplicado: 'Für diesen Monat sind schon Zinsen gebucht', informe_valor: 'Manueller Modus: gib den Zinsbetrag ein',
    dados_invalidos: 'Ungültige Angaben. Bitte Felder prüfen.', erro_interno: 'Fehler auf dem Server. Bitte erneut versuchen.',
  },
  demo: { aviso: 'Demo mit Beispieldaten. Buchen, bearbeiten und löschen erlaubt: nichts wird gespeichert, beim Neuladen beginnt alles von vorn.', restaurar: 'Beispiel wiederherstellen' },
};

const en = {
  app: { nome: 'My Finances', backup: 'Backup', backupDica: 'Download a JSON backup', backupErro: 'Export failed', demo: 'Demo' },
  abas: { visao: 'Overview', lancamentos: 'Transactions', orcamento: 'Budget', recorrentes: 'Recurring', rendimento: 'Savings' },
  abasCurto: { visao: 'Home', lancamentos: 'Transact.', orcamento: 'Budget', recorrentes: 'Recurring', rendimento: 'Savings' },
  ajustes: { titulo: 'Settings', idioma: 'Language', tema: 'Appearance', sistema: 'Automatic', claro: 'Light', escuro: 'Dark', sair: 'Sign out' },
  login: { senha: 'Password', entrar: 'Sign in' },
  comum: {
    cancelar: 'Cancel', salvar: 'Save', apagar: 'Delete', apagarMesmo: 'Delete for sure?', fechar: 'Close', editar: 'Edit',
    descricao: 'Description', valor: 'Amount', moeda: 'Currency', data: 'Date', categoria: 'Category', semCategoria: 'No category',
    nota: 'Note', despesa: 'Expense', receita: 'Income', mesAnterior: 'Previous month', proximoMes: 'Next month',
    zero: '0.00', adicionar: 'Add', abrir: 'Open', confirmar: 'Confirm?', moedaExibicao: 'Display currency',
  },
  visao: {
    receitas: 'Income', despesas: 'Expenses', saldoMes: 'Month balance', contas: 'Savings accounts', nContas: '{n} account(s)',
    pctReceitas: '{p} of income', novo: '+ Transaction', atencao: 'Budget watch', verOrcamento: 'See budget →',
    paraOnde: 'Where the money went', nenhumaDespesa: 'No expenses in {mes}.', cadastrarConta: '+ Add the account that earns interest every month',
    jurosMes: 'interest this month {v}', saidasMes: 'outflows {v}', orcamentoTotal: 'Total budget',
    cambio: 'Amounts converted to {base} · rate {fonte}', cambioBce: 'ECB of {data}', cambioAprox: 'approximate (no connection to the rate)',
  },
  lanc: {
    novo: '+ New transaction', novoTitulo: 'New transaction', editarTitulo: 'Edit transaction', buscar: 'Search description…',
    todasCategorias: 'All categories', nenhum: 'No transactions', nadaFiltro: 'Nothing matches this filter.',
    vazio: 'Record this month’s income and expenses. Fixed bills fit better under Recurring.', recorrente: 'recurring',
    geradoRecorrencia: 'Created by a recurring item. Changes here apply to this month only.', descreva: 'Describe the transaction',
    informeValor: 'Enter an amount', salvo: 'Transaction saved', apagado: 'Transaction deleted',
  },
  orc: {
    categoria: '+ Category', doMes: 'Monthly budget', de: 'of', restam: '{v} left', excedido: 'Over by {v}',
    mesPassou: '{p} of the month has passed · the dashed line shows where each category ends at the current pace.',
    resta: '{v} left', ritmo: 'At this pace the month ends at {v}.', semOrcamento: 'No budget set', definir: 'set →',
    todasComOrcamento: 'Every expense category has a budget.', catReceita: 'Income categories',
    estado: { ok: 'On track', alerta: 'Watch', estourado: 'Over' },
    novaCategoria: 'New category', icone: 'Icon', nome: 'Name', cor: 'Colour', orcamentoMensal: 'Monthly budget',
    semLimite: 'Leave empty for no limit.', avisarEm: 'Warn at {p}%', apagarCat: 'Delete? Transactions lose this category',
    deNome: 'Enter a name', invalido: 'Invalid budget', salva: 'Category saved', apagada: 'Category deleted',
  },
  rec: {
    titulo: 'Recurring', sub: 'Added automatically as transactions on their day each month.', nova: '+ New recurring item',
    porMes: 'Per month · {m}', nenhuma: 'No recurring items', vazio: 'Rent, salary, gym, streaming… Add it once and the app records it every month.',
    cadastrar: 'Add', dia: 'day', freq: { mensal: 'monthly', trimestral: 'every 3 months', anual: 'yearly' },
    proximo: 'next {d}', encerrada: 'ended', pausada: 'paused', novaTitulo: 'New recurring item', editarTitulo: 'Edit recurring item',
    exemplo: 'e.g. Rent', frequencia: 'Frequency', mensal: 'Monthly', trimestral: 'Quarterly', anual: 'Yearly', diaDoMes: 'Day of month',
    ultimoDia: '31 = last day of the month', comeca: 'Starts on', comecaDica: 'Past months are recorded when you save.', termina: 'Ends on (optional)',
    ativa: 'Active (untick to pause)', eOsLanc: 'What about the transactions it already created?', manter: 'Keep transactions', apagarTambem: 'Delete them too',
    descreva: 'Describe the recurring item', diaInvalido: 'Day between 1 and 31', salva: 'Recurring item saved', apagada: 'Recurring item deleted',
  },
  rend: {
    nenhuma: 'No savings account',
    vazio: 'Add the account with its starting balance and rate. The app works out each month’s interest, records outflows and shows how much you can withdraw without shrinking the capital.',
    cadastrar: 'Add account', novaConta: '+ New account', contaPadrao: 'Savings account', desde: '{v} since {d} · start {i}',
    editarConta: 'Edit account', lancar: '+ Record interest', saida: '− Record outflow', aporte: '+ Deposit',
    naoLancado: 'Interest for {mes} isn’t recorded yet — estimate {v}.', lancarSeta: 'Record →',
    automaticoEm: 'Automatic interest: {v} will be recorded on {d}.',
    esteMes: 'This month', jurosMes: 'Interest this month', lancado: 'recorded', naoLancadoCurto: 'not recorded yet', saidasMes: 'Outflows this month',
    tiposSaida: 'withdrawals, taxes and fees', liquido: 'Net result', jurosMenosSaidas: 'interest − outflows', proximo: 'Next interest',
    sobreSaldo: '{t} per month on the current balance', acumulado: 'To date', jurosAcum: 'Total interest', ult12: '{v} in the last 12 months',
    saidasAcum: 'Total outflows', detalheSaidas: 'Withdrawals {r} · Taxes {i} · Fees {t}', taxa: 'Rate', am: 'p.m.',
    anual: '{a} p.a. equivalent', mediaReal: ' · actual avg {m} p.m.', sustentavel: 'Sustainable withdrawal', porMes: '/month',
    semReduzir: 'per month without shrinking the capital', semSaidas: 'No recent outflows: all interest is staying in the account.',
    cobre: 'Your average outflows ({s}/month) are below the expected interest ({j}). The capital keeps growing — {d} left over each month.',
    naoCobre: 'Your average outflows ({s}/month) exceed the interest ({j}). At this pace the balance lasts about {t}. To keep the capital, withdraw at most {r} per month.',
    mediaNota: 'Average outflows over the last 3 completed months.', jurosXSaidas: 'Interest × outflows', saldoProjecao: 'Balance and forecast',
    mesAMes: 'Month by month', movimentos: 'Entries ({n})', projecao: 'Forecast',
    col: { mes: 'Month', abertura: 'Opening', juros: 'Interest', rentab: 'Return', aportes: 'Deposits', saidas: 'Outflows', liquido: 'Net', fechamento: 'Closing', saida: 'Outflow', jurosAcum: 'Cum. interest', saldo: 'Balance' },
    projNota: 'Uses the current rate and an average monthly outflow of {v}.', semMov: 'No entries yet.', automatico: 'automatic',
    tipo: { rendimento: 'Interest', aporte: 'Deposit', resgate: 'Withdrawal', imposto: 'Tax', taxa: 'Fee' },
    novaTitulo: 'New savings account', editarTitulo: 'Edit account', nome: 'Name', exNome: 'e.g. Reserve', instituicao: 'Institution',
    exInst: 'Bank or broker', saldoInicial: 'Starting balance', dataSaldo: 'Date of starting balance', dataDica: 'The month-by-month history starts on this date.',
    comoRende: 'How it earns', pctMes: '% per month', pctAno: '% per year', extrato: 'Statement amount', taxaAnual: 'Annual rate (%)', taxaMensal: 'Monthly rate (%)',
    dicaAnual: 'Converted to the equivalent monthly rate: (1 + a)^(1/12) − 1.', dicaMensal: 'e.g. 0.8 for 0.8% per month.',
    manualNota: 'You enter the statement amount each month. Forecasts use the actual average return of the recorded months.',
    auto: 'Record interest automatically on the last day of each month', autoDica: 'You can still edit the amount later if the statement differs.',
    incluirAnteriores: 'Also calculate the months since the starting balance date', observacao: 'Note',
    apagarConta: 'Delete account', apagarContaConf: 'Delete account and entries?', deNome: 'Give the account a name', saldoInvalido: 'Invalid starting balance',
    taxaInvalida: 'Invalid rate', criada: 'Account created', salva: 'Account saved', apagada: 'Account deleted',
    regSaida: 'Record outflow', regEntrada: 'Record inflow', editarMov: 'Edit entry', disponivel: 'Available balance: {v}',
    exSaida: 'e.g. withdrawal for a trip', informeValor: 'Enter an amount', movRegistrado: 'Entry recorded', movApagado: 'Entry deleted',
    lancarTitulo: 'Record interest', mesRef: 'Month', semRend: '{n} months without recorded interest', jaLancado: ' ✓ recorded',
    calcTaxa: 'Calculate from rate', creditado: 'Interest credited ({m})', formula: '{t} × month-end balance ({b})',
    exatoNota: 'The exact amount uses the entries recorded up to the last day of the month.', lancarBotao: 'Record',
    duplicado: 'Interest for {mes} is already recorded. To fix it, delete the earlier entry in the list, or record another anyway.',
    lancarMesmo: 'Record anyway', informeRend: 'Enter the interest amount', rendLancado: 'Interest of {v} recorded',
    legJuros: 'Interest', legSaidas: 'Outflows', legSaldo: 'Actual balance', legProj: '12-month forecast', projecaoTag: '(forecast)',
    ariaBarras: 'Interest and outflows per month', ariaLinha: 'Balance history and forecast',
  },
  duracao: { ano: '{n} year', anos: '{n} years', mes: '{n} month', meses: '{n} months', e: ' and ' },
  erro: {
    senha_incorreta: 'Wrong password', nao_autorizado: 'Session expired. Please sign in again.',
    saida_maior_saldo: 'Outflow larger than the available balance ({saldo})', mes_anterior_inicio: 'Month is before the account start',
    rendimento_duplicado: 'Interest is already recorded for this month', informe_valor: 'Manual mode: enter the interest amount',
    dados_invalidos: 'Invalid data. Please check the fields.', erro_interno: 'Something went wrong on the server. Please try again.',
  },
  demo: { aviso: 'Demo with sample data. Add, edit and delete freely: nothing is saved, and reloading the page starts over.', restaurar: 'Restore sample' },
};


// ---------- metas e importação ----------
pt.abas.metas = 'Metas'; pt.abasCurto.metas = 'Metas';
de.abas.metas = 'Sparziele'; de.abasCurto.metas = 'Ziele';
en.abas.metas = 'Goals'; en.abasCurto.metas = 'Goals';
pt.visao.metas = 'Metas'; de.visao.metas = 'Sparziele'; en.visao.metas = 'Goals';
pt.erro.retirada_maior_guardado = 'Retirada maior que o valor guardado ({saldo})';
de.erro.retirada_maior_guardado = 'Entnahme größer als der gesparte Betrag ({saldo})';
en.erro.retirada_maior_guardado = 'Withdrawal larger than the amount saved ({saldo})';

pt.metas = {
  titulo: 'Metas', sub: 'Guarde para o que importa e veja quanto falta a cada mês.', nova: 'Nova meta',
  nenhuma: 'Nenhuma meta ainda', vazio: 'Uma viagem, uma reserva de emergência, a entrada de um apartamento… Defina o valor e o prazo; o app mostra quanto guardar por mês.',
  criar: 'Criar meta', de: 'de', guardar: 'Guardar', retirar: 'Retirar', faltam: 'Faltam {v}', concluida: 'Meta atingida!',
  porMes: 'Guarde {v}/mês até {d}', semPrazo: 'Sem prazo', prazo: 'até {d}', ritmo: 'Ritmo: {v}/mês', previsao: 'No ritmo atual, atinge em {d}',
  semRitmo: 'Nenhum depósito nos últimos 3 meses.', prazoPassou: 'O prazo já passou.',
  estado: { 'no-ritmo': 'No ritmo', atrasada: 'Atrasada', concluida: 'Concluída', andamento: 'Em andamento', parada: 'Parada' },
  novaTitulo: 'Nova meta', editarTitulo: 'Editar meta', nome: 'Nome', exNome: 'Ex.: Viagem de fim de ano', icone: 'Ícone', cor: 'Cor',
  alvo: 'Valor da meta', prazoCampo: 'Prazo (opcional)', jaGuardado: 'Já guardado', jaGuardadoDica: 'Se você já começou, informe quanto já tem.',
  pessoas: 'Quem participa (opcional)', pessoasDica: 'Para metas em conjunto: nomes separados por vírgula. Ex.: Eu, Ana', arquivar: 'Arquivar meta',
  arquivada: 'Arquivada', reativar: 'Reativar', arquivadas: 'Arquivadas', apagar: 'Apagar meta', apagarConf: 'Apagar meta e depósitos?',
  deNome: 'Dê um nome à meta', alvoInvalido: 'Informe o valor da meta', salva: 'Meta salva', criada: 'Meta criada', apagada: 'Meta apagada',
  guardarTitulo: 'Guardar em “{n}”', retirarTitulo: 'Retirar de “{n}”', deposito: 'Depósito', retirada: 'Retirada', quem: 'Quem', guardado: 'Guardado {v}',
  registrado: 'Registrado', historico: 'Histórico', semHistorico: 'Nenhum depósito ainda.', porPessoa: 'Por pessoa', semNome: 'Sem nome',
  evolucao: 'Evolução', apagarDep: 'Apagar', verTodas: 'Ver metas →',
};
de.metas = {
  titulo: 'Sparziele', sub: 'Spare für das, was zählt, und sieh jeden Monat, wie viel noch fehlt.', nova: 'Neues Ziel',
  nenhuma: 'Noch keine Sparziele', vazio: 'Eine Reise, ein Notgroschen, die Anzahlung für eine Wohnung… Lege Betrag und Frist fest; die App zeigt, wie viel du pro Monat sparen musst.',
  criar: 'Ziel anlegen', de: 'von', guardar: 'Sparen', retirar: 'Entnehmen', faltam: 'Noch {v}', concluida: 'Ziel erreicht!',
  porMes: 'Spare {v}/Monat bis {d}', semPrazo: 'Ohne Frist', prazo: 'bis {d}', ritmo: 'Tempo: {v}/Monat', previsao: 'Im aktuellen Tempo erreicht im {d}',
  semRitmo: 'Keine Einzahlung in den letzten 3 Monaten.', prazoPassou: 'Die Frist ist abgelaufen.',
  estado: { 'no-ritmo': 'Im Plan', atrasada: 'Im Verzug', concluida: 'Erreicht', andamento: 'Läuft', parada: 'Pausiert' },
  novaTitulo: 'Neues Sparziel', editarTitulo: 'Sparziel bearbeiten', nome: 'Name', exNome: 'z. B. Urlaub im Winter', icone: 'Symbol', cor: 'Farbe',
  alvo: 'Zielbetrag', prazoCampo: 'Frist (optional)', jaGuardado: 'Bereits gespart', jaGuardadoDica: 'Falls du schon angefangen hast, trage den aktuellen Stand ein.',
  pessoas: 'Wer spart mit (optional)', pessoasDica: 'Für gemeinsame Ziele: Namen mit Komma trennen. z. B. Ich, Ana', arquivar: 'Ziel archivieren',
  arquivada: 'Archiviert', reativar: 'Reaktivieren', arquivadas: 'Archiviert', apagar: 'Ziel löschen', apagarConf: 'Ziel und Einzahlungen löschen?',
  deNome: 'Gib dem Ziel einen Namen', alvoInvalido: 'Gib den Zielbetrag ein', salva: 'Ziel gespeichert', criada: 'Ziel angelegt', apagada: 'Ziel gelöscht',
  guardarTitulo: 'In „{n}“ sparen', retirarTitulo: 'Aus „{n}“ entnehmen', deposito: 'Einzahlung', retirada: 'Entnahme', quem: 'Wer', guardado: 'Gespart {v}',
  registrado: 'Erfasst', historico: 'Verlauf', semHistorico: 'Noch keine Einzahlungen.', porPessoa: 'Pro Person', semNome: 'Ohne Namen',
  evolucao: 'Entwicklung', apagarDep: 'Löschen', verTodas: 'Zu den Zielen →',
};
en.metas = {
  titulo: 'Goals', sub: 'Save for what matters and see what’s left each month.', nova: 'New goal',
  nenhuma: 'No goals yet', vazio: 'A trip, an emergency fund, a flat deposit… Set the amount and the deadline; the app shows how much to save each month.',
  criar: 'Create goal', de: 'of', guardar: 'Save', retirar: 'Withdraw', faltam: '{v} to go', concluida: 'Goal reached!',
  porMes: 'Save {v}/month until {d}', semPrazo: 'No deadline', prazo: 'by {d}', ritmo: 'Pace: {v}/month', previsao: 'At this pace, reached in {d}',
  semRitmo: 'No deposits in the last 3 months.', prazoPassou: 'The deadline has passed.',
  estado: { 'no-ritmo': 'On track', atrasada: 'Behind', concluida: 'Done', andamento: 'In progress', parada: 'Paused' },
  novaTitulo: 'New goal', editarTitulo: 'Edit goal', nome: 'Name', exNome: 'e.g. Winter holiday', icone: 'Icon', cor: 'Colour',
  alvo: 'Goal amount', prazoCampo: 'Deadline (optional)', jaGuardado: 'Already saved', jaGuardadoDica: 'If you’ve already started, enter what you have.',
  pessoas: 'Who’s saving (optional)', pessoasDica: 'For shared goals: names separated by commas. e.g. Me, Ana', arquivar: 'Archive goal',
  arquivada: 'Archived', reativar: 'Reactivate', arquivadas: 'Archived', apagar: 'Delete goal', apagarConf: 'Delete goal and deposits?',
  deNome: 'Give the goal a name', alvoInvalido: 'Enter the goal amount', salva: 'Goal saved', criada: 'Goal created', apagada: 'Goal deleted',
  guardarTitulo: 'Save into “{n}”', retirarTitulo: 'Withdraw from “{n}”', deposito: 'Deposit', retirada: 'Withdrawal', quem: 'Who', guardado: 'Saved {v}',
  registrado: 'Recorded', historico: 'History', semHistorico: 'No deposits yet.', porPessoa: 'Per person', semNome: 'Unnamed',
  evolucao: 'Progress', apagarDep: 'Delete', verTodas: 'See goals →',
};

pt.imp = {
  botao: 'Importar extrato', titulo: 'Importar extrato', escolher: 'Escolher arquivo CSV', soltar: 'ou arraste o arquivo para cá',
  bancos: 'Funciona com Sparkasse, N26, ING, DKB, Commerzbank e outros bancos que exportam CSV.',
  comoBaixar: 'No site ou app do banco: Umsätze → Exportieren → CSV.', exemplo: 'Usar extrato de exemplo',
  lendo: 'Lendo o arquivo…', erroArquivo: 'Não consegui ler esse arquivo. Confira se é um CSV exportado pelo banco.',
  nenhuma: 'Não encontrei lançamentos. Indique abaixo quais colunas têm a data e o valor.',
  banco: 'Banco: {b}', bancoGenerico: 'Formato reconhecido', periodo: '{a} a {b}', resumo: '{n} lançamentos', ja: '{n} já importados', duvida: '{n} talvez repetidos',
  colunas: 'Colunas', colData: 'Data', colValor: 'Valor', colDesc: 'Descrição', colFav: 'Favorecido', nenhumaColuna: '—',
  moedaArquivo: 'Moeda do extrato', todas: 'Marcar todos', nenhumaSel: 'Desmarcar todos', jaImportado: 'já importado',
  talvez: 'parece com “{d}” de {data}', lembrar: 'Lembrar as categorias que eu escolher para os próximos extratos',
  importar: 'Importar {n}', voltar: 'Outro arquivo', importados: '{n} lançamentos importados', nadaSel: 'Marque pelo menos um lançamento.',
  semCategoria: 'Sem categoria', sugerida: 'sugerida',
};
de.imp = {
  botao: 'Kontoauszug importieren', titulo: 'Kontoauszug importieren', escolher: 'CSV-Datei wählen', soltar: 'oder Datei hierher ziehen',
  bancos: 'Funktioniert mit Sparkasse, N26, ING, DKB, Commerzbank und anderen Banken mit CSV-Export.',
  comoBaixar: 'Im Online-Banking: Umsätze → Exportieren → CSV.', exemplo: 'Beispielauszug verwenden',
  lendo: 'Datei wird gelesen…', erroArquivo: 'Die Datei konnte nicht gelesen werden. Ist es ein CSV-Export deiner Bank?',
  nenhuma: 'Keine Buchungen gefunden. Wähle unten die Spalten für Datum und Betrag.',
  banco: 'Bank: {b}', bancoGenerico: 'Format erkannt', periodo: '{a} bis {b}', resumo: '{n} Buchungen', ja: '{n} schon importiert', duvida: '{n} evtl. doppelt',
  colunas: 'Spalten', colData: 'Datum', colValor: 'Betrag', colDesc: 'Beschreibung', colFav: 'Empfänger', nenhumaColuna: '—',
  moedaArquivo: 'Währung des Auszugs', todas: 'Alle auswählen', nenhumaSel: 'Keine auswählen', jaImportado: 'schon importiert',
  talvez: 'ähnlich wie „{d}“ vom {data}', lembrar: 'Gewählte Kategorien für künftige Auszüge merken',
  importar: '{n} importieren', voltar: 'Andere Datei', importados: '{n} Buchungen importiert', nadaSel: 'Wähle mindestens eine Buchung.',
  semCategoria: 'Ohne Kategorie', sugerida: 'vorgeschlagen',
};
en.imp = {
  botao: 'Import statement', titulo: 'Import statement', escolher: 'Choose CSV file', soltar: 'or drag the file here',
  bancos: 'Works with Sparkasse, N26, ING, DKB, Commerzbank and other banks that export CSV.',
  comoBaixar: 'In your online banking: Transactions → Export → CSV.', exemplo: 'Use sample statement',
  lendo: 'Reading the file…', erroArquivo: 'Couldn’t read this file. Make sure it’s a CSV exported by your bank.',
  nenhuma: 'No transactions found. Pick the date and amount columns below.',
  banco: 'Bank: {b}', bancoGenerico: 'Format recognised', periodo: '{a} to {b}', resumo: '{n} transactions', ja: '{n} already imported', duvida: '{n} possible duplicates',
  colunas: 'Columns', colData: 'Date', colValor: 'Amount', colDesc: 'Description', colFav: 'Payee', nenhumaColuna: '—',
  moedaArquivo: 'Statement currency', todas: 'Select all', nenhumaSel: 'Select none', jaImportado: 'already imported',
  talvez: 'looks like “{d}” on {data}', lembrar: 'Remember the categories I choose for future statements',
  importar: 'Import {n}', voltar: 'Another file', importados: '{n} transactions imported', nadaSel: 'Select at least one transaction.',
  semCategoria: 'No category', sugerida: 'suggested',
};


// ---------- contas, cartões, viagens, relatório, lembretes ----------
Object.assign(pt.abas, { contas: 'Contas', mais: 'Mais', viagens: 'Viagens', relatorio: 'Relatório anual' });
Object.assign(pt.abasCurto, { contas: 'Contas', mais: 'Mais' });
Object.assign(de.abas, { contas: 'Konten', mais: 'Mehr', viagens: 'Reisen', relatorio: 'Jahresbericht' });
Object.assign(de.abasCurto, { contas: 'Konten', mais: 'Mehr' });
Object.assign(en.abas, { contas: 'Accounts', mais: 'More', viagens: 'Trips', relatorio: 'Annual report' });
Object.assign(en.abasCurto, { contas: 'Accounts', mais: 'More' });

Object.assign(pt.erro, { transferencia_contas: 'Escolha duas contas diferentes para a transferência.', conta_com_lancamentos: 'Esta conta tem {n} lançamentos. Arquive em vez de apagar.', escolha_origem: 'Escolha a conta de onde sai o pagamento.' });
Object.assign(de.erro, { transferencia_contas: 'Wähle zwei verschiedene Konten für die Umbuchung.', conta_com_lancamentos: 'Dieses Konto hat {n} Buchungen. Archiviere es, statt es zu löschen.', escolha_origem: 'Wähle das Konto, von dem bezahlt wird.' });
Object.assign(en.erro, { transferencia_contas: 'Choose two different accounts for the transfer.', conta_com_lancamentos: 'This account has {n} transactions. Archive it instead of deleting.', escolha_origem: 'Choose the account the payment comes from.' });

Object.assign(pt.lanc, { valorConta: 'Cobrado na conta ({m})', valorContaDica: 'Quanto saiu da conta na moeda dela. Vazio: usa o câmbio do dia.', cambioDoDia: 'Câmbio do dia', transferencia: 'Transferência', conta: 'Conta', semConta: 'Sem conta', de: 'De', para: 'Para', valorRecebido: 'Valor que chegou ({m})', valorRecebidoDica: 'As contas têm moedas diferentes.', parcelas: 'Parcelas', parcelasDica: 'Divide o valor em parcelas mensais no cartão.', viagem: 'Viagem', semViagem: 'Nenhuma', apagarParcelas: 'Apagar todas as parcelas', ajusteSaldo: 'ajuste de saldo', parcela: 'parcela {n}/{t}' });
Object.assign(de.lanc, { valorConta: 'Belastet auf dem Konto ({m})', valorContaDica: 'Betrag in der Kontowährung. Leer: Tageskurs wird verwendet.', cambioDoDia: 'Tageskurs', transferencia: 'Umbuchung', conta: 'Konto', semConta: 'Ohne Konto', de: 'Von', para: 'Nach', valorRecebido: 'Angekommener Betrag ({m})', valorRecebidoDica: 'Die Konten haben unterschiedliche Währungen.', parcelas: 'Raten', parcelasDica: 'Teilt den Betrag in monatliche Raten auf der Karte.', viagem: 'Reise', semViagem: 'Keine', apagarParcelas: 'Alle Raten löschen', ajusteSaldo: 'Saldokorrektur', parcela: 'Rate {n}/{t}' });
Object.assign(en.lanc, { valorConta: 'Charged to account ({m})', valorContaDica: 'Amount in the account’s currency. Empty: uses the day’s rate.', cambioDoDia: 'Day’s rate', transferencia: 'Transfer', conta: 'Account', semConta: 'No account', de: 'From', para: 'To', valorRecebido: 'Amount received ({m})', valorRecebidoDica: 'The accounts use different currencies.', parcelas: 'Instalments', parcelasDica: 'Splits the amount into monthly card instalments.', viagem: 'Trip', semViagem: 'None', apagarParcelas: 'Delete all instalments', ajusteSaldo: 'balance adjustment', parcela: 'instalment {n}/{t}' });

Object.assign(pt.visao, { metasMes: 'Guardado', atencaoSub: '{n} categorias perto ou acima do limite', atencaoSub1: '1 categoria perto ou acima do limite', excessoTotal: '{v} acima do previsto', deLimite: 'de {v}', sit: { acima: 'Acima', limite: 'No limite', perto: 'Perto do limite' }, verOrcamento: 'Ver orçamento',  patrimonio: 'Patrimônio líquido', tenho: 'Tenho', devo: 'Devo', proximos: 'Próximos 7 dias', nadaVence: 'Nada vence nos próximos 7 dias.', verContas: 'Ver contas →', vence: 'vence {d}', venceu: 'venceu {d}', fatura: 'Fatura {n}', configurarContas: 'Cadastre suas contas para ver o patrimônio total →' });
Object.assign(de.visao, { metasMes: 'Zurückgelegt', atencaoSub: '{n} Kategorien nahe am oder über dem Limit', atencaoSub1: '1 Kategorie nahe am oder über dem Limit', excessoTotal: '{v} über Plan', deLimite: 'von {v}', sit: { acima: 'Überschritten', limite: 'Am Limit', perto: 'Fast am Limit' }, verOrcamento: 'Zum Budget',  patrimonio: 'Nettovermögen', tenho: 'Vermögen', devo: 'Schulden', proximos: 'Nächste 7 Tage', nadaVence: 'In den nächsten 7 Tagen ist nichts fällig.', verContas: 'Zu den Konten →', vence: 'fällig {d}', venceu: 'fällig seit {d}', fatura: 'Abrechnung {n}', configurarContas: 'Lege deine Konten an, um dein Gesamtvermögen zu sehen →' });
Object.assign(en.visao, { metasMes: 'Set aside', atencaoSub: '{n} categories near or over limit', atencaoSub1: '1 category near or over limit', excessoTotal: '{v} over plan', deLimite: 'of {v}', sit: { acima: 'Over', limite: 'At limit', perto: 'Near limit' }, verOrcamento: 'See budget',  patrimonio: 'Net worth', tenho: 'Assets', devo: 'Debts', proximos: 'Next 7 days', nadaVence: 'Nothing due in the next 7 days.', verContas: 'See accounts →', vence: 'due {d}', venceu: 'overdue since {d}', fatura: '{n} statement', configurarContas: 'Add your accounts to see your total net worth →' });

Object.assign(pt.orc, { dedutivel: 'Dedutível no imposto', dedutivelDica: 'Aparece no relatório anual, na parte de despesas dedutíveis.' });
Object.assign(de.orc, { dedutivel: 'Steuerlich absetzbar', dedutivelDica: 'Erscheint im Jahresbericht bei den absetzbaren Ausgaben.' });
Object.assign(en.orc, { dedutivel: 'Tax-deductible', dedutivelDica: 'Shows up in the annual report under deductible expenses.' });
pt.rec.conta = 'Conta'; de.rec.conta = 'Konto'; en.rec.conta = 'Account';
pt.imp.conta = 'Conta do extrato'; de.imp.conta = 'Konto des Auszugs'; en.imp.conta = 'Statement account';

pt.contas = { descPagamento: 'Fatura {n} · {m}',
  titulo: 'Contas', liquido: 'Patrimônio líquido', tenho: 'Tenho', devo: 'Devo', evolucao: 'Últimos 12 meses', nova: 'Nova conta',
  vazio: 'Cadastre suas contas — Girokonto, dinheiro, investimentos, cartões e dívidas — para ver quanto você tem de verdade.', vazioTitulo: 'Nenhuma conta ainda',
  grupos: { corrente: 'Contas e dinheiro', rendimento: 'Contas de rendimento', investimento: 'Investimentos', cartao: 'Cartões de crédito', divida: 'Dívidas' },
  tipos: { corrente: 'Conta corrente', dinheiro: 'Dinheiro', investimento: 'Investimento', divida: 'Dívida', cartao: 'Cartão de crédito' },
  novaTitulo: 'Nova conta', editarTitulo: 'Editar conta', nome: 'Nome', exNome: 'Ex.: Girokonto Sparkasse', instituicao: 'Banco ou instituição', tipo: 'Tipo',
  saldoInicial: 'Saldo atual', valorDevido: 'Valor devido', faturaAberta: 'Já gasto no cartão (opcional)', saldoEm: 'Saldo em', saldoEmDica: 'Lançamentos a partir desta data mudam o saldo.',
  limite: 'Limite', fechamento: 'Dia do fechamento', vencimento: 'Dia do vencimento', pagarCom: 'Paga com', nenhuma: 'Nenhuma', cor: 'Cor',
  arquivar: 'Arquivar conta', reativar: 'Reativar', arquivadas: 'Arquivadas', apagar: 'Apagar conta', apagarConf: 'Apagar a conta?', deNome: 'Dê um nome à conta',
  salva: 'Conta salva', criada: 'Conta criada', apagada: 'Conta apagada', saldo: 'Saldo', transferir: 'Transferir', ajustar: 'Ajustar saldo', atualizarValor: 'Atualizar valor',
  ajustarTitulo: 'Ajustar saldo de “{n}”', novoSaldo: 'Saldo real', ajustarDica: 'Informe o saldo do extrato (ou o valor atual do investimento). A diferença entra como ajuste, sem contar como receita ou despesa.',
  ajustado: 'Saldo ajustado', semAjuste: 'O saldo já está certo.', movimentos: 'Movimentações', semMov: 'Nenhuma movimentação neste mês.', abrir: 'Abrir', jurosMes: 'juros do mês {v}',
  usado: 'Usado', disponivel: 'Disponível', faturaAtual: 'Fatura atual', fecha: 'fecha {d}', vence: 'vence {d}', faturas: 'Faturas', semFaturas: 'Nenhuma compra no cartão ainda.',
  estadoFatura: { aberta: 'Aberta', fechada: 'Fechada', paga: 'Paga', vencida: 'Vencida', vazia: '—' }, pagar: 'Pagar fatura', pagarTitulo: 'Pagar fatura {m}',
  valorPagar: 'Valor', pagamentoOk: 'Pagamento registrado', aPagar: 'A pagar: {v} até {d}', compras: '{n} compras', pago: 'pago {v}', limiteUsado: '{p}% do limite',
  dividaDica: 'Para pagar uma parcela da dívida, faça uma transferência da sua conta para ela.', cartaoDica: 'As compras no cartão contam no orçamento na data da compra. Pagar a fatura é uma transferência, para não contar duas vezes.',
};
de.contas = { descPagamento: 'Abrechnung {n} · {m}',
  titulo: 'Konten', liquido: 'Nettovermögen', tenho: 'Vermögen', devo: 'Schulden', evolucao: 'Letzte 12 Monate', nova: 'Neues Konto',
  vazio: 'Lege deine Konten an — Girokonto, Bargeld, Depots, Kreditkarten und Kredite —, um zu sehen, wie viel du wirklich hast.', vazioTitulo: 'Noch keine Konten',
  grupos: { corrente: 'Konten und Bargeld', rendimento: 'Zinskonten', investimento: 'Geldanlagen', cartao: 'Kreditkarten', divida: 'Kredite' },
  tipos: { corrente: 'Girokonto', dinheiro: 'Bargeld', investimento: 'Geldanlage', divida: 'Kredit', cartao: 'Kreditkarte' },
  novaTitulo: 'Neues Konto', editarTitulo: 'Konto bearbeiten', nome: 'Name', exNome: 'z. B. Girokonto Sparkasse', instituicao: 'Bank oder Institut', tipo: 'Art',
  saldoInicial: 'Aktueller Saldo', valorDevido: 'Offener Betrag', faturaAberta: 'Bereits auf der Karte ausgegeben (optional)', saldoEm: 'Saldo am', saldoEmDica: 'Buchungen ab diesem Datum verändern den Saldo.',
  limite: 'Limit', fechamento: 'Abrechnungstag', vencimento: 'Fälligkeitstag', pagarCom: 'Bezahlt von', nenhuma: 'Keins', cor: 'Farbe',
  arquivar: 'Konto archivieren', reativar: 'Reaktivieren', arquivadas: 'Archiviert', apagar: 'Konto löschen', apagarConf: 'Konto löschen?', deNome: 'Gib dem Konto einen Namen',
  salva: 'Konto gespeichert', criada: 'Konto angelegt', apagada: 'Konto gelöscht', saldo: 'Saldo', transferir: 'Umbuchen', ajustar: 'Saldo korrigieren', atualizarValor: 'Wert aktualisieren',
  ajustarTitulo: 'Saldo von „{n}“ korrigieren', novoSaldo: 'Tatsächlicher Saldo', ajustarDica: 'Trage den Saldo laut Auszug (oder den aktuellen Depotwert) ein. Die Differenz wird als Korrektur gebucht, nicht als Einnahme oder Ausgabe.',
  ajustado: 'Saldo korrigiert', semAjuste: 'Der Saldo stimmt bereits.', movimentos: 'Bewegungen', semMov: 'Keine Bewegungen in diesem Monat.', abrir: 'Öffnen', jurosMes: 'Zinsen im Monat {v}',
  usado: 'Genutzt', disponivel: 'Verfügbar', faturaAtual: 'Aktuelle Abrechnung', fecha: 'Abrechnung {d}', vence: 'fällig {d}', faturas: 'Abrechnungen', semFaturas: 'Noch keine Kartenumsätze.',
  estadoFatura: { aberta: 'Offen', fechada: 'Abgerechnet', paga: 'Bezahlt', vencida: 'Überfällig', vazia: '—' }, pagar: 'Abrechnung bezahlen', pagarTitulo: 'Abrechnung {m} bezahlen',
  valorPagar: 'Betrag', pagamentoOk: 'Zahlung erfasst', aPagar: 'Zu zahlen: {v} bis {d}', compras: '{n} Umsätze', pago: 'bezahlt {v}', limiteUsado: '{p} % des Limits',
  dividaDica: 'Um eine Rate zu zahlen, buche von deinem Konto auf den Kredit um.', cartaoDica: 'Kartenumsätze zählen am Kaufdatum zum Budget. Das Bezahlen der Abrechnung ist eine Umbuchung, damit nichts doppelt zählt.',
};
en.contas = { descPagamento: '{n} statement · {m}',
  titulo: 'Accounts', liquido: 'Net worth', tenho: 'Assets', devo: 'Debts', evolucao: 'Last 12 months', nova: 'New account',
  vazio: 'Add your accounts — current account, cash, investments, cards and loans — to see what you really have.', vazioTitulo: 'No accounts yet',
  grupos: { corrente: 'Accounts and cash', rendimento: 'Savings accounts', investimento: 'Investments', cartao: 'Credit cards', divida: 'Loans' },
  tipos: { corrente: 'Current account', dinheiro: 'Cash', investimento: 'Investment', divida: 'Loan', cartao: 'Credit card' },
  novaTitulo: 'New account', editarTitulo: 'Edit account', nome: 'Name', exNome: 'e.g. Sparkasse current account', instituicao: 'Bank or institution', tipo: 'Type',
  saldoInicial: 'Current balance', valorDevido: 'Amount owed', faturaAberta: 'Already spent on the card (optional)', saldoEm: 'Balance on', saldoEmDica: 'Transactions from this date change the balance.',
  limite: 'Limit', fechamento: 'Statement day', vencimento: 'Due day', pagarCom: 'Paid from', nenhuma: 'None', cor: 'Colour',
  arquivar: 'Archive account', reativar: 'Reactivate', arquivadas: 'Archived', apagar: 'Delete account', apagarConf: 'Delete the account?', deNome: 'Give the account a name',
  salva: 'Account saved', criada: 'Account created', apagada: 'Account deleted', saldo: 'Balance', transferir: 'Transfer', ajustar: 'Adjust balance', atualizarValor: 'Update value',
  ajustarTitulo: 'Adjust “{n}” balance', novoSaldo: 'Actual balance', ajustarDica: 'Enter the statement balance (or the investment’s current value). The difference is recorded as an adjustment, not as income or expense.',
  ajustado: 'Balance adjusted', semAjuste: 'The balance is already right.', movimentos: 'Activity', semMov: 'No activity this month.', abrir: 'Open', jurosMes: 'interest this month {v}',
  usado: 'Used', disponivel: 'Available', faturaAtual: 'Current statement', fecha: 'closes {d}', vence: 'due {d}', faturas: 'Statements', semFaturas: 'No card purchases yet.',
  estadoFatura: { aberta: 'Open', fechada: 'Closed', paga: 'Paid', vencida: 'Overdue', vazia: '—' }, pagar: 'Pay statement', pagarTitulo: 'Pay {m} statement',
  valorPagar: 'Amount', pagamentoOk: 'Payment recorded', aPagar: 'To pay: {v} by {d}', compras: '{n} purchases', pago: 'paid {v}', limiteUsado: '{p}% of limit',
  dividaDica: 'To pay an instalment, transfer from your account to the loan.', cartaoDica: 'Card purchases count towards the budget on the purchase date. Paying the statement is a transfer, so nothing is counted twice.',
};

pt.viag = {
  titulo: 'Viagens', sub: 'Um orçamento para cada viagem, com gastos em qualquer moeda.', nova: 'Nova viagem', vazioTitulo: 'Nenhuma viagem ainda',
  vazio: 'Crie a viagem com o orçamento. Ao lançar um gasto, escolha a viagem: o app soma tudo na moeda da viagem pelo câmbio do dia.',
  gasto: 'Gasto', de: 'de', restante: 'Sobram {v}', passou: 'Passou {v} do previsto', porDia: 'Pode gastar {v} por dia', fase: { futura: 'Em breve', 'em-andamento': 'Agora', encerrada: 'Encerrada' },
  estado: { ok: 'Dentro', alerta: 'Atenção', estourado: 'Estourado', 'sem-orcamento': 'Sem orçamento' }, porMoeda: 'Pago em', porCategoria: 'Por categoria', lancamentos: 'Gastos',
  semGastos: 'Nenhum gasto nesta viagem ainda.', novaTitulo: 'Nova viagem', editarTitulo: 'Editar viagem', nome: 'Destino ou nome', exNome: 'Ex.: Rio de Janeiro',
  orcamento: 'Orçamento', inicio: 'Ida', fim: 'Volta', cambioNota: 'Valores convertidos pelo câmbio do dia de cada gasto.', dica: 'Para somar um gasto, escolha a viagem ao lançar.',
  apagar: 'Apagar viagem', apagarConf: 'Apagar? Os gastos continuam nos lançamentos.', arquivar: 'Arquivar', reativar: 'Reativar', arquivadas: 'Arquivadas',
  salva: 'Viagem salva', apagada: 'Viagem apagada', deNome: 'Dê um nome à viagem', dias: '{n} dias', adicionarGasto: 'Adicionar gasto',
};
de.viag = {
  titulo: 'Reisen', sub: 'Ein Budget pro Reise, mit Ausgaben in jeder Währung.', nova: 'Neue Reise', vazioTitulo: 'Noch keine Reisen',
  vazio: 'Lege die Reise mit Budget an. Wähle beim Buchen die Reise: Die App rechnet alles zum Tageskurs in die Reisewährung um.',
  gasto: 'Ausgegeben', de: 'von', restante: 'Noch {v}', passou: '{v} über dem Plan', porDia: 'Noch {v} pro Tag', fase: { futura: 'Bald', 'em-andamento': 'Jetzt', encerrada: 'Beendet' },
  estado: { ok: 'Im Rahmen', alerta: 'Achtung', estourado: 'Überschritten', 'sem-orcamento': 'Ohne Budget' }, porMoeda: 'Bezahlt in', porCategoria: 'Nach Kategorie', lancamentos: 'Ausgaben',
  semGastos: 'Noch keine Ausgaben für diese Reise.', novaTitulo: 'Neue Reise', editarTitulo: 'Reise bearbeiten', nome: 'Ziel oder Name', exNome: 'z. B. Rio de Janeiro',
  orcamento: 'Budget', inicio: 'Hinreise', fim: 'Rückreise', cambioNota: 'Umgerechnet zum Tageskurs jeder Ausgabe.', dica: 'Wähle beim Buchen die Reise, um eine Ausgabe hinzuzufügen.',
  apagar: 'Reise löschen', apagarConf: 'Löschen? Die Ausgaben bleiben in den Buchungen.', arquivar: 'Archivieren', reativar: 'Reaktivieren', arquivadas: 'Archiviert',
  salva: 'Reise gespeichert', apagada: 'Reise gelöscht', deNome: 'Gib der Reise einen Namen', dias: '{n} Tage', adicionarGasto: 'Ausgabe hinzufügen',
};
en.viag = {
  titulo: 'Trips', sub: 'A budget for each trip, with spending in any currency.', nova: 'New trip', vazioTitulo: 'No trips yet',
  vazio: 'Create the trip with its budget. When you add an expense, pick the trip: the app adds everything up in the trip’s currency at each day’s rate.',
  gasto: 'Spent', de: 'of', restante: '{v} left', passou: '{v} over plan', porDia: 'You can spend {v} a day', fase: { futura: 'Upcoming', 'em-andamento': 'Now', encerrada: 'Ended' },
  estado: { ok: 'On track', alerta: 'Watch', estourado: 'Over', 'sem-orcamento': 'No budget' }, porMoeda: 'Paid in', porCategoria: 'By category', lancamentos: 'Expenses',
  semGastos: 'No expenses on this trip yet.', novaTitulo: 'New trip', editarTitulo: 'Edit trip', nome: 'Destination or name', exNome: 'e.g. Rio de Janeiro',
  orcamento: 'Budget', inicio: 'Departure', fim: 'Return', cambioNota: 'Converted at each expense’s daily rate.', dica: 'To add an expense, pick the trip when you record it.',
  apagar: 'Delete trip', apagarConf: 'Delete? The expenses stay in your transactions.', arquivar: 'Archive', reativar: 'Reactivate', arquivadas: 'Archived',
  salva: 'Trip saved', apagada: 'Trip deleted', deNome: 'Give the trip a name', dias: '{n} days', adicionarGasto: 'Add expense',
};

pt.rel = { metas: 'Guardado em metas e viagens', metasNota: 'Sai do saldo: depósitos menos retiradas.',
  titulo: 'Relatório anual', entradas: 'Entradas', saidas: 'Saídas', rendimentos: 'Rendimentos', saldo: 'Saldo', porMes: 'Mês a mês', despesasCat: 'Despesas por categoria',
  receitasCat: 'Receitas por categoria', total: 'Total', media: 'Média/mês', dedutiveis: 'Despesas dedutíveis', dedutiveisDica: 'Categorias marcadas como “dedutível no imposto” em Orçamento. Útil para a Steuererklärung.',
  semDedutiveis: 'Nenhuma despesa dedutível neste ano. Marque as categorias em Orçamento → categoria → “Dedutível no imposto”.', exportar: 'Exportar CSV', exportarDed: 'Exportar dedutíveis',
  semDados: 'Nenhum lançamento neste ano.', rendimentosNota: 'Juros das contas de rendimento, já incluídos no patrimônio.', moeda: 'Valores em {m}',
};
de.rel = { metas: 'Für Sparziele und Reisen', metasNota: 'Wird vom Saldo abgezogen: Einzahlungen minus Entnahmen.',
  titulo: 'Jahresbericht', entradas: 'Einnahmen', saidas: 'Ausgaben', rendimentos: 'Zinsen', saldo: 'Saldo', porMes: 'Monat für Monat', despesasCat: 'Ausgaben nach Kategorie',
  receitasCat: 'Einnahmen nach Kategorie', total: 'Gesamt', media: 'Ø/Monat', dedutiveis: 'Absetzbare Ausgaben', dedutiveisDica: 'Kategorien, die im Budget als „steuerlich absetzbar“ markiert sind. Praktisch für die Steuererklärung.',
  semDedutiveis: 'Keine absetzbaren Ausgaben in diesem Jahr. Markiere Kategorien unter Budget → Kategorie → „Steuerlich absetzbar“.', exportar: 'CSV exportieren', exportarDed: 'Absetzbares exportieren',
  semDados: 'Keine Buchungen in diesem Jahr.', rendimentosNota: 'Zinsen der Zinskonten, bereits im Vermögen enthalten.', moeda: 'Beträge in {m}',
};
en.rel = { metas: 'Set aside for goals and trips', metasNota: 'Taken off the balance: deposits minus withdrawals.',
  titulo: 'Annual report', entradas: 'Income', saidas: 'Expenses', rendimentos: 'Interest', saldo: 'Balance', porMes: 'Month by month', despesasCat: 'Expenses by category',
  receitasCat: 'Income by category', total: 'Total', media: 'Avg/month', dedutiveis: 'Deductible expenses', dedutiveisDica: 'Categories marked “tax-deductible” under Budget. Handy for your tax return.',
  semDedutiveis: 'No deductible expenses this year. Mark categories under Budget → category → “Tax-deductible”.', exportar: 'Export CSV', exportarDed: 'Export deductibles',
  semDados: 'No transactions this year.', rendimentosNota: 'Interest from savings accounts, already part of net worth.', moeda: 'Amounts in {m}',
};

pt.mais = { titulo: 'Mais', recorrentes: 'Contas fixas e salário que entram todo mês', viagens: 'Orçamento por viagem, em qualquer moeda', relatorio: 'O ano inteiro, por mês e categoria, com dedutíveis', lembretes: 'Lembretes', lembretesDesc: 'Avisos no celular antes de vencer', ajustes: 'Idioma, aparência e backup' };
de.mais = { titulo: 'Mehr', recorrentes: 'Fixkosten und Gehalt, die jeden Monat kommen', viagens: 'Budget pro Reise, in jeder Währung', relatorio: 'Das ganze Jahr nach Monat und Kategorie, mit Absetzbarem', lembretes: 'Erinnerungen', lembretesDesc: 'Hinweise aufs Handy vor Fälligkeiten', ajustes: 'Sprache, Darstellung und Backup' };
en.mais = { titulo: 'More', recorrentes: 'Fixed bills and salary that come every month', viagens: 'A budget per trip, in any currency', relatorio: 'The whole year by month and category, with deductibles', lembretes: 'Reminders', lembretesDesc: 'Phone alerts before things are due', ajustes: 'Language, appearance and backup' };

pt.lemb = {
  titulo: 'Lembretes no celular', oque: 'Você recebe aviso de contas recorrentes e faturas de cartão a vencer, e quando uma categoria passa do alerta do orçamento. Os avisos chegam entre 8h e 21h.',
  ativar: 'Ativar notificações', ativas: 'Notificações ativas neste aparelho', desativar: 'Desativar', teste: 'Enviar teste', testeOk: 'Teste enviado',
  naoSuporta: 'Este navegador não recebe notificações.', iphone: 'No iPhone, as notificações funcionam com o app instalado: no Safari, toque em Compartilhar → Adicionar à Tela de Início e abra o app por lá.',
  negado: 'As notificações estão bloqueadas. Libere em Ajustes do iPhone → Notificações → Finanças.', dias: 'Avisar', diasOp: { 0: 'No dia', 1: '1 dia antes', 2: '2 dias antes', 3: '3 dias antes' },
  demo: 'Na demonstração as notificações ficam desligadas.', ativadas: 'Notificações ativadas', desativadas: 'Notificações desativadas', erro: 'Não foi possível ativar as notificações.',
};
de.lemb = {
  titulo: 'Erinnerungen aufs Handy', oque: 'Du wirst an fällige Daueraufträge und Kreditkartenabrechnungen erinnert und wenn eine Kategorie die Budgetwarnung überschreitet. Hinweise kommen zwischen 8 und 21 Uhr.',
  ativar: 'Benachrichtigungen aktivieren', ativas: 'Benachrichtigungen auf diesem Gerät aktiv', desativar: 'Deaktivieren', teste: 'Test senden', testeOk: 'Test gesendet',
  naoSuporta: 'Dieser Browser kann keine Benachrichtigungen empfangen.', iphone: 'Auf dem iPhone funktionieren Benachrichtigungen mit der installierten App: in Safari auf Teilen → Zum Home-Bildschirm tippen und die App von dort öffnen.',
  negado: 'Benachrichtigungen sind blockiert. Erlaube sie unter Einstellungen → Mitteilungen → Finanzen.', dias: 'Erinnern', diasOp: { 0: 'Am Tag', 1: '1 Tag vorher', 2: '2 Tage vorher', 3: '3 Tage vorher' },
  demo: 'In der Demo sind Benachrichtigungen ausgeschaltet.', ativadas: 'Benachrichtigungen aktiviert', desativadas: 'Benachrichtigungen deaktiviert', erro: 'Benachrichtigungen konnten nicht aktiviert werden.',
};
en.lemb = {
  titulo: 'Phone reminders', oque: 'You’ll be reminded of upcoming recurring bills and card statements, and when a category passes its budget alert. Reminders arrive between 8 am and 9 pm.',
  ativar: 'Turn on notifications', ativas: 'Notifications on for this device', desativar: 'Turn off', teste: 'Send test', testeOk: 'Test sent',
  naoSuporta: 'This browser can’t receive notifications.', iphone: 'On iPhone, notifications work with the installed app: in Safari tap Share → Add to Home Screen, then open the app from there.',
  negado: 'Notifications are blocked. Allow them in iPhone Settings → Notifications → Finances.', dias: 'Remind me', diasOp: { 0: 'On the day', 1: '1 day before', 2: '2 days before', 3: '3 days before' },
  demo: 'Notifications are off in the demo.', ativadas: 'Notifications turned on', desativadas: 'Notifications turned off', erro: 'Couldn’t turn on notifications.',
};


pt.orig = {
  deOnde: 'De onde sai o dinheiro?', paraOnde: 'Para onde volta o dinheiro?', nenhuma: 'Não descontar de nenhuma conta', nenhumaVolta: 'Não devolver a nenhuma conta',
  saiDaConta: 'Sai da conta ({m})', voltaNaConta: 'Entra na conta ({m})', depois: 'Saldo de {n} depois', negativa: 'A conta vai ficar negativa.',
  semContas: 'Cadastre uma conta corrente em Contas para descontar o valor do saldo.',
  dicaMeta: 'O valor sai do saldo da conta e fica guardado na meta. O patrimônio não muda.', dicaMetaVolta: 'O valor sai da meta e volta para o saldo da conta.',
};
de.orig = {
  deOnde: 'Von welchem Konto?', paraOnde: 'Auf welches Konto zurück?', nenhuma: 'Von keinem Konto abziehen', nenhumaVolta: 'Auf kein Konto zurückbuchen',
  saiDaConta: 'Abbuchung vom Konto ({m})', voltaNaConta: 'Gutschrift aufs Konto ({m})', depois: 'Saldo {n} danach', negativa: 'Das Konto rutscht ins Minus.',
  semContas: 'Lege unter Konten ein Girokonto an, um den Betrag vom Saldo abzuziehen.',
  dicaMeta: 'Der Betrag geht vom Kontosaldo ab und liegt im Sparziel. Dein Vermögen ändert sich nicht.', dicaMetaVolta: 'Der Betrag geht aus dem Sparziel zurück aufs Konto.',
};
en.orig = {
  deOnde: 'Where is the money coming from?', paraOnde: 'Where does the money go back to?', nenhuma: 'Don’t take it from an account', nenhumaVolta: 'Don’t put it back in an account',
  saiDaConta: 'Taken from account ({m})', voltaNaConta: 'Back into account ({m})', depois: '{n} balance after', negativa: 'The account will go negative.',
  semContas: 'Add a current account under Accounts to take the amount from its balance.',
  dicaMeta: 'The amount leaves the account balance and sits in the goal. Your net worth doesn’t change.', dicaMetaVolta: 'The amount leaves the goal and goes back to the account.',
};
Object.assign(pt.erro, { conta_origem_invalida: 'Escolha uma conta corrente, dinheiro ou investimento.' });
Object.assign(de.erro, { conta_origem_invalida: 'Wähle ein Girokonto, Bargeld oder ein Depot.' });
Object.assign(en.erro, { conta_origem_invalida: 'Choose a current account, cash or an investment account.' });
Object.assign(pt.lanc, { daReserva: 'dinheiro separado', dinheiroSeparado: 'Dinheiro da viagem ({v})', sep: { meta: 'Guardado na meta', metaVolta: 'Retirado da meta', viagem: 'Separado para a viagem', viagemVolta: 'Devolvido da viagem' } });
Object.assign(de.lanc, { daReserva: 'Reisegeld', dinheiroSeparado: 'Reisegeld ({v})', sep: { meta: 'Ins Sparziel', metaVolta: 'Aus dem Sparziel', viagem: 'Für die Reise zurückgelegt', viagemVolta: 'Von der Reise zurück' } });
Object.assign(en.lanc, { daReserva: 'trip money', dinheiroSeparado: 'Trip money ({v})', sep: { meta: 'Saved into goal', metaVolta: 'Taken from goal', viagem: 'Set aside for trip', viagemVolta: 'Returned from trip' } });
Object.assign(pt.viag, {
  separado: 'Dinheiro separado', separadoDica: 'Reserve um valor para gastar na viagem: do saldo do mês, da poupança ou de uma conta ou cartão. Os gastos pagos com ele saem daqui.',
  separar: 'Separar dinheiro para a viagem', separarMais: 'Separar mais', separarCurto: 'Separar', devolver: 'Devolver sobra', separadoResumo: 'Separado {s} · gasto com ele {g}',
  separadoDe: 'Separado de {n}', devolvidoPara: 'Devolvido para {n}', separarTitulo: 'Separar para “{n}”', devolverTitulo: 'Devolver para a conta',
  separarDica: 'O valor sai do saldo da conta e fica reservado para a viagem.', devolverDica: 'O que sobrou volta para o saldo da conta.',
  sobra: 'Sobra {v}', devolverMais: 'Só há {v} separado.', devolvido: 'Valor devolvido à conta', separadoOk: 'Dinheiro separado', reservaApagada: 'Movimento apagado',
});
Object.assign(de.viag, {
  separado: 'Reisegeld', separadoDica: 'Leg einen Betrag für die Reise zurück: aus dem Monatssaldo, dem Ersparten oder von einem Konto oder einer Karte. Ausgaben damit werden hier abgezogen.',
  separar: 'Geld für die Reise zurücklegen', separarMais: 'Mehr zurücklegen', separarCurto: 'Zurücklegen', devolver: 'Rest zurückbuchen', separadoResumo: 'Zurückgelegt {s} · davon ausgegeben {g}',
  separadoDe: 'Von {n}', devolvidoPara: 'Zurück auf {n}', separarTitulo: 'Für „{n}“ zurücklegen', devolverTitulo: 'Aufs Konto zurückbuchen',
  separarDica: 'Der Betrag geht vom Kontosaldo ab und ist für die Reise reserviert.', devolverDica: 'Der Rest geht zurück auf das Konto.',
  sobra: 'Noch {v}', devolverMais: 'Es sind nur {v} zurückgelegt.', devolvido: 'Zurückgebucht', separadoOk: 'Geld zurückgelegt', reservaApagada: 'Gelöscht',
});
Object.assign(en.viag, {
  separado: 'Trip money', separadoDica: 'Set an amount aside to spend on the trip: from the month’s balance, your savings, or an account or card. Expenses paid with it come out of here.',
  separar: 'Set money aside for the trip', separarMais: 'Set aside more', separarCurto: 'Set aside', devolver: 'Return what’s left', separadoResumo: 'Set aside {s} · spent from it {g}',
  separadoDe: 'From {n}', devolvidoPara: 'Back to {n}', separarTitulo: 'Set aside for “{n}”', devolverTitulo: 'Return to account',
  separarDica: 'The amount leaves the account balance and is reserved for the trip.', devolverDica: 'What’s left goes back to the account balance.',
  sobra: '{v} left', devolverMais: 'Only {v} is set aside.', devolvido: 'Returned to account', separadoOk: 'Money set aside', reservaApagada: 'Deleted',
});
Object.assign(pt.contas.grupos, { separado: 'Separado para metas e viagens' });
Object.assign(de.contas.grupos, { separado: 'Für Sparziele und Reisen zurückgelegt' });
Object.assign(en.contas.grupos, { separado: 'Set aside for goals and trips' });


Object.assign(pt.metas, {
  suasMetas: 'Metas', poupancaSub: 'Dinheiro guardado que se acumula todo mês', esteMes: 'Este mês: {v}', todoMes: 'Todo mês: {v} no dia {d}',
  ativarMensal: 'Guardar automaticamente todo mês', automatico: 'Depósito automático', pagou: 'Pagou: {d}',
  mensalTitulo: 'Guardar todo mês', mensalNenhum: 'Desligado', mensalDica: 'O valor entra sozinho no dia escolhido e sai do saldo do mês. Começa a partir de agora.',
});
Object.assign(de.metas, {
  suasMetas: 'Sparziele', poupancaSub: 'Erspartes, das jeden Monat wächst', esteMes: 'Diesen Monat: {v}', todoMes: 'Monatlich: {v} am {d}.',
  ativarMensal: 'Jeden Monat automatisch sparen', automatico: 'Automatische Einzahlung', pagou: 'Bezahlt: {d}',
  mensalTitulo: 'Jeden Monat sparen', mensalNenhum: 'Aus', mensalDica: 'Der Betrag wird am gewählten Tag automatisch eingezahlt und vom Monatssaldo abgezogen. Gilt ab jetzt.',
});
Object.assign(en.metas, {
  suasMetas: 'Goals', poupancaSub: 'Money set aside that grows every month', esteMes: 'This month: {v}', todoMes: 'Every month: {v} on day {d}',
  ativarMensal: 'Save automatically every month', automatico: 'Automatic deposit', pagou: 'Paid: {d}',
  mensalTitulo: 'Save every month', mensalNenhum: 'Off', mensalDica: 'The amount goes in automatically on the chosen day and comes off the month’s balance. Starts from now.',
});
Object.assign(pt.lanc, {
  pagarCom: 'Pagar com', saldoDoMes: 'Saldo do mês · {v}', saldoDoMesCurto: 'Saldo do mês', semSaldo: 'O saldo do mês não cobre este gasto (disponível {v}).',
  usarPoupanca: 'Pagar com {n} ({v})', ficaEm: 'Fica em {n}', pagarComDica: 'O valor sai do dinheiro guardado. O gasto conta no orçamento, mas não tira do saldo do mês.', daMeta: 'de {n}',
});
Object.assign(de.lanc, {
  pagarCom: 'Bezahlen mit', saldoDoMes: 'Monatssaldo · {v}', saldoDoMesCurto: 'Monatssaldo', semSaldo: 'Der Monatssaldo reicht nicht für diese Ausgabe (verfügbar {v}).',
  usarPoupanca: 'Mit {n} bezahlen ({v})', ficaEm: 'Danach in {n}', pagarComDica: 'Der Betrag kommt aus dem Ersparten. Die Ausgabe zählt im Budget, verringert aber nicht den Monatssaldo.', daMeta: 'aus {n}',
});
Object.assign(en.lanc, {
  pagarCom: 'Pay with', saldoDoMes: 'Month’s balance · {v}', saldoDoMesCurto: 'Month’s balance', semSaldo: 'The month’s balance doesn’t cover this expense ({v} available).',
  usarPoupanca: 'Pay with {n} ({v})', ficaEm: 'Left in {n}', pagarComDica: 'The amount comes out of your savings. The expense counts in the budget but doesn’t reduce the month’s balance.', daMeta: 'from {n}',
});

Object.assign(pt.viag, { doSaldo: 'Do saldo do mês', devolvidoSaldo: 'Devolvido ao saldo do mês', grupoGuardado: 'Dinheiro guardado', grupoContas: 'Contas e cartões', ficaEm: 'Fica em {n}',
  origemDica: { saldo: 'Sai do saldo deste mês. Os gastos pagos com este dinheiro não tiram do saldo de novo.', meta: 'Sai do dinheiro guardado; o saldo do mês não muda.',
    conta: 'Sai do saldo da conta (no cartão, entra na fatura) e é descontado do saldo do mês.', volta: 'O que sobrou volta para onde você escolher.' } });
Object.assign(de.viag, { doSaldo: 'Aus dem Monatssaldo', devolvidoSaldo: 'Zurück in den Monatssaldo', grupoGuardado: 'Erspartes', grupoContas: 'Konten und Karten', ficaEm: 'Danach in {n}',
  origemDica: { saldo: 'Kommt aus dem Saldo dieses Monats. Ausgaben damit verringern den Saldo nicht noch einmal.', meta: 'Kommt aus dem Ersparten; der Monatssaldo ändert sich nicht.',
    conta: 'Geht vom Kontosaldo ab (bei der Karte in die Abrechnung) und vom Monatssaldo.', volta: 'Der Rest geht dorthin zurück, wo du willst.' } });
Object.assign(en.viag, { doSaldo: 'From the month’s balance', devolvidoSaldo: 'Returned to the month’s balance', grupoGuardado: 'Savings', grupoContas: 'Accounts and cards', ficaEm: 'Left in {n}',
  origemDica: { saldo: 'Comes out of this month’s balance. Expenses paid with it don’t reduce the balance again.', meta: 'Comes out of your savings; the month’s balance doesn’t change.',
    conta: 'Leaves the account balance (on a card, it goes on the statement) and comes off the month’s balance.', volta: 'What’s left goes back wherever you choose.' } });


Object.assign(pt.metas, {
  objetivoPoupanca: 'Objetivo (opcional)', alvoOpcional: 'Valor a atingir', porMesCurto: '{v}/mês para chegar lá',
  sal: {
    titulo: 'Distribuir o salário (Einkommensverteiler)', sub: 'Quando o salário cair, uma parte vem para cá automaticamente.', ativar: 'Distribuir parte do salário para cá',
    modo: { excedente: 'Excedente', pct: 'Porcentagem', fixo: 'Valor fixo' }, pct: 'Porcentagem (%)', acimaDe: 'Guardar o que passar de ({m})', aPartirDe: 'Só se o salário for a partir de ({m})',
    qualquer: 'Qualquer valor', categoria: 'Categoria do salário', semConta: 'Não descontar de conta', informeLimite: 'Informe a partir de qual valor guardar.',
    exemplo: 'Com o último salário de {s}, vão {v} para {n}.', explica: { excedente: 'Tudo o que passar de {l} vai para cá.', pct: '{v} de cada salário vai para cá.', fixo: '{v} de cada salário vai para cá.' },
    dica: 'Vale para os salários lançados a partir de agora (à mão, recorrentes ou importados). O valor sai do saldo do mês.', doSalario: 'Do salário (distribuição)',
    resumo: { excedente: 'Salário: guarda o que passar de {l}', comLimite: 'Salário: guarda {v} quando for a partir de {l}', semLimite: 'Salário: guarda {v}' },
  },
});
Object.assign(de.metas, {
  objetivoPoupanca: 'Ziel (optional)', alvoOpcional: 'Zielbetrag', porMesCurto: '{v}/Monat bis zum Ziel',
  sal: {
    titulo: 'Einkommensverteiler', sub: 'Wenn das Gehalt eingeht, fließt automatisch ein Teil hierher.', ativar: 'Einen Teil des Gehalts hierher verteilen',
    modo: { excedente: 'Überschuss', pct: 'Prozent', fixo: 'Festbetrag' }, pct: 'Prozent (%)', acimaDe: 'Alles über ({m}) sparen', aPartirDe: 'Nur ab einem Gehalt von ({m})',
    qualquer: 'Jeder Betrag', categoria: 'Gehaltskategorie', semConta: 'Von keinem Konto abziehen', informeLimite: 'Gib an, ab welchem Betrag gespart wird.',
    exemplo: 'Beim letzten Gehalt von {s} gehen {v} an {n}.', explica: { excedente: 'Alles über {l} fließt hierher.', pct: '{v} jedes Gehalts fließen hierher.', fixo: '{v} jedes Gehalts fließen hierher.' },
    dica: 'Gilt für Gehälter ab jetzt (manuell, Dauerauftrag oder Import). Der Betrag wird vom Monatssaldo abgezogen.', doSalario: 'Aus dem Gehalt (Verteiler)',
    resumo: { excedente: 'Gehalt: spart alles über {l}', comLimite: 'Gehalt: spart {v} ab {l}', semLimite: 'Gehalt: spart {v}' },
  },
});
Object.assign(en.metas, {
  objetivoPoupanca: 'Goal (optional)', alvoOpcional: 'Target amount', porMesCurto: '{v}/month to get there',
  sal: {
    titulo: 'Split your salary', sub: 'When your salary arrives, part of it comes here automatically.', ativar: 'Send part of your salary here',
    modo: { excedente: 'Surplus', pct: 'Percentage', fixo: 'Fixed amount' }, pct: 'Percentage (%)', acimaDe: 'Save everything above ({m})', aPartirDe: 'Only if the salary is at least ({m})',
    qualquer: 'Any amount', categoria: 'Salary category', semConta: 'Don’t take it from an account', informeLimite: 'Enter the amount above which to save.',
    exemplo: 'With your last salary of {s}, {v} would go to {n}.', explica: { excedente: 'Everything above {l} comes here.', pct: '{v} of each salary comes here.', fixo: '{v} of each salary comes here.' },
    dica: 'Applies to salaries from now on (manual, recurring or imported). The amount comes off the month’s balance.', doSalario: 'From salary (split)',
    resumo: { excedente: 'Salary: saves everything above {l}', comLimite: 'Salary: saves {v} from {l}', semLimite: 'Salary: saves {v}' },
  },
});
Object.assign(pt.erro, { categoria_salario: 'Escolha a categoria do salário.' });
Object.assign(de.erro, { categoria_salario: 'Wähle die Gehaltskategorie.' });
Object.assign(en.erro, { categoria_salario: 'Choose the salary category.' });


Object.assign(pt.metas, { origem: {
  registro: 'Já estava guardado (não descontar)', registroRetirada: 'Só registrar (não devolver a nada)',
  chipSaldo: 'Saldo do mês', chipRegistro: 'Só registro', trocar: 'Tocar para trocar entre saldo do mês e só registro',
  dica: { saldo: 'Sai do saldo deste mês.', conta: 'Sai do saldo da conta e do saldo deste mês.', registro: 'Só registra na meta. Não mexe no saldo do mês nem em conta.',
    saldoVolta: 'Volta para o saldo deste mês.', contaVolta: 'Volta para o saldo da conta e para o saldo deste mês.', registroVolta: 'Só registra a retirada. Não mexe no saldo do mês nem em conta.' },
} });
Object.assign(de.metas, { origem: {
  registro: 'War schon gespart (nicht abziehen)', registroRetirada: 'Nur erfassen (nirgends gutschreiben)',
  chipSaldo: 'Monatssaldo', chipRegistro: 'Nur erfasst', trocar: 'Tippen, um zwischen Monatssaldo und nur erfasst zu wechseln',
  dica: { saldo: 'Wird vom Saldo dieses Monats abgezogen.', conta: 'Wird vom Konto und vom Saldo dieses Monats abgezogen.', registro: 'Nur im Sparziel erfasst. Monatssaldo und Konten bleiben gleich.',
    saldoVolta: 'Geht zurück in den Saldo dieses Monats.', contaVolta: 'Geht zurück aufs Konto und in den Saldo dieses Monats.', registroVolta: 'Nur erfasst. Monatssaldo und Konten bleiben gleich.' },
} });
Object.assign(en.metas, { origem: {
  registro: 'Already saved (don’t deduct)', registroRetirada: 'Just record it (don’t put it anywhere)',
  chipSaldo: 'Month’s balance', chipRegistro: 'Record only', trocar: 'Tap to switch between month’s balance and record only',
  dica: { saldo: 'Comes off this month’s balance.', conta: 'Comes off the account and this month’s balance.', registro: 'Only recorded in the goal. The month’s balance and accounts don’t change.',
    saldoVolta: 'Goes back to this month’s balance.', contaVolta: 'Goes back to the account and this month’s balance.', registroVolta: 'Only recorded. The month’s balance and accounts don’t change.' },
} });

const DICS = { pt, de, en };

const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export function idiomaInicial() {
  const salvo = ler('mf2-idioma');
  if (DICS[salvo]) return salvo;
  const nav = (navigator.language || 'pt').slice(0, 2).toLowerCase();
  return DICS[nav] ? nav : 'pt';
}

const buscar = (dic, chave) => chave.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dic);

export function criarT(idioma) {
  const dic = DICS[idioma] || pt;
  return (chave, vars) => {
    let s = buscar(dic, chave);
    if (s === undefined) s = buscar(pt, chave);
    if (typeof s !== 'string') return s ?? chave;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : s;
  };
}

// tradutor ativo, para código fora do React (ex.: mensagens de erro da API)
let tAtual = criarT('pt');
export const traduzir = (chave, vars) => tAtual(chave, vars);

const Ctx = createContext({ idioma: 'pt', t: tAtual, setIdioma: () => {} });

export function ProvedorIdioma({ children }) {
  const [idioma, setIdiomaEstado] = useState(() => {
    const i = idiomaInicial();
    definirIdioma(IDIOMAS.find((x) => x.id === i).locale);
    tAtual = criarT(i);
    return i;
  });
  const setIdioma = useCallback((i) => {
    definirIdioma(IDIOMAS.find((x) => x.id === i).locale);
    tAtual = criarT(i);
    gravar('mf2-idioma', i);
    document.documentElement.lang = IDIOMAS.find((x) => x.id === i).locale;
    setIdiomaEstado(i);
  }, []);
  const valor = useMemo(() => ({ idioma, setIdioma, t: criarT(idioma) }), [idioma, setIdioma]);
  return createElement(Ctx.Provider, { value: valor }, children);
}

export const useIdioma = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
