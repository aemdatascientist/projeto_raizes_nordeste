# Raízes do Nordeste

**Disciplina:** Projeto Multidisciplinar – UNINTER 2026  
**Trilha:** Front-end  
**Aluna:** Aline Edlaine de Medeiros, RU 5152233

Interface multicanal (Web, App, Totem e Balcão) para pedidos com retirada em uma rede de lanchonetes nordestinas. Desenvolvida com HTML, CSS e JavaScript puros, usando dados ilustrativos e sem transações financeiras reais.

## Como executar

Com Node.js instalado, abra o terminal nesta pasta:

```bash
node servidor.js
```

Acesse **<http://127.0.0.1:8080>**. Para encerrar, pressione Ctrl+C. Também é possível abrir `index.html` diretamente no navegador.

## O que testar

O link **Como avaliar esta demonstração**, no rodapé da aplicação, traz este mesmo roteiro.

1. Compare as unidades: **Recife** (cozinha completa e horário de pico), **João Pessoa** (bolo esgotado) e **Caruaru** (fechada).
2. Adicione produtos e, em Recife, teste os cupons `RAIZES_RECIFE_7F3A` (válido), `RAIZES_RECIFE_0E6D` (vencido), `RAIZES_JOAOPESSOA_4B9E` (de outra unidade) e `ABC` (inválido). Cada cupom segue o padrão `RAIZES_UNIDADE_XXXX` e vale só na sua unidade; a lista completa está em `dados.js`.
3. Crie uma conta de teste marcando "campanhas personalizadas", ou compre sem cadastro.
4. No pagamento, escolha no **painel de simulação** o retorno: aprovado, recusado ou indisponível.
5. Com campanhas autorizadas e 2 pedidos pagos, veja a oferta **Freguês da casa** (`RAIZES_RECIFE_C21B` em Recife) e o botão "Por que estou vendo esta oferta?".
6. Na **Área da equipe**, use Cozinha (iniciar preparo, marcar pronto) e Atendente (confirmar retirada).
7. Como **Gerente**, ajuste o estoque com motivo e consulte vendas por unidade e canal e a auditoria.
8. Em **Privacidade**, revogue campanhas, veja o registro de consentimentos, exporte e exclua os dados.
9. Troque o canal para **App** (menu inferior no celular) e **Totem** (botões maiores, aviso de inatividade aos 100 s e limpeza aos 120 s).

A canjica só fica disponível em junho, conforme o mês do computador.

## Organização do reporitório

- `index.html`: estrutura da página.
- `style.css`: estilos mobile-first, ajustes para tablet/computador e canais App e Totem.
- `dados.js`: dados fictícios e regras como dados (unidades, produtos, cupons, fidelidade, fila e transições do pedido).
- `app.js`: estado, regras de negócio, telas, ações e eventos.
- `imagens/`: desenhos em SVG da identidade visual do nordeste (chapéu de couro, bandeirinhas, mandacaru, serra) e dos produtos.
- `servidor.js`: servidor local, sem dependências.
- `documentacao/evidencias/`: capturas de tela e resultados (`resultados.json`) gerados pelos testes.
- `testes/`: 33 verificações automáticas dos fluxos no navegador.

## Limites da demo

Contas, pedidos, estoque e auditoria ficam somente na memória da aba: recarregar apaga tudo. Há uma conta de teste por sessão. Não há autenticação segura, usuários simultâneos nem sincronização entre abas. Os papéis da equipe são selecionáveis para facilitar a avaliação; uma versão real exigiria controle de acesso no servidor. A fila de outros canais em cada unidade é simulada (`filaSimulada` em `dados.js`).

## Demais documentações do projeto e da disciplina

A documentação do projeto (requisitos, diagramas, wireframes, LGPD, plano de testes e conclusão) será entregue em PDF no AVA. Este repositório contém apenas a aplicação, os testes automatizados e as evidências geradas por eles.
