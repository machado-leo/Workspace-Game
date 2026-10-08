// O Spotify de cada um (public/js/spotify.js) e a janela ao lado (public/js/janela.js).
//
// O pedido: "cada um tivesse o seu e logasse na sua conta e escutasse suas musicas". A
// API do Spotify so aceita 5 pessoas por app desde fev/2026, entao o caminho e o player
// web do proprio Spotify numa janela no canto - a pessoa entra na conta dela, la. Aqui:
// a janela certa, sempre a mesma, o aviso quando o pop-up e bloqueado, o celular, e que
// o WhatsApp (que passou a usar a mesma janela.js) continua abrindo igual.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

// Um navegador: tela de 1920x1040 livres, pop-up liberado ou nao, dedo ou mouse.
function navegador({ bloqueia = false, celular = false } = {}) {
  const aberturas = [];
  const aviso = { textContent: '', classes: new Set(['oculto']) };
  aviso.classList = { remove: (c) => aviso.classes.delete(c), add: (c) => aviso.classes.add(c) };
  const ctx = {
    setTimeout: () => 0,
    screen: { availWidth: 1920, availHeight: 1040, availLeft: 0, availTop: 0 },
    innerWidth: celular ? 390 : 1920,
    matchMedia: () => ({ matches: celular }),
    open: (url, nome, recursos) => { aberturas.push([url, nome, recursos]); return bloqueia ? null : { focus() {} }; },
    document: { getElementById: (id) => (id === 'aviso-camera' ? aviso : null) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ['janela.js', 'whatsapp.js', 'spotify.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js', f), 'utf8'), ctx));
  return { ctx, aberturas, aviso };
}

console.log('\nSPOTIFY: A JANELA COMPLETA (onde a pessoa entra na conta)');
const n = navegador();
conferir('abre o player web do Spotify (a pessoa entra na conta dela, na pagina do Spotify)', n.ctx.Spotify.abrirCompleto(), true);
conferir('  numa janela no canto de baixo, a direita, menor que a do WhatsApp',
  n.aberturas[0], ['https://open.spotify.com/', 'spotify-sede', 'popup=yes,width=460,height=645,left=1460,top=395']);
n.ctx.Spotify.abrirCompleto();
conferir('clicar de novo usa a MESMA janela (nome fixo), nao abre outra', n.aberturas.map((a) => a[1]), ['spotify-sede', 'spotify-sede']);

const b = navegador({ bloqueia: true });
conferir('pop-up bloqueado: devolve false', b.ctx.Spotify.abrirCompleto(), false);
conferir('  e avisa na tela o que fazer', [b.aviso.classes.has('oculto'), /Spotify\. Libere pop-ups/.test(b.aviso.textContent)], [false, true]);

const c = navegador({ celular: true });
c.ctx.Spotify.abrirCompleto();
conferir('no celular: abre numa aba (o celular oferece o app do Spotify)', c.aberturas[0], ['https://open.spotify.com/', '_blank', 'noopener']);

console.log('\nSPOTIFY: O MINI-PLAYER NO ESCRITORIO');
const S = navegador().ctx.Spotify;
const ID = '37i9dQZF1DXcBWIGoYBM5M';
conferir('link de playlist copiado do Spotify vira playlist + id', S._lerLink('https://open.spotify.com/playlist/' + ID + '?si=abc123'), { tipo: 'playlist', id: ID });
conferir('  com o idioma no meio (intl-pt), album, podcast, e o link spotify:',
  [S._lerLink('https://open.spotify.com/intl-pt/album/' + ID).tipo, S._lerLink('https://open.spotify.com/show/' + ID).tipo, S._lerLink('spotify:track:' + ID).tipo],
  ['album', 'show', 'track']);
conferir('o player e montado AQUI, so com tipo e id', S._urlDoPlayer({ tipo: 'playlist', id: ID }), 'https://open.spotify.com/embed/playlist/' + ID + '?utm_source=generator');
conferir('link que nao e do Spotify nao vira player',
  ['https://evil.com/playlist/' + ID, 'https://open.spotify.com.evil.com/playlist/' + ID, 'https://openXspotifyYcom/playlist/' + ID, 'javascript:alert(1)', 'https://open.spotify.com/playlist/curto'].map((l) => !!S._lerLink(l).erro),
  [true, true, true, true, true]);
conferir('  as Musicas Curtidas explicam o que fazer (nao tocam fora do Spotify)', /Ponha elas numa playlist/.test(S._lerLink('https://open.spotify.com/collection/tracks').erro), true);
conferir('  o link curto do celular tambem', /link curto do celular/.test(S._lerLink('https://spotify.link/AbCdEf').erro), true);
let salvas = [];
for (let i = 0; i < 10; i++) salvas = S._acrescentar(salvas, { tipo: 'playlist', id: String(i).padStart(22, 'x') });
salvas = S._acrescentar(salvas, { tipo: 'playlist', id: '5'.padStart(22, 'x') });
conferir('a lista guarda as ultimas 8, a mais recente em cima, sem repetir',
  [salvas.length, salvas[0].id, salvas.filter((x) => x.id === '5'.padStart(22, 'x')).length], [8, '5'.padStart(22, 'x'), 1]);
conferir('adicionar de novo uma que ja tinha nome e capa nao perde os dois',
  S._acrescentar([{ tipo: 'playlist', id: ID, titulo: 'Foco', capa: 'https://i.scdn.co/image/abc' }], { tipo: 'playlist', id: ID }),
  [{ tipo: 'playlist', id: ID, titulo: 'Foco', capa: 'https://i.scdn.co/image/abc' }]);
conferir('o que volta do navegador passa de novo pela regra: capa de outro lugar cai, nome fica',
  S._limparItem({ tipo: 'playlist', id: ID, titulo: 'Foco', capa: 'https://evil.com/x.png' }), { tipo: 'playlist', id: ID, titulo: 'Foco', capa: null });
conferir('  e item mexido (tipo ou id inventado) some', [S._limparItem({ tipo: 'script', id: ID }), S._limparItem({ tipo: 'playlist', id: 'x' })], [null, null]);
console.log('\nSPOTIFY: ARRASTAR PRA ONDE QUISER');
// Espaco livre de 1000 x 600 (tela menos o tamanho do player e as margens de 8 px)
conferir('o lugar e fracao do espaco livre: 0 encosta a esquerda/em cima, 1 a direita/embaixo',
  [S._paraPixels({ fx: 0, fy: 0 }, 1000, 600), S._paraPixels({ fx: 1, fy: 1 }, 1000, 600), S._paraPixels({ fx: 0.5, fy: 0.25 }, 1000, 600)],
  [{ x: 8, y: 8 }, { x: 1008, y: 608 }, { x: 508, y: 158 }]);
conferir('  e volta: soltar em 508,158 da o mesmo lugar', S._paraFracao(508, 158, 1000, 600), { fx: 0.5, fy: 0.25 });
conferir('arrastar pra fora da tela para na borda (nunca some)',
  [S._paraFracao(-500, -40, 1000, 600), S._paraFracao(5000, 9000, 1000, 600)], [{ fx: 0, fy: 0 }, { fx: 1, fy: 1 }]);
const noCanto = S._paraFracao(1008, 608, 1000, 600);
conferir('  quem deixou no canto de baixo continua no canto quando a janela diminui (e o player muda de tamanho)',
  S._paraPixels(noCanto, 400, 300), { x: 408, y: 308 });
conferir('  sem espaco livre (tela menor que o player): encosta no canto de cima, sem numero negativo',
  S._paraPixels({ fx: 1, fy: 1 }, -50, -20), { x: 8, y: 8 });
conferir('lugar guardado mexido no navegador e ignorado (volta pro canto)',
  [S._lugarValido({ fx: 0.3, fy: 0.9 }), S._lugarValido({ fx: 2, fy: 0 }), S._lugarValido({ fx: 'x', fy: 0 }), S._lugarValido(null)], [true, false, false, false]);
const htmlArrasta = fs.readFileSync(path.join(raiz, 'public/index.html'), 'utf8');
conferir('a alca de arrastar e o "Voltar pro canto" estao na pagina',
  [/id="spotify-alca"/.test(htmlArrasta), /id="spotify-canto"/.test(htmlArrasta)], [true, true]);

const srv = fs.readFileSync(path.join(raiz, 'server/index.js'), 'utf8');
conferir('a CSP deixa abrir iframe so do Spotify', srv.match(/"frame-src [^"]*"/g), ['"frame-src https://open.spotify.com"']);
conferir('  e imagem de fora so a capa do Spotify (i.scdn.co)', srv.match(/"img-src [^"]*"/g), ['"img-src \'self\' data: blob: https://i.scdn.co"']);
conferir('o nome e a capa vem de uma rota so pra quem esta logado', /app\.get\('\/api\/spotify\/:tipo\/:id', sessao\.exigirLogin/.test(srv), true);
const htmlMini = fs.readFileSync(path.join(raiz, 'public/index.html'), 'utf8');
conferir('o mini-player esta na pagina, escondido ate clicar', /<section id="spotify-mini" class="spotify-mini oculto/.test(htmlMini), true);

console.log('\nSPOTIFY: O WHATSAPP CONTINUA IGUAL (mesma janela.js)');
const w = navegador();
w.ctx.WhatsApp.chamar('+55 (85) 99999-0000');
conferir('o WhatsApp abre na janela dele, na altura toda, do lado direito',
  w.aberturas[0], ['https://web.whatsapp.com/send?phone=5585999990000', 'whatsapp-sede', 'popup=yes,width=560,height=1040,left=1360,top=0']);
const wb = navegador({ bloqueia: true });
wb.ctx.WhatsApp.chamar('85999990000');
conferir('  e o aviso de pop-up bloqueado fala do WhatsApp', /WhatsApp\. Libere pop-ups/.test(wb.aviso.textContent), true);
const wc = navegador({ celular: true });
wc.ctx.WhatsApp.chamar('85999990000');
conferir('  no celular, o link do app', wc.aberturas[0], ['https://wa.me/85999990000', '_blank', 'noopener']);

console.log('\nSPOTIFY: NA PAGINA');
const html = fs.readFileSync(path.join(raiz, 'public/index.html'), 'utf8');
const pos = (s) => html.indexOf('<script src="js/' + s + '">');
conferir('o janela.js carrega antes do WhatsApp e do Spotify', [pos('janela.js') > 0, pos('janela.js') < pos('whatsapp.js'), pos('janela.js') < pos('spotify.js')], [true, true, true]);
conferir('o botao do Spotify esta no trilho, com nome', /<button id="btn-spotify" class="trilho-btn"[\s\S]*?<span class="trilho-nome">Spotify<\/span>/.test(html), true);
const main = fs.readFileSync(path.join(raiz, 'public/js/main.js'), 'utf8');
conferir('o main.js liga o botao', /Spotify\.init\(\)/.test(main), true);

// ------------------------------------------ o nome e a capa (server/spotify.js)
(async function () {
  console.log('\nSPOTIFY: NOME E CAPA PELO SERVIDOR');
  const SP = require('../server/spotify');
  SP._zerar();
  const pedidos = [];
  const falso = (resposta) => async (tipo, id) => { pedidos.push(tipo + '/' + id); return resposta; };
  const r1 = await SP.obter('playlist', ID, { buscar: falso({ title: 'Foco total\n<b>', thumbnail_url: 'https://i.scdn.co/image/ab67706f0000' }) });
  conferir('devolve o nome (limpo) e a capa do Spotify', r1, { titulo: 'Foco total  b', capa: 'https://i.scdn.co/image/ab67706f0000' });
  conferir('  o nome nao leva quebra de linha nem sinal de HTML', /[\n<>]/.test(r1.titulo), false);
  await SP.obter('playlist', ID, { buscar: falso({ title: 'outro' }) });
  conferir('  o segundo pedido do mesmo link vem do cache (nao vai ao Spotify)', pedidos.length, 1);
  const r2 = await SP.obter('album', ID, { buscar: falso({ title: 'Album', thumbnail_url: 'https://evil.com/capa.png' }) });
  conferir('capa que nao e do i.scdn.co nao passa', r2 && r2.capa, null);
  const antes = pedidos.length;
  conferir('tipo ou id invalido: nada, e o Spotify nem e chamado',
    [await SP.obter('script', ID, { buscar: falso({ title: 'x' }) }), await SP.obter('playlist', '../../x', { buscar: falso({ title: 'x' }) }), pedidos.length - antes],
    [null, null, 0]);
  conferir('Spotify fora do ar ou sem nome: null (o mini-player mostra o tipo)',
    [await SP.obter('show', ID, { buscar: async () => { throw new Error('rede'); } }), await SP.obter('track', ID, { buscar: falso({}) })], [null, null]);

  console.log('\n' + ok + ' passaram, ' + falhou + ' falharam');
  process.exit(falhou ? 1 : 0);
})();
