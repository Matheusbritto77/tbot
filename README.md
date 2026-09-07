# Telegram Userbot MTProto (API Não Oficial)

Aplicação web completa para automação de postagens no Telegram utilizando uma conta de usuário comum via protocolo **MTProto (GramJS)**, com login prático por **QR Code**, seletor visual de grupos, agendador de postagens com intervalo customizável e recursos anti-spam.

---

## 🚀 Como Iniciar

### Opção 1: Com Docker (Recomendado)

```bash
docker compose up -d
```
Abra no navegador: 👉 **[http://localhost](http://localhost)** (porta 80)

---

### Opção 2: Com Node.js local

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Inicie o servidor:
   ```bash
   npm start
   ```

3. Abra no navegador:
   👉 **[http://localhost](http://localhost)** (porta 80)

---

## 🔑 Como Obter seu API ID e API HASH (Passo a Passo)

Para utilizar a API não oficial do Telegram (MTProto), o Telegram exige que você obtenha um par de chaves gratuito:

1. Acesse o portal do desenvolvedor do Telegram: [https://my.telegram.org](https://my.telegram.org)
2. Digite seu número de telefone com código do país (ex: `+55 11 99999-9999`) e confirme com o código recebido no seu Telegram.
3. Clique em **API development tools**.
4. Se for a primeira vez, preencha qualquer título em **App title** e **Short name** (ex: `Userbot`, `meubot`) e clique em **Create application**.
5. Copie os campos:
   - **App api_id**: número inteiro.
   - **App api_hash**: código de texto hexadecimal.
6. Cole esses valores na tela da aplicação web (eles ficam salvos automaticamente para os próximos acessos).

---

## 📱 Como Conectar via QR Code

1. Na aplicação em [http://localhost](http://localhost), insira seu `API ID` e `API HASH` e clique em **Gerar QR Code para Login**.
2. Abra o aplicativo oficial do **Telegram no seu smartphone**.
3. Vá em **Configurações** (ou Menu lateral) > **Dispositivos** > **Conectar Dispositivo**.
4. Aponte a câmera do celular para o QR Code na tela do computador.
5. Pronto! A sua sessão é autenticada instantaneamente e salva de forma segura localmente (`data/session.json`). Você não precisará escanear de novo nas próximas inicializações.
   *(Caso sua conta possua Verificação em Duas Etapas / 2FA, a tela solicitará a sua senha do Telegram para finalizar).*

---

## ⚙️ Configuração das Postagens

1. **Seletor de Grupos**: A aplicação carrega automaticamente todos os grupos, supergrupos e canais da sua conta. Basta escolher o grupo desejado no menu suspenso.
2. **Mensagem**:
   - Digite o conteúdo desejado no compositor.
   - **Tags Dinâmicas Anti-Spam**:
     - `{hora}`: substitui pelo horário atual (ex: `20:45:10`).
     - `{data}`: substitui pela data atual (ex: `07/09/2026`).
     - `{aleatorio}`: gera um código aleatório (ex: `X9K3L`).
     - `{Spintax}`: sorteia palavras ou frases aleatórias, por exemplo: `{Olá|Oi|E aí!}`. Isso impede que mensagens idênticas repetidas sejam bloqueadas pelo Telegram.
3. **Intervalo**:
   - Defina o tempo de espera entre postagens (em **Segundos**, **Minutos** ou **Horas**).
   - Defina uma variação aleatória (*jitter*) em segundos (ex: `± 5 seg`) para simular comportamento humano.
4. **Testar Envio**:
   - Clique em **Enviar Teste Agora** para validar se a sua conta tem permissão de postar no grupo escolhido antes de ligar o agendador automático.
5. **Iniciar / Pausar / Parar**:
   - Clique em **Iniciar Postagens** para ligar o ciclo contínuo.
   - O painel exibe um cronômetro regressivo em tempo real (`04:59`, `04:58`...) indicando quando ocorrerá o próximo envio.
   - Acompanhe todos os eventos no **Terminal de Logs ao Vivo**.

---

## 📂 Estrutura do Projeto

```
nnt/
├── package.json        # Dependências e scripts npm
├── server.js           # Servidor Express + API REST + Stream SSE em tempo real
├── lib/
│   ├── telegram.js     # Integração MTProto (GramJS), login QR e envio de mensagens
│   ├── scheduler.js    # Motor de agendamento, spintax, tags dinâmicas e métricas
│   └── store.js        # Persistência de sessão, configurações e logs
├── public/
│   ├── index.html      # Interface web SPA moderna
│   ├── css/style.css   # Estilo Dark Mode com estética do Telegram
│   └── js/app.js       # Comunicação SSE e lógica interativa do dashboard
└── data/               # Armazenamento de sessão e configurações (gerado automaticamente)
```
