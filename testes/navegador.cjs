// =====================================================
// Testes automatizados da interface
// Contém os 33 cenários do plano de testes (T01 a T33), executados no
// navegador com Playwright e o Chrome instalado. Existem para verificar
// os fluxos de ponta a ponta e registrar as evidências: os resultados e
// as capturas de tela são salvos em documentacao/evidencias.
// Uso: com "node servidor.js" rodando, execute "node testes/navegador.cjs".
// =====================================================

// Playwright controla o Chrome (instalação: npm install playwright)
const { chromium } = require('playwright');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const saida = path.join(raiz, 'documentacao', 'evidencias');
const endereco = 'http://127.0.0.1:8080';
fs.mkdirSync(saida, { recursive: true });

const resultados = {
    data: new Date().toISOString().slice(0, 10),
    ambiente: 'Chrome local / Windows',
    testes: []
};

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    // Caixas de confirmação: aceitas por padrão; alguns testes recusam
    let aceitarDialogo = true;
    page.on('dialog', d => aceitarDialogo ? d.accept() : d.dismiss());

    // Qualquer erro de JavaScript na página é registrado
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));


    // ---------- Funções de apoio ----------

    const ler = expressao => page.evaluate(expressao);
    const mensagem = () => page.locator('#mensagem').innerText();
    const textoPrincipal = () => page.locator('main').innerText();
    const nav = nome => page.locator(`nav [data-tela="${nome}"]`).click();

    // Volta ao estado inicial antes de cada cenário
    async function reset() {
        aceitarDialogo = true;
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(endereco);
        await page.waitForSelector('[data-adicionar="1"]');
    }

    async function add(id, vezes = 1) {
        for (let i = 0; i < vezes; i++) await page.locator(`[data-adicionar="${id}"]`).click();
    }

    async function cadastro(marketing = false) {
        await nav('conta');
        const f = page.locator('#cadastro');
        await f.locator('[name=nome]').fill('Cliente de teste');
        await f.locator('[name=email]').fill('teste@example.com');
        await f.locator('[name=senha]').fill('teste123');
        await f.locator('[name=privacidade]').check();
        if (marketing) await f.locator('[name=marketing]').check();
        await f.locator('button').click();
    }

    async function irParaPagamento(retorno = 'aprovado', observacao = '') {
        await nav('carrinho');
        await page.locator('[data-tela=checkout]').click();
        await page.locator('[name=retorno]').selectOption(retorno);
        await page.locator('[name=observacao]').fill(observacao);
        await page.locator('[name=ciente]').check();
    }

    async function pagar(retorno = 'aprovado', observacao = '') {
        await irParaPagamento(retorno, observacao);
        await page.locator('#checkout button').click();
        await page.waitForFunction(() => estado.pagamento === null);
    }

    // Salva a tela visível. "alvo" rola até o elemento; a mensagem flutuante
    // é limpa para não cobrir o conteúdo, a menos que ela seja a evidência.
    async function captura(nome, { alvo = '', manterAviso = false } = {}) {
        if (alvo) await page.locator(alvo).first().evaluate(e => e.scrollIntoView({ block: 'start' }));
        if (!manterAviso) await ler(() => { document.querySelector('#mensagem').textContent = ''; });
        await page.screenshot({ path: path.join(saida, nome + '.png') });
    }

    // Executa um cenário e registra o resultado
    async function teste(id, nome, funcao) {
        try {
            await reset();
            const detalhe = await funcao();
            resultados.testes.push({ id, nome, ok: true, ...(detalhe ? { detalhe } : {}) });
            console.log('OK', id, nome);
        } catch (e) {
            resultados.testes.push({ id, nome, ok: false, erro: e.message.split('\n')[0] });
            console.log('FALHOU', id, nome, e.message);
        }
    }


    // ---------- Cardápio e unidades ----------

    await teste('T01', 'Cardápio diferente por unidade', async () => {
        assert(await page.locator('[data-adicionar="6"]').isVisible());
        await page.locator('#unidade').selectOption('joao');
        assert.equal(await page.locator('[data-adicionar="6"]').count(), 0);
        assert(await page.locator('[data-adicionar="3"]').isDisabled());
    });

    await teste('T02', 'Unidade fechada bloqueia pedidos', async () => {
        await page.locator('#unidade').selectOption('caruaru');
        assert(await page.locator('[data-adicionar="1"]').isDisabled());
        assert.match(await textoPrincipal(), /Esta unidade está fechada agora/);
    });

    await teste('T03', 'Produto sazonal fora da temporada', async () => {
        const foraDeJunho = new Date().getMonth() !== 5;
        assert.equal(await page.locator('[data-adicionar="7"]').isDisabled(), foraDeJunho);
        if (foraDeJunho) assert.match(await textoPrincipal(), /Fora da temporada/);
    });


    // ---------- Carrinho e cupons ----------

    await teste('T04', 'Montar pedido e calcular subtotal', async () => {
        await add(1, 2);
        await add(5);
        await nav('carrinho');
        assert.equal(await ler(() => totais().subtotal), 3300);
        assert.equal(await page.locator('#quantidade').innerText(), '3');
    });

    await teste('T05', 'Limite de estoque no carrinho', async () => {
        await add(1, 12);
        await add(1);
        assert.equal(await ler(() => estado.carrinho[0].quantidade), 12);
        assert.match(await mensagem(), /quantidade disponível/);
    });

    await teste('T06', 'Cupom válido da unidade', async () => {
        await add(1, 2);
        await add(5);
        await nav('carrinho');
        await page.locator('#cupom-form input').fill('raizes_recife_7f3a');
        await page.locator('#cupom-form button').click();
        assert.equal(await ler(() => totais().total), 2970);
    });

    await teste('T07', 'Cupom vencido, de outra unidade e inválido', async () => {
        await add(1);
        await nav('carrinho');
        await page.locator('#cupom-form input').fill('RAIZES_RECIFE_0E6D');
        await page.locator('#cupom-form button').click();
        assert.match(await page.locator('#erro-cupom').innerText(), /vencido/);
        await page.locator('#cupom-form input').fill('RAIZES_JOAOPESSOA_4B9E');
        await page.locator('#cupom-form button').click();
        assert.match(await page.locator('#erro-cupom').innerText(), /unidade João Pessoa[\s\S]*RAIZES_RECIFE_7F3A/);
        await page.locator('#cupom-form input').fill('ABC');
        await page.locator('#cupom-form button').click();
        assert.match(await page.locator('#erro-cupom').innerText(), /inválido/);
        assert.equal(await ler(() => totais().desconto), 0);
    });


    // ---------- Conta ----------

    await teste('T08', 'Cadastro com aceite e campanhas desmarcadas', async () => {
        await cadastro();
        assert.equal(await ler(() => estado.usuario.marketing), false);
        assert.equal(await ler(() => estado.usuario.consentimentos[0].situacao), 'Ciente');
    });

    await teste('T09', 'Cadastro com senha curta ou sem aceite', async () => {
        await nav('conta');
        const f = page.locator('#cadastro');
        await f.locator('[name=nome]').fill('Teste');
        await f.locator('[name=email]').fill('teste@example.com');
        await f.locator('[name=senha]').fill('123');
        await f.locator('[name=privacidade]').check();
        await f.locator('button').click();
        assert.equal(await ler(() => estado.conta), null);
        await f.locator('[name=senha]').fill('teste123');
        await f.locator('[name=privacidade]').uncheck();
        await f.locator('button').click();
        assert.equal(await ler(() => estado.conta), null);
    });

    await teste('T10', 'Login com senha incorreta', async () => {
        await cadastro();
        await page.locator('#sair').click();
        const f = page.locator('#login');
        await f.locator('[name=email]').fill('teste@example.com');
        await f.locator('[name=senha]').fill('errada');
        await f.locator('button').click();
        assert.equal(await ler(() => estado.usuario), null);
        assert.match(await page.locator('#erro-login').innerText(), /incorretos/);
        await f.locator('[name=senha]').fill('teste123');
        await f.locator('button').click();
        assert.equal(await ler(() => estado.usuario.nome), 'Cliente de teste');
    });


    // ---------- Pagamento externo (simulado) ----------

    await teste('T11', 'Pagamento aprovado confirma o pedido', async () => {
        await add(1);
        await irParaPagamento();
        await page.locator('#checkout button').click();
        assert.match(await page.locator('.etapas-pagamento .atual').innerText(), /Aguardando resposta/);
        await page.setViewportSize({ width: 375, height: 812 });
        await captura('pagamento-mobile', { alvo: 'main' });
        await page.waitForFunction(() => estado.pagamento === null);
        assert.equal(await ler(() => estado.pedidos.length), 1);
        assert.equal(await ler(() => produto(1).estoque.recife), 11);
        assert.equal(await ler(() => estado.carrinho.length), 0);
        assert.match(await textoPrincipal(), /RN-0001/);
    });

    await teste('T12', 'Pagamento recusado e provedor indisponível', async () => {
        await cadastro();
        await nav('cardapio');
        await add(1);
        await pagar('recusado');
        assert.equal(await ler(() => estado.pedidos.length), 0);
        assert.equal(await ler(() => estado.usuario.pontos), 0);
        assert.equal(await ler(() => estado.carrinho.length), 1);
        assert.match(await page.locator('#retorno-pagamento').innerText(), /recusado/);
        await page.setViewportSize({ width: 375, height: 812 });
        await captura('pagamento-recusado-mobile', { alvo: 'main', manterAviso: true });
        await page.locator('[name=retorno]').selectOption('falha');
        await page.locator('[name=ciente]').check();
        await page.locator('#checkout button').click();
        await page.waitForFunction(() => estado.pagamento === null);
        assert.match(await page.locator('#retorno-pagamento').innerText(), /não respondeu/);
        assert.equal(await ler(() => produto(1).estoque.recife), 12);
    });

    await teste('T13', 'Envio duplicado e alterações durante a espera', async () => {
        await add(1);
        await irParaPagamento();
        await page.locator('#checkout button').click();
        assert(await page.locator('#checkout button').isDisabled());
        await page.locator('#unidade').selectOption('joao');
        assert.equal(await page.locator('#unidade').inputValue(), 'recife');
        await ler(() => solicitarPagamento(document.querySelector('#checkout')));
        await page.waitForFunction(() => estado.pagamento === null);
        assert.equal(await ler(() => estado.pedidos.length), 1);
    });


    // ---------- Operação da loja ----------

    await teste('T14', 'Preparo e retirada conforme o papel', async () => {
        await add(1);
        await pagar();
        await nav('operacao');
        await page.locator('#perfil').selectOption('atendente');
        assert.equal(await page.getByRole('button', { name: 'Iniciar preparo', exact: true }).count(), 0);
        await page.locator('#perfil').selectOption('cozinha');
        await page.getByRole('button', { name: 'Iniciar preparo', exact: true }).click();
        assert.equal(await ler(() => estado.pedidos[0].status), 'Em preparo');
        await page.getByRole('button', { name: 'Marcar pronto', exact: true }).click();
        await page.locator('#perfil').selectOption('atendente');
        await page.getByRole('button', { name: 'Confirmar retirada', exact: true }).click();
        assert.equal(await ler(() => estado.pedidos[0].status), 'Retirado');
        assert.equal(await ler(() => estado.auditoria.length), 4);
    });


    // ---------- Fidelidade ----------

    await teste('T15', 'Pontos e resgate de recompensa', async () => {
        await cadastro();
        await nav('cardapio');
        await add(1, 2);
        await add(5);
        await pagar();
        assert.equal(await ler(() => estado.usuario.pontos), 33);
        await nav('cardapio');
        await add(1);
        await nav('carrinho');
        await page.locator('#recompensa').check();
        assert.equal(await ler(() => totais().total), 900);
        await pagar();
        assert.equal(await ler(() => estado.usuario.pontos), 12);
    });

    await teste('T16', 'Cancelamento com estorno simulado', async () => {
        await cadastro();
        await nav('cardapio');
        await add(1, 2);
        await add(5);
        await pagar();
        await nav('cardapio');
        await add(1);
        await nav('carrinho');
        await page.locator('#recompensa').check();
        await pagar();
        await page.locator('[data-cancelar="RN-0002"]').click();
        assert.equal(await ler(() => estado.usuario.pontos), 33);
        assert.equal(await ler(() => produto(1).estoque.recife), 10);
        assert.equal(await ler(() => estado.pedidos[1].status), 'Cancelado');
    });


    // ---------- Privacidade (LGPD) ----------

    await teste('T17', 'Exportação e exclusão dos dados', async () => {
        await cadastro(true);
        await page.locator('footer [data-tela=privacidade]').click();
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportar').click()]);
        const dados = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
        assert.equal(dados.nome, 'Cliente de teste');
        assert.equal('senha' in dados, false);
        assert.equal(dados.consentimentos.length, 2);
        await nav('cardapio');
        await add(1);
        await pagar();
        await page.locator('footer [data-tela=privacidade]').click();
        await page.locator('#excluir').click();
        assert.match(await mensagem(), /pedidos ativos/);
        assert.notEqual(await ler(() => estado.usuario), null);
        await nav('pedidos');
        await page.locator('[data-cancelar]').click();
        await page.locator('footer [data-tela=privacidade]').click();
        await page.locator('#excluir').click();
        assert.equal(await ler(() => estado.conta), null);
        assert.equal(await ler(() => estado.pedidos.length), 0);
    });


    // ---------- Gerência ----------

    await teste('T18', 'Ajuste de estoque e vendas consolidadas', async () => {
        await add(1);
        await pagar();
        await nav('operacao');
        await page.locator('#perfil').selectOption('gerente');
        await page.locator('#estoque [name=saldo]').fill('4');
        await page.locator('#estoque [name=motivo]').fill('Reposição de teste');
        await page.locator('#estoque button').click();
        assert.equal(await ler(() => produto(1).estoque.recife), 4);
        assert.match(await textoPrincipal(), /Reposição de teste/);
        assert.match(await page.locator('table').first().innerText(), /R\$\s*14,00/);
        assert.match(await page.locator('table').nth(1).innerText(), /Web\s+1/);
        await captura('operacao-desktop', { alvo: '#estoque' });
    });


    // ---------- Responsividade, canais e acessibilidade ----------

    await teste('T19', 'Layout em celular, tablet e desktop', async () => {
        for (const width of [375, 768, 1280]) {
            await page.setViewportSize({ width, height: 812 });
            for (const tela of ['cardapio', 'conta', 'carrinho', 'fidelidade', 'operacao', 'privacidade', 'guia']) {
                await page.evaluate(t => navegar(t), tela);
                assert(await ler(() => document.documentElement.scrollWidth <= innerWidth), `${tela} excedeu ${width}px`);
            }
        }
        await nav('cardapio');
        await page.setViewportSize({ width: 1280, height: 800 });
        await captura('cardapio-desktop', { alvo: 'header' });
        await page.setViewportSize({ width: 375, height: 812 });
        await captura('cardapio-mobile', { alvo: 'main' });
        await add(1);
        await pagar();
        await captura('pedido-mobile', { alvo: 'main' });
    });

    await teste('T20', 'Totem limpa a sessão após inatividade', async () => {
        await cadastro();
        await page.locator('#canal').selectOption('totem');
        assert.equal(await ler(() => estado.usuario), null);
        assert((await page.locator('[data-adicionar="1"]').boundingBox()).height >= 54);
        await add(1);
        await ler(() => { atividade = Date.now() - 101000; });
        await page.waitForSelector('#aviso-inatividade', { state: 'visible' });
        await page.setViewportSize({ width: 800, height: 900 });
        await captura('totem-aviso');
        await ler(() => { atividade = Date.now() - 121000; });
        await page.waitForFunction(() => estado.carrinho.length === 0, {}, { timeout: 5000 });
        assert.equal(await ler(() => estado.canal), 'totem');
        assert(await page.locator('#aviso-inatividade').isHidden());
    });

    await teste('T21', 'Navegação por teclado e rótulos', async () => {
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('.pular').evaluate(e => e === document.activeElement), true);
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('main').evaluate(e => e === document.activeElement), true);
        await nav('conta');
        assert.equal(await page.getByLabel('Nome fictício', { exact: true }).count(), 1);
        assert.equal(await page.locator('#cadastro input[required]').count(), 4);
    });

    await teste('T22', 'Observação com HTML exibida como texto', async () => {
        await add(1);
        await pagar('aprovado', '<img src=x onerror="window.invadiu=true">');
        await nav('operacao');
        assert.equal(await page.locator('main img').count(), 0);
        assert.equal(await ler(() => window.invadiu), undefined);
        assert.match(await textoPrincipal(), /<img/);
    });

    await teste('T23', 'Troca de unidade com carrinho cheio', async () => {
        await add(1);
        aceitarDialogo = false;
        await page.locator('#unidade').selectOption('joao');
        assert.equal(await ler(() => estado.unidade), 'recife');
        assert.equal(await ler(() => estado.carrinho.length), 1);
        aceitarDialogo = true;
        await page.locator('#unidade').selectOption('joao');
        assert.equal(await ler(() => estado.carrinho.length), 0);
        assert.equal(await ler(() => estado.unidade), 'joao');
    });

    await teste('T24', 'Estoque alterado durante a espera do provedor', async () => {
        await add(1);
        await irParaPagamento();
        await page.locator('#checkout button').click();
        await nav('operacao');
        await page.locator('#perfil').selectOption('gerente');
        await page.locator('#estoque [name=saldo]').fill('0');
        await page.locator('#estoque [name=motivo]').fill('Produto perdido');
        await page.locator('#estoque button').click();
        await page.waitForFunction(() => estado.pagamento === null);
        assert.equal(await ler(() => estado.pedidos.length), 0);
        assert.equal(await ler(() => estado.carrinho.length), 1);
        assert.match(await mensagem(), /estoque mudou/);
    });


    // ---------- Movimento da loja, campanhas e consentimentos ----------

    await teste('T25', 'Movimento da loja e previsão de retirada', async () => {
        assert.match(await page.locator('#movimento').innerText(), /Intenso[\s\S]*17 min/);
        await page.locator('#unidade').selectOption('joao');
        assert.match(await page.locator('#movimento').innerText(), /Tranquilo[\s\S]*8 min/);
        await add(1);
        await pagar();
        assert.match(await textoPrincipal(), /cerca de 8 min/);
        await nav('cardapio');
        assert.match(await page.locator('#movimento').innerText(), /Moderado[\s\S]*11 min/);
    });

    await teste('T26', 'Cupom personalizado sem autorização', async () => {
        await cadastro(false);
        await nav('cardapio');
        await add(1);
        await nav('carrinho');
        await page.locator('#cupom-form input').fill('RAIZES_RECIFE_C21B');
        await page.locator('#cupom-form button').click();
        assert.match(await page.locator('#erro-cupom').innerText(), /exclusivo/);
        assert.equal(await ler(() => totais().desconto), 0);
    });

    await teste('T27', 'Campanha personalizada com autorização e revogação', async () => {
        await cadastro(true);
        for (let i = 0; i < 2; i++) {
            await nav('cardapio');
            await add(5);
            await pagar();
        }
        await nav('cardapio');
        await page.locator('#oferta-personalizada summary').click();
        assert.match(await page.locator('#oferta-personalizada').innerText(), /não usamos idade/);
        await page.setViewportSize({ width: 375, height: 812 });
        await captura('oferta-mobile', { alvo: '#oferta-personalizada' });
        await add(1);
        await nav('carrinho');
        await page.locator('#cupom-form input').fill('RAIZES_RECIFE_C21B');
        await page.locator('#cupom-form button').click();
        assert.equal(await ler(() => totais().total), 1190);
        await page.locator('footer [data-tela=privacidade]').click();
        await page.locator('#marketing').uncheck();
        assert.equal(await ler(() => estado.cupom), '');
        await nav('cardapio');
        assert.equal(await page.locator('#oferta-personalizada').count(), 0);
    });

    await teste('T28', 'Registro de consentimentos', async () => {
        await cadastro(true);
        assert.equal(await ler(() => estado.usuario.consentimentos.length), 2);
        await page.locator('footer [data-tela=privacidade]').click();
        await page.locator('#marketing').uncheck();
        assert.equal(await page.locator('#historico-consentimentos tbody tr').count(), 3);
        assert.match(await page.locator('#historico-consentimentos tbody tr').first().innerText(), /Revogado/);
        await page.setViewportSize({ width: 375, height: 812 });
        await captura('privacidade-mobile', { alvo: '#marketing' });
    });

    await teste('T29', 'Canais App e Totem', async () => {
        // Totem: "Continuar meu pedido" mantém o carrinho
        await page.locator('#canal').selectOption('totem');
        await add(1);
        await ler(() => { atividade = Date.now() - 101000; });
        await page.waitForSelector('#aviso-inatividade', { state: 'visible' });
        await page.locator('#continuar-sessao').click();
        assert(await page.locator('#aviso-inatividade').isHidden());
        assert.equal(await ler(() => estado.carrinho.length), 1);
        assert(await page.locator('nav [data-tela="operacao"]').isHidden());

        // App: menu fixo na parte de baixo do celular, sem área da equipe
        await page.locator('#canal').selectOption('app');
        await page.setViewportSize({ width: 375, height: 812 });
        const menu = await page.locator('nav').boundingBox();
        assert(Math.abs(menu.y + menu.height - 812) <= 1, 'menu do App não está no rodapé');
        assert(await page.locator('nav [data-tela="operacao"]').isHidden());
        await ler(() => navegar('operacao'));
        assert.equal(await ler(() => estado.tela), 'cardapio');
        await captura('app-mobile', { manterAviso: true });
    });

    await teste('T30', 'Desempenho do carregamento inicial', async () => {
        await page.waitForLoadState('load');
        const medida = await ler(() => {
            const navegacao = performance.getEntriesByType('navigation')[0];
            const recursos = performance.getEntriesByType('resource');
            const bytes = navegacao.encodedBodySize + recursos.reduce((soma, r) => soma + r.encodedBodySize, 0);
            return { kb: Math.round(bytes / 1024), carregamento: Math.round(navegacao.domContentLoadedEventEnd), arquivos: recursos.length + 1 };
        });
        assert(medida.kb < 100, `aplicação com ${medida.kb} KB`);
        assert(medida.carregamento < 1000, `carregamento em ${medida.carregamento} ms`);
        return `${medida.arquivos} arquivos, ${medida.kb} KB, conteúdo pronto em ${medida.carregamento} ms`;
    });

    await teste('T31', 'Pedido registrado pelo atendente no balcão', async () => {
        await nav('operacao');
        await page.locator('#balcao').click();
        await add(1);
        await pagar();
        assert.equal(await ler(() => estado.pedidos[0].canal), 'balcao');
    });

    await teste('T32', 'Servidor local bloqueia pastas internas', async () => {
        const resposta = await page.request.get(endereco + '/.git/config');
        assert.equal(resposta.status(), 403);
    });

    resultados.testes.push({
        id: 'T33',
        nome: 'Nenhum erro de JavaScript durante os cenários',
        ok: erros.length === 0,
        ...(erros.length ? { erro: erros.join('; ') } : {})
    });

    fs.writeFileSync(path.join(saida, 'resultados.json'), JSON.stringify(resultados, null, 2));
    await browser.close();

    const aprovados = resultados.testes.filter(t => t.ok).length;
    console.log(`${aprovados}/${resultados.testes.length} verificações aprovadas.`);
    if (aprovados !== resultados.testes.length) process.exitCode = 1;
})().catch(e => {
    console.error(e);
    process.exitCode = 1;
});
