/**
 * Contratos.gs – geração de contrato a partir de um modelo no Google Docs
 *
 * Como funciona:
 * 1. O modelo é um Google Doc com campos entre chaves duplas, ex.: {{contratado_nome}}.
 * 2. O modelo é cadastrado na aba MODELOS_CONTRATO (menu Gestor > Cadastrar modelo de contrato).
 * 3. Na contratação, "Gerar contrato" copia o modelo para a pasta da contratação,
 *    preenche os campos com os dados da instituição (contratante), do contratado,
 *    do projeto e da contratação, e salva um PDF ao lado.
 */

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Lista de campos disponíveis no modelo (aparece na tela para consulta). */
const CAMPOS_CONTRATO_DESC = [
  ['contratante_razao_social', 'Razão social da instituição'],
  ['contratante_nome_fantasia', 'Nome fantasia da instituição'],
  ['contratante_cnpj', 'CNPJ da instituição'],
  ['contratante_endereco_completo', 'Endereço completo da instituição'],
  ['contratante_cidade_uf', 'Cidade/UF da instituição'],
  ['contratante_representante_nome', 'Representante legal da instituição'],
  ['contratante_representante_cpf', 'CPF do representante da instituição'],
  ['contratante_representante_rg', 'RG do representante da instituição'],
  ['contratante_representante_cargo', 'Cargo do representante da instituição'],
  ['contratante_representante_nacionalidade', 'Nacionalidade do representante'],
  ['contratante_representante_estado_civil', 'Estado civil do representante'],
  ['contratante_representante_profissao', 'Profissão do representante'],
  ['foro', 'Foro (cidade/UF; se vazio, usa a cidade da instituição)'],
  ['contratante_rep_o_a', 'Concordância c/ representante da instituição: o / a (ex.: inscrit{{…}})'],
  ['contratante_rep_seu_sua', 'Concordância c/ representante da instituição: seu / sua'],
  ['contratante_rep_do_da', 'Concordância c/ representante da instituição: do / da'],
  ['contratante_rep_ao_a', 'Concordância c/ representante da instituição: ao / à'],
  ['testemunha1_nome', 'Testemunha 1 – nome (cadastro da instituição)'],
  ['testemunha1_cpf', 'Testemunha 1 – CPF'],
  ['testemunha2_nome', 'Testemunha 2 – nome'],
  ['testemunha2_cpf', 'Testemunha 2 – CPF'],
  ['contratado_nome', 'Nome ou razão social do contratado'],
  ['contratado_cpf_cnpj', 'CPF ou CNPJ do contratado'],
  ['contratado_rg', 'RG do contratado (pessoa física)'],
  ['contratado_nacionalidade', 'Nacionalidade do contratado'],
  ['contratado_estado_civil', 'Estado civil do contratado'],
  ['contratado_profissao', 'Profissão do contratado'],
  ['contratado_endereco_completo', 'Endereço completo do contratado'],
  ['contratado_email', 'E-mail do contratado'],
  ['contratado_telefone', 'Telefone do contratado'],
  ['contratado_representante_nome', 'Representante do contratado (empresa)'],
  ['contratado_representante_cpf', 'CPF do representante do contratado'],
  ['contratado_representante_cargo', 'Cargo do representante do contratado'],
  ['contratado_rep_o_a', 'Concordância c/ representante do contratado: o / a'],
  ['contratado_rep_seu_sua', 'Concordância c/ representante do contratado: seu / sua'],
  ['contratado_rep_do_da', 'Concordância c/ representante do contratado: do / da'],
  ['contratado_rep_ao_a', 'Concordância c/ representante do contratado: ao / à'],
  ['contratado_chave_pix', 'Chave PIX do contratado'],
  ['contratado_banco', 'Banco do contratado'],
  ['contratado_agencia', 'Agência do contratado'],
  ['contratado_conta', 'Conta do contratado'],
  ['projeto_nome', 'Nome do projeto'],
  ['projeto_sigla', 'Sigla do projeto'],
  ['num_edital', 'Nº do edital'],
  ['termo_fomento', 'Termo de fomento'],
  ['orgao', 'Órgão do termo de fomento (ex.: SEDEF/PR)'],
  ['num_proposta', 'Nº da proposta'],
  ['data_celebracao', 'Data de celebração do termo'],
  ['rubrica', 'Descrição da rubrica'],
  ['funcao', 'Função (descrição da rubrica, ex.: Educador Social)'],
  ['funcao_maiusculo', 'Função em MAIÚSCULAS (para o título)'],
  ['funcao_minusculo', 'Função em minúsculas (para o meio do texto)'],
  ['carga_horaria', 'Carga horária mensal com extenso, ex.: 60 (sessenta)'],
  ['objeto', 'Objeto da contratação'],
  ['num_parcelas', 'Nº de parcelas'],
  ['valor_parcela', 'Valor da parcela (R$)'],
  ['valor_parcela_extenso', 'Valor da parcela por extenso'],
  ['ultima_parcela_texto', 'Ajuste da última parcela, ex.: ", sendo a última de R$ 2.214,11 (…)" (vazio quando todas são iguais)'],
  ['valor_total', 'Valor total do contrato (R$)'],
  ['valor_total_extenso', 'Valor total por extenso'],
  ['inicio_execucao', 'Início da execução'],
  ['fim_execucao', 'Fim da execução'],
  ['data_assinatura', 'Data de assinatura'],
  ['data_assinatura_extenso', 'Data de assinatura por extenso'],
  ['data_hoje_extenso', 'Data de hoje por extenso'],
  ['data_assinatura_ou_hoje_extenso', 'Data de assinatura por extenso (se vazia, a data de hoje)']
];

// ---------------------------------------------------------------------------
// Formatação

function dataBr_(d) {
  return d instanceof Date ? Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy') : '';
}

function dataExtenso_(d) {
  return d instanceof Date ? d.getDate() + ' de ' + MESES_PT[d.getMonth()] + ' de ' + d.getFullYear() : '';
}

function enderecoCompleto_(o) {
  if (!o) return '';
  // Formato: RUA, Nº (COMPLEMENTO) – BAIRRO, CIDADE/UF, CEP 00000-000
  let txt = [o.endereco, o.numero].filter(String).join(', ');
  if (o.complemento) txt += ' (' + o.complemento + ')';
  const resto = [o.bairro, o.cidade ? o.cidade + (o.uf ? '/' + o.uf : '') : '', o.cep ? 'CEP ' + o.cep : '']
    .filter(String).join(', ');
  return [txt, resto].filter(String).join(' – ');
}

const UNIDADES_PT = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS_PT = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS_PT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos'];

function ate999_(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, partes = [];
  if (c) partes.push(CENTENAS_PT[c]);
  if (r) {
    if (r < 20) partes.push(UNIDADES_PT[r]);
    else partes.push(DEZENAS_PT[Math.floor(r / 10)] + (r % 10 ? ' e ' + UNIDADES_PT[r % 10] : ''));
  }
  return partes.join(' e ');
}

function inteiroExtenso_(n) {
  if (n === 0) return 'zero';
  const nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  const grupos = [];
  while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    const texto = (i === 1 && g === 1) ? 'mil'
      : ate999_(g) + (i ? ' ' + (g === 1 ? nomes[i][0] : nomes[i][1]) : '');
    partes.push({ texto: texto, g: g });
  }
  return partes.map((p, idx) => {
    if (idx === 0) return p.texto;
    const ultimo = idx === partes.length - 1;
    return (ultimo && (p.g < 100 || p.g % 100 === 0) ? ' e ' : ' ') + p.texto;
  }).join('');
}

function valorExtenso_(v) {
  const centavosTotais = Math.round(Number(v || 0) * 100);
  const reais = Math.floor(centavosTotais / 100), cent = centavosTotais % 100;
  const partes = [];
  if (reais) {
    const deReais = reais >= 1000000 && reais % 1000000 === 0;
    partes.push(inteiroExtenso_(reais) + (reais === 1 ? ' real' : (deReais ? ' de reais' : ' reais')));
  }
  if (cent) partes.push(inteiroExtenso_(cent) + (cent === 1 ? ' centavo' : ' centavos'));
  return partes.length ? partes.join(' e ') : 'zero reais';
}

// ---------------------------------------------------------------------------

function montarCamposContrato_(c) {
  const p = buscar_('PROJETOS', 'id_projeto', c.id_projeto) || {};
  const i = buscar_('INSTITUICOES', 'id_instituicao', p.id_instituicao) || {};
  const f = buscar_('FORNECEDORES', 'id_fornecedor', c.id_fornecedor) || {};
  const r = buscar_('RUBRICAS', 'id_rubrica', c.id_rubrica) || {};
  const s = v => (v === null || v === undefined) ? '' : String(v);

  const gRep = generoDe_(i.representante_genero, i.representante_nome);
  const nomeRepCtd = nomeRepresentanteContratado_(f);
  const gCtd = generoDe_(f.representante_genero, nomeRepCtd);
  let horas = Number(c.carga_horaria_mensal) > 0 ? Number(c.carga_horaria_mensal) : 0;
  if (!horas) {
    const proc = ler_('PROCESSOS_COTACAO').find(x => x.id_contratacao === c.id_contratacao);
    if (proc && Number(proc.horas_mensais) > 0) horas = Number(proc.horas_mensais);
  }
  if (!horas && Number(r.carga_horaria) > 0) horas = Number(r.carga_horaria);     // carga horária cadastrada na rubrica

  return Object.assign({
    contratante_razao_social: s(i.razao_social),
    contratante_nome_fantasia: s(i.nome_fantasia),
    contratante_cnpj: s(i.cnpj),
    contratante_endereco_completo: enderecoCompleto_(i),
    contratante_cidade_uf: i.cidade ? i.cidade + (i.uf ? '/' + i.uf : '') : '',
    contratante_representante_nome: s(i.representante_nome),
    contratante_representante_cpf: s(i.representante_cpf),
    contratante_representante_rg: s(i.representante_rg),
    contratante_representante_cargo: s(i.representante_cargo) || 'Presidente',
    contratante_representante_nacionalidade: flexionar_(i.representante_nacionalidade, gRep.g),
    contratante_representante_estado_civil: flexionar_(i.representante_estado_civil, gRep.g),
    contratante_representante_profissao: s(i.representante_profissao),
    foro: s(i.foro_cidade_uf) || (i.cidade ? i.cidade + (i.uf ? '/' + i.uf : '') : ''),
    testemunha1_nome: s(i.testemunha1_nome),
    testemunha1_cpf: s(i.testemunha1_cpf),
    testemunha2_nome: s(i.testemunha2_nome),
    testemunha2_cpf: s(i.testemunha2_cpf),
    contratado_nome: s(f.razao_social),
    contratado_cpf_cnpj: s(f.cnpj_cpf),
    contratado_rg: s(f.rg),
    contratado_nacionalidade: flexionar_(f.nacionalidade, gCtd.g),
    contratado_estado_civil: flexionar_(f.estado_civil, gCtd.g),
    contratado_profissao: s(f.profissao),
    contratado_endereco_completo: enderecoCompleto_(f),
    contratado_email: s(f.email),
    contratado_telefone: s(f.telefone),
    contratado_representante_nome: nomeRepCtd,
    contratado_representante_cpf: s(f.representante_cpf) || (soDigitos_(f.cnpj_cpf).length === 11 ? s(f.cnpj_cpf) : ''),
    contratado_representante_cargo: s(f.representante_cargo),
    contratado_chave_pix: s(f.chave_pix),
    contratado_banco: s(f.banco),
    contratado_agencia: s(f.agencia),
    contratado_conta: s(f.conta),
    projeto_nome: s(p.nome_projeto),
    projeto_sigla: s(p.sigla),
    num_edital: s(p.num_edital),
    termo_fomento: s(p.termo_fomento_cit),
    orgao: s(p.orgao),
    num_proposta: s(p.num_proposta),
    data_celebracao: dataBr_(p.data_celebracao),
    rubrica: s(r.descricao),
    funcao: s(r.descricao),
    funcao_maiusculo: s(r.descricao).toUpperCase(),
    funcao_minusculo: s(r.descricao).toLowerCase(),
    carga_horaria: horas ? horas + ' (' + inteiroExtenso_(horas) + ')' : '',
    objeto: s(c.objeto),
    num_parcelas: s(c.num_parcelas),
    valor_parcela: brl_(c.valor_parcela),
    valor_parcela_extenso: valorExtenso_(c.valor_parcela),
    ultima_parcela_texto: Number(c.valor_ultima_parcela) > 0 && Math.abs(Number(c.valor_ultima_parcela) - Number(c.valor_parcela)) > 0.001
      ? ', sendo a última parcela de ' + brl_(c.valor_ultima_parcela) + ' (' + valorExtenso_(c.valor_ultima_parcela) + ')' : '',
    valor_total: brl_(c.valor_total_contratado),
    valor_total_extenso: valorExtenso_(c.valor_total_contratado),
    inicio_execucao: dataBr_(c.inicio_execucao),
    fim_execucao: dataBr_(c.fim_execucao),
    data_assinatura: dataBr_(c.data_assinatura_contrato),
    data_assinatura_extenso: dataExtenso_(c.data_assinatura_contrato),
    data_hoje_extenso: dataExtenso_(new Date()),
    data_assinatura_ou_hoje_extenso: dataExtenso_(c.data_assinatura_contrato instanceof Date
      ? c.data_assinatura_contrato : new Date()),
    _genero_estimado: [gRep.estimado ? 'representante da instituição (' + (i.representante_nome || '?') + ')' : '',
                       gCtd.estimado ? 'representante do contratado (' + (nomeRepCtd || '?') + ')' : ''].filter(String)
  }, camposGenero_('contratante_rep', gRep.g), camposGenero_('contratado_rep', gCtd.g));
}

/** Troca todas as ocorrências de {{campo}} pelo valor (texto literal, sem regex no valor). */
function substituirCampo_(elemento, campo, valor) {
  const padrao = '\\{\\{\\s*' + campo + '\\s*\\}\\}';
  let r = elemento.findText(padrao);
  while (r) {
    const t = r.getElement().asText();
    const ini = r.getStartOffset();
    // Guarda a formatação do próprio campo (fonte, tamanho, negrito…) para o valor herdar
    const atributos = t.getAttributes(ini);
    const limpos = {};
    Object.keys(atributos).forEach(k => {
      if (atributos[k] !== null && atributos[k] !== undefined && k !== 'LINK_URL') limpos[k] = atributos[k];
    });
    t.deleteText(ini, r.getEndOffsetInclusive());
    if (valor) {
      t.insertText(ini, valor);
      t.setAttributes(ini, ini + valor.length - 1, limpos);
    }
    r = elemento.findText(padrao);
  }
}

/** Campos {{...}} que aparecem no documento (antes do preenchimento). */
function camposNoDocumento_(elementos) {
  const achados = {};
  elementos.forEach(el => camposPendentes_(el).forEach(x => {
    achados[x.replace(/[{}\s]/g, '')] = true;
  }));
  return achados;
}

// ---------------------------------------------------------------------------
// Concordância de gênero

const NOMES_FEMININOS_EXCECAO = ['edione', 'ione', 'beatriz', 'raquel', 'isabel', 'izabel', 'rachel', 'ingrid',
  'miriam', 'mirian', 'carmen', 'ester', 'esther', 'ruth', 'rute', 'nicole', 'denise', 'alice', 'irene',
  'liz', 'luz', 'inês', 'ines', 'cleide', 'jaqueline', 'jacqueline', 'joice', 'gisele', 'giselle', 'simone',
  'daniele', 'danielle', 'michele', 'michelle', 'aline', 'caroline', 'suellen', 'evelyn', 'kelly', 'sueli',
  'sarah', 'yasmin', 'lais', 'laís', 'thaís', 'thais', 'deise', 'solange', 'rosilene', 'eliane', 'cristiane'];
const NOMES_MASCULINOS_EXCECAO = ['luca', 'lucca', 'joshua', 'jonas', 'elias', 'josias', 'isaias', 'matias', 'nicolas'];

/** 'F' ou 'M'. Usa o gênero cadastrado; se não houver, estima pelo primeiro nome. */
function generoDe_(generoCadastrado, nome) {
  const g = String(generoCadastrado || '').toLowerCase();
  if (g.indexOf('fem') === 0) return { g: 'F', estimado: false };
  if (g.indexOf('mas') === 0) return { g: 'M', estimado: false };
  const primeiro = String(nome || '').trim().split(/\s+/)[0].toLowerCase();
  if (!primeiro) return { g: 'M', estimado: true };
  if (NOMES_FEMININOS_EXCECAO.indexOf(primeiro) > -1) return { g: 'F', estimado: true };
  if (NOMES_MASCULINOS_EXCECAO.indexOf(primeiro) > -1) return { g: 'M', estimado: true };
  return { g: /a$/.test(primeiro) ? 'F' : 'M', estimado: true };
}

/** brasileiro/brasileira, casado/casada… acompanhando o gênero. */
function flexionar_(palavra, g) {
  const p = String(palavra || '').trim();
  if (!p) return '';
  if (g === 'F' && /o$/i.test(p)) return p.slice(0, -1) + (p.slice(-1) === 'O' ? 'A' : 'a');
  if (g === 'M' && /a$/i.test(p) && /(eir|ad|id|ss)a$/i.test(p)) return p.slice(0, -1) + (p.slice(-1) === 'A' ? 'O' : 'o');
  return p;
}

function camposGenero_(prefixo, g) {
  const F = g === 'F', o = {};
  o[prefixo + '_o_a'] = F ? 'a' : 'o';
  o[prefixo + '_seu_sua'] = F ? 'sua' : 'seu';
  o[prefixo + '_do_da'] = F ? 'da' : 'do';
  o[prefixo + '_ao_a'] = F ? 'à' : 'ao';
  o[prefixo + '_ele_ela'] = F ? 'ela' : 'ele';
  o[prefixo + '_senhor_senhora'] = F ? 'Senhora' : 'Senhor';
  return o;
}

/** Nome do representante do contratado; se vazio, usa o nome da pessoa (PF ou MEI sem o CNPJ na frente). */
function nomeRepresentanteContratado_(f) {
  if (f.representante_nome) return String(f.representante_nome);
  return String(f.razao_social || '').replace(/^[\d.\-\/\s]+/, '').trim();
}

/** "SEDEF/PR" (com ou sem espaços) escrito à mão nos modelos antigos. */
const ORGAO_ANTIGO_RX = 'SEDEF\\s*/\\s*PR';

/** Troca as ocorrências de um padrão (regex do Docs) por um texto literal, mantendo a formatação do trecho. */
function substituirLiteral_(elemento, padrao, valor) {
  let r = elemento.findText(padrao), guarda = 0;
  while (r && guarda++ < 500) {
    const t = r.getElement().asText();
    const ini = r.getStartOffset();
    const atributos = t.getAttributes(ini), limpos = {};
    Object.keys(atributos).forEach(k => { if (atributos[k] !== null && atributos[k] !== undefined && k !== 'LINK_URL') limpos[k] = atributos[k]; });
    t.deleteText(ini, r.getEndOffsetInclusive());
    t.insertText(ini, valor);
    t.setAttributes(ini, ini + valor.length - 1, limpos);
    r = elemento.findText(padrao, r);
  }
}

/**
 * Rode UMA VEZ no editor (▶ Executar): troca "SEDEF/PR" por {{orgao}} em todos os modelos cadastrados
 * (contrato e cotação). Depois disso o órgão vem sempre do campo "Órgão" do projeto.
 */
function atualizarModelosOrgao() {
  const r = [];
  ler_('MODELOS_CONTRATO').filter(m => m.google_doc_id).forEach(m => {
    try {
      const doc = DocumentApp.openById(m.google_doc_id);
      const partes = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(x => x);
      let n = 0;
      partes.forEach(el => { let a = el.findText(ORGAO_ANTIGO_RX); while (a) { n++; a = el.findText(ORGAO_ANTIGO_RX, a); } });
      partes.forEach(el => substituirLiteral_(el, ORGAO_ANTIGO_RX, '{{orgao}}'));
      doc.saveAndClose();
      r.push((m.nome || m.id_modelo) + ': ' + n + ' troca(s)');
    } catch (e) { r.push((m.nome || m.id_modelo) + ': ERRO – ' + e.message); }
  });
  Logger.log(r.join('\n'));
  return r;
}

function camposPendentes_(elemento) {
  const achados = [];
  let r = elemento.findText('\\{\\{[^}]+\\}\\}');
  while (r) {
    const t = r.getElement().asText().getText();
    achados.push(t.substring(r.getStartOffset(), r.getEndOffsetInclusive() + 1));
    r = elemento.findText('\\{\\{[^}]+\\}\\}', r);
  }
  return achados;
}

function gerarContrato_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const c = buscar_('CONTRATACOES', 'id_contratacao', d.id_contratacao);
  if (!c) throw new Error('Contratação não encontrada.');
  exigirAcessoProjeto_(u, c.id_projeto);

  const p = buscar_('PROJETOS', 'id_projeto', c.id_projeto);
  const modelo = buscar_('MODELOS_CONTRATO', 'id_modelo', d.id_modelo);
  if (!modelo || modelo.ativo !== true || modelo.tipo_modelo === 'Cotação') throw new Error('Selecione um modelo de contrato.');
  if (modelo.id_instituicao && modelo.id_instituicao !== p.id_instituicao) {
    throw new Error('Este modelo é de outra instituição.');
  }

  const campos = montarCamposContrato_(c);
  const forn = buscar_('FORNECEDORES', 'id_fornecedor', c.id_fornecedor) || {};
  const pasta = garantirPastaContratacao_(c.id_contratacao);
  const carimbo = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HHmm');
  const nomeBase = 'Minuta contrato ' + c.id_contratacao + ' - ' + (forn.razao_social || '') + ' (' + carimbo + ')';

  // 1. Copia o modelo e preenche os campos
  const copia = DriveApp.getFileById(modelo.google_doc_id).makeCopy(nomeBase, pasta);
  const doc = DocumentApp.openById(copia.getId());
  const partes = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(x => x);
  const presentes = camposNoDocumento_(partes);
  const descricoes = {};
  CAMPOS_CONTRATO_DESC.forEach(x => { descricoes[x[0]] = x[1]; });
  const vazios = Object.keys(presentes).filter(k => k.charAt(0) !== '_' && campos[k] === '')
    .map(k => descricoes[k] || k);
  Object.keys(campos).filter(k => k.charAt(0) !== '_')
    .forEach(k => partes.forEach(el => substituirCampo_(el, k, campos[k])));
  // Modelos antigos com o órgão escrito à mão: "SEDEF/PR" vira o órgão cadastrado no projeto
  if (campos.orgao) partes.forEach(el => substituirLiteral_(el, ORGAO_ANTIGO_RX, campos.orgao));

  const pendentes = [];
  partes.forEach(el => camposPendentes_(el).forEach(x => { if (pendentes.indexOf(x) === -1) pendentes.push(x); }));
  doc.saveAndClose();

  // 2. Gera o PDF na mesma pasta
  const pdf = pasta.createFile(copia.getAs('application/pdf').setName(nomeBase + '.pdf'));
  inserir_('DOCUMENTOS', {
    id_projeto: c.id_projeto,
    id_contratacao: c.id_contratacao,
    tipo: 'Minuta de contrato',
    nome_arquivo: nomeBase + '.pdf',
    drive_file_id: pdf.getId(),
    url: pdf.getUrl(),
    mime_type: 'application/pdf',
    enviado_por: u.id_usuario,
    enviado_em: new Date()
  });

  if (c.status === 'Em cotação') atualizar_('CONTRATACOES', c._linha, { status: 'Contrato em elaboração' });
  registrarAuditoria_(u.id_usuario, 'CONTRATACOES', c.id_contratacao, 'gerar_contrato', null,
    { modelo: modelo.id_modelo, pdf: pdf.getId() });

  const detalhe = obterContratacao_(u, c.id_contratacao);
  detalhe.contrato_gerado = { pdf_url: pdf.getUrl(), doc_url: copia.getUrl(), pendentes: pendentes,
                              vazios: vazios, genero_estimado: campos._genero_estimado };
  return detalhe;
}

// ---------------------------------------------------------------------------
// Modelos (menu da planilha)

/** Extrai o ID de um link do Google Docs e diz exatamente por que não abre, se for o caso. */
function validarModeloDoc_(url) {
  const m = String(url).match(/\/d\/([-\w]{25,})/) || String(url).match(/[-\w]{25,}/);
  if (!m) throw new Error('Não encontrei o ID do documento nesse link.');
  const id = m[1] || m[0];
  let arquivo;
  try {
    arquivo = DriveApp.getFileById(id);
  } catch (e) {
    throw new Error('O Google não deixou esta planilha acessar o documento.\n\n' +
      'Conta usada pelo sistema: ' + Session.getActiveUser().getEmail() + '\n\n' +
      'Se o documento está em outra conta do Google, compartilhe-o com essa conta como Editor ' +
      '(botão Compartilhar do documento) e tente de novo.\n\nDetalhe técnico: ' + e.message);
  }
  const tipo = arquivo.getMimeType();
  if (tipo !== MimeType.GOOGLE_DOCS) {
    throw new Error('Este link é de um arquivo ' + (tipo.indexOf('word') > -1 ? 'Word (.docx)' : tipo) +
      ', não de um Google Docs.\nAbra-o no Drive > Arquivo > Salvar como Documentos Google, e use o link da cópia nova.');
  }
  try { DocumentApp.openById(id); } catch (e) {
    throw new Error('O documento existe, mas não consegui abri-lo para edição: ' + e.message);
  }
  return { id: id, nome: arquivo.getName() };
}

function cadastrarModeloUI() {
  const ui = SpreadsheetApp.getUi();
  try {
    const url = perguntar_(ui, 'Cadastrar modelo de contrato',
      'Cole o link do Google Doc do modelo.\n(Se o seu modelo está em Word: abra no Drive > Arquivo > Salvar como Documentos Google, e use o link do novo arquivo.)');
    const doc = validarModeloDoc_(url);
    const m = [doc.id];
    const nomeDoc = doc.nome;
    const nome = perguntar_(ui, 'Cadastrar modelo de contrato', 'Nome do modelo (ex.: Prestação de serviço – PF):') || nomeDoc;
    const tipo = perguntar_(ui, 'Cadastrar modelo de contrato',
      'Tipo de despesa (deixe em branco para servir para todos):\n' + LISTAS.tipo_despesa.join('\n'));
    if (tipo && LISTAS.tipo_despesa.indexOf(tipo) === -1) return ui.alert('Tipo de despesa inválido.');
    const inst = perguntar_(ui, 'Cadastrar modelo de contrato',
      'ID da instituição, se o modelo for exclusivo de uma (ex.: INS-0001).\nDeixe em branco para servir para todas.').toUpperCase();
    if (inst && !buscar_('INSTITUICOES', 'id_instituicao', inst)) return ui.alert('Instituição não encontrada.');

    const novo = inserir_('MODELOS_CONTRATO', {
      nome: nome, tipo_despesa: tipo, tipo_pessoa_contratado: '', id_instituicao: inst,
      google_doc_id: m[0], ativo: true, atualizado_em: new Date(), tipo_modelo: 'Contrato'
    });
    ui.alert('Modelo cadastrado: ' + novo.id_modelo + '\n\nJá aparece na tela de contratações.');
  } catch (e) {
    if (e.message !== 'CANCELADO') ui.alert('Erro: ' + e.message);
  }
}

/** Cria um modelo de exemplo com os campos já marcados, para servir de base. */
function criarModeloExemploUI() {
  const ui = SpreadsheetApp.getUi();
  const doc = DocumentApp.create('Modelo – Contrato de prestação de serviços (exemplo)');
  const b = doc.getBody();
  const H = DocumentApp.ParagraphHeading;

  b.appendParagraph('CONTRATO DE PRESTAÇÃO DE SERVIÇOS').setHeading(H.HEADING1)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  b.appendParagraph('Projeto {{projeto_nome}} – Termo de Fomento nº {{termo_fomento}}')
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  b.appendParagraph('');
  b.appendParagraph('CONTRATANTE: {{contratante_razao_social}}, inscrita no CNPJ sob o nº {{contratante_cnpj}}, ' +
    'com sede em {{contratante_endereco_completo}}, neste ato representada por {{contratante_representante_nome}}, ' +
    '{{contratante_representante_nacionalidade}}, {{contratante_representante_estado_civil}}, ' +
    '{{contratante_representante_cargo}}, portador(a) do CPF nº {{contratante_representante_cpf}}.');
  b.appendParagraph('CONTRATADO(A): {{contratado_nome}}, inscrito(a) no CPF/CNPJ sob o nº {{contratado_cpf_cnpj}}, ' +
    '{{contratado_nacionalidade}}, {{contratado_estado_civil}}, {{contratado_profissao}}, ' +
    'residente/sediado(a) em {{contratado_endereco_completo}}.');
  b.appendParagraph('As partes acima identificadas têm entre si justo e contratado o seguinte:');

  b.appendParagraph('CLÁUSULA PRIMEIRA – DO OBJETO').setHeading(H.HEADING3);
  b.appendParagraph('O presente contrato tem por objeto {{objeto}}, no âmbito do projeto {{projeto_nome}} ' +
    '(Edital nº {{num_edital}}), rubrica "{{rubrica}}".');

  b.appendParagraph('CLÁUSULA SEGUNDA – DO VALOR E DO PAGAMENTO').setHeading(H.HEADING3);
  b.appendParagraph('Pelos serviços, a CONTRATANTE pagará o valor total de {{valor_total}} ({{valor_total_extenso}}), ' +
    'em {{num_parcelas}} parcela(s) mensal(is) de {{valor_parcela}} ({{valor_parcela_extenso}}){{ultima_parcela_texto}}, ' +
    'mediante apresentação de nota fiscal, por PIX na chave {{contratado_chave_pix}}.');

  b.appendParagraph('CLÁUSULA TERCEIRA – DA VIGÊNCIA').setHeading(H.HEADING3);
  b.appendParagraph('O presente contrato vigorará de {{inicio_execucao}} a {{fim_execucao}}.');

  b.appendParagraph('CLÁUSULA QUARTA – DO FORO').setHeading(H.HEADING3);
  b.appendParagraph('Fica eleito o foro da comarca de {{foro}} para dirimir quaisquer dúvidas oriundas deste contrato.');

  b.appendParagraph('');
  b.appendParagraph('{{contratante_cidade_uf}}, {{data_assinatura_extenso}}.');
  b.appendParagraph('');
  b.appendParagraph('_______________________________________\n{{contratante_razao_social}}\n{{contratante_representante_nome}}');
  b.appendParagraph('');
  b.appendParagraph('_______________________________________\n{{contratado_nome}}\nCPF/CNPJ {{contratado_cpf_cnpj}}');
  doc.saveAndClose();

  const pastaModelos = config_('pasta_modelos_drive_id');
  if (pastaModelos) DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(pastaModelos));

  const novo = inserir_('MODELOS_CONTRATO', {
    nome: 'Prestação de serviço (exemplo)', tipo_despesa: 'Prestação de serviço', tipo_pessoa_contratado: '',
    id_instituicao: '', google_doc_id: doc.getId(), ativo: true, atualizado_em: new Date()
  });
  ui.alert('Modelo de exemplo criado (' + novo.id_modelo + ').\n\nAbra em:\n' + doc.getUrl() +
    '\n\nSubstitua o texto pelo do seu contrato, mantendo os campos {{...}} onde os dados devem entrar.');
}
