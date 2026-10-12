// =====================================================
// Raízes do Nordeste — lógica da aplicação
// Contém o estado, as regras de negócio, as telas do cliente e da
// equipe e o tratamento de eventos. Usa os dados de dados.js e desenha
// cada tela dentro de <main>, em JavaScript puro, sem frameworks.
// Conta, pedidos, estoque e auditoria ficam apenas na memória
// desta aba: recarregar a página restaura os dados fictícios.
// =====================================================


// -----------------------------------------------------
// 1. Estado da aplicação
// -----------------------------------------------------

// Tudo o que muda durante o uso fica neste objeto.
// Cada tela é redesenhada a partir dele.
const estado = {
    unidade: 'recife',
    canal: 'web',
    tela: 'cardapio',
    carrinho: [],          // itens escolhidos: { id, quantidade }
    conta: null,           // conta fictícia criada nesta sessão
    usuario: null,         // conta conectada no momento
    pedidos: [],
    cupom: '',
    recompensa: false,     // cliente escolheu usar pontos no pedido
    filtro: '',
    busca: '',
    perfil: 'atendente',   // papel escolhido na área da equipe
    auditoria: [],
    pagamento: null,       // pedido aguardando retorno do provedor
    ultimoRetorno: '',     // mensagem da última tentativa de pagamento sem sucesso
    sequencia: 0
};

// Área onde as telas são desenhadas
const conteudo = document.querySelector('#conteudo');

// Cópia do estoque inicial, usada para reiniciar a demonstração
const estoqueInicial = PRODUTOS.map(p => ({ ...p.estoque }));

// Nomes dos canais exibidos na interface
const NOMES_CANAIS = { web: 'Web', app: 'App', totem: 'Totem', balcao: 'Balcão' };

// Momento da última interação (usado pelo totem)
let atividade = Date.now();

// Controle do tempo da mensagem flutuante
let avisoTimer;


// -----------------------------------------------------
// 2. Funções auxiliares
// -----------------------------------------------------

// Converte centavos em reais (ex.: 1400 → R$ 14,00)
function dinheiro(valor) {
    return (valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Impede que um texto digitado seja interpretado como HTML
function escapar(valor) {
    const trocas = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(valor).replace(/[&<>"']/g, caractere => trocas[caractere]);
}

// Busca um produto pelo código
function produto(id) {
    return PRODUTOS.find(p => p.id === Number(id));
}

// Unidade selecionada no momento
function loja() {
    return unidadePorId(estado.unidade);
}

function unidadePorId(id) {
    return UNIDADES.find(u => u.id === id);
}

// Produto sazonal só aparece como disponível nos meses cadastrados
function sazonal(p) {
    return !p.meses || p.meses.includes(new Date().getMonth() + 1);
}

// Disponível = dentro da temporada e com saldo na unidade escolhida
function disponivel(p) {
    return sazonal(p) && (p.estoque[estado.unidade] || 0) > 0;
}

// Data e hora no formato brasileiro
function agora() {
    return new Date().toLocaleString('pt-BR');
}

// Hora prevista daqui a alguns minutos (ex.: 12:47)
function horaDaqui(minutos) {
    const data = new Date(Date.now() + minutos * 60000);
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Total de itens no carrinho, exibido no botão "Meu pedido"
function quantidadeNoCarrinho() {
    return estado.carrinho.reduce((soma, item) => soma + item.quantidade, 0);
}

// Mostra uma mensagem curta no rodapé da tela por 7 segundos
function avisar(texto) {
    const caixa = document.querySelector('#mensagem');
    clearTimeout(avisoTimer);
    caixa.textContent = texto;
    avisoTimer = setTimeout(() => { caixa.textContent = ''; }, 7000);
}

// Registra operações sensíveis para a auditoria da gerência
function registrar(acao) {
    estado.auditoria.unshift({
        hora: new Date().toLocaleTimeString('pt-BR'),
        acao,
        unidade: loja().nome,
        perfil: estado.perfil,
        canal: NOMES_CANAIS[estado.canal]
    });
}

// Registra quando o cliente concede ou revoga uma autorização (LGPD, art. 8º)
function registrarConsentimento(usuario, finalidade, situacao) {
    usuario.consentimentos.unshift({ data: agora(), finalidade, situacao, canal: NOMES_CANAIS[estado.canal] });
}


// -----------------------------------------------------
// 3. Regras de negócio
// -----------------------------------------------------

// Subtotal, descontos e total do carrinho, sempre em centavos
function totais() {
    const subtotal = estado.carrinho.reduce((soma, item) => soma + produto(item.id).preco * item.quantidade, 0);

    // Cupom: percentual sobre o subtotal
    const cupom = CUPONS[estado.cupom];
    const desconto = cupom ? Math.round(subtotal * cupom.percentual / 100) : 0;

    // Recompensa: até R$ 5,00, nunca maior que o valor restante
    const podeResgatar = estado.recompensa && estado.usuario && estado.usuario.pontos >= FIDELIDADE.pontosResgate;
    const beneficio = podeResgatar ? Math.min(FIDELIDADE.valorResgate, subtotal - desconto) : 0;

    return { subtotal, desconto, beneficio, total: subtotal - desconto - beneficio };
}

// Pedidos de um cliente que não foram cancelados
function pedidosPagos(usuario) {
    return estado.pedidos.filter(p => p.cliente === usuario && p.status !== 'Cancelado');
}

// Campanha personalizada: só com autorização e pela frequência de pedidos.
// Idade e outros dados de perfil não são usados (minimização).
function elegivelFregues() {
    const u = estado.usuario;
    return !!u && u.marketing && pedidosPagos(u).length >= FIDELIDADE.pedidosFregues;
}

// Código do cupom de uma campanha na unidade escolhida (ex.: RAIZES_RECIFE_7F3A)
function codigoCupom(campanha) {
    return Object.keys(CUPONS).find(c => CUPONS[c].unidade === estado.unidade && CUPONS[c].campanha === campanha);
}

// Confere um código de cupom e devolve a mensagem para o cliente
function validarCupom(codigo) {
    const cupom = CUPONS[codigo];
    if (!codigo) return { ok: true, mensagem: 'Cupom removido.' };
    if (!cupom) return { ok: false, mensagem: `Cupom inválido. Confira o código ou use ${codigoCupom('boas-vindas')}.` };
    if (cupom.unidade !== estado.unidade) {
        return { ok: false, mensagem: `Este cupom é da unidade ${unidadePorId(cupom.unidade).nome}. Nesta unidade, use ${codigoCupom('boas-vindas')}.` };
    }
    if (cupom.vencido) return { ok: false, mensagem: 'Este cupom está vencido. A campanha junina terminou em 30/06.' };
    if (!cupom.publico && !elegivelFregues()) {
        return { ok: false, mensagem: 'Este cupom é exclusivo para clientes que autorizaram campanhas personalizadas e já fizeram 2 pedidos.' };
    }
    return { ok: true, mensagem: `Desconto de ${cupom.percentual}% aplicado.` };
}

// Pedidos aguardando a cozinha nesta unidade (inclui a fila de outros canais)
function pedidosNaFila(unidadeId) {
    const ativos = estado.pedidos.filter(p => p.unidade === unidadeId && ['Confirmado', 'Em preparo'].includes(p.status)).length;
    return unidadePorId(unidadeId).filaSimulada + ativos;
}

// Tempo estimado para retirada, em minutos
function tempoEstimado(unidadeId) {
    return FILA.minutosBase + FILA.minutosPorPedido * pedidosNaFila(unidadeId);
}

// Classificação do movimento da loja, usada para avisar o horário de pico
function movimento(unidadeId) {
    const fila = pedidosNaFila(unidadeId);
    if (fila <= 1) return 'Tranquilo';
    if (fila <= 3) return 'Moderado';
    return 'Intenso';
}

// Verifica se o papel atual pode avançar o pedido para a próxima etapa
function podeAvancar(pedido) {
    const regra = TRANSICOES[pedido.status];
    return !!regra && regra.perfil === estado.perfil && pedido.unidade === estado.unidade;
}

// Cliente cancela antes do preparo; gerente também durante o preparo
function podeCancelar(pedido) {
    if (!pedido) return false;
    if (estado.tela === 'operacao') {
        return estado.perfil === 'gerente' && ['Confirmado', 'Em preparo'].includes(pedido.status);
    }
    const doCliente = !pedido.cliente || pedido.cliente === estado.usuario;
    return pedido.status === 'Confirmado' && doCliente;
}

// Totem e App são canais do cliente: não mostram a área da equipe
function canalDoCliente() {
    return estado.canal === 'totem' || estado.canal === 'app';
}


// -----------------------------------------------------
// 4. Navegação
// -----------------------------------------------------

// Desenha a tela pedida e atualiza o cabeçalho
function navegar(tela, foco = true) {
    const telas = {
        cardapio: telaCardapio,
        carrinho: telaCarrinho,
        conta: telaConta,
        checkout: telaCheckout,
        pedidos: telaPedidos,
        fidelidade: telaFidelidade,
        privacidade: telaPrivacidade,
        operacao: telaOperacao,
        guia: telaGuia
    };

    // A equipe não usa os canais do cliente
    if (tela === 'operacao' && canalDoCliente()) {
        avisar(`A área da equipe não fica disponível no canal ${NOMES_CANAIS[estado.canal]}.`);
        tela = 'cardapio';
    }

    estado.tela = tela;
    document.querySelector('#canal').value = estado.canal;
    document.querySelector('#unidade').value = estado.unidade;
    document.body.dataset.canal = estado.canal;
    document.querySelector('#quantidade').textContent = quantidadeNoCarrinho();

    // Destaca o botão da tela atual
    document.querySelectorAll('nav button').forEach(botao => {
        botao.setAttribute('aria-current', botao.dataset.tela === tela ? 'page' : 'false');
    });

    conteudo.innerHTML = (telas[tela] || telaCardapio)();
    if (foco) conteudo.focus();
}


// -----------------------------------------------------
// 5. Telas do cliente
// -----------------------------------------------------

// Cardápio da unidade escolhida
function telaCardapio() {
    const unidade = loja();
    const busca = estado.busca.toLocaleLowerCase('pt-BR');

    // Só aparecem produtos vendidos na unidade, respeitando filtro e busca
    const itens = PRODUTOS.filter(p =>
        p.estoque[estado.unidade] !== undefined &&
        (!estado.filtro || p.categoria === estado.filtro) &&
        p.nome.toLocaleLowerCase('pt-BR').includes(busca)
    );

    const categorias = ['Cuscuz', 'Tapiocas', 'Doces', 'Bebidas']
        .map(c => `<option ${estado.filtro === c ? 'selected' : ''}>${c}</option>`)
        .join('');

    const cartoes = itens.map(cartaoProduto).join('') || '<p>Vixe, não achamos esse prato. Tente outra busca.</p>';

    // O cardápio fala com sotaque; as demais telas mantêm a linguagem formal
    return `
        <section class="intro">
            <h1>Oxente, bateu a fome?</h1>
            <p>Escolha seu lanche e retire em ${escapar(unidade.nome)}. Avexe não, escolha com calma.</p>
            <p>${unidade.aberta ? 'Unidade aberta' : 'Unidade fechada'} na simulação · horário de referência: ${unidade.horario} · cozinha ${unidade.cozinha}</p>
        </section>
        ${painelMovimento()}
        ${painelCampanhas()}
        <div class="filtros">
            <label>Buscar produto
                <input id="busca" type="search" value="${escapar(estado.busca)}" placeholder="Ex.: tapioca">
            </label>
            <label>Categoria
                <select id="categoria"><option value="">Todas</option>${categorias}</select>
            </label>
            <button id="filtrar">Buscar</button>
        </div>
        <div class="grade">${cartoes}</div>`;
}

// Cartão de um produto do cardápio
function cartaoProduto(p) {
    const situacao = !sazonal(p) ? 'Fora da temporada' : disponivel(p) ? 'Disponível' : 'Esgotado nesta unidade';
    const bloqueado = !disponivel(p) || !loja().aberta;

    return `
        <article class="produto">
            <div class="desenho" aria-hidden="true"><img src="imagens/${p.icone}.svg" alt=""></div>
            <div class="item-topo">
                <h2>${p.nome}</h2>
                <span class="preco">${dinheiro(p.preco)}</span>
            </div>
            <p>${p.descricao}</p>
            <span class="etiqueta ${disponivel(p) ? '' : 'etiqueta-indisponivel'}">${situacao}</span>
            <button data-adicionar="${p.id}" aria-label="Adicionar ${p.nome}" ${bloqueado ? 'disabled' : ''}>Adicionar</button>
        </article>`;
}

// Movimento da loja: prepara o cliente para a espera no horário de pico
function painelMovimento() {
    const unidade = loja();
    if (!unidade.aberta) {
        return '<p class="nota nota-erro">Esta unidade está fechada agora. Escolha outra unidade para fazer o pedido.</p>';
    }

    const nivel = movimento(unidade.id);
    const pico = nivel === 'Intenso'
        ? ' Horário de pico: seu pedido entra na fila assim que o pagamento for aprovado.'
        : '';

    return `
        <p class="movimento movimento-${nivel.toLowerCase()}" id="movimento">
            <strong>Movimento agora: ${nivel}</strong> · ${pedidosNaFila(unidade.id)} pedidos na fila ·
            retirada em cerca de ${tempoEstimado(unidade.id)} min.${pico}
        </p>`;
}

// Campanha pública e, se houver autorização, a campanha personalizada
function painelCampanhas() {
    let html = `<p class="nota">Campanha de boas-vindas: use <strong>${codigoCupom('boas-vindas')}</strong> e ganhe 10% de desconto nesta unidade. Uma aplicação por pedido.</p>`;
    if (elegivelFregues()) html += ofertaPersonalizada();
    return html;
}

// Oferta personalizada com a explicação de por que ela aparece
function ofertaPersonalizada() {
    const u = estado.usuario;
    const autorizacao = u.consentimentos.find(c => c.finalidade === 'Campanhas personalizadas' && c.situacao === 'Autorizado');

    return `
        <section class="oferta" id="oferta-personalizada">
            <h2>Freguês da casa, ${escapar(u.nome)}!</h2>
            <p>Use <strong>${codigoCupom('fregues')}</strong> e ganhe 15% no próximo pedido nesta unidade.</p>
            <details>
                <summary>Por que estou vendo esta oferta?</summary>
                <p>Você autorizou campanhas personalizadas${autorizacao ? ` em ${autorizacao.data}` : ''} e já fez
                ${pedidosPagos(u).length} pedidos pagos. Usamos somente a quantidade de pedidos:
                não usamos idade, localização ou outros dados do seu perfil.</p>
                <p>Você pode revogar a autorização em <a href="#privacidade" data-tela="privacidade">Privacidade e meus dados</a>.</p>
            </details>
        </section>`;
}

// Carrinho: quantidades, cupom, pontos e total
function telaCarrinho() {
    if (!estado.carrinho.length) {
        return `
            <h1>Meu pedido</h1>
            <p>Seu pedido está vazio.</p>
            <button data-tela="cardapio">Escolher no cardápio</button>`;
    }

    const t = totais();
    const cupom = CUPONS[estado.cupom];

    const linhas = estado.carrinho.map(item => {
        const p = produto(item.id);
        return `
            <div class="linha">
                <div><strong>${p.nome}</strong><br>${dinheiro(p.preco)} cada</div>
                <button data-diminuir="${p.id}" aria-label="Diminuir ${p.nome}">−</button>
                <span>${item.quantidade}</span>
                <button data-adicionar="${p.id}" aria-label="Aumentar ${p.nome}">+</button>
                <strong>${dinheiro(p.preco * item.quantidade)}</strong>
            </div>`;
    }).join('');

    // Recompensa só aparece para quem está conectado
    const recompensa = estado.usuario
        ? `<label><input id="recompensa" type="checkbox" ${estado.recompensa ? 'checked' : ''} ${estado.usuario.pontos < FIDELIDADE.pontosResgate ? 'disabled' : ''}>
               Usar ${FIDELIDADE.pontosResgate} pontos por até ${dinheiro(FIDELIDADE.valorResgate)} de desconto (saldo: ${estado.usuario.pontos})</label>`
        : '<p>Entre na sua conta para acumular pontos e usar recompensas.</p>';

    return `
        <h1>Meu pedido</h1>
        <p>Retirada em ${escapar(loja().nome)}. Trocar de unidade limpa os itens após confirmação.</p>
        <div class="painel">
            ${linhas}
            <form id="cupom-form" class="formulario">
                <label>Cupom
                    <input name="cupom" value="${escapar(estado.cupom)}" maxlength="30" placeholder="${codigoCupom('boas-vindas')}" aria-describedby="erro-cupom">
                </label>
                <p id="erro-cupom" class="erro" role="alert"></p>
                ${cupom ? `<p class="sucesso">Cupom aplicado: ${cupom.descricao}.</p>` : ''}
                <button>Aplicar cupom</button>
            </form>
            ${recompensa}
            <div class="resumo">
                <p>Subtotal: ${dinheiro(t.subtotal)}<br>
                   Cupom: −${dinheiro(t.desconto)}<br>
                   Recompensa: −${dinheiro(t.beneficio)}</p>
                <p class="total">Total: ${dinheiro(t.total)}</p>
                <p>Previsão de retirada: cerca de ${tempoEstimado(estado.unidade)} min após a aprovação do pagamento.</p>
            </div>
            <button data-tela="checkout">Continuar para pagamento</button>
        </div>`;
}

// Cadastro e login fictícios
function telaConta() {
    if (estado.usuario) {
        return `
            <h1>Minha conta</h1>
            <div class="painel">
                <p>Olá, ${escapar(estado.usuario.nome)}!</p>
                <p>${escapar(estado.usuario.email)}</p>
                <p>Saldo: ${estado.usuario.pontos} pontos.</p>
                <div class="acoes">
                    <button id="sair">Sair da conta</button>
                    <button class="secundario" data-tela="privacidade">Gerenciar meus dados</button>
                </div>
            </div>`;
    }

    // No totem, o aparelho é compartilhado: reforça o encerramento da sessão
    const avisoTotem = estado.canal === 'totem'
        ? '<p class="nota">Você está em um totem compartilhado. Ao terminar, toque em “Encerrar sessão e limpar dados”. Sem uso por 2 minutos, a sessão é limpa automaticamente.</p>'
        : '';

    return `
        <h1>Minha conta</h1>
        <p>Use somente dados fictícios. Cadastro e login são simulados nesta aba; fechar ou recarregar a página apaga tudo.</p>
        ${avisoTotem}
        <div class="colunas">
            <section class="painel">
                <h2>Entrar</h2>
                <form id="login" class="formulario">
                    <label>E-mail<input name="email" type="email" autocomplete="off" required></label>
                    <label>Senha fictícia<input name="senha" type="password" autocomplete="off" required></label>
                    <p id="erro-login" class="erro" role="alert"></p>
                    <button>Entrar</button>
                </form>
            </section>
            <section class="painel">
                <h2>Criar cadastro de teste</h2>
                <form id="cadastro" class="formulario">
                    <label>Nome fictício<input name="nome" minlength="2" maxlength="60" required></label>
                    <label>E-mail fictício<input name="email" type="email" required></label>
                    <label>Senha fictícia (mínimo 6 caracteres)<input name="senha" type="password" minlength="6" required></label>
                    <p class="dica">Pedimos apenas nome, e-mail e senha. Não pedimos CPF, endereço, idade ou dados bancários.</p>
                    <label><input name="privacidade" type="checkbox" required>Li o <a href="#privacidade" data-tela="privacidade">aviso de privacidade</a> e estou ciente do uso dos dados para minha conta e meus pontos.</label>
                    <label><input name="marketing" type="checkbox">Quero receber campanhas personalizadas (opcional, posso revogar quando quiser).</label>
                    <button>Cadastrar</button>
                </form>
            </section>
        </div>`;
}

// Opções de pagamento conforme o canal (totem e balcão usam maquininha)
function formasDePagamento() {
    if (estado.canal === 'totem' || estado.canal === 'balcao') {
        return ['Cartão na maquininha (provedor externo)', 'Pix (QR Code na tela)'];
    }
    return ['Pix', 'Cartão pelo provedor externo'];
}

// Etapas visuais da solicitação de pagamento
function etapasPagamento() {
    const pendente = !!estado.pagamento;
    const falhou = !pendente && !!estado.ultimoRetorno;

    const etapas = [
        { nome: 'Pedido revisado', classe: 'feita' },
        { nome: 'Solicitação enviada ao provedor', classe: pendente || falhou ? 'feita' : '' },
        { nome: pendente ? 'Aguardando resposta do provedor…' : falhou ? 'Pagamento não concluído' : 'Resposta do provedor', classe: pendente ? 'atual' : falhou ? 'falha' : '' },
        { nome: 'Pedido confirmado e enviado à cozinha', classe: '' }
    ];

    return `<ol class="etapas-pagamento" aria-label="Etapas do pagamento">
        ${etapas.map(e => `<li class="${e.classe}">${e.nome}</li>`).join('')}
    </ol>`;
}

// Pagamento: solicitação ao serviço externo (simulado)
function telaCheckout() {
    if (!estado.carrinho.length) return telaCarrinho();

    const pendente = !!estado.pagamento;
    const opcoes = formasDePagamento().map(f => `<option>${f}</option>`).join('');

    let retorno = 'Você pode comprar sem cadastro; pontos são exclusivos de contas conectadas.';
    let classeRetorno = '';
    if (pendente) retorno = 'Solicitação enviada ao provedor. Aguarde a confirmação.';
    else if (estado.ultimoRetorno) { retorno = estado.ultimoRetorno; classeRetorno = 'erro'; }

    return `
        <h1>Pagamento e retirada</h1>
        ${etapasPagamento()}
        <p>Retire no balcão de ${escapar(loja().nome)} usando o número do pedido.</p>
        <p class="nota">O pagamento é encaminhado a um serviço externo simulado. Não informe dados bancários ou de cartão.</p>
        <p class="total">Total: ${dinheiro(totais().total)}</p>
        <form id="checkout" class="formulario">
            <fieldset ${pendente ? 'disabled' : ''}>
                <legend>Dados do pagamento</legend>
                <label>Forma de pagamento<select name="metodo">${opcoes}</select></label>
                <label>Observação para a cozinha (opcional)
                    <textarea name="observacao" maxlength="150" placeholder="Ex.: sem manteiga. Não inclua dados pessoais."></textarea>
                </label>
                <div class="simulador">
                    <p><strong>Painel de simulação</strong> — usado só na avaliação para escolher a resposta do provedor.</p>
                    <label>Retorno do provedor
                        <select name="retorno">
                            <option value="aprovado">Aprovado</option>
                            <option value="recusado">Recusado</option>
                            <option value="falha">Indisponível / tempo esgotado</option>
                        </select>
                    </label>
                </div>
                <label><input name="ciente" type="checkbox" required>Estou ciente do tratamento dos dados do pedido descrito no <a data-tela="privacidade" href="#privacidade">aviso de privacidade</a>.</label>
                <button>${pendente ? 'Aguardando retorno…' : 'Solicitar pagamento'}</button>
            </fieldset>
        </form>
        <p id="retorno-pagamento" class="${classeRetorno}" role="status">${retorno}</p>
        ${!pendente && estado.ultimoRetorno ? '<button class="secundario" data-tela="carrinho">Voltar ao pedido</button>' : ''}`;
}

// Acompanhamento dos pedidos desta sessão
function telaPedidos() {
    // Pedido de visitante aparece para todos nesta aba; pedido com conta, só para o dono
    const pedidos = estado.pedidos.filter(p => p.cliente ? p.cliente === estado.usuario : true);

    if (!pedidos.length) {
        return `
            <h1>Acompanhar pedido</h1>
            <p>Nenhum pedido para acompanhar. Escolha seus produtos no cardápio.</p>`;
    }

    return `
        <h1>Acompanhar pedido</h1>
        <p>O acompanhamento mostra os pedidos desta sessão. A equipe atualiza o preparo na área da equipe.</p>
        ${pedidos.map(cartaoPedidoCliente).join('')}`;
}

// Cartão de um pedido na visão do cliente
function cartaoPedidoCliente(p) {
    const itens = p.itens.map(i => `${i.quantidade} × ${produto(i.id).nome}`).join('<br>');
    const cancelado = p.status === 'Cancelado';

    // Linha do tempo: etapas concluídas recebem ✓
    const etapas = ETAPAS.map((etapa, i) => {
        const feita = i < ETAPAS.indexOf(p.status) ? ' ✓' : '';
        return `<li class="${p.status === etapa ? 'atual' : ''}">${etapa}${feita}</li>`;
    }).join('');

    let orientacao = 'Guarde o número para retirar seu pedido.';
    if (p.status === 'Pronto para retirada') orientacao = 'Seu pedido está pronto. Apresente o número no balcão.';
    if (p.status === 'Retirado') orientacao = 'Obrigada pela visita!';

    const previsao = ['Confirmado', 'Em preparo'].includes(p.status)
        ? `<p class="previsao">Previsão de retirada: por volta de ${p.previsaoHora} (cerca de ${p.previsaoMin} min).</p>`
        : '';

    return `
        <article class="pedido">
            <h2>${p.id} <span class="canal">${NOMES_CANAIS[p.canal]}</span></h2>
            <p>${unidadePorId(p.unidade).nome} · ${p.criado}</p>
            <p>${itens}</p>
            <p>Total: ${dinheiro(p.total)} · pagamento ${cancelado ? 'estornado na simulação' : 'aprovado'}</p>
            ${cancelado
                ? '<p class="erro">Pedido cancelado. Estoque, pontos e recompensa foram revertidos.</p>'
                : `<ol class="passos">${etapas}</ol>${previsao}<p>${orientacao}</p>`}
            ${p.status === 'Confirmado' ? `<button data-cancelar="${p.id}" class="secundario">Cancelar pedido e simular estorno</button>` : ''}
        </article>`;
}

// Programa de fidelidade e campanhas
function telaFidelidade() {
    const u = estado.usuario;

    let saldo = '<p>Crie uma conta fictícia ou entre para participar.</p><button data-tela="conta">Entrar / cadastrar</button>';
    if (u) {
        const faltam = Math.max(0, FIDELIDADE.pontosResgate - u.pontos);
        saldo = `
            <p class="total">Seu saldo: ${u.pontos} pontos</p>
            <label for="progresso-pontos">${faltam ? `Faltam ${faltam} pontos para a próxima recompensa` : 'Você já pode usar uma recompensa!'}</label>
            <progress id="progresso-pontos" max="${FIDELIDADE.pontosResgate}" value="${Math.min(u.pontos, FIDELIDADE.pontosResgate)}"></progress>
            <div class="acoes"><button data-tela="carrinho">Usar recompensa no pedido</button></div>`;
    }

    // Situação da campanha personalizada para quem está conectado
    let personalizada = '<p>Campanhas personalizadas dependem de uma conta e de autorização separada e opcional.</p>';
    if (u && !u.marketing) {
        personalizada = '<p>Campanhas personalizadas estão desativadas. A adesão é opcional e não impede pedidos ou pontos.</p>';
    } else if (u && elegivelFregues()) {
        personalizada = ofertaPersonalizada();
    } else if (u) {
        const faltam = FIDELIDADE.pedidosFregues - pedidosPagos(u).length;
        personalizada = `<p>Você autorizou campanhas personalizadas. Faltam ${faltam} pedido(s) pago(s) para receber a oferta “Freguês da casa”.</p>`;
    }

    return `
        <h1>Fidelidade que dá gosto</h1>
        <div class="painel">
            <h2>Volte sempre, acumule pontos</h2>
            <p>A cada R$ 1,00 efetivamente pago, ganhe 1 ponto (centavos não contam).
               Com ${FIDELIDADE.pontosResgate} pontos, use até ${dinheiro(FIDELIDADE.valorResgate)} de desconto no próximo pedido.</p>
            <p>Pontos são creditados somente após pagamento aprovado. Cancelamentos revertem pontos e recompensas.</p>
            ${saldo}
            <h2>Campanhas</h2>
            <p><strong>${codigoCupom('boas-vindas')}:</strong> 10% no pedido. O cupom é público, funciona mesmo sem autorização de campanhas e vale somente em ${escapar(loja().nome)}; cada unidade tem o seu código.</p>
            ${personalizada}
        </div>`;
}

// Privacidade: transparência, consentimentos e direitos do titular
function telaPrivacidade() {
    const u = estado.usuario;

    // Para que serve cada dado pedido
    const dados = [
        ['Nome', 'Identificar a conta e cumprimentar o cliente', 'Sim, para criar conta'],
        ['E-mail', 'Entrar na conta', 'Sim, para criar conta'],
        ['Senha', 'Proteger o acesso (não é exportada)', 'Sim, para criar conta'],
        ['Itens, unidade e observação', 'Preparar e entregar o pedido', 'Sim, para pedir'],
        ['Quantidade de pedidos', 'Pontos e campanha “Freguês da casa”', 'Somente com conta; campanha só com autorização']
    ];
    const tabelaDados = dados.map(d => `<tr><td>${d[0]}</td><td>${d[1]}</td><td>${d[2]}</td></tr>`).join('');

    let controles = '<p>Entre na sua conta para ver seus consentimentos, exportar ou excluir os dados associados a ela.</p><button data-tela="conta">Minha conta</button>';
    if (u) {
        // Três colunas para caber no celular; o canal aparece abaixo da situação
        const historico = u.consentimentos
            .map(c => `<tr><td>${c.data}</td><td>${c.finalidade}</td><td>${c.situacao}<br><small>${c.canal}</small></td></tr>`)
            .join('');
        controles = `
            <label><input id="marketing" type="checkbox" ${u.marketing ? 'checked' : ''}>Autorizo campanhas personalizadas</label>
            <h3>Registro dos seus consentimentos</h3>
            <div class="tabela">
                <table id="historico-consentimentos">
                    <thead><tr><th>Data</th><th>Finalidade</th><th>Situação</th></tr></thead>
                    <tbody>${historico}</tbody>
                </table>
            </div>
            <div class="acoes">
                <button id="exportar">Baixar meus dados fictícios</button>
                <button id="excluir" class="secundario">Excluir conta e dados associados</button>
            </div>`;
    }

    return `
        <h1>Privacidade e meus dados</h1>
        <div class="painel">
            <h2>Como funciona esta demonstração</h2>
            <p>Use apenas dados fictícios. Nome, e-mail e senha ficam na memória desta aba para simular cadastro e login.
               Não há servidor, rastreadores, cookies de publicidade ou envio a um provedor real. Fechar ou recarregar a página elimina os dados.</p>
            <h2>Quais dados pedimos e por quê</h2>
            <div class="tabela">
                <table>
                    <thead><tr><th>Dado</th><th>Para que usamos</th><th>Obrigatório?</th></tr></thead>
                    <tbody>${tabelaDados}</tbody>
                </table>
            </div>
            <p>Não pedimos CPF, endereço, idade ou dados bancários porque não são necessários para a retirada.
               As estatísticas da gerência mostram totais por unidade, canal e produto, sem nome ou e-mail.
               O painel da cozinha mostra só número, itens e observação do pedido.</p>
            <p>Em produção, o tratamento necessário ao pedido precisaria de base legal adequada (execução de contrato),
               política de retenção, canal do titular e controles de acesso no back-end. O aceite demonstrado aqui não substitui essa avaliação.</p>
            <h2>Seus controles</h2>
            ${controles}
            <p>Para limpar também pedidos sem cadastro e o restante da demonstração, use “Encerrar sessão e limpar dados”, no rodapé.</p>
            <p class="nota">A área da equipe permite alternar papéis para avaliação. Isso não é autenticação profissional:
               uma versão real exigiria autorização por perfil, HTTPS, senha protegida no servidor e auditoria persistente.</p>
        </div>`;
}


// -----------------------------------------------------
// 6. Telas da equipe e de apoio
// -----------------------------------------------------

// Área da equipe: fila, ações por papel e gestão da unidade
function telaOperacao() {
    const gerente = estado.perfil === 'gerente';
    const fila = estado.pedidos.filter(p => p.unidade === estado.unidade);
    const papeis = [['atendente', 'Atendente'], ['cozinha', 'Cozinha'], ['gerente', 'Gerente / Administrador']]
        .map(([valor, nome]) => `<option value="${valor}" ${estado.perfil === valor ? 'selected' : ''}>${nome}</option>`)
        .join('');

    const balcao = estado.perfil === 'atendente'
        ? `<h2>Pedido no balcão</h2>
           <p>Use o cardápio e conclua o pedido como visitante. O pedido receberá o canal Balcão.</p>
           <button id="balcao">Abrir cardápio para atendimento</button>`
        : '';

    return `
        <h1>Área da equipe</h1>
        <p class="nota">Acesso demonstrativo: escolha um papel para testar seus fluxos. Não use dados reais.
           A restrição profissional por login está fora desta implementação.</p>
        <label class="formulario">Papel da demonstração<select id="perfil">${papeis}</select></label>
        <h2>Fila · ${loja().nome}</h2>
        <p>Movimento: ${movimento(estado.unidade)} · ${pedidosNaFila(estado.unidade)} pedidos na fila (inclui outros canais simulados).</p>
        ${fila.map(cartaoPedidoEquipe).join('') || '<p>Sem pedidos desta sessão nesta unidade.</p>'}
        ${balcao}
        ${gerente ? painelGerente() : ''}`;
}

// Cartão de um pedido na fila da equipe, com as ações permitidas ao papel
function cartaoPedidoEquipe(p) {
    const itens = p.itens.map(i => `${i.quantidade} × ${produto(i.id).nome}`).join('<br>');
    const regra = TRANSICOES[p.status];
    const avancar = podeAvancar(p) ? `<button data-avancar="${p.id}">${regra.acao}</button>` : '';
    const cancelar = estado.perfil === 'gerente' && ['Confirmado', 'Em preparo'].includes(p.status)
        ? `<button data-cancelar="${p.id}">Cancelar e simular estorno</button>`
        : '';

    return `
        <article class="pedido">
            <h3>${p.id} · ${p.status} <span class="canal">${NOMES_CANAIS[p.canal]}</span></h3>
            <p>${itens}</p>
            <p>Observação: ${escapar(p.observacao) || 'Nenhuma'}</p>
            <div class="acoes">${avancar}${cancelar}</div>
        </article>`;
}

// Gerência: estoque, vendas consolidadas e auditoria
function painelGerente() {
    const vendas = estado.pedidos.filter(p => p.status !== 'Cancelado');
    const produtosLocais = PRODUTOS.filter(p => p.estoque[estado.unidade] !== undefined)
        .map(p => `<option value="${p.id}">${p.nome} (saldo: ${p.estoque[estado.unidade]})</option>`)
        .join('');

    // Vendas por unidade
    const porUnidade = UNIDADES.map(u => {
        const daUnidade = vendas.filter(p => p.unidade === u.id);
        return `<tr><td>${u.nome}</td><td>${daUnidade.length}</td><td>${dinheiro(daUnidade.reduce((s, p) => s + p.total, 0))}</td></tr>`;
    }).join('');

    // Vendas por canal: mostra o peso de cada canal de atendimento
    const porCanal = Object.keys(NOMES_CANAIS).map(canal => {
        const doCanal = vendas.filter(p => p.canal === canal);
        return `<tr><td>${NOMES_CANAIS[canal]}</td><td>${doCanal.length}</td><td>${dinheiro(doCanal.reduce((s, p) => s + p.total, 0))}</td></tr>`;
    }).join('');

    // Ranking dos produtos mais vendidos
    const ranking = PRODUTOS
        .map(p => ({ nome: p.nome, quantidade: vendas.reduce((s, v) => s + (v.itens.find(i => i.id === p.id)?.quantidade || 0), 0) }))
        .filter(p => p.quantidade > 0)
        .sort((a, b) => b.quantidade - a.quantidade)
        .map(p => `<li>${p.nome}: ${p.quantidade}</li>`)
        .join('') || '<li>Nenhuma venda.</li>';

    const auditoria = estado.auditoria
        .map(a => `<li>${a.hora} · ${a.perfil} · ${a.canal} · ${a.unidade} · ${escapar(a.acao)}</li>`)
        .join('') || '<li>Nenhuma operação registrada.</li>';

    return `
        <h2>Estoque local</h2>
        <form id="estoque" class="formulario">
            <label>Produto<select name="produto">${produtosLocais}</select></label>
            <label>Novo saldo<input name="saldo" type="number" min="0" max="999" required></label>
            <label>Motivo do ajuste<input name="motivo" minlength="3" maxlength="100" required></label>
            <button>Ajustar estoque</button>
        </form>
        <h2>Vendas consolidadas</h2>
        <div class="colunas">
            <div class="tabela">
                <table>
                    <thead><tr><th>Unidade</th><th>Pedidos pagos</th><th>Total recebido</th></tr></thead>
                    <tbody>${porUnidade}</tbody>
                </table>
            </div>
            <div class="tabela">
                <table>
                    <thead><tr><th>Canal</th><th>Pedidos pagos</th><th>Total recebido</th></tr></thead>
                    <tbody>${porCanal}</tbody>
                </table>
            </div>
        </div>
        <h3>Produtos mais vendidos</h3>
        <ul>${ranking}</ul>
        <h2>Auditoria da sessão</h2>
        <ul>${auditoria}</ul>`;
}

// Roteiro curto para quem avalia a demonstração
function telaGuia() {
    return `
        <h1>Como avaliar esta demonstração</h1>
        <div class="painel">
            <ol class="roteiro">
                <li>Compare as unidades: Recife (cozinha completa, horário de pico), João Pessoa (bolo esgotado) e Caruaru (fechada).</li>
                <li>Adicione produtos e, em Recife, use os cupons <strong>RAIZES_RECIFE_7F3A</strong> (válido), <strong>RAIZES_RECIFE_0E6D</strong> (vencido), <strong>RAIZES_JOAOPESSOA_4B9E</strong> (de outra unidade) ou <strong>ABC</strong> (inválido).</li>
                <li>Crie uma conta fictícia marcando campanhas personalizadas, ou compre sem cadastro.</li>
                <li>No pagamento, escolha no painel de simulação o retorno: aprovado, recusado ou indisponível.</li>
                <li>Depois de 2 pedidos pagos com campanhas autorizadas, veja a oferta “Freguês da casa” e o botão “Por que estou vendo esta oferta?”.</li>
                <li>Na área da equipe, use Cozinha (iniciar preparo, marcar pronto) e Atendente (confirmar retirada).</li>
                <li>Como Gerente, ajuste o estoque com motivo e consulte vendas por unidade, canal e a auditoria.</li>
                <li>Em Privacidade, revogue campanhas, consulte o registro de consentimentos, exporte e exclua os dados.</li>
                <li>Troque o canal para App (menu inferior) e Totem (botões maiores e aviso de inatividade).</li>
            </ol>
            <button data-tela="cardapio">Começar pelo cardápio</button>
        </div>`;
}


// -----------------------------------------------------
// 7. Ações do cliente
// -----------------------------------------------------

// Adiciona uma unidade do produto ao carrinho, respeitando o estoque
function adicionar(id) {
    const p = produto(id);
    if (estado.pagamento) return avisar('Aguarde o retorno do pagamento antes de alterar o pedido.');
    if (!p || !loja().aberta || !disponivel(p)) return avisar('Produto indisponível nesta unidade.');

    const item = estado.carrinho.find(i => i.id === p.id);
    const quantidade = item ? item.quantidade : 0;
    if (quantidade >= p.estoque[estado.unidade]) return avisar('Você atingiu a quantidade disponível deste produto.');

    if (item) item.quantidade++;
    else estado.carrinho.push({ id: p.id, quantidade: 1 });

    estado.ultimoRetorno = '';
    navegar(estado.tela, false);
    avisar(`${p.nome} adicionado ao pedido.`);
}

// Retira uma unidade; com zero, o item sai do carrinho
function diminuir(id) {
    if (estado.pagamento) return avisar('Aguarde o pagamento.');
    const item = estado.carrinho.find(i => i.id === Number(id));
    if (item) item.quantidade--;
    estado.carrinho = estado.carrinho.filter(i => i.quantidade > 0);
    estado.ultimoRetorno = '';
    navegar('carrinho', false);
}

// Aplica ou remove um cupom
function aplicarCupom(form) {
    if (estado.pagamento) return avisar('Aguarde o pagamento antes de alterar o cupom.');
    const codigo = String(new FormData(form).get('cupom')).trim().toUpperCase();
    const resultado = validarCupom(codigo);

    if (!resultado.ok) {
        // Mensagem perto do campo e também anunciada no rodapé
        document.querySelector('#erro-cupom').textContent = resultado.mensagem;
        return avisar(resultado.mensagem);
    }
    estado.cupom = codigo;
    navegar('carrinho', false);
    avisar(resultado.mensagem);
}

// Cria a conta fictícia (uma por sessão)
function cadastrar(form) {
    const d = new FormData(form);
    const nome = String(d.get('nome')).trim();
    const email = String(d.get('email')).trim().toLowerCase();
    const senha = String(d.get('senha'));

    if (nome.length < 2 || senha.length < 6 || !d.get('privacidade')) {
        return avisar('Preencha nome, senha e aceite de privacidade.');
    }
    if (estado.conta) {
        return avisar('Já existe uma conta nesta sessão. Entre nela ou exclua seus dados para cadastrar outra.');
    }

    const conta = { nome, email, senha, pontos: 0, marketing: !!d.get('marketing'), consentimentos: [] };
    registrarConsentimento(conta, 'Aviso de privacidade (conta e pontos)', 'Ciente');
    if (conta.marketing) registrarConsentimento(conta, 'Campanhas personalizadas', 'Autorizado');

    estado.conta = conta;
    estado.usuario = conta;
    navegar('conta');
    avisar('Cadastro de teste criado.');
}

// Login fictício com a conta da sessão
function entrar(form) {
    const d = new FormData(form);
    const email = String(d.get('email')).trim().toLowerCase();
    const correto = estado.conta && estado.conta.email === email && estado.conta.senha === d.get('senha');

    if (!correto) {
        const texto = 'E-mail ou senha incorretos. Confira os dados ou cadastre uma conta fictícia nesta sessão.';
        document.querySelector('#erro-login').textContent = texto;
        return avisar(texto);
    }
    estado.usuario = estado.conta;
    navegar('conta');
    avisar('Você entrou na conta.');
}

// Envia a solicitação de pagamento ao provedor externo (simulado)
function solicitarPagamento(form) {
    // Evita duas solicitações para o mesmo pedido
    if (estado.pagamento) return;
    if (!loja().aberta) return avisar('Esta unidade está fechada. Escolha outra unidade.');

    const semEstoque = estado.carrinho.some(i => !disponivel(produto(i.id)) || i.quantidade > produto(i.id).estoque[estado.unidade]);
    if (!estado.carrinho.length || semEstoque) return avisar('Há itens sem estoque suficiente. Revise seu pedido.');

    const dados = new FormData(form);
    if (!dados.get('ciente')) return avisar('Leia o aviso de privacidade antes de continuar.');

    const valores = totais();
    const pedido = {
        id: 'RN-' + String(++estado.sequencia).padStart(4, '0'),
        unidade: estado.unidade,
        canal: estado.canal,
        itens: estado.carrinho.map(i => ({ ...i })),
        ...valores,
        observacao: String(dados.get('observacao') || ''),
        metodo: dados.get('metodo'),
        retorno: dados.get('retorno'),
        status: 'Aguardando pagamento',
        cliente: estado.usuario,
        pontos: 0,
        resgate: valores.beneficio > 0,
        criado: agora()
    };

    estado.pagamento = pedido;
    estado.ultimoRetorno = '';
    navegar('checkout');

    // O atraso representa a espera pela resposta do provedor externo
    setTimeout(() => receberRetorno(pedido), 1500);
}

// Trata a resposta do provedor: aprovado, recusado ou sem resposta
function receberRetorno(pedido) {
    // Ignora o retorno de uma sessão que já foi encerrada
    if (estado.pagamento !== pedido) return;
    estado.pagamento = null;

    if (pedido.retorno !== 'aprovado') {
        const texto = pedido.retorno === 'recusado'
            ? 'Pagamento recusado pelo provedor. Nenhum valor foi cobrado. Tente outra forma de pagamento.'
            : 'O serviço de pagamento não respondeu a tempo. Nenhum valor foi cobrado. Seu pedido foi mantido; tente novamente.';
        return falharPagamento(pedido, texto, `Pagamento não concluído (${pedido.retorno}): ${pedido.id}`);
    }

    // Revalidar evita confirmar um item que acabou durante a espera
    const faltou = pedido.itens.some(i => i.quantidade > (produto(i.id).estoque[pedido.unidade] || 0));
    if (faltou) {
        return falharPagamento(pedido, 'O estoque mudou durante o pagamento. A aprovação simulada foi desfeita; revise os itens.', `Pagamento desfeito por falta de estoque: ${pedido.id}`);
    }

    // Aprovado: baixa o estoque, calcula a previsão e credita os pontos
    pedido.itens.forEach(i => { produto(i.id).estoque[pedido.unidade] -= i.quantidade; });
    pedido.previsaoMin = tempoEstimado(pedido.unidade);
    pedido.previsaoHora = horaDaqui(pedido.previsaoMin);
    pedido.status = 'Confirmado';
    if (pedido.cliente) {
        pedido.pontos = Math.floor(pedido.total / 100);
        pedido.cliente.pontos += pedido.pontos - (pedido.resgate ? FIDELIDADE.pontosResgate : 0);
    }

    estado.pedidos.push(pedido);
    estado.carrinho = [];
    estado.cupom = '';
    estado.recompensa = false;
    registrar(`Pagamento aprovado: ${pedido.id}`);
    navegar('pedidos');
    avisar(`Pedido ${pedido.id} confirmado!`);
}

// Pagamento sem sucesso: mantém o carrinho e explica o que aconteceu
function falharPagamento(pedido, texto, registro) {
    estado.ultimoRetorno = texto;
    registrar(registro);
    if (estado.tela === 'checkout') navegar('checkout', false);
    avisar(texto);
}

// Cancela o pedido, simula o estorno e devolve estoque e pontos
function cancelar(id) {
    const p = estado.pedidos.find(pedido => pedido.id === id);
    if (!podeCancelar(p)) return avisar('Cancelamento não permitido neste estado ou perfil.');

    // Se os pontos do pedido já foram gastos, o saldo ficaria negativo
    const pontosDoPedido = p.pontos - (p.resgate ? FIDELIDADE.pontosResgate : 0);
    if (p.cliente && p.cliente.pontos < pontosDoPedido) {
        return avisar('Os pontos deste pedido já foram utilizados. Solicite suporte; a demonstração não permite saldo negativo.');
    }
    if (!confirm('Cancelar este pedido? O estorno é apenas simulado.')) return;

    p.status = 'Cancelado';
    p.itens.forEach(i => { produto(i.id).estoque[p.unidade] += i.quantidade; });
    if (p.cliente) p.cliente.pontos -= pontosDoPedido;

    registrar(`Cancelamento e estorno simulado: ${p.id}`);
    navegar(estado.tela);
    avisar('Pedido cancelado e pagamento estornado na simulação.');
}

// Autoriza ou revoga as campanhas personalizadas
function alterarMarketing(marcado) {
    const u = estado.usuario;
    u.marketing = marcado;
    registrarConsentimento(u, 'Campanhas personalizadas', marcado ? 'Autorizado' : 'Revogado');

    // Revogar também retira o cupom personalizado do carrinho
    if (!marcado && estado.cupom && !CUPONS[estado.cupom].publico) estado.cupom = '';

    navegar('privacidade', false);
    avisar(marcado ? 'Campanhas autorizadas.' : 'Autorização de campanhas revogada.');
}

// Gera um arquivo com os dados da conta (direito de acesso e portabilidade)
function exportarDados() {
    const u = estado.usuario;
    const conteudoArquivo = {
        nome: u.nome,
        email: u.email,
        marketing: u.marketing,
        pontos: u.pontos,
        consentimentos: u.consentimentos,
        pedidos: estado.pedidos.filter(p => p.cliente === u).map(({ cliente, ...pedido }) => pedido)
    };
    const arquivo = new Blob([JSON.stringify(conteudoArquivo, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(arquivo);
    link.download = 'meus-dados-ficticios.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Exclui a conta e os pedidos associados (direito de eliminação)
function excluirConta() {
    if (estado.pagamento) return avisar('Aguarde o pagamento antes de excluir a conta.');
    const ativos = estado.pedidos.some(p => p.cliente === estado.usuario && !['Retirado', 'Cancelado'].includes(p.status));
    if (ativos) return avisar('Conclua ou cancele seus pedidos ativos antes de excluir a conta.');
    if (!confirm('Excluir esta conta fictícia e seus pedidos associados?')) return;

    estado.pedidos = estado.pedidos.filter(p => p.cliente !== estado.usuario);
    estado.conta = null;
    estado.usuario = null;
    estado.recompensa = false;
    navegar('privacidade');
    avisar('Conta e pedidos associados excluídos da sessão.');
}


// -----------------------------------------------------
// 8. Ações da equipe
// -----------------------------------------------------

// Avança o pedido conforme a máquina de estados (TRANSICOES)
function avancarStatus(id) {
    const pedido = estado.pedidos.find(p => p.id === id);
    if (!pedido || !podeAvancar(pedido)) return avisar('Transição não permitida para este papel.');

    pedido.status = TRANSICOES[pedido.status].proximo;
    registrar(`${pedido.id}: ${pedido.status}`);
    navegar('operacao');
}

// Ajuste manual de estoque, sempre com motivo para a auditoria
function ajustarEstoque(form) {
    if (estado.perfil !== 'gerente') return;
    const d = new FormData(form);
    const p = produto(d.get('produto'));
    const saldo = Number(d.get('saldo'));
    const motivo = String(d.get('motivo')).trim();

    const valido = p && p.estoque[estado.unidade] !== undefined && Number.isInteger(saldo) && saldo >= 0 && saldo <= 999 && motivo.length >= 3;
    if (!valido) return avisar('Informe saldo inteiro entre 0 e 999 e um motivo.');

    p.estoque[estado.unidade] = saldo;
    registrar(`Estoque ${p.nome}: ${saldo}. Motivo: ${motivo}`);
    navegar('operacao');
    avisar('Estoque ajustado e operação registrada.');
}


// -----------------------------------------------------
// 9. Sessão, unidade e canal
// -----------------------------------------------------

// Apaga tudo e volta aos dados iniciais (canal e unidade são mantidos)
function limparSessao() {
    PRODUTOS.forEach((p, i) => { p.estoque = { ...estoqueInicial[i] }; });
    Object.assign(estado, {
        carrinho: [], conta: null, usuario: null, pedidos: [], cupom: '', recompensa: false,
        filtro: '', busca: '', perfil: 'atendente', auditoria: [], pagamento: null, ultimoRetorno: '', sequencia: 0
    });
    atividade = Date.now();
    document.querySelector('#aviso-inatividade').hidden = true;
    navegar('cardapio');
    avisar('Sessão encerrada. Dados fictícios limpos.');
}

// Trocar de unidade esvazia o carrinho, porque o estoque é outro
function trocarUnidade(select) {
    if (estado.pagamento) {
        select.value = estado.unidade;
        return avisar('Aguarde o pagamento antes de trocar de unidade.');
    }
    if (estado.carrinho.length && !confirm('Trocar de unidade remove os itens do carrinho. Continuar?')) {
        select.value = estado.unidade;
        return;
    }
    estado.unidade = select.value;
    estado.carrinho = [];
    estado.cupom = '';
    estado.recompensa = false;
    estado.ultimoRetorno = '';
    navegar('cardapio');
}

// Entrar ou sair do totem limpa a sessão para proteger os dados
function trocarCanal(select) {
    if (estado.pagamento) {
        select.value = estado.canal;
        return avisar('Aguarde o pagamento antes de trocar de canal.');
    }
    const canal = select.value;
    if (estado.canal === 'totem' || canal === 'totem') {
        if (!confirm('Trocar de/para totem limpa a sessão para proteger os dados. Continuar?')) {
            select.value = estado.canal;
            return;
        }
        limparSessao();
    }
    estado.canal = canal;
    navegar('cardapio');
}

// Totem: avisa antes e limpa a sessão depois de 2 minutos sem uso
function verificarInatividade() {
    const aviso = document.querySelector('#aviso-inatividade');
    if (estado.canal !== 'totem' || estado.pagamento) {
        aviso.hidden = true;
        return;
    }

    const parado = Date.now() - atividade;
    if (parado >= INATIVIDADE.limiteMs) {
        limparSessao();
        return;
    }
    if (parado >= INATIVIDADE.avisoMs) {
        const segundos = Math.ceil((INATIVIDADE.limiteMs - parado) / 1000);
        document.querySelector('#contagem').textContent = segundos;
        if (aviso.hidden) {
            aviso.hidden = false;
            document.querySelector('#continuar-sessao').focus();
        }
        return;
    }
    aviso.hidden = true;
}


// -----------------------------------------------------
// 10. Eventos
// -----------------------------------------------------

// Cliques: um único "ouvinte" trata todos os botões pelos atributos data-*
document.addEventListener('click', e => {
    const alvo = e.target.closest('button, a');
    if (!alvo) return;

    if (alvo.dataset.tela) {
        e.preventDefault();
        navegar(alvo.dataset.tela);
    }
    if (alvo.dataset.adicionar) adicionar(alvo.dataset.adicionar);
    if (alvo.dataset.diminuir) diminuir(alvo.dataset.diminuir);
    if (alvo.dataset.cancelar) cancelar(alvo.dataset.cancelar);
    if (alvo.dataset.avancar) avancarStatus(alvo.dataset.avancar);

    switch (alvo.id) {
        case 'filtrar':
            estado.busca = document.querySelector('#busca').value;
            estado.filtro = document.querySelector('#categoria').value;
            navegar('cardapio', false);
            break;
        case 'sair':
            if (estado.pagamento) return avisar('Aguarde o pagamento antes de sair.');
            estado.usuario = null;
            estado.recompensa = false;
            navegar('conta');
            break;
        case 'balcao':
            estado.canal = 'balcao';
            navegar('cardapio');
            avisar('Atendimento no balcão iniciado.');
            break;
        case 'reiniciar':
            if (estado.pagamento) return avisar('Aguarde o pagamento antes de limpar a sessão.');
            if (confirm('Limpar todos os dados e reiniciar a demonstração?')) limparSessao();
            break;
        case 'exportar':
            if (estado.usuario) exportarDados();
            break;
        case 'excluir':
            if (estado.usuario) excluirConta();
            break;
        case 'entendi-privacidade':
            document.querySelector('#faixa-privacidade').hidden = true;
            break;
        case 'continuar-sessao':
            document.querySelector('#aviso-inatividade').hidden = true;
            break;
    }
});

// Mudanças em listas e caixas de seleção
document.addEventListener('change', e => {
    const alvo = e.target;
    if (alvo.id === 'unidade') trocarUnidade(alvo);
    if (alvo.id === 'canal') trocarCanal(alvo);
    if (alvo.id === 'perfil') {
        estado.perfil = alvo.value;
        navegar('operacao', false);
    }
    if (alvo.id === 'recompensa') {
        if (estado.pagamento) {
            alvo.checked = estado.recompensa;
            return avisar('Aguarde o pagamento antes de alterar o desconto.');
        }
        estado.recompensa = alvo.checked;
        navegar('carrinho', false);
    }
    if (alvo.id === 'marketing' && estado.usuario) alterarMarketing(alvo.checked);
});

// Formulários: o envio real é impedido e tratado aqui
document.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    if (form.id === 'cadastro') cadastrar(form);
    if (form.id === 'login') entrar(form);
    if (form.id === 'cupom-form') aplicarCupom(form);
    if (form.id === 'checkout') solicitarPagamento(form);
    if (form.id === 'estoque') ajustarEstoque(form);
});

// Qualquer interação conta como atividade para o totem
['click', 'keydown', 'input', 'touchstart'].forEach(evento => {
    document.addEventListener(evento, () => { atividade = Date.now(); }, { passive: true });
});


// -----------------------------------------------------
// 11. Inicialização
// -----------------------------------------------------

document.querySelector('#unidade').innerHTML = UNIDADES.map(u => `<option value="${u.id}">${u.nome}</option>`).join('');
setInterval(verificarInatividade, 1000);
navegar('cardapio', false);
