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
