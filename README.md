# Psicogenise

Projeto simples com uma interface que renderiza "nuvens" interativas na página e permite tocar/solicitar sons e enviar entradas de texto para um backend.

**O que há neste repositório**
- `index.html`: página principal (markup básico, inclui `app.js` e `styles.css`).
- `styles.css`: estilos e variáveis CSS.
- `app.js`: lógica de posicionamento das nuvens, criação dos botões/inputs e comunicação com o backend (fetch com timeout).

**Principais alterações recentes**
- O script JavaScript foi movido de `index.html` para `app.js` para facilitar manutenção e cache.
- Imagens que atuavam como botões (`<img role="button">`) foram substituídas por elementos semânticos `<button>` com `img` dentro para melhorar acessibilidade.
- As requisições `fetch` passaram a usar timeout (`AbortController`) e blobs de áudio são revogados (`URL.revokeObjectURL`) após reprodução.
- É possível configurar a quantidade de nuvens via atributo `data-cloud-count` no `<body>` (ex.: `<body data-cloud-count="6">`).

**Como rodar localmente (rápido)**
Você pode abrir `index.html` direto no navegador, porém alguns recursos (fetch, CORS) funcionam melhor servindo os arquivos por um servidor HTTP simples.

Usando Python 3 (porta 8000):

```bash
python3 -m http.server 8000
# depois abra http://localhost:8000
```

Ou, se preferir, use `npx serve`:

```bash
npx serve . -l 8000
```

**Configuração do backend (opcional)**
- O frontend procura por `window.__API_BASE_URL` para construir endpoints. Se não estiver definido, as ações de envio/requisição serão ignoradas (com logs no console) — útil para desenvolvimento sem backend.
- Para testar com um backend local, defina a variável antes de carregar a página, por exemplo no console do navegador:

```js
window.__API_BASE_URL = 'http://localhost:3000';
```

Endpoints esperados (padrões em `app.js`):
- `POST /api/sound` — retorna áudio como JSON `{ audioUrl: '/media/foo.mp3' }` ou blob/base64.
- `POST /api/messages` — recebe payload do input principal.
- `POST /api/cloud-inputs` — recebe payloads dos inputs nas nuvens.

Se o backend exigir autenticação, ajuste o código em `app.js` para enviar o header `Authorization`.

**Testes manuais rápidos**
- Abra o site e clique nos botões (GIFs) — se `window.__API_BASE_URL` não estiver definido, o comportamento será simulado e aparecerão logs no console.
- Digite um texto em um campo e pressione Enter — o evento dispara `backend:submit:*` (veja console).

**Boas práticas / próximas melhorias sugeridas**
- Otimizar imagens (`som.gif`, `fundo.jpg`, `nuvem.png`) para formatos modernos (webp/avif) e múltiplas resoluções.
- Externalizar strings para i18n se necessário.
- Considerar mover o cálculo de posicionamento das nuvens para um Web Worker se o `COUNT` for alto.
- Suporte a `prefers-reduced-motion` já sugerido no CSS — mantenha para acessibilidade.

---

Se quiser, eu posso:
- criar um pequeno servidor de exemplo (mock) para os endpoints descritos, ou
- adicionar um `CONTRIBUTING.md` e um script de lint/format.
