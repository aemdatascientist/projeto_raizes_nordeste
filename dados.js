// =====================================================
// Raízes do Nordeste — dados fictícios (mock data)
// Contém as unidades, o cardápio, os cupons e as regras declaradas como
// dados (etapas do pedido, fidelidade, fila e tempo do totem). Fica
// separado de app.js para que essas regras mudem sem alterar as telas.
// Em uma versão real, estes dados viriam da API de cada unidade.
// =====================================================

// Unidades da rede. Cada uma tem horário, situação, tipo de cozinha e fila próprios.
// "filaSimulada" representa pedidos de outros canais já em preparo na loja,
// usada para demonstrar o comportamento da interface em horário de pico.
const UNIDADES = [
    { id: 'recife', nome: 'Recife · Boa Vista', horario: '7h às 20h', aberta: true, cozinha: 'completa', filaSimulada: 4 },
    { id: 'joao', nome: 'João Pessoa · Centro', horario: '7h às 18h', aberta: true, cozinha: 'reduzida', filaSimulada: 1 },
    { id: 'caruaru', nome: 'Caruaru · Centro', horario: '7h às 17h', aberta: false, cozinha: 'reduzida', filaSimulada: 0 }
];

// Cardápio da rede. O estoque é separado por unidade:
// produto sem chave para uma unidade não é vendido nela.
// Preços em centavos para evitar erros de arredondamento.
// "icone" é o nome do desenho na pasta imagens (ex.: milho → imagens/milho.svg).
const PRODUTOS = [
    { id: 1, nome: 'Cuscuz com queijo coalho', descricao: 'Cuscuz de milho, queijo coalho e manteiga de garrafa.', categoria: 'Cuscuz', preco: 1400, icone: 'milho', estoque: { recife: 12, joao: 8, caruaru: 5 } },
    { id: 2, nome: 'Tapioca de frango', descricao: 'Goma de mandioca com frango desfiado e requeijão.', categoria: 'Tapiocas', preco: 1600, icone: 'tapioca', estoque: { recife: 10, joao: 6, caruaru: 5 } },
    { id: 3, nome: 'Bolo de macaxeira', descricao: 'Uma fatia do nosso bolo de macaxeira com coco.', categoria: 'Doces', preco: 800, icone: 'bolo', estoque: { recife: 8, joao: 0, caruaru: 3 } },
    { id: 4, nome: 'Suco de cajá', descricao: 'Suco regional, preparado na hora. Copo de 300 ml.', categoria: 'Bebidas', preco: 700, icone: 'caja', estoque: { recife: 15, joao: 9, caruaru: 5 } },
    { id: 5, nome: 'Café coado', descricao: 'Café passado na hora. Copo de 150 ml.', categoria: 'Bebidas', preco: 500, icone: 'cafe', estoque: { recife: 20, joao: 15, caruaru: 10 } },
    { id: 6, nome: 'Tapioca de carne de sol', descricao: 'Carne de sol desfiada com queijo coalho. Exige cozinha completa: só em Recife.', categoria: 'Tapiocas', preco: 1900, icone: 'tapioca', estoque: { recife: 6 } },
    { id: 7, nome: 'Canjica junina', descricao: 'Milho, leite e canela. Produto sazonal: disponível em junho.', categoria: 'Doces', preco: 900, icone: 'canjica', meses: [6], estoque: { recife: 10, joao: 8 } }
];

// Etapas que o cliente acompanha depois do pagamento aprovado
const ETAPAS = ['Confirmado', 'Em preparo', 'Pronto para retirada', 'Retirado'];

// Máquina de estados do pedido: quem pode avançar cada etapa e o nome do botão.
const TRANSICOES = {
    'Confirmado': { proximo: 'Em preparo', perfil: 'cozinha', acao: 'Iniciar preparo' },
    'Em preparo': { proximo: 'Pronto para retirada', perfil: 'cozinha', acao: 'Marcar pronto' },
    'Pronto para retirada': { proximo: 'Retirado', perfil: 'atendente', acao: 'Confirmar retirada' }
};

// Cupons e campanhas. Padrão do código: RAIZES_UNIDADE_XXXX (4 caracteres fixos).
// Cada cupom vale somente na unidade indicada no código.
// "publico: false" indica campanha personalizada,
// liberada somente para quem autorizou campanhas e cumpre a regra de frequência.
const CUPONS = {
    RAIZES_RECIFE_7F3A: { unidade: 'recife', campanha: 'boas-vindas', percentual: 10, publico: true, descricao: 'Boas-vindas: 10% no pedido' },
    RAIZES_RECIFE_C21B: { unidade: 'recife', campanha: 'fregues', percentual: 15, publico: false, descricao: 'Freguês da casa: 15% para clientes frequentes' },
    RAIZES_RECIFE_0E6D: { unidade: 'recife', campanha: 'junina', percentual: 10, publico: true, vencido: true, descricao: 'Campanha junina (encerrada em 30/06)' },

    RAIZES_JOAOPESSOA_4B9E: { unidade: 'joao', campanha: 'boas-vindas', percentual: 10, publico: true, descricao: 'Boas-vindas: 10% no pedido' },
    RAIZES_JOAOPESSOA_D53C: { unidade: 'joao', campanha: 'fregues', percentual: 15, publico: false, descricao: 'Freguês da casa: 15% para clientes frequentes' },
    RAIZES_JOAOPESSOA_1A7F: { unidade: 'joao', campanha: 'junina', percentual: 10, publico: true, vencido: true, descricao: 'Campanha junina (encerrada em 30/06)' },

    RAIZES_CARUARU_9C2D: { unidade: 'caruaru', campanha: 'boas-vindas', percentual: 10, publico: true, descricao: 'Boas-vindas: 10% no pedido' },
    RAIZES_CARUARU_E48A: { unidade: 'caruaru', campanha: 'fregues', percentual: 15, publico: false, descricao: 'Freguês da casa: 15% para clientes frequentes' },
    RAIZES_CARUARU_6F10: { unidade: 'caruaru', campanha: 'junina', percentual: 10, publico: true, vencido: true, descricao: 'Campanha junina (encerrada em 30/06)' }
};

// Regras do programa de fidelidade
const FIDELIDADE = {
    pontosResgate: 30,      // pontos necessários para um resgate
    valorResgate: 500,      // desconto máximo do resgate, em centavos (R$ 5,00)
    pedidosFregues: 2       // pedidos pagos para receber a campanha personalizada
};

// Estimativa de tempo de retirada: base + minutos por pedido na fila
const FILA = { minutosBase: 5, minutosPorPedido: 3 };

// Totem: aviso após 100 s sem uso e limpeza da sessão aos 120 s
const INATIVIDADE = { avisoMs: 100000, limiteMs: 120000 };
