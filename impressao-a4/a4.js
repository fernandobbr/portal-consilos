/* CÓPIA de Desktop\painel-de-apps\assets\impressao-a4\a4.js em 28/10/2026 (portal, Inventário Produção). Corrigir na fonte e recopiar. */
/* =============================================================================
   Padrão Consilos de impressão: folha A4 em RETRATO (29/09/2026) -- o motor.
   Regras completas: skill impressao-a4-retrato (.claude\skills e .agents\skills).

   Uso na página (depois de a4.css):
     A4.configurar({
       titulo: 'MONTAGENS EM ABERTO',            // vai no cabeçalho de cada folha
       carimbo: 'ÚLTIMA ATUALIZAÇÃO: 28/09 13:51',
       logo: '../assets/logo-consilos.png',
       botoes: document.querySelector('.topo-interno'),   // onde pôr PRÉVIA A4 e IMPRIMIR
       montar: A4 => [ ...blocos na ordem da folha... ]
     });
   Blocos: A4.kpis, A4.tabela, A4.graficoSemanas, A4.graficoCategorias, A4.pizza, A4.bloco.
   A paginação é automática: bloco que não cabe vai para a folha seguinte; tabela
   longa quebra por linha e repete o cabeçalho; gráfico largo quebra em faixas.
   ============================================================================= */
(function () {
  'use strict';
  const LARG = 748, ALT = 1077;                 // área útil do A4 retrato com margem estreita de 6 mm, a 96 dpi
  const MOLDURA = 2 + 6;                        // moldura preta de 2px + 6px de respiro por dentro (a4.css)
  const LARG_C = LARG - 2 * MOLDURA;             // largura do conteúdo dentro da moldura
  const SVGNS = 'http://www.w3.org/2000/svg';
  const raiz = document.documentElement;
  let cfg = null, folhasEl = null;

  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const sv = (tag, at, txt) => { const e = document.createElementNS(SVGNS, tag); Object.entries(at || {}).forEach(([k, v]) => e.setAttribute(k, v)); if (txt !== undefined) e.textContent = txt; return e; };
  // largura aproximada de texto em Arial Narrow 12px negrito (o gráfico não mede o DOM: é desenhado em conta)
  const largTxt = t => String(t).length * 6.3 + 2;

  // ---- blocos -------------------------------------------------------------------------------------------
  function bloco(titulo, corpo, nota) {
    const b = el('section', 'a4-bloco');
    if (titulo) {
      const t = el('div', 'a4-bloco-tit');
      t.append(el('span', '', titulo));
      if (nota) t.append(el('small', '', nota));
      b.append(t);
    }
    const c = el('div', 'a4-bloco-corpo');
    if (corpo) c.append(...[].concat(corpo));
    b.append(c);
    return b;
  }

  function kpis(lista) {
    const g = el('div', 'a4-kpis');
    lista.forEach(k => {
      const d = el('div', 'a4-kpi'); if (k.cor) d.style.setProperty('--c', k.cor);
      d.append(el('b', '', k.rotulo), el('span', '', k.valor));
      if (k.extra) d.append(el('small', '', k.extra));
      g.append(d);
    });
    return g;
  }

  // tabela: { titulo, nota, colunas:[{rot, larg (em %), cls}], linhas:[[células]], rodape:[células], destaqueCol }
  // célula = texto ou { t, cls }. Quebra entre folhas por linha, com o cabeçalho repetido.
  function tabela(spec) {
    const b = tabelaNo(spec, spec.linhas, false, true);
    b._a4tab = spec;
    return b;
  }
  function tabelaNo(spec, linhas, continua, comRodape) {
    const t = el('table', 'a4-tab');
    const cg = el('colgroup');
    spec.colunas.forEach(c => { const col = el('col'); if (c.larg) col.style.width = c.larg + '%'; cg.append(col); });
    const cel = (tag, c, j) => {
      const o = typeof c === 'object' && c !== null ? c : { t: c };
      const d = el(tag, [spec.colunas[j] && spec.colunas[j].cls, o.cls, j === spec.destaqueCol ? 'a4-destaque' : ''].filter(Boolean).join(' '), o.t == null ? '' : String(o.t));
      if (o.t != null) d.title = String(o.t);
      return d;
    };
    const th = el('thead'), trh = el('tr');
    spec.colunas.forEach((c, j) => { const h = el('th', j === spec.destaqueCol ? 'a4-destaque' : '', c.rot); trh.append(h); });
    th.append(trh);
    const tb = el('tbody');
    linhas.forEach(l => { const tr = el('tr'); l.forEach((c, j) => tr.append(cel('td', c, j))); tb.append(tr); });
    t.append(cg, th, tb);
    if (comRodape && spec.rodape) { const tf = el('tfoot'), tr = el('tr'); spec.rodape.forEach((c, j) => tr.append(cel('td', c, j))); tf.append(tr); t.append(tf); }
    return bloco(spec.titulo ? spec.titulo + (continua ? ' (continuação)' : '') : '', t, spec.nota);
  }

  // gráfico por semana: { titulo, nota, semanas:[rótulo], destaque:i, series:[{nome, cor, valores[], dentro(v,i), sobre(v,i)}],
  //   linha:{ nome, valores[], rotulo(i) }, altura }  -- semana sem valor numa série não tem a barra dela
  function graficoSemanas(spec) {
    const grupos = spec.semanas.map((rot, i) => ({
      rot, destaque: i === spec.destaque,
      barras: spec.series.filter(s => s.valores[i] > 0).map(s => ({ v: s.valores[i], cor: s.cor, nome: s.nome,
        dentro: s.dentro ? s.dentro(s.valores[i], i) : '', sobre: s.sobre ? s.sobre(s.valores[i], i) : String(s.valores[i]) })),
      linha: spec.linha ? { v: spec.linha.valores[i], rot: spec.linha.rotulo ? spec.linha.rotulo(i) : '' } : null
    }));
    return faixas(grupos, spec);
  }
  // gráfico por categoria (ex.: centro de trabalho): { titulo, nota, itens:[{nome, valor, cor, dentro, sobre}], altura }
  function graficoCategorias(spec) {
    const grupos = spec.itens.map(it => ({ rot: null, barras: [{ v: it.valor, cor: it.cor || '#1f4e79', nome: it.nome, dentro: it.dentro || '', sobre: it.sobre || String(it.valor) }] }));
    return faixas(grupos, spec);
  }

  // divide os grupos em faixas que caibam na largura da folha e desenha cada faixa num bloco
  const EIXO = 58, BW = 36, GAP = 4, PAD = 6, MIN_BARRA = 16;
  function faixas(grupos, spec) {
    const util = LARG_C - 2 - EIXO;
    const larguraGrupo = g => {
      const n = Math.max(1, g.barras.length);
      // o nome na diagonal pode avançar por baixo do grupo da esquerda: não entra na conta da largura
      const linha = g.linha && g.linha.rot ? largTxt(g.linha.rot) + 8 : 0;
      return Math.max(n * BW + (n - 1) * GAP + 2 * PAD, g.rot ? largTxt(g.rot) + 12 : 0, linha, 44);
    };
    // o menor número de faixas que cabe, com os grupos repartidos entre elas por igual (em largura), na ordem
    const ws = grupos.map(larguraGrupo), totalW = ws.reduce((a, b) => a + b, 0);
    let pacotes = null;
    for (let k = Math.max(1, Math.ceil(totalW / util)); k <= grupos.length && !pacotes; k++) {
      const partes = Array.from({ length: k }, () => []), somas = new Array(k).fill(0);
      let acum = 0;
      grupos.forEach((g, i) => { const j = Math.min(k - 1, Math.floor((acum + ws[i] / 2) / (totalW / k))); partes[j].push(g); somas[j] += ws[i]; acum += ws[i]; });
      if (somas.every(s => s <= util) && partes.every(p => p.length)) pacotes = partes;
    }
    if (!pacotes) pacotes = grupos.map(g => [g]);      // cada grupo sozinho: o último recurso
    // escala comum a todas as faixas: as alturas se comparam entre elas
    const maior = Math.max(1, ...grupos.flatMap(g => g.barras.map(b => b.v).concat(g.linha ? [g.linha.v || 0] : [])));
    const bruto = maior / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const passo = [1, 2, 5, 10].map(m => m * mag).find(p => p >= bruto);
    const topo = passo * Math.ceil(maior / passo);
    const maxNome = Math.max(0, ...grupos.flatMap(g => g.barras.map(b => largTxt(b.nome))));
    return pacotes.map((p, k) => {
      const svg = desenharFaixa(p, { util, topo, passo, maxNome, altura: spec.altura || 190, larguraGrupo, fmtEixo: spec.fmtEixo });
      const tit = spec.titulo ? spec.titulo + (pacotes.length > 1 ? ' (' + (k + 1) + '/' + pacotes.length + ')' : '') : '';
      return bloco(tit, svg, spec.nota);
    });
  }

  function desenharFaixa(grupos, o) {
    const temCab = grupos.some(g => g.rot);
    const CAB = temCab ? 24 : 0, FOLGA = 30;                  // folga em cima para o número acima da barra mais alta
    const NOMES = Math.ceil(o.maxNome * 0.71) + 12;             // faixa dos nomes na diagonal
    const H = CAB + FOLGA + o.altura + NOMES;
    const W = LARG_C - 2;
    const chao = CAB + FOLGA + o.altura;
    const alt = v => v > 0 ? MIN_BARRA + (o.altura - MIN_BARRA) * v / o.topo : 0;
    const svg = sv('svg', { class: 'a4-graf', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    // larguras: proporcionais ao que cada grupo precisa, esticadas até a largura útil
    const precisa = grupos.map(o.larguraGrupo), totalP = precisa.reduce((a, b) => a + b, 0);
    const larg = precisa.map(w => w * o.util / totalP);
    const g0 = grupos[0];
    if (g0 && g0.barras.length) {
      const n0 = g0.barras.length, centro0 = EIXO + (larg[0] - (n0 * BW + (n0 - 1) * GAP)) / 2 + BW / 2;
      const falta = largTxt(g0.barras[0].nome) * 0.71 + 4 - centro0;
      if (falta > 0 && grupos.length > 1) {
        const resto = o.util - larg[0], novo0 = larg[0] + 2 * falta;
        for (let i = 1; i < larg.length; i++) larg[i] *= (o.util - novo0) / resto;
        larg[0] = novo0;
      }
    }
    let x = EIXO;
    const pos = larg.map(w => { const a = x; x += w; return a; });
    // grade e eixo
    for (let v = 0; v <= o.topo + o.passo / 2; v += o.passo) {
      const y = chao - alt(v) + (v === 0 ? 0 : 0);
      svg.append(sv('line', { x1: EIXO, x2: W, y1: y, y2: y, stroke: '#c8c8c8', 'stroke-dasharray': '4 3', 'stroke-width': 1 }));
      svg.append(sv('text', { x: EIXO - 6, y: y + 4, 'text-anchor': 'end' }, (o.fmtEixo || (n => n.toLocaleString('pt-BR')))(v)));
    }
    if (temCab) {
      svg.append(sv('rect', { x: 0, y: 0, width: EIXO, height: CAB, fill: '#c8102e', stroke: '#000000' }));
      svg.append(sv('text', { x: 6, y: 16, class: 'a4-t-sem' }, 'SEMANA'));
    }
    const topos = [];                                            // topo ocupado de cada grupo (número de cima)
    grupos.forEach((g, gi) => {
      const gx = pos[gi], gw = larg[gi];
      if (g.destaque) svg.append(sv('rect', { x: gx, y: CAB, width: gw, height: H - CAB, fill: 'rgba(128,128,128,0.18)' }));
      svg.append(sv('line', { x1: gx + gw, x2: gx + gw, y1: 0, y2: H, stroke: '#9e9e9e', 'stroke-width': 1 }));
      if (g.rot) {
        svg.append(sv('rect', { x: gx, y: 0, width: gw, height: CAB, fill: g.destaque ? '#8f0b21' : '#c8102e', stroke: '#000000' }));
        svg.append(sv('text', { x: gx + gw / 2, y: 16, 'text-anchor': 'middle', class: 'a4-t-sem' }, g.rot));
      }
      const n = g.barras.length, bloco = n * BW + (n - 1) * GAP;
      let bx = gx + (gw - bloco) / 2;
      let topoG = chao;
      g.barras.forEach(b => {
        const h = alt(b.v), y = chao - h;
        svg.append(sv('rect', { x: bx, y, width: BW, height: h, fill: b.cor }));
        if (b.dentro && h >= 15) svg.append(sv('text', { x: bx + BW / 2, y: y + 12, 'text-anchor': 'middle', class: 'a4-t-branco' }, b.dentro));
        if (b.sobre) svg.append(sv('text', { x: bx + BW / 2, y: y - 4, 'text-anchor': 'middle' }, b.sobre));
        topoG = Math.min(topoG, y - 18);
        // nome na diagonal, terminando embaixo do meio da barra
        const cx = bx + BW / 2, cy = chao + 8;
        svg.append(sv('text', { x: cx, y: cy, 'text-anchor': 'end', transform: `rotate(-45 ${cx} ${cy})` }, b.nome));
        bx += BW + GAP;
      });
      topos.push(topoG);
    });
    svg.append(sv('line', { x1: EIXO, x2: W, y1: chao, y2: chao, stroke: '#000000', 'stroke-width': 1 }));
    svg.append(sv('line', { x1: EIXO, x2: EIXO, y1: CAB, y2: chao, stroke: '#000000', 'stroke-width': 1 }));
    // linha de tendência: ponto no meio do grupo; o número vai acima do ponto, ou acima do que houver na semana
    if (grupos.some(g => g.linha)) {
      const pts = grupos.map((g, gi) => ({ x: pos[gi] + larg[gi] / 2, y: chao - alt(g.linha ? g.linha.v : 0), g, gi }));
      svg.append(sv('polyline', { points: pts.map(p => p.x + ',' + p.y).join(' '), fill: 'none', stroke: '#000000', 'stroke-width': 2 }));
      pts.forEach(p => {
        svg.append(sv('circle', { cx: p.x, cy: p.y, r: 4, fill: '#000000', stroke: '#ffffff', 'stroke-width': 1.5 }));
        if (!p.g.linha || !p.g.linha.rot) return;
        let y = p.y - 8;
        if (y > topos[p.gi]) {                         // o número bateria nas barras: sobe acima delas, com traço até o ponto
          y = Math.max(CAB + 14, topos[p.gi] - 5);
          svg.append(sv('line', { x1: p.x, x2: p.x, y1: y + 3, y2: p.y - 5, stroke: '#000000', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
        }
        svg.append(sv('text', { x: p.x, y, 'text-anchor': 'middle', class: 'a4-t-linha' }, p.g.linha.rot));
      });
    }
    return svg;
  }

  // pizza: { titulo, nota, itens:[{nome, cor, valor, extra}], fmtPct } -- fatia pequena desenhada com 14% no mínimo
  function pizza(spec) {
    const tot = spec.itens.reduce((s, i) => s + i.valor, 0) || 1;
    const reais = spec.itens.map(i => 100 * i.valor / tot);
    const MIN = 14, peq = reais.filter(p => p > 0 && p < MIN).length, somaG = reais.filter(p => p >= MIN).reduce((a, b) => a + b, 0) || 1;
    const des = reais.map(p => p <= 0 ? 0 : p < MIN ? MIN : p * (100 - MIN * peq) / somaG);
    const R = 80, svg = sv('svg', { class: 'a4-graf', width: 2 * R + 2, height: 2 * R + 2, viewBox: `-1 -1 ${2 * R + 2} ${2 * R + 2}` });
    svg.style.width = (2 * R + 2) + 'px';
    let ang = 0;
    const fmt = spec.fmtPct || (p => p.toFixed(1).replace('.', ',') + '%');
    spec.itens.forEach((it, k) => {
      if (!des[k]) return;
      const a0 = ang / 100 * 2 * Math.PI, a1 = (ang + des[k]) / 100 * 2 * Math.PI;
      const P = a => [R + R * Math.sin(a), R - R * Math.cos(a)];
      const [x0, y0] = P(a0), [x1, y1] = P(a1);
      const d = des[k] >= 99.99 ? `M ${R} 0 A ${R} ${R} 0 1 1 ${R - 0.01} 0 Z` : `M ${R} ${R} L ${x0} ${y0} A ${R} ${R} 0 ${des[k] > 50 ? 1 : 0} 1 ${x1} ${y1} Z`;
      svg.append(sv('path', { d, fill: it.cor, stroke: '#ffffff', 'stroke-width': 1 }));
      const m = (a0 + a1) / 2;
      svg.append(sv('text', { x: R + R * 0.62 * Math.sin(m), y: R - R * 0.62 * Math.cos(m) + 4, 'text-anchor': 'middle', class: 'a4-t-branco' }, fmt(reais[k])));
      ang += des[k];
    });
    svg.append(sv('circle', { cx: R, cy: R, r: R, fill: 'none', stroke: '#000000', 'stroke-width': 1 }));
    const lista = el('div', 'a4-pizza-lista');
    spec.itens.forEach(it => {
      const d = el('div'), i = el('i'); i.style.background = it.cor;
      d.append(i, el('b', '', it.nome)); if (it.extra) d.append(el('span', '', it.extra));
      lista.append(d);
    });
    const caixa = el('div', 'a4-pizza'); caixa.append(svg, lista);
    const extra = [].concat(spec.depois || []);
    return bloco(spec.titulo, [caixa, ...extra], spec.nota);
  }

  // ---- paginação -----------------------------------------------------------------------------------------
  function novaFolha() {
    const f = el('div', 'a4-folha');
    const cab = el('header', 'a4-cab');
    if (cfg.logo) { const img = el('img'); img.src = cfg.logo; img.alt = 'Consilos'; cab.append(img); }
    cab.append(el('h1', '', cfg.titulo || ''));
    const dir = el('div', 'a4-cab-dir'); dir.append(el('div', '', cfg.carimbo || ''), el('div', 'a4-num', ''));
    cab.append(dir);
    f.append(cab);
    folhasEl.append(f);
    return f;
  }
  const cabe = f => f.scrollHeight <= f.clientHeight + 0.5;   // a altura útil já desconta a moldura

  function gerar() {
    if (!cfg) return;
    folhasEl?.remove();
    folhasEl = el('div', 'a4-folhas');
    // mede fora da tela: as folhas precisam existir no layout para a altura valer
    const medindo = !raiz.classList.contains('a4-previa');
    if (medindo) Object.assign(folhasEl.style, { display: 'block', position: 'absolute', left: '-20000px', top: '0', visibility: 'hidden' });
    document.body.append(folhasEl);
    const blocos = [].concat(...cfg.montar(A4).map(b => [].concat(b))).filter(Boolean);
    let f = novaFolha();
    const avisos = [];
    blocos.forEach(b => {
      f.append(b);
      if (cabe(f)) return;
      b.remove();
      // tabela longa quebra entre folhas; a curta (até 12 linhas) vai inteira para a próxima, sem sobrar pedaço
      if (b._a4tab && b._a4tab.linhas.length > 12) { f = quebrarTabela(b._a4tab, f); return; }
      if (f.children.length > 1) f = novaFolha();
      f.append(b);
      if (!cabe(f)) avisos.push('bloco maior que uma folha: ' + (b.querySelector('.a4-bloco-tit span')?.textContent || b.className));
    });
    const todas = [...folhasEl.querySelectorAll('.a4-folha')];
    todas.forEach((fl, i) => { fl.querySelector('.a4-num').textContent = 'FOLHA ' + (i + 1) + ' DE ' + todas.length; });
    if (medindo) folhasEl.removeAttribute('style');
    A4.avisos = avisos;
    if (avisos.length) console.warn('[A4]', avisos.join(' | '));
    return todas.length;
  }

  // põe na folha atual o máximo de linhas que couber (pelo menos 3), o resto segue nas próximas com o cabeçalho repetido
  function quebrarTabela(spec, f) {
    let resto = spec.linhas.slice(), continua = false;
    while (resto.length) {
      const ultimaParte = n => n === resto.length;
      const tentar = n => { const b = tabelaNo(spec, resto.slice(0, n), continua, ultimaParte(n)); f.append(b); const ok = cabe(f); b.remove(); return ok; };
      let lo = 0, hi = resto.length;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (tentar(mid)) lo = mid; else hi = mid - 1; }
      if (lo < Math.min(3, resto.length) && f.children.length > 1) { f = novaFolha(); continue; }
      const n = Math.max(lo, 1);
      f.append(tabelaNo(spec, resto.slice(0, n), continua, ultimaParte(n)));
      resto = resto.slice(n); continua = true;
      if (resto.length) f = novaFolha();
    }
    return f;
  }

  // ---- prévia, impressão e botões -----------------------------------------------------------------------------
  function previa(ligar) {
    if (ligar) {
      raiz.classList.add('a4-previa');
      const n = gerar();
      if (!document.querySelector('.a4-barra')) {
        const barra = el('div', 'a4-barra');
        const txt = el('span', '', '');
        const b1 = el('button', 'a4-btn', 'IMPRIMIR'); b1.type = 'button'; b1.addEventListener('click', imprimir);
        const b2 = el('button', 'a4-btn a4-sec', 'VOLTAR PARA A TELA'); b2.type = 'button'; b2.addEventListener('click', () => previa(false));
        barra.append(txt, b1); if (!cfg.telaFolha) barra.append(b2);   // tela em folha: não há outra tela para onde voltar
        document.body.prepend(barra);
      }
      document.querySelector('.a4-barra span').textContent = (cfg.telaFolha ? (cfg.titulo || '') + ' · ' : 'PRÉVIA DA IMPRESSÃO · A4 RETRATO · ') + n + (n === 1 ? ' FOLHA' : ' FOLHAS')
        + (A4.avisos.length ? ' · ATENÇÃO: ' + A4.avisos.join('; ') : '');
      window.scrollTo(0, 0);
    } else {
      raiz.classList.remove('a4-previa');
      folhasEl?.remove(); folhasEl = null;
      window.dispatchEvent(new Event('resize'));
    }
  }
  function imprimir() { gerar(); window.print(); }

  // Ctrl+P também sai no padrão: as folhas são geradas antes de o navegador montar a impressão
  window.addEventListener('beforeprint', () => { if (!folhasEl) gerar(); });
  window.addEventListener('afterprint', () => { if (!raiz.classList.contains('a4-previa')) { folhasEl?.remove(); folhasEl = null; } });

  function configurar(c) {
    cfg = c;
    // telaFolha: a própria tela é a folha A4 (relatório feito para o papel); #a4 abre qualquer página na prévia
    if (c.telaFolha || location.hash === '#a4') setTimeout(() => previa(true), c.telaFolha ? 0 : 400);
    if (c.botoes) {
      const b1 = el('button', 'a4-btn a4-sec', 'PRÉVIA A4'); b1.type = 'button'; b1.addEventListener('click', () => previa(true));
      const b2 = el('button', 'a4-btn', 'IMPRIMIR A4'); b2.type = 'button'; b2.addEventListener('click', imprimir);
      c.botoes.append(b1, b2);
    }
  }

  const A4 = { LARG, ALT, configurar, gerar, previa, imprimir, bloco, kpis, tabela, graficoSemanas, graficoCategorias, pizza, avisos: [] };
  window.A4 = A4;
})();
