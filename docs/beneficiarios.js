/**
 * beneficiarios.js – tela do Módulo BENEFICIÁRIOS (Sistema IBK)
 *
 * Carregado ANTES do script principal do index.html:  <script src="beneficiarios.js"></script>
 * Usa as funções do site (api, apiRapida, esc, pode, navAtivo, gravarRota, mostrarView, toast, lerArquivo…)
 * no momento em que a pessoa usa a tela. Sem este arquivo, o site funciona normalmente sem o módulo.
 *
 * Telas: menu "Beneficiários" (crianças e fichas), "Chamada", "Frequência" e a aba "Oficinas" dentro do projeto.
 */
(function () {
  const AREAS = [
    ['beneficiarios', 'Beneficiários', 'Ficha da criança/adolescente, vínculos com projetos e documentos. Ver = consultar (ex.: prefeitura). Editar = matricular, alterar e desligar.'],
    ['presenca', 'Presença', 'Chamada, frequência, lista de presença do mês e oficinas dos projetos. Editar = fazer chamada e registrar ocorrência (educador).'],
    ['atendimentos', 'Atendimentos', 'Encaminhamentos, acompanhamentos, registros sigilosos e dados sensíveis (CID, renda, benefício). Só para a equipe técnica.']
  ];
  const SIT = { Presente: 'P', Falta: 'F', 'Falta justificada': 'FJ' };
  let OP = null, FICHA = null, SUB = 'dados', montado = false;
  const E = { alvoCh: '', dataCh: '', mesCh: '' };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  // ───────── utilitários
  const q = (s, el) => (el || document).querySelector(s);
  const qq = (s, el) => Array.from((el || document).querySelectorAll(s));
  const hojeIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
  const pct = v => v === null || v === undefined ? '—' : Math.round(v * 100) + '%';
  const st = (txt, cor) => `<span class="st ${cor || ''}">${esc(txt)}</span>`;
  const corStatus = s => ['Matriculado', 'Ativo', 'Em andamento', 'Concluído', 'Encerrada'].includes(s) ? 'verde'
    : ['Lista de espera', 'Pré-inscrito', 'Aberta', 'Enviado', 'Em acompanhamento', 'Planejada'].includes(s) ? 'amarelo' : '';
  async function opcoes(forcar) {
    if (!OP || forcar) OP = await api('obterOpcoesBen', {});
    return OP;
  }
  function selectAlvo(id, valor, comProjeto) {
    let h = `<select id="${id}"><option value="">Escolha…</option>`;
    OP.projetos.forEach(p => {
      const ofs = OP.oficinas.filter(o => o.id_projeto === p.id && o.status !== 'Encerrada');
      h += `<optgroup label="${esc(p.nome)}">` + (comProjeto !== false ? `<option value="P:${esc(p.id)}"${valor === 'P:' + p.id ? ' selected' : ''}>Projeto todo</option>` : '');
      ofs.forEach(o => { h += `<option value="O:${esc(o.id)}"${valor === 'O:' + o.id ? ' selected' : ''}>${esc(o.nome)}${o.dias_semana ? ' (' + esc(o.dias_semana) + ')' : ''}</option>`; });
      h += '</optgroup>';
    });
    return h + '</select>';
  }
  const lerAlvo = v => !v ? null : v[0] === 'O' ? { id_oficina: v.slice(2) } : { id_projeto: v.slice(2) };

  // ───────── formulário gerado a partir dos campos do servidor
  function campoHtml(f, v) {
    const id = 'bf_' + f.n, lab = `<label for="${id}">${esc(f.r)}${f.obrig ? ' *' : ''}</label>`;
    if (v === undefined || v === null) v = f.padrao !== undefined ? f.padrao : '';
    if (f.t === 'longo') return `<div class="largo">${lab}<textarea id="${id}" name="${f.n}" rows="3">${esc(v)}</textarea></div>`;
    if (f.t === 'bool') return `<div><label style="display:flex;gap:8px;align-items:center;margin-top:22px"><input type="checkbox" id="${id}" name="${f.n}" style="width:auto"${v === true ? ' checked' : ''}> ${esc(f.r)}</label></div>`;
    let inp;
    if (f.t === 'lista') inp = `<select id="${id}" name="${f.n}"><option value="">—</option>${(OP.listas[f.lista] || []).map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (f.t === 'ref') {
      const lista = f.ref === 'PROJETOS' ? OP.projetos : f.ref === 'OFICINAS' ? OP.oficinas
        : f.ref === 'BEN_OCORRENCIAS' && FICHA ? FICHA.ocorrencias.map(o => ({ id: o.id_ocorrencia, nome: br(o.data) + ' – ' + o.tipo })) : [];
      inp = `<select id="${id}" name="${f.n}"><option value="">—</option>${lista.map(o => `<option value="${esc(o.id)}"${String(o.id) === String(v) ? ' selected' : ''}>${esc(o.nome)}</option>`).join('')}</select>`;
    } else {
      const tipo = { data: 'date', hora: 'time', numero: 'text', email: 'email', telefone: 'tel' }[f.t] || 'text';
      inp = `<input type="${tipo}" id="${id}" name="${f.n}" value="${esc(v)}"${f.t === 'numero' ? ' inputmode="decimal"' : ''}>`;
    }
    return `<div>${lab}${inp}</div>`;
  }
  function renderForm(aba, valores, ocultar) {
    valores = valores || {}; ocultar = ocultar || [];
    const grupos = [], por = {};
    OP.schema[aba].forEach(f => {
      if (ocultar.includes(f.n)) return;
      const s = f.secao || '';
      if (!por[s]) { por[s] = []; grupos.push(s); }
      por[s].push(f);
    });
    return grupos.map(s => (s ? `<div class="secao"><h4>${esc(s)}</h4>` : '<div>') + `<div class="form-grade">${por[s].map(f => campoHtml(f, valores[f.n])).join('')}</div></div>`).join('');
  }
  const lerForm = el => { const d = {}; qq('[name]', el).forEach(x => { d[x.name] = x.type === 'checkbox' ? x.checked : x.value; }); return d; };

  /** Janela (dialog) com formulário. salvar(dados) devolve Promise. */
  function janela(titulo, corpoHtml, salvar, grande) {
    let dlg = document.getElementById('dlgBen');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlgBen'; document.body.appendChild(dlg); }
    dlg.className = grande ? 'grande' : '';
    dlg.innerHTML = `<form method="dialog"><div class="modal-cab"><h3>${esc(titulo)}</h3><button type="button" class="btn-link" data-x>✕</button></div>
      <div class="modal-corpo">${corpoHtml}</div>
      <div class="modal-rodape"><div class="msg" id="msgBen" role="alert"></div><button type="button" class="btn-sec" data-x>Cancelar</button>${salvar ? '<button class="btn" type="submit">Salvar</button>' : ''}</div></form>`;
    qq('[data-x]', dlg).forEach(b => b.onclick = () => dlg.close());
    q('form', dlg).onsubmit = async e => {
      e.preventDefault();
      if (!salvar) return dlg.close();
      const btn = e.submitter; btn.disabled = true; msg('msgBen', 'Salvando…', 'ok');
      try { await salvar(lerForm(q('.modal-corpo', dlg))); dlg.close(); }
      catch (err) { msg('msgBen', err.message); }
      btn.disabled = false;
    };
    dlg.showModal();
    return dlg;
  }

  // ───────── montagem (menu, tela, aba do projeto)
  function montar() {
    if (montado) return;
    montado = true;
    const css = document.createElement('style');
    css.textContent = `.st.vermelho{background:var(--erro-fundo);color:var(--erro)}
      .ben-pres{display:flex;gap:4px}.ben-pres button{border:1px solid var(--borda-forte);background:#fff;border-radius:8px;padding:6px 10px;min-width:42px;font-weight:600;color:var(--suave)}
      .ben-pres button.on[data-s="Presente"]{background:var(--ok);border-color:var(--ok);color:#fff}
      .ben-pres button.on[data-s="Falta"]{background:var(--erro);border-color:var(--erro);color:#fff}
      .ben-pres button.on[data-s="Falta justificada"]{background:var(--alerta);border-color:var(--alerta);color:#fff}
      .ben-card{border:1px solid var(--borda);border-radius:var(--raio-p);padding:12px 14px;margin-bottom:10px;background:var(--card-suave)}
      .ben-card .meta{font-size:12px;color:var(--suave);margin-bottom:4px}.ben-filtros{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;align-items:end;margin-bottom:16px}
      .ben-mes{display:flex;align-items:center;gap:10px;margin-bottom:10px}.ben-mes b{min-width:150px;text-align:center;text-transform:capitalize}
      .ben-cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
      .ben-dia{border:1px solid var(--borda-forte);background:#fff;border-radius:10px;padding:8px 6px;text-align:center;cursor:pointer;font:inherit;color:inherit}
      .ben-dia b{display:block;font-size:18px}.ben-dia small{display:block;font-size:11px;color:var(--suave)}
      .ben-dia.feita{background:var(--ok-fundo,#e6f4ea);border-color:var(--ok)}.ben-dia.pendente{background:var(--alerta-fundo,#fff4e0);border-color:var(--alerta)}
      .ben-dia.futura{opacity:.55;cursor:default}.ben-dia.sel{outline:3px solid var(--primaria,#1f4466);outline-offset:1px}.ben-dia.extra{border-style:dashed}
      .ben-fotos{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}.ben-foto{position:relative;width:120px;height:90px;border-radius:8px;overflow:hidden;background:var(--card-suave);border:1px solid var(--borda);cursor:pointer}
      .ben-foto img{width:100%;height:100%;object-fit:cover}.ben-foto button{position:absolute;top:2px;right:2px;border:0;background:rgba(0,0,0,.55);color:#fff;border-radius:6px;cursor:pointer;padding:0 6px}
      #benCh:empty{display:none}.ben-cons td{vertical-align:middle}.ben-cons label{display:inline-flex;gap:4px;align-items:center;margin-right:12px;font-weight:normal}.ben-cons input[type=radio]{width:auto}`;
    document.head.appendChild(css);

    const nav = q('.nav');
    if (nav) {
      const ico = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
      nav.insertAdjacentHTML('beforeend',
        `<div class="lateral-rotulo" id="navBenRotulo" style="margin-top:14px">BENEFICIÁRIOS</div>
         <a class="nav-item oculto" id="navBen" href="#beneficiarios">${ico('<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>')}Crianças e fichas</a>
         <a class="nav-item oculto" id="navBenCh" href="#chamada">${ico('<path d="M9 11l3 3 8-8"/><rect x="3" y="4" width="18" height="17" rx="2"/>')}Chamada</a>
         <a class="nav-item oculto" id="navBenFr" href="#frequencia">${ico('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')}Frequência</a>`);
      q('#navBen').addEventListener('click', () => abrirLista());
      q('#navBenCh').addEventListener('click', () => abrirChamada());
      q('#navBenFr').addEventListener('click', () => abrirFrequencia());
    }
    const main = q('main');
    if (main) main.insertAdjacentHTML('beforeend', '<div id="viewBen" class="oculto"></div>');

    // Aba "Oficinas" dentro do projeto (ao lado de Execuções)
    const ultimaAba = q('#viewDetalhe [data-aba="execucoes"]');
    if (ultimaAba) {
      ultimaAba.insertAdjacentHTML('afterend', '<button class="aba oculto" role="tab" data-aba="oficinas" aria-selected="false">Oficinas</button>');
      q('#viewDetalhe [data-aba="oficinas"]').addEventListener('click', () => trocarAba('oficinas'));
      const painelExec = document.getElementById('abaExecucoes');
      if (painelExec) painelExec.insertAdjacentHTML('afterend', '<section class="painel oculto" id="abaOficinas" role="tabpanel"><div class="vazio">Carregando…</div></section>');
    }
  }

  const podeAlgo = () => pode('beneficiarios') || pode('presenca');

  function aplicarMenus() {
    montar();
    const vis = (id, ok) => { const el = document.getElementById(id); if (el) el.classList.toggle('oculto', !ok); };
    vis('navBenRotulo', podeAlgo());
    vis('navBen', pode('beneficiarios'));
    vis('navBenCh', pode('presenca', 'editar'));
    vis('navBenFr', pode('presenca'));
    OP = null;                    // usuário pode ter mudado
  }

  function cabecalho(sobre, titulo, sub, acoes) {
    return `<div class="pagina-cab"><div><p class="sobretitulo">${esc(sobre)}</p><h1>${esc(titulo)}</h1><p class="subtitulo">${esc(sub)}</p></div>${acoes || ''}</div>`;
  }
  async function abrirView(navId, migalha, rota) {
    navAtivo(navId, migalha);
    gravarRota(rota);
    mostrarView('viewBen');
    const v = q('#viewBen');
    if (!OP) v.innerHTML = '<div class="vazio">Carregando…</div>';
    try { await opcoes(); } catch (err) { v.innerHTML = `<div class="vazio">${esc(err.message)}</div>`; throw err; }
    return v;
  }

  // ───────── CRIANÇAS
  async function abrirLista() {
    FICHA = null;
    const v = await abrirView('navBen', 'Beneficiários', 'beneficiarios');
    v.innerHTML = cabecalho('Crianças e adolescentes', 'Beneficiários', 'Matrícula, ficha de inscrição, ocorrências, encaminhamentos, acompanhamentos e documentos.',
      OP.pode.editar_ficha ? '<button class="btn" id="benNova">+ Nova matrícula</button>' : '') +
      `<div class="ben-filtros"><div><label>Buscar</label><input id="benBusca" placeholder="Nome, matrícula, responsável ou CPF"></div>
       <div><label>Situação</label><select id="benStatus"><option value="">Todas</option>${OP.listas.status_beneficiario.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
       <div><label>Projeto</label><select id="benProj"><option value="">Todos</option>${OP.projetos.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</select></div></div>
       <section class="painel" id="benLista"><div class="vazio">Carregando…</div></section>`;
    let t;
    const buscar = () => apiRapida('listarBeneficiarios', { texto: q('#benBusca').value, status: q('#benStatus').value, id_projeto: q('#benProj').value }, l => {
      const el = q('#benLista'); if (!el) return;
      el.innerHTML = !l.length ? '<div class="vazio">Nenhuma criança encontrada.</div>' :
        `<div class="tabela-wrap"><table><thead><tr><th>Matrícula</th><th>Nome</th><th>Idade</th><th>Responsável</th><th>Telefone</th><th>Situação</th></tr></thead><tbody>${
          l.map(b => `<tr class="clicavel" tabindex="0" data-id="${esc(b.id_beneficiario)}"><td>${esc(b.num_matricula)}</td><td><b>${esc(b.nome)}</b></td><td>${esc(b.idade)}</td>
          <td>${esc(b.responsavel)}</td><td>${esc(b.telefone)}</td><td>${st(b.status, corStatus(b.status))}</td></tr>`).join('')}</tbody></table></div>
          <p class="dica">${l.length} criança(s)</p>`;
      qq('tr[data-id]', el).forEach(tr => tr.onclick = () => abrirFicha(tr.dataset.id));
    }).catch(err => { q('#benLista').innerHTML = `<div class="vazio">${esc(err.message)}</div>`; });
    q('#benBusca').oninput = () => { clearTimeout(t); t = setTimeout(buscar, 350); };
    q('#benStatus').onchange = buscar; q('#benProj').onchange = buscar;
    if (q('#benNova')) q('#benNova').onclick = () => janela('Nova matrícula', renderForm('BENEFICIARIOS', { data_matricula: hojeIso() }), async d => {
      const f = await api('salvarBeneficiario', d); toast('Matrícula ' + f.ficha.num_matricula + ' criada');
      FICHA = f; SUB = 'projetos'; renderFicha();
    }, true);
    buscar();
  }

  async function abrirFicha(id, sub) {
    const v = await abrirView('navBen', 'Beneficiários', 'beneficiarios/' + id + '/' + (sub || SUB));
    if (!FICHA || FICHA.ficha.id_beneficiario !== id) v.innerHTML = '<div class="vazio">Abrindo ficha…</div>';
    SUB = sub || SUB || 'dados';
    try {
      await apiRapida('obterBeneficiario', { id_beneficiario: id }, f => { if (!ocupado(v)) { FICHA = f; renderFicha(); } });
    } catch (err) { v.innerHTML = `<div class="vazio">${esc(err.message)}</div>`; }
  }

  function renderFicha() {
    const f = FICHA, b = f.ficha, v = q('#viewBen'), fr = f.frequencia;
    mostrarView('viewBen');
    gravarRota('beneficiarios/' + b.id_beneficiario + '/' + SUB);
    const subs = [['dados', 'Dados da ficha'], ['projetos', `Projetos (${f.vinculos.length})`], ['ocorrencias', `Ocorrências (${f.ocorrencias.length})`]];
    if (OP.pode.atendimentos) subs.push(['encaminhamentos', `Encaminhamentos (${f.encaminhamentos.length})`], ['acompanhamentos', `Acompanhamentos (${f.acompanhamentos.length})`]);
    const consOk = f.consentimentos.filter(c => c.resposta).length;
    subs.push(['consentimentos', `Termos e autorizações (${consOk}/${f.consentimentos.length})`]);
    subs.push(['documentos', `Documentos (${f.documentos.length})`]);
    const saude = [b.condicoes_saude, b.alergias, b.restricoes_alimentares, b.medicamentos].filter(Boolean).join(' · ');
    v.innerHTML = `<button class="btn-link voltar" id="benVoltar">← Voltar para a lista</button>
      <div class="titulo-linha"><div><h2 style="margin:0">${esc(b.nome_social || b.nome_completo)} ${st(b.status, corStatus(b.status))}</h2>
        <div class="dica" style="margin:4px 0 0">Matrícula ${esc(b.num_matricula)} · ${esc(b.idade)} anos · Responsável: ${esc(b.resp1_nome)} ${esc(b.resp1_telefone)}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-sec" id="benImprimir">🖨️ Ficha para imprimir / PDF</button>
        ${OP.pode.editar_ficha && b.status !== 'Desligado' && b.status !== 'Transferido' ? '<button class="btn-link perigo" id="benDesligar">Desligar</button>' : ''}</div></div>
      <div class="resumo" style="margin-top:14px">
        <div class="kpi ${fr && fr.alerta ? 'alerta' : 'ok'}"><span>Frequência</span><strong>${fr ? pct(fr.frequencia) : '—'}</strong><small>${fr ? fr.presentes + ' de ' + fr.chamadas + ' chamadas' + (fr.faltas_seguidas ? ' · ' + fr.faltas_seguidas + ' falta(s) seguida(s)' : '') : 'sem chamadas ainda'}</small></div>
        <div class="kpi"><span>Projetos/oficinas ativos</span><strong>${f.vinculos.filter(x => x.status === 'Ativo').length}</strong><small>${f.vinculos.filter(x => x.status === 'Lista de espera').length} na lista de espera</small></div>
        <div class="kpi ${f.pendencias.length ? 'alerta' : 'ok'}"><span>Pendências</span><strong>${f.pendencias.length}</strong><small>${f.pendencias.length ? 'veja abaixo' : 'ficha completa'}</small></div>
      </div>
      ${saude ? `<div class="aviso">⚠ Saúde: ${esc(saude)}</div>` : ''}
      ${f.pendencias.length ? `<div class="aviso">${f.pendencias.map(esc).join('<br>')}</div>` : ''}
      <div class="abas" role="tablist" style="margin-top:18px">${subs.map(s => `<button class="aba" data-bensub="${s[0]}" aria-selected="${s[0] === SUB}">${esc(s[1])}</button>`).join('')}</div>
      <section class="painel" id="benSub"></section>`;
    q('#benVoltar').onclick = () => voltarTela(abrirLista);
    q('#benImprimir').onclick = imprimirFicha;
    if (q('#benDesligar')) q('#benDesligar').onclick = desligar;
    qq('[data-bensub]', v).forEach(bt => bt.onclick = () => { SUB = bt.dataset.bensub; renderFicha(); });
    ({ dados: subDados, projetos: subProjetos, documentos: subDocumentos, consentimentos: subConsentimentos,
       ocorrencias: () => subRegistros('BEN_OCORRENCIAS', 'ocorrencias', 'salvarOcorrencia', OP.pode.ocorrencia),
       encaminhamentos: () => subRegistros('BEN_ENCAMINHAMENTOS', 'encaminhamentos', 'salvarEncaminhamento', OP.pode.editar_atendimentos),
       acompanhamentos: () => subRegistros('BEN_ACOMPANHAMENTOS', 'acompanhamentos', 'salvarAcompanhamento', OP.pode.editar_atendimentos)
    }[SUB] || subDados)();
  }

  function subDados() {
    const b = FICHA.ficha, el = q('#benSub'), edita = OP.pode.editar_ficha;
    el.innerHTML = `<form id="benFormDados">${renderForm('BENEFICIARIOS', b)}${edita ? '<div class="form-acoes"><div class="msg" id="msgBenDados"></div><button class="btn" type="submit">Salvar alterações</button></div>' : ''}</form>`;
    if (!edita) qq('[name]', el).forEach(x => x.disabled = true);
    q('#benFormDados').onsubmit = async e => {
      e.preventDefault(); if (!edita) return;
      const btn = e.submitter; btn.disabled = true; msg('msgBenDados', 'Salvando…', 'ok');
      try { const d = lerForm(el); d.id_beneficiario = b.id_beneficiario; FICHA = await api('salvarBeneficiario', d); toast('Ficha salva'); renderFicha(); }
      catch (err) { msg('msgBenDados', err.message); btn.disabled = false; }
    };
  }

  function subProjetos() {
    const f = FICHA, b = f.ficha, el = q('#benSub'), edita = OP.pode.editar_ficha;
    el.innerHTML = (f.vinculos.length ? `<div class="tabela-wrap"><table><thead><tr><th>Projeto</th><th>Oficina</th><th>Entrada</th><th>Saída</th><th>Situação</th><th></th></tr></thead><tbody>${
      f.vinculos.map(x => `<tr><td>${esc(x.projeto_nome)}</td><td>${esc(x.oficina_nome)}</td><td>${br(x.data_entrada)}</td><td>${x.data_saida ? br(x.data_saida) : ''}</td>
        <td>${st(x.status, corStatus(x.status))}</td><td>${edita && x.status !== 'Encerrado' ? `<button class="btn-link" data-enc="${esc(x.id_vinculo)}">Encerrar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="vazio">A criança ainda não está em nenhum projeto ou oficina. Sem vínculo ela não aparece na chamada.</div>') +
      (edita ? `<div class="secao"><h4>Vincular a projeto ou oficina</h4><div class="linha-form"><div><label>Projeto ou oficina</label>${selectAlvo('benAlvoVin')}</div>
        <div><label>Data de entrada</label><input type="date" id="benEntVin" value="${hojeIso()}"></div><div><button class="btn" id="benVincular">Vincular</button></div></div></div>` : '');
    qq('[data-enc]', el).forEach(bt => bt.onclick = () => janela('Encerrar vínculo', `<div class="form-grade"><div><label>Data de saída</label><input type="date" name="data" value="${hojeIso()}"></div>
      <div class="largo"><label>Motivo</label><input name="motivo"></div></div>`, async d => {
      FICHA = await api('encerrarVinculo', Object.assign({ id_vinculo: bt.dataset.enc }, d)); toast('Vínculo encerrado'); renderFicha();
    }));
    if (q('#benVincular')) q('#benVincular').onclick = async () => {
      const alvo = lerAlvo(q('#benAlvoVin').value); if (!alvo) return toast('Escolha o projeto ou a oficina');
      const d = Object.assign({ id_beneficiario: b.id_beneficiario, data_entrada: q('#benEntVin').value }, alvo);
      if (alvo.id_oficina) d.id_projeto = (OP.oficinas.find(o => o.id === alvo.id_oficina) || {}).id_projeto;
      try { FICHA = await api('salvarVinculo', d); toast(FICHA.aviso || 'Vínculo criado'); if (FICHA.aviso) alert(FICHA.aviso); renderFicha(); }
      catch (err) { alert(err.message); }
    };
  }

  function subRegistros(aba, chave, acao, podeEditar) {
    const f = FICHA, b = f.ficha, el = q('#benSub'), lista = f[chave];
    const resumo = {
      BEN_OCORRENCIAS: r => [r.tipo, r.gravidade && 'gravidade ' + r.gravidade].filter(Boolean).join(' · '),
      BEN_ENCAMINHAMENTOS: r => [r.servico_destino, r.orgao_nome].filter(Boolean).join(' · '),
      BEN_ACOMPANHAMENTOS: r => [r.tipo, r.area, r.profissional].filter(Boolean).join(' · ')
    }[aba];
    const idDe = r => r[Object.keys(r).find(k => /^id_/.test(k))];
    el.innerHTML = (podeEditar ? '<div class="titulo-linha"><span></span><button class="btn" id="benNovoReg">+ Novo registro</button></div>' : '') +
      (lista.length ? lista.map(r => `<div class="ben-card"><div class="meta">${br(r.data)} · ${esc(resumo(r))} ${r.status ? st(r.status, corStatus(r.status)) : ''}
        ${r.sigiloso === true ? st('sigiloso', 'vermelho') : ''} ${podeEditar ? `· <a href="#" data-edit="${esc(idDe(r))}">editar</a>` : ''}</div>
        ${esc(r.descricao || r.motivo || '').replace(/\n/g, '<br>')}
        ${r.providencias ? `<div class="dica">Providências: ${esc(r.providencias)}</div>` : ''}${r.retorno_descricao ? `<div class="dica">Retorno: ${esc(r.retorno_descricao)}</div>` : ''}
        ${r.proximos_passos ? `<div class="dica">Próximos passos: ${esc(r.proximos_passos)}${r.data_proximo ? ' (' + br(r.data_proximo) + ')' : ''}</div>` : ''}</div>`).join('')
        : '<div class="vazio">Nenhum registro.</div>');
    const ocultar = ['id_beneficiario'].concat(aba === 'BEN_OCORRENCIAS' && !OP.pode.editar_atendimentos ? ['sigiloso'] : []);
    const abrir = (valores, id) => janela((id ? 'Editar ' : 'Novo ') + { BEN_OCORRENCIAS: 'ocorrência', BEN_ENCAMINHAMENTOS: 'encaminhamento', BEN_ACOMPANHAMENTOS: 'acompanhamento' }[aba],
      renderForm(aba, valores, ocultar), async d => {
        d.id_beneficiario = b.id_beneficiario;
        if (id) d[Object.keys(valores).find(k => /^id_/.test(k))] = id;
        const r = await api(acao, d);
        if (r && r.ficha) FICHA = r;
        toast('Registro salvo'); renderFicha();
      }, true);
    if (q('#benNovoReg')) q('#benNovoReg').onclick = () => abrir({ data: hojeIso() });
    qq('[data-edit]', el).forEach(a => a.onclick = e => { e.preventDefault(); abrir(lista.find(r => idDe(r) === a.dataset.edit), a.dataset.edit); });
  }

  function subConsentimentos() {
    const f = FICHA, b = f.ficha, el = q('#benSub'), edita = OP.pode.editar_ficha;
    el.innerHTML = `<div class="titulo-linha"><p class="dica" style="margin:0">Autorizações assinadas pela família. Anexe o termo assinado na aba Documentos.</p>
      ${OP.pode.excluir ? '<button class="btn-link" id="benTiposCons">Editar termos</button>' : ''}</div>
      <div class="tabela-wrap"><table class="ben-cons"><thead><tr><th>Termo</th><th>Resposta</th><th>Data</th><th>Quem assinou</th><th>Observação</th></tr></thead><tbody>${
      f.consentimentos.map((c, i) => `<tr data-i="${i}"><td><b>${esc(c.tipo)}</b></td>
        <td>${OP.listas.resposta_consentimento.map(r => `<label><input type="radio" name="cons${i}" value="${esc(r)}"${c.resposta === r ? ' checked' : ''}> ${esc(r)}</label>`).join('')}
          ${!c.resposta ? st('sem resposta', 'amarelo') : ''}</td>
        <td><input type="date" class="cData" value="${esc(c.data || hojeIso())}"></td>
        <td><input class="cResp" value="${esc(c.responsavel_nome || b.resp1_nome || '')}"></td>
        <td><input class="cObs" value="${esc(c.observacao || '')}"></td></tr>`).join('')}</tbody></table></div>
      ${edita ? '<div class="form-acoes"><div class="msg" id="msgBenCons"></div><button class="btn" id="benSalvarCons">Salvar autorizações</button></div>' : ''}`;
    if (q('#benTiposCons')) q('#benTiposCons').onclick = () => janela('Termos pedidos à família',
      `<p class="dica" style="margin-top:0">Um termo por linha. Vale para todas as fichas; quem ainda não respondeu fica com pendência.</p>
       <textarea name="tipos" rows="8" style="width:100%">${esc(OP.listas.tipo_consentimento.join('\n'))}</textarea>`, async d => {
        OP = await api('salvarTiposConsentimento', { tipos: String(d.tipos || '').split('\n') });
        FICHA = await api('obterBeneficiario', { id_beneficiario: b.id_beneficiario }); toast('Lista de termos salva'); renderFicha();
      });
    if (!edita) { qq('input', el).forEach(x => x.disabled = true); return; }
    q('#benSalvarCons').onclick = async e => {
      const itens = qq('tr[data-i]', el).map(tr => {
        const c = f.consentimentos[Number(tr.dataset.i)], r = q('input[type=radio]:checked', tr);
        return { tipo: c.tipo, resposta: r ? r.value : '', data: q('.cData', tr).value, responsavel_nome: q('.cResp', tr).value, observacao: q('.cObs', tr).value };
      }).filter(i => i.resposta);
      if (!itens.length) return msg('msgBenCons', 'Marque pelo menos uma resposta.');
      const btn = e.currentTarget; btn.disabled = true; msg('msgBenCons', 'Salvando…', 'ok');
      try { FICHA = await api('salvarConsentimentos', { id_beneficiario: b.id_beneficiario, itens }); toast('Autorizações salvas'); renderFicha(); }
      catch (err) { msg('msgBenCons', err.message); btn.disabled = false; }
    };
  }

  function subDocumentos() {
    const f = FICHA, b = f.ficha, el = q('#benSub'), edita = OP.pode.editar_ficha;
    el.innerHTML = (f.documentos.length ? `<div class="tabela-wrap"><table><thead><tr><th>Tipo</th><th>Arquivo</th><th>Enviado em</th><th>Validade</th></tr></thead><tbody>${
      f.documentos.map(x => `<tr><td>${esc(x.tipo)}</td><td><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.nome_arquivo)}</a></td><td>${br(x.enviado_em)}</td>
        <td>${x.validade ? br(x.validade) : '—'} ${x.vencido ? st('vencido', 'vermelho') : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="vazio">Nenhum documento anexado.</div>') +
      (edita ? `<div class="secao"><h4>Anexar documento</h4><div class="linha-form"><div><label>Tipo</label><select id="benDocTipo"><option value="">—</option>${OP.listas.tipo_documento_ben.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
        <div><label>Validade (se tiver)</label><input type="date" id="benDocVal"></div><div><label>Arquivo</label><input type="file" id="benDocArq"></div>
        <div><button class="btn" id="benAnexar">Anexar</button></div></div><div class="msg" id="msgBenDoc"></div></div>` : '');
    if (q('#benAnexar')) q('#benAnexar').onclick = async e => {
      const btn = e.currentTarget; btn.disabled = true; msg('msgBenDoc', 'Enviando…', 'ok');
      try {
        const arquivo = await lerArquivo(q('#benDocArq').files[0]);
        FICHA = await api('enviarDocBeneficiario', { id_beneficiario: b.id_beneficiario, tipo: q('#benDocTipo').value, validade: q('#benDocVal').value, arquivo });
        toast('Documento anexado'); renderFicha();
      } catch (err) { msg('msgBenDoc', err.message); btn.disabled = false; }
    };
  }

  function desligar() {
    const b = FICHA.ficha;
    janela('Desligar ' + (b.nome_social || b.nome_completo), `<p class="dica" style="margin-top:0">Todos os vínculos ativos serão encerrados nesta data. A ficha e o histórico continuam no sistema.</p>
      <div class="form-grade"><div><label>Data</label><input type="date" name="data" value="${hojeIso()}"></div>
      <div><label>Situação</label><select name="status"><option>Desligado</option><option>Transferido</option></select></div>
      <div class="largo"><label>Motivo *</label><input name="motivo"></div></div>`, async d => {
      FICHA = await api('desligarBeneficiario', Object.assign({ id_beneficiario: b.id_beneficiario }, d)); toast('Criança desligada'); renderFicha();
    });
  }

  function imprimirFicha() {
    const f = FICHA, b = f.ficha, w = window.open('', '_blank');
    if (!w) return alert('Libere as janelas pop-up para imprimir.');
    const linha = (r, v) => v === '' || v === undefined || v === null || v === false ? '' : `<tr><th>${esc(r)}</th><td>${esc(v === true ? 'Sim' : v)}</td></tr>`;
    const secoes = {};
    OP.schema.BENEFICIARIOS.forEach(c => { if (c.secao) secoes[c.secao] = (secoes[c.secao] || '') + linha(c.r, c.t === 'data' ? (b[c.n] ? br(b[c.n]) : '') : b[c.n]); });
    const tab = (lista, cols) => !lista.length ? '<p class="vazio">Nenhum registro.</p>' :
      `<table class="g"><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr>${lista.map(l => `<tr>${cols.map(c => `<td>${esc(c[2] ? br(l[c[1]]) : l[c[1]])}</td>`).join('')}</tr>`).join('')}</table>`;
    const fr = f.frequencia;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ficha – ${esc(b.nome_completo)}</title><style>
      body{font-family:Arial,sans-serif;margin:32px;color:#222;font-size:12px}h1{font-size:20px;color:#1f4466;margin:0}h2{font-size:14px;color:#1f4466;border-bottom:1px solid #1f4466;margin:20px 0 6px}
      .sub{color:#555}table{border-collapse:collapse;width:100%}.k th{text-align:left;font-weight:normal;color:#666;width:38%;padding:2px 6px}.k td{padding:2px 6px}
      .g th{background:#1f4466;color:#fff;padding:4px;text-align:left}.g td{border:1px solid #ccc;padding:4px;vertical-align:top}.vazio{color:#888}.rod{color:#777;font-size:10px;margin-top:20px}
      @media print{button{display:none}}</style></head><body><button onclick="print()">🖨️ Imprimir / salvar em PDF</button>
      <h1>Ficha da criança / adolescente</h1><p class="sub">${esc(b.nome_completo)} · matrícula ${esc(b.num_matricula)} · ${esc(b.idade)} anos · ${esc(b.status)}</p>
      ${Object.keys(secoes).filter(s => secoes[s]).map(s => `<h2>${esc(s)}</h2><table class="k">${secoes[s]}</table>`).join('')}
      <h2>Projetos e oficinas</h2>${tab(f.vinculos, [['Projeto', 'projeto_nome'], ['Oficina', 'oficina_nome'], ['Entrada', 'data_entrada', 1], ['Saída', 'data_saida', 1], ['Situação', 'status']])}
      <h2>Frequência</h2><p>${fr ? `${fr.chamadas} chamadas · ${fr.presentes} presenças · ${fr.faltas} faltas · ${fr.justificadas} justificadas · <b>${pct(fr.frequencia)}</b>` : 'Sem chamadas.'}</p>
      <h2>Ocorrências</h2>${tab(f.ocorrencias, [['Data', 'data', 1], ['Tipo', 'tipo'], ['Gravidade', 'gravidade'], ['O que aconteceu', 'descricao'], ['Providências', 'providencias'], ['Situação', 'status']])}
      ${OP.pode.atendimentos ? `<h2>Encaminhamentos</h2>${tab(f.encaminhamentos, [['Data', 'data', 1], ['Para', 'servico_destino'], ['Órgão', 'orgao_nome'], ['Motivo', 'motivo'], ['Situação', 'status'], ['Retorno', 'retorno_descricao']])}
      <h2>Acompanhamentos</h2>${tab(f.acompanhamentos, [['Data', 'data', 1], ['Tipo', 'tipo'], ['Área', 'area'], ['Profissional', 'profissional'], ['Relato', 'descricao'], ['Próximos passos', 'proximos_passos']])}` : ''}
      <h2>Termos e autorizações da família</h2><table class="g"><tr><th>Termo</th><th>Autoriza</th><th>Não autoriza</th><th>Data</th><th>Quem assinou</th></tr>${
        f.consentimentos.map(c => `<tr><td>${esc(c.tipo)}</td><td style="text-align:center">${c.resposta === 'Autoriza' ? '☒' : '☐'}</td><td style="text-align:center">${c.resposta === 'Não autoriza' ? '☒' : '☐'}</td>
          <td>${c.data ? br(c.data) : ''}</td><td>${esc(c.responsavel_nome || '')}</td></tr>`).join('')}</table>
      <p style="margin-top:28px">______________________________________ &nbsp; Data: ____/____/______<br>Assinatura do(a) responsável</p>
      <h2>Documentos</h2>${tab(f.documentos, [['Tipo', 'tipo'], ['Arquivo', 'nome_arquivo'], ['Validade', 'validade', 1]])}
      ${f.pendencias.length ? `<h2>Pendências</h2><ul>${f.pendencias.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      <p class="rod">Gerado em ${new Date().toLocaleString('pt-BR')} por ${esc(usuario.nome)}. Dados pessoais de criança/adolescente (LGPD): não compartilhar fora da instituição.</p></body></html>`);
    w.document.close();
  }

  // ───────── CHAMADA
  // Oficina: calendário com as datas geradas pelos dias da semana (vigência da oficina ou do projeto).
  // Projeto todo: escolhe a data.
  async function abrirChamada() {
    const v = await abrirView('navBenCh', 'Chamada', 'chamada');
    v.innerHTML = cabecalho('Lista de presença', 'Chamada', 'Escolha a oficina e clique na data da aula: a lista já vem com as crianças vinculadas.') +
      `<div class="ben-filtros"><div style="grid-column:span 2"><label>Oficina ou projeto</label>${selectAlvo('benAlvoCh', E.alvoCh)}</div></div>
       <section class="painel" id="benCal"><div class="vazio">Escolha a oficina.</div></section>
       <section class="painel" id="benCh" style="margin-top:16px"></section>`;
    q('#benAlvoCh').onchange = () => { E.alvoCh = q('#benAlvoCh').value; E.dataCh = ''; E.mesCh = ''; q('#benCh').innerHTML = ''; carregarCalendario(); };
    if (E.alvoCh) carregarCalendario();
  }

  async function carregarCalendario() {
    const el = q('#benCal'), alvo = lerAlvo(E.alvoCh);
    if (!alvo) { el.innerHTML = '<div class="vazio">Escolha a oficina.</div>'; return; }
    if (!alvo.id_oficina) {
      el.innerHTML = `<div class="linha-form"><div><label>Data</label><input type="date" id="benDataCh" max="${hojeIso()}" value="${E.dataCh || hojeIso()}"></div>
        <div><button class="btn" id="benAbrirLista">Abrir lista</button></div></div>
        <p class="dica">Chamada do projeto todo (crianças vinculadas ao projeto sem oficina definida). Para o calendário, escolha uma oficina.</p>`;
      q('#benAbrirLista').onclick = () => { E.dataCh = q('#benDataCh').value; carregarChamada(); };
      if (E.dataCh) carregarChamada();
      return;
    }
    el.innerHTML = '<div class="vazio">Montando o calendário da oficina…</div>';
    try { renderCalendario(await api('obterDatasOficina', alvo)); }
    catch (err) { el.innerHTML = `<div class="vazio">${esc(err.message)}</div>`; return; }
    if (E.dataCh) carregarChamada();
  }

  function renderCalendario(c) {
    const el = q('#benCal');
    const meses = [];
    c.datas.forEach(d => { const m = d.data.slice(0, 7); if (meses.indexOf(m) === -1) meses.push(m); });
    if (!E.mesCh || meses.indexOf(E.mesCh) === -1) {
      const hoje = c.hoje.slice(0, 7);
      E.mesCh = meses.indexOf(hoje) > -1 ? hoje : (meses.filter(m => m < hoje).pop() || meses[0] || '');
    }
    const i = meses.indexOf(E.mesCh), doMes = c.datas.filter(d => d.data.slice(0, 7) === E.mesCh);
    const nomeMes = m => m ? MESES[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : '';
    const dia = d => {
      const dt = new Date(d.data + 'T12:00:00');
      const info = d.situacao === 'feita' ? `${d.presentes} pres. · ${d.faltas} faltas${d.fotos ? ' · 📷' + d.fotos : ''}` : d.situacao === 'pendente' ? 'fazer chamada' : 'futura';
      return `<button type="button" class="ben-dia ${d.situacao}${d.prevista ? '' : ' extra'}${d.data === E.dataCh ? ' sel' : ''}" data-dia="${d.data}"${d.situacao === 'futura' ? ' disabled' : ''}
        title="${d.prevista ? '' : 'Aula fora da agenda'}"><small>${DIAS_SEM[dt.getDay()]}</small><b>${d.data.slice(8, 10)}</b><small>${esc(info)}</small></button>`;
    };
    el.innerHTML = `<div class="titulo-linha"><div><b>${esc(c.titulo)}</b> · ${esc(c.dias_semana || 'sem dias definidos')}
        ${c.inicio ? ` · de ${br(c.inicio)} a ${br(c.fim)}` : ''}</div>
        <div class="dica" style="margin:0">${c.resumo.feitas} de ${c.resumo.previstas} aulas com chamada${c.resumo.pendentes ? ` · <b>${c.resumo.pendentes} pendente(s)</b>` : ''}</div></div>
      ${c.aviso ? `<div class="aviso">${esc(c.aviso)} Ajuste em Projetos → projeto → Oficinas.</div>` : ''}
      ${c.recessos.length ? `<p class="dica" style="margin-top:0">Sem aula: ${c.recessos.map(r => esc(r.descricao) + ' (' + br(r.data_inicio) + ' a ' + br(r.data_fim) + ')').join(' · ')}</p>` : ''}
      ${meses.length ? `<div class="ben-mes"><button class="btn-sec" id="benMesAnt"${i <= 0 ? ' disabled' : ''}>‹</button><b>${esc(nomeMes(E.mesCh))}</b>
        <button class="btn-sec" id="benMesProx"${i >= meses.length - 1 ? ' disabled' : ''}>›</button></div>
        <div class="ben-cal">${doMes.map(dia).join('')}</div>` : ''}
      <details style="margin-top:12px"><summary class="dica" style="cursor:pointer">Aula fora da agenda (reposição, evento…)</summary>
        <div class="linha-form" style="margin-top:8px"><div><label>Data</label><input type="date" id="benDataExtra" max="${c.hoje}"></div>
        <div><button class="btn-sec" id="benAbrirExtra">Abrir lista</button></div></div></details>`;
    const ir = n => { E.mesCh = meses[i + n]; renderCalendario(c); };
    if (q('#benMesAnt')) { q('#benMesAnt').onclick = () => ir(-1); q('#benMesProx').onclick = () => ir(1); }
    qq('[data-dia]', el).forEach(bt => bt.onclick = () => { E.dataCh = bt.dataset.dia; qq('.ben-dia', el).forEach(x => x.classList.toggle('sel', x === bt)); carregarChamada(); });
    q('#benAbrirExtra').onclick = () => { const v = q('#benDataExtra').value; if (!v) return toast('Escolha a data'); E.dataCh = v; carregarChamada(); };
  }

  async function carregarChamada() {
    const alvo = lerAlvo(E.alvoCh); if (!alvo || !E.dataCh) return;
    alvo.data = E.dataCh;
    const el = q('#benCh');
    el.innerHTML = '<div class="vazio">Buscando as crianças vinculadas…</div>';
    try { renderChamada(await api('obterListaPresenca', alvo)); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (err) { el.innerHTML = `<div class="vazio">${esc(err.message)}</div>`; }
  }

  /** Recarrega o calendário sem perder a data escolhida (depois de salvar chamada ou foto). */
  async function atualizarCalendario() {
    const alvo = lerAlvo(E.alvoCh);
    if (!alvo || !alvo.id_oficina || !q('#benCal')) return;
    try { renderCalendario(await api('obterDatasOficina', alvo)); } catch (e) { /* o calendário só fica desatualizado */ }
  }

  function renderChamada(l) {
    const el = q('#benCh'), edita = pode('presenca', 'editar');
    const extra = l.recesso ? `<div class="aviso">Esta data está em ${esc(l.recesso)}. A chamada fica registrada como aula extra.</div>`
      : l.prevista === false ? '<div class="aviso">Esta data não está na agenda da oficina. A chamada fica registrada como aula extra.</div>' : '';
    if (!l.criancas.length) { el.innerHTML = extra + `<div class="vazio">Nenhuma criança vinculada a ${esc(l.titulo)} em ${br(l.data)}. Vincule as crianças pela ficha (aba Projetos).</div>`; return; }
    el.innerHTML = `${extra}<div class="titulo-linha"><div><b>${esc(l.titulo)}</b> · ${br(l.data)} · ${l.criancas.length} criança(s) ${l.chamada ? st('chamada já lançada – editando', 'amarelo') : ''}</div>
      ${edita ? '<button class="btn-sec" id="benTodosP">Todos presentes</button>' : ''}</div>
      <div class="tabela-wrap"><table><thead><tr><th>Criança</th><th>Idade</th><th>Presença</th><th>Justificativa</th></tr></thead><tbody>${
      l.criancas.map((c, i) => `<tr data-i="${i}"><td><b>${esc(c.nome)}</b>${c.autoriza_imagem ? '' : ' <span title="Sem autorização de uso de imagem">🚫📷</span>'}${c.alerta_saude ? `<div class="dica" style="margin:2px 0 0">⚠ ${esc(c.alerta_saude)}</div>` : ''}</td><td>${esc(c.idade)}</td>
        <td><div class="ben-pres">${Object.keys(SIT).map(s => `<button type="button" data-s="${s}" title="${s}" class="${c.situacao === s ? 'on' : ''}">${SIT[s]}</button>`).join('')}</div></td>
        <td><input class="ben-just" value="${esc(c.justificativa)}" placeholder="Se falta justificada"></td></tr>`).join('')}</tbody></table></div>
      <div class="form-grade" style="margin-top:16px"><div><label>Educador(a)</label><input id="benEdu" value="${esc(l.educador_nome)}"></div>
        <div class="largo"><label>Atividade realizada</label><textarea id="benAtiv" rows="2">${esc(l.chamada ? l.chamada.atividade_realizada : '')}</textarea></div></div>
      ${edita ? '<div class="form-acoes"><div class="msg" id="msgBenCh"></div><span class="dica" id="benCont"></span><button class="btn" id="benSalvarCh">Salvar chamada</button></div>' : ''}
      <div class="secao"><h4>Fotos da aula (opcional)</h4>
        ${l.sem_autorizacao_imagem.length ? `<div class="aviso">🚫📷 Sem autorização de uso de imagem: ${l.sem_autorizacao_imagem.map(esc).join(', ')}. Não fotografe o rosto dessas crianças.</div>` : ''}
        <div class="ben-fotos" id="benFotos">${l.fotos.map(f => `<div class="ben-foto" data-foto="${esc(f.id_foto)}" title="${esc(f.legenda || f.nome_arquivo)}"><span class="dica" style="padding:6px;display:block">carregando…</span>
          ${OP.pode.excluir ? `<button type="button" data-delfoto="${esc(f.id_foto)}" title="Excluir foto">×</button>` : ''}</div>`).join('')}</div>
        ${!edita ? (l.fotos.length ? '' : '<p class="dica">Nenhuma foto.</p>') : l.chamada
          ? `<div class="linha-form"><div><label>Fotos</label><input type="file" id="benFotoArq" accept="image/*" multiple></div>
             <div><label>Legenda (opcional)</label><input id="benFotoLeg" placeholder="Ex.: aquecimento e treino de quedas"></div>
             <div><button class="btn-sec" id="benFotoEnviar">Enviar fotos</button></div></div><div class="msg" id="msgBenFoto"></div>
             <p class="dica">As fotos vão para a pasta do projeto no Drive (Fotos das oficinas) e entram no planejamento pedagógico do mês.</p>`
          : '<p class="dica">Salve a chamada para poder enviar fotos.</p>'}</div>`;
    carregarMiniaturas(l);
    if (!edita) { qq('.ben-pres button, .ben-just, #benEdu, #benAtiv', el).forEach(x => x.disabled = true); return; }
    const contar = () => {
      const c = { P: 0, F: 0, FJ: 0, vazio: 0 };
      qq('tr[data-i]', el).forEach(tr => { const on = q('.ben-pres .on', tr); on ? c[on.textContent]++ : c.vazio++; });
      q('#benCont').textContent = `${c.P} presentes · ${c.F} faltas · ${c.FJ} justificadas${c.vazio ? ' · ' + c.vazio + ' sem marcar' : ''}`;
    };
    qq('.ben-pres button', el).forEach(bt => bt.onclick = () => { const ja = bt.classList.contains('on'); qq('button', bt.parentNode).forEach(x => x.classList.remove('on')); if (!ja) bt.classList.add('on'); contar(); });
    q('#benTodosP').onclick = () => { qq('tr[data-i]', el).forEach(tr => qq('.ben-pres button', tr).forEach(x => x.classList.toggle('on', x.dataset.s === 'Presente'))); contar(); };
    q('#benSalvarCh').onclick = async e => {
      const itens = []; let vazias = 0;
      qq('tr[data-i]', el).forEach(tr => {
        const c = l.criancas[Number(tr.dataset.i)], on = q('.ben-pres .on', tr);
        if (!on) { vazias++; return; }
        itens.push({ id_beneficiario: c.id_beneficiario, situacao: on.dataset.s, justificativa: q('.ben-just', tr).value });
      });
      if (vazias && !confirm(vazias + ' criança(s) sem marcação. Salvar mesmo assim?')) return;
      const btn = e.currentTarget; btn.disabled = true; msg('msgBenCh', 'Salvando…', 'ok');
      try {
        const r = await api('salvarChamada', Object.assign(lerAlvo(E.alvoCh), { data: l.data, itens, educador_nome: q('#benEdu').value, atividade_realizada: q('#benAtiv').value }));
        toast('Chamada salva'); renderChamada(r); atualizarCalendario();
      } catch (err) { msg('msgBenCh', err.message); btn.disabled = false; }
    };
    if (q('#benFotoEnviar')) q('#benFotoEnviar').onclick = async e => {
      const arqs = Array.from(q('#benFotoArq').files || []);
      if (!arqs.length) return msg('msgBenFoto', 'Escolha as fotos.');
      const btn = e.currentTarget; btn.disabled = true;
      let r = null;
      try {
        for (let i = 0; i < arqs.length; i++) {
          msg('msgBenFoto', `Enviando foto ${i + 1} de ${arqs.length}…`, 'ok');
          const arquivo = await reduzirFoto(arqs[i]);
          r = await api('enviarFotoAula', Object.assign(lerAlvo(E.alvoCh), { data: l.data, legenda: q('#benFotoLeg').value, arquivo }));
        }
        toast(arqs.length + ' foto(s) enviada(s)'); renderChamada(r); atualizarCalendario();
      } catch (err) { msg('msgBenFoto', err.message); btn.disabled = false; if (r) renderChamada(r); }
    };
    qq('[data-delfoto]', el).forEach(bt => bt.onclick = async ev => {
      ev.stopPropagation();
      if (!confirm('Excluir esta foto? Ela vai para a LIXEIRA.')) return;
      try { await api('excluirRegistroBen', { aba: 'BEN_FOTOS', id: bt.dataset.delfoto }); toast('Foto excluída'); carregarChamada(); atualizarCalendario(); }
      catch (err) { alert(err.message); }
    });
    contar();
  }

  const FOTOS_CACHE = {};
  function carregarMiniaturas(l) {
    qq('[data-foto]', q('#benCh')).forEach(async box => {
      const id = box.dataset.foto;
      try {
        if (!FOTOS_CACHE[id]) {
          const r = await api('obterFotoAula', { id_foto: id });
          FOTOS_CACHE[id] = 'data:' + (r.mime || 'image/jpeg') + ';base64,' + r.base64;
        }
        const span = q('span', box); if (span) span.remove();
        box.insertAdjacentHTML('afterbegin', `<img alt="Foto da aula" src="${FOTOS_CACHE[id]}">`);
        box.onclick = () => { const w = window.open('', '_blank'); if (w) w.document.write(`<title>Foto da aula</title><img src="${FOTOS_CACHE[id]}" style="max-width:100%">`); };
      } catch (err) { const span = q('span', box); if (span) span.textContent = 'não abriu'; }
    });
  }

  /** Reduz a foto no navegador (máx. 1600 px, JPEG) antes de enviar: o celular tira fotos de 4–10 MB. */
  function reduzirFoto(file) {
    return new Promise((ok, falha) => {
      if (!file || !/^image\//.test(file.type)) return falha(new Error('Envie uma imagem (JPG ou PNG).'));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        const dataUrl = cv.toDataURL('image/jpeg', 0.85);
        ok({ nome: file.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', base64: dataUrl.split(',')[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); lerArquivo(file).then(ok, falha); };
      img.src = url;
    });
  }

  // ───────── FREQUÊNCIA
  async function abrirFrequencia() {
    const v = await abrirView('navBenFr', 'Frequência', 'frequencia');
    const d = new Date(), ini = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    v.innerHTML = cabecalho('Lista de presença', 'Frequência', 'Percentual por criança, faltas seguidas e a lista do mês para assinatura e prestação de contas.') +
      `<div class="ben-filtros"><div style="grid-column:span 2"><label>Oficina ou projeto</label>${selectAlvo('benAlvoFr', E.alvoCh)}</div>
       <div><label>De</label><input type="date" id="benDe" value="${ini}"></div><div><label>Até</label><input type="date" id="benAte" value="${hojeIso()}"></div>
       <div style="display:flex;gap:8px"><button class="btn" id="benVerFr">Ver</button><button class="btn-sec" id="benListaMes" title="Mês da data inicial">🖨️ Lista do mês</button></div></div>
       <section class="painel" id="benFr"><div class="vazio">Escolha a oficina ou o projeto.</div></section>`;
    q('#benVerFr').onclick = async () => {
      const alvo = lerAlvo(q('#benAlvoFr').value); if (!alvo) return toast('Escolha a oficina ou o projeto');
      E.alvoCh = q('#benAlvoFr').value;
      try {
        const l = await api('obterFrequencia', Object.assign(alvo, { de: q('#benDe').value, ate: q('#benAte').value }));
        q('#benFr').innerHTML = !l.length ? '<div class="vazio">Nenhuma chamada no período.</div>' :
          `<div class="tabela-wrap"><table><thead><tr><th>Criança</th><th class="num">Chamadas</th><th class="num">Presenças</th><th class="num">Faltas</th><th class="num">Justificadas</th><th class="num">Seguidas</th><th>Frequência</th></tr></thead><tbody>${
          l.map(r => `<tr><td>${esc(r.nome)}</td><td class="num">${r.chamadas}</td><td class="num">${r.presentes}</td><td class="num">${r.faltas}</td><td class="num">${r.justificadas}</td>
            <td class="num">${r.faltas_seguidas}${r.evasao ? ' ' + st('evasão', 'vermelho') : ''}</td><td>${st(pct(r.frequencia), r.alerta ? 'vermelho' : 'verde')}</td></tr>`).join('')}</tbody></table></div>
          <p class="dica">Falta justificada conta como ausência no percentual. Em vermelho: abaixo da frequência mínima ou com faltas seguidas (ajuste em CONFIG).</p>`;
      } catch (err) { q('#benFr').innerHTML = `<div class="vazio">${esc(err.message)}</div>`; }
    };
    q('#benListaMes').onclick = async () => {
      const alvo = lerAlvo(q('#benAlvoFr').value); if (!alvo) return toast('Escolha a oficina ou o projeto');
      const p = q('#benDe').value.split('-'), w = window.open('', '_blank');
      if (!w) return alert('Libere as janelas pop-up para imprimir.');
      w.document.write('<p style="font-family:sans-serif;padding:24px;color:#555">Montando a lista…</p>');
      try { escreverListaMes(w, await api('obterListaPresencaMes', Object.assign(alvo, { ano: +p[0], mes: +p[1] }))); }
      catch (err) { w.close(); alert(err.message); }
    };
  }

  function escreverListaMes(w, l) {
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Lista de presença ${l.mes}/${l.ano}</title><style>
      @page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#222;font-size:11px;margin:24px}h1{font-size:18px;color:#1f4466;margin:0 0 4px}
      table{border-collapse:collapse;width:100%;margin-top:10px}th{background:#1f4466;color:#fff;padding:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      td{border:1px solid #bbb;padding:4px}td.c,th.c{text-align:center;width:24px}.n{width:24px}.f{width:50px}@media print{button{display:none}}</style></head><body>
      <button onclick="print()">🖨️ Imprimir / salvar em PDF</button><h1>Lista de presença – ${meses[l.mes - 1]}/${l.ano}</h1>
      <div>Projeto: ${esc(l.projeto.nome)}${l.projeto.termo ? ' · Termo de Fomento ' + esc(l.projeto.termo) : ''}</div>
      ${l.oficina ? `<div>Oficina: ${esc(l.oficina.nome)} · Educador(a): ${esc(l.oficina.educador || '')} · ${esc(l.oficina.dias_semana || '')}</div>` : ''}
      <table><tr><th class="n">#</th><th>Criança / adolescente</th>${l.dias.map(d => `<th class="c">${d.slice(8, 10)}</th>`).join('')}<th class="f">Freq.</th></tr>
      ${l.criancas.map((c, i) => { const tot = c.marcas.filter(Boolean).length, pres = c.marcas.filter(m => m === 'Presente').length;
        return `<tr><td class="n">${i + 1}</td><td>${esc(c.nome)}</td>${c.marcas.map(m => `<td class="c">${m ? SIT[m] : ''}</td>`).join('')}<td class="f">${tot ? Math.round(pres / tot * 100) + '%' : ''}</td></tr>`; }).join('')}</table>
      <p style="color:#777">P = presente · F = falta · FJ = falta justificada</p>
      <p style="margin-top:40px">______________________________________<br>Assinatura do(a) educador(a)</p></body></html>`);
    w.document.close();
  }

  // ───────── aba OFICINAS dentro do projeto
  function renderProjeto(atualProj) {
    montar();
    const aba = q('#viewDetalhe [data-aba="oficinas"]');
    if (aba) aba.classList.toggle('oculto', !!atualProj.novo || !pode('presenca'));
  }

  async function trocarAbaProjeto(nome) {
    const painel = document.getElementById('abaOficinas');
    if (!painel) return;
    painel.classList.toggle('oculto', nome !== 'oficinas');
    if (nome !== 'oficinas' || !atual || !atual.projeto) return;
    const idProj = String(atual.projeto.id_projeto), edita = pode('presenca', 'editar');
    try { await opcoes(true); } catch (err) { painel.innerHTML = `<div class="vazio">${esc(err.message)}</div>`; return; }
    const ofs = OP.oficinas.filter(o => o.id_projeto === idProj);
    painel.innerHTML = `<div class="titulo-linha"><h2 style="font-size:16px;margin:0">Oficinas do projeto</h2>${edita ? '<button class="btn" id="benNovaOf">+ Nova oficina</button>' : ''}</div>` +
      (ofs.length ? `<div class="tabela-wrap"><table><thead><tr><th>Oficina</th><th>Educador(a)</th><th>Dias</th><th class="num">Crianças</th><th>Situação</th><th></th></tr></thead><tbody>${
        ofs.map(o => `<tr class="${edita ? 'clicavel' : ''}" data-of="${esc(o.id)}"><td><b>${esc(o.nome)}</b></td><td>${esc(o.educador_nome || '')}</td><td>${esc(o.dias_semana || '')}</td>
          <td class="num">${o.ativos || 0}${o.vagas ? ' / ' + esc(o.vagas) : ''}</td><td>${st(o.status, corStatus(o.status))}</td>
          <td><button class="btn-link" data-lista="${esc(o.id)}">Lista de presença</button></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="vazio">Nenhuma oficina cadastrada neste projeto.</div>') +
      '<p class="dica">As crianças entram nas oficinas pela ficha (Beneficiários → ficha → Projetos). As datas da lista de presença saem dos dias da semana e do período da oficina (ou da vigência do projeto), tirando as férias e recessos abaixo.</p>';
    const recs = OP.recessos.filter(r => r.id_projeto === idProj);
    painel.insertAdjacentHTML('beforeend', `<div class="secao"><div class="titulo-linha"><h4 style="margin:0">Férias e recessos</h4>${edita ? '<button class="btn-sec" id="benNovoRec">+ Período</button>' : ''}</div>
      ${recs.length ? `<div class="tabela-wrap"><table><thead><tr><th>Período</th><th>De</th><th>Até</th><th></th></tr></thead><tbody>${recs.map(r => `<tr><td>${esc(r.descricao)}</td><td>${br(r.data_inicio)}</td><td>${br(r.data_fim)}</td>
        <td>${edita ? `<button class="btn-link" data-rec="${esc(r.id)}">editar</button> <button class="btn-link perigo" data-delrec="${esc(r.id)}">excluir</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="dica">Nenhum período cadastrado. As datas de férias ficam fora da lista de presença.</p>'}</div>`);
    const abrirRec = r => janela(r ? 'Editar período' : 'Férias ou recesso', renderForm('BEN_RECESSOS', r ? { descricao: r.descricao, data_inicio: r.data_inicio, data_fim: r.data_fim } : {}, ['id_projeto']), async d => {
      d.id_projeto = idProj; if (r) d.id_recesso = r.id;
      OP = await api('salvarRecesso', d); toast('Período salvo'); trocarAbaProjeto('oficinas');
    });
    if (q('#benNovoRec')) q('#benNovoRec').onclick = () => abrirRec(null);
    qq('[data-rec]', painel).forEach(bt => bt.onclick = () => abrirRec(recs.find(r => r.id === bt.dataset.rec)));
    qq('[data-delrec]', painel).forEach(bt => bt.onclick = async () => {
      if (!confirm('Excluir este período? As datas voltam para a lista de presença.')) return;
      try { OP = await api('excluirRecesso', { id_recesso: bt.dataset.delrec }); toast('Período excluído'); trocarAbaProjeto('oficinas'); } catch (err) { alert(err.message); }
    });
    const abrir = (valores, id) => janela(id ? 'Editar oficina' : 'Nova oficina', renderForm('OFICINAS', valores, ['id_projeto']), async d => {
      d.id_projeto = idProj; if (id) d.id_oficina = id;
      OP = await api('salvarOficina', d); toast('Oficina salva'); trocarAbaProjeto('oficinas');
    }, true);
    if (q('#benNovaOf')) q('#benNovaOf').onclick = () => abrir({});
    if (edita) qq('tr[data-of]', painel).forEach(tr => tr.onclick = async () => abrir(await api('obterOficina', { id_oficina: tr.dataset.of }), tr.dataset.of));
    qq('[data-lista]', painel).forEach(bt => bt.onclick = ev => {
      ev.stopPropagation(); E.alvoCh = 'O:' + bt.dataset.lista; E.dataCh = ''; E.mesCh = '';
      pode('presenca', 'editar') ? abrirChamada() : abrirFrequencia();
    });
  }

  // ───────── registro no site
  (window.MODULOS_TELA = window.MODULOS_TELA || []).push({
    nome: 'beneficiarios',
    areas: AREAS,
    rotas: ['beneficiarios', 'chamada', 'frequencia'],
    navIds: { navBen: 'beneficiarios', navBenCh: 'chamada', navBenFr: 'frequencia' },
    views: ['viewBen'],
    pode: podeAlgo,
    aplicarMenus: aplicarMenus,
    abrir: rota => {
      if (rota.tipo === 'chamada' && pode('presenca', 'editar')) return abrirChamada();
      if (rota.tipo === 'frequencia' && pode('presenca')) return abrirFrequencia();
      if (pode('beneficiarios')) return rota.tipo === 'beneficiarios' && rota.id ? abrirFicha(rota.id, rota.aba) : abrirLista();
      return pode('presenca', 'editar') ? abrirChamada() : abrirFrequencia();
    },
    renderProjeto: renderProjeto,
    trocarAbaProjeto: trocarAbaProjeto
  });
})();
