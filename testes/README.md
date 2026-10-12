# Testes automatizados

Esta pasta contém os testes de ponta a ponta da interface. Eles existem para verificar os fluxos principais (cardápio, cupons, conta, pagamento simulado, operação da loja, fidelidade, privacidade, canais e acessibilidade) e para registrar as evidências em `documentacao/evidencias`.

Os testes usam Playwright com o Chrome já instalado, sem baixar outro navegador. A aplicação não depende dessa ferramenta para funcionar.

Para instalar o Playwright:

```bash
npm install playwright --no-save --no-audit --no-fund
```

Em um terminal, execute `node servidor.js`. Em outro:

```bash
node testes/navegador.cjs
```

O script executa os 33 cenários do plano de testes (T01 a T33) e salva os resultados (`resultados.json`) e as capturas de tela em `documentacao/evidencias`. Defina `CHROME_PATH` se o Chrome estiver em outro local.

Usabilidade com pessoas reais, leitura com tecnologia assistiva e acesso aos links públicos precisam de verificação complementar. Os testes de layout verificam largura e organização, sem substituir uma revisão visual.
