/**
 * Reparo.gs – encontra e corrige IDs repetidos (menu Gestor > Corrigir IDs repetidos)
 *
 * Primeiro mostra o que vai mudar; só altera depois da confirmação.
 * Regra: a 1ª ocorrência de cada ID fica como está; as seguintes ganham ID novo.
 * Os registros ligados a uma contratação ou a um contratado repetido são redistribuídos:
 *  - parcelas: pelo valor da parcela (ex.: 1.700,00 × 2.611,20);
 *  - contratações × contratados: pelo nome do contratado na pasta da contratação no Drive,
 *    e, se não houver pasta, pela ordem em que foram cadastrados;
 *  - documentos: pela pasta do Drive onde o arquivo está.
 */

const ABAS_COM_ID = ['INSTITUICOES', 'USUARIOS', 'PROJETOS', 'RUBRICAS', 'FORNECEDORES', 'CONTRATACOES',
  'PROCESSOS_COTACAO', 'COTACOES', 'PARCELAS', 'NOTAS_FISCAIS', 'PAGAMENTOS', 'DOCUMENTOS',
  'MODELOS_CONTRATO', 'IMPORTACOES_EXTRATO', 'EXTRATO', 'BIMESTRES'];

function corrigirIdsRepetidosUI() {
  const ui = SpreadsheetApp.getUi();
  const plano = planejarReparo_();
  if (!plano.linhas.length) return ui.alert('Nenhum ID repetido encontrado. Está tudo certo. ✓');
  const r = ui.alert('IDs repetidos encontrados',
    plano.linhas.join('\n') + '\n\nAplicar as correções?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  plano.aplicar.forEach(fn => fn());
  registrarAuditoria_('', 'REPARO', '', 'corrigir_ids', null, { alteracoes: plano.linhas.length });
  ui.alert('Correção concluída. ✓\n\nConfira no sistema as contratações citadas e, se precisar, ajuste à mão.');
}

function planejarReparo_() {
  const linhas = [], aplicar = [];
  const novosIds = {};   // aba -> [{ old, novo, linha }]

  // Parcelas repetidas: fica com o ID (e com a NF/pagamento já lançados) a parcela cuja
  // contratação combina com a nota (rubrica na descrição, CNPJ ou nome do emitente).
  const donoParcela = {};
  try {
    const ctrs = {}; ler_('CONTRATACOES').forEach(c => { ctrs[c.id_contratacao] = c; });
    const forns = {}; ler_('FORNECEDORES').forEach(f => { (forns[f.id_fornecedor] = forns[f.id_fornecedor] || []).push(f); });
    const rubs = {}; ler_('RUBRICAS').forEach(r => { rubs[r.id_rubrica] = r; });
    const nfs = {}; ler_('NOTAS_FISCAIS').forEach(n => { nfs[n.id_parcela] = n; });
    const grupos = {};
    ler_('PARCELAS').forEach(x => { (grupos[x.id_parcela] = grupos[x.id_parcela] || []).push(x); });
    Object.keys(grupos).filter(id => grupos[id].length > 1).forEach(id => {
      const nf = nfs[id];
      if (!nf) return;
      let melhor = null, nota = -1;
      grupos[id].forEach(x => {
        const c = ctrs[x.id_contratacao] || {}, r = rubs[c.id_rubrica] || {};
        let pts = 0;
        if (r.descricao && normalizar_(nf.descricao).indexOf(normalizar_(r.descricao)) > -1) pts += 2;
        (forns[c.id_fornecedor] || []).forEach(f => {
          if (nf.cnpj_emitente && soDigitos_(f.cnpj_cpf) === soDigitos_(nf.cnpj_emitente)) pts += 1;
          if (nf.razao_social_emitente && normalizar_(f.razao_social) === normalizar_(nf.razao_social_emitente)) pts += 1;
        });
        if (pts > nota) { nota = pts; melhor = x; }
      });
      if (melhor) donoParcela[id] = melhor._linha;
    });
  } catch (e) {}

  ABAS_COM_ID.forEach(aba => {
    let regs;
    try { regs = ler_(aba); } catch (e) { return; }
    const cab = cabecalho_(aba_(aba))[0];
    const vistos = {};
    if (aba === 'PARCELAS') {
      // a parcela "dona" da nota é tratada como a primeira, para manter o ID
      regs = regs.slice().sort((a, b) => (donoParcela[b.id_parcela] === b._linha) - (donoParcela[a.id_parcela] === a._linha));
    }
    regs.forEach(r => {
      const id = r[cab];
      if (!id) return;
      if (vistos[id]) {
        const novo = gerarIdPrevia_(aba);
        (novosIds[aba] = novosIds[aba] || []).push({ old: id, novo: novo, linha: r._linha, reg: r });
        let desc = '';
        if (aba === 'PARCELAS') desc = ' (parcela ' + r.num_parcela + ' da ' + r.id_contratacao + ')';
        linhas.push('• ' + aba + ' linha ' + r._linha + ': ' + id + ' → ' + novo + desc);
        aplicar.push(() => atualizar_(aba, r._linha, { [cab]: novo }));
      } else vistos[id] = r;
    });
  });

  // Contratados repetidos: decidir qual contratação pertence a qual contratado
  (novosIds.FORNECEDORES || []).forEach(dup => {
    const todasOcorr = ler_('FORNECEDORES').filter(f => f.id_fornecedor === dup.old);
    const ctrs = ler_('CONTRATACOES').filter(c => c.id_fornecedor === dup.old);
    ctrs.forEach((c, i) => {
      let alvo = null;
      const pastaNome = nomePasta_(c.pasta_drive_id);
      if (pastaNome) alvo = todasOcorr.find(f => normalizar_(pastaNome).indexOf(normalizar_(f.razao_social)) > -1);
      if (!alvo) alvo = todasOcorr[Math.min(i, todasOcorr.length - 1)];
      if (alvo && alvo._linha === dup.linha) {
        linhas.push('  ↳ contratação ' + c.id_contratacao + ' (linha ' + c._linha + ') passa a apontar para ' + dup.novo + ' – ' + alvo.razao_social);
        aplicar.push(() => atualizar_('CONTRATACOES', c._linha, { id_fornecedor: dup.novo }));
      }
    });
  });

  // Contratações repetidas: redistribuir parcelas, documentos e cotações
  (novosIds.CONTRATACOES || []).forEach(dup => {
    const nova = dup.reg;
    const primeira = ler_('CONTRATACOES').find(c => c.id_contratacao === dup.old && c._linha !== dup.linha);
    const parcelas = ler_('PARCELAS').filter(p => p.id_contratacao === dup.old);
    let movidas = 0;
    parcelas.forEach(p => {
      const valorNova = Math.abs(Number(p.valor_previsto) - Number(nova.valor_parcela)) < 0.01;
      const valorPrim = primeira && Math.abs(Number(p.valor_previsto) - Number(primeira.valor_parcela)) < 0.01;
      if (valorNova && !valorPrim) {
        movidas++;
        aplicar.push(() => atualizar_('PARCELAS', p._linha, { id_contratacao: dup.novo }));
      }
    });
    linhas.push('  ↳ ' + movidas + ' parcela(s) de ' + brl_(nova.valor_parcela) + ' passam para ' + dup.novo);

    const pastaNova = nova.pasta_drive_id && primeira && nova.pasta_drive_id !== primeira.pasta_drive_id ? nova.pasta_drive_id : '';
    ler_('DOCUMENTOS').filter(d => d.id_contratacao === dup.old).forEach(d => {
      if (pastaNova && pastaDoArquivo_(d.drive_file_id) === pastaNova) {
        linhas.push('  ↳ documento "' + d.nome_arquivo + '" passa para ' + dup.novo);
        aplicar.push(() => atualizar_('DOCUMENTOS', d._linha, { id_contratacao: dup.novo }));
      } else {
        linhas.push('  ↳ documento "' + d.nome_arquivo + '" fica em ' + dup.old + ' (confira)');
      }
    });
    if (primeira && primeira.pasta_drive_id && nova.pasta_drive_id === primeira.pasta_drive_id) {
      aplicar.push(() => atualizar_('CONTRATACOES', dup.linha, { pasta_drive_id: '' }));
    }
  });

  return { linhas: linhas, aplicar: aplicar };
}

/** Próximo ID sem gravar o contador (usado só na prévia; o reparo grava ao aplicar). */
function gerarIdPrevia_(aba) { return gerarId(aba); }

function normalizar_(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function nomePasta_(id) {
  if (!id) return '';
  try { return DriveApp.getFolderById(id).getName(); } catch (e) { return ''; }
}
function pastaDoArquivo_(id) {
  try { const it = DriveApp.getFileById(id).getParents(); return it.hasNext() ? it.next().getId() : ''; } catch (e) { return ''; }
}
