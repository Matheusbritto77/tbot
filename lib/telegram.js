const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const qrcode = require('qrcode');
const { loadSession, saveSession, clearSession, loadConfig, saveConfig, addLog } = require('./store');

const DEFAULT_API_ID = 2040;
const DEFAULT_API_HASH = 'b18441a1ff607e10a989891a5462e627';

class TelegramService {
  constructor() {
    this.client = null;
    this.isAuthenticated = false;
    this.currentUser = null;
    this.loginStatus = 'idle'; // 'idle' | 'generating' | 'waiting_qr_scan' | 'password_needed' | 'authenticated' | 'error'
    this.qrCodeDataUrl = null;
    this.qrCodeRawUrl = null;
    this.qrExpiresAt = null;
    this.passwordCallback = null;
    this.passwordHint = null;
    this.errorMessage = null;
    this.dialogsCache = new Map();
    this.listeners = new Set();
    this.isLoggingIn = false;
  }

  addListener(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(event, data) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (err) {
        console.error('Erro ao notificar listener:', err.message);
      }
    }
  }

  getState() {
    return {
      isAuthenticated: this.isAuthenticated,
      loginStatus: this.loginStatus,
      currentUser: this.currentUser,
      qrCodeDataUrl: this.qrCodeDataUrl,
      qrCodeRawUrl: this.qrCodeRawUrl,
      qrExpiresAt: this.qrExpiresAt,
      passwordRequired: this.loginStatus === 'password_needed',
      passwordHint: this.passwordHint,
      errorMessage: this.errorMessage,
    };
  }

  async init() {
    const sessionData = loadSession();
    const config = loadConfig();

    if (sessionData && sessionData.sessionString && sessionData.apiId && sessionData.apiHash) {
      addLog('info', 'Tentando restaurar sessão salva do Telegram...');
      try {
        const session = new StringSession(sessionData.sessionString);
        this.client = new TelegramClient(
          session,
          Number(sessionData.apiId),
          sessionData.apiHash,
          { connectionRetries: 5 }
        );

        await this.client.connect();
        const isAuth = await this.client.checkAuthorization();
        if (isAuth) {
          const me = await this.client.getMe();
          this.currentUser = {
            id: me.id ? me.id.toString() : '',
            firstName: me.firstName || '',
            lastName: me.lastName || '',
            username: me.username || '',
            phone: me.phone || '',
          };
          this.isAuthenticated = true;
          this.loginStatus = 'authenticated';
          addLog('success', `Sessão restaurada com sucesso! Logado como ${me.firstName} ${me.username ? '(@' + me.username + ')' : ''}`);
          this.notify('auth_state', this.getState());
          return true;
        } else {
          addLog('warning', 'Sessão salva expirou ou foi revogada no Telegram.');
          clearSession();
          this.loginStatus = 'idle';
        }
      } catch (err) {
        addLog('error', `Falha ao restaurar sessão: ${err.message}`);
        this.loginStatus = 'idle';
      }
    }
    return false;
  }

  async startQrLogin(apiId, apiHash) {
    if (this.isAuthenticated && this.client) {
      return this.getState();
    }

    if (this.isLoggingIn) {
      return this.getState();
    }

    // Use provided credentials or fallback to Telegram client built-in credentials
    const finalApiId = Number(apiId) || Number(process.env.TELEGRAM_API_ID) || DEFAULT_API_ID;
    const finalApiHash = (apiHash && apiHash.trim()) || process.env.TELEGRAM_API_HASH || DEFAULT_API_HASH;

    this.isLoggingIn = true;
    this.loginStatus = 'generating';
    this.errorMessage = null;
    this.notify('auth_state', this.getState());
    addLog('info', 'Iniciando autenticação por QR Code com a API MTProto do Telegram...');

    // Save credentials to config
    saveConfig({ apiId: finalApiId, apiHash: finalApiHash });

    try {
      // Disconnect previous client if any
      if (this.client) {
        try {
          await this.client.disconnect();
        } catch (_) {}
      }

      const stringSession = new StringSession('');
      this.client = new TelegramClient(
        stringSession,
        finalApiId,
        finalApiHash,
        { connectionRetries: 5 }
      );

      await this.client.connect();

      // Start QR flow in background
      this.client
        .signInUserWithQrCode(
          {
            apiId: finalApiId,
            apiHash: finalApiHash,
          },
          {
            qrCode: async ({ token, expires }) => {
              try {
                const base64UrlToken = Buffer.from(token).toString('base64url');
                const tgUrl = `tg://login?token=${base64UrlToken}`;
                const dataUrl = await qrcode.toDataURL(tgUrl, {
                  width: 320,
                  margin: 2,
                  color: {
                    dark: '#000000',
                    light: '#ffffff',
                  },
                });

                this.qrCodeRawUrl = tgUrl;
                this.qrCodeDataUrl = dataUrl;
                this.qrExpiresAt = Date.now() + 30000;
                this.loginStatus = 'waiting_qr_scan';
                addLog('info', 'Novo QR Code gerado. Aguardando leitura no aplicativo Telegram.');
                this.notify('qr_update', {
                  qrCodeDataUrl: this.qrCodeDataUrl,
                  qrCodeRawUrl: this.qrCodeRawUrl,
                  qrExpiresAt: this.qrExpiresAt,
                });
                this.notify('auth_state', this.getState());
              } catch (qrErr) {
                console.error('Erro gerando imagem QR:', qrErr);
              }
            },
            onError: async (err) => {
              console.error('Erro no fluxo QR:', err);
              if (err.message && err.message.includes('AUTH_KEY_UNREGISTERED')) {
                return false;
              }
              this.errorMessage = err.message || 'Erro durante a leitura do QR Code';
              this.loginStatus = 'error';
              addLog('error', `Erro na autenticação: ${this.errorMessage}`);
              this.notify('auth_state', this.getState());
              return true; // Stop
            },
            password: async (hint) => {
              addLog('warning', 'Esta conta possui Verificação em Duas Etapas (2FA). Senha necessária.');
              this.loginStatus = 'password_needed';
              this.passwordHint = hint || '';
              this.notify('auth_state', this.getState());

              return new Promise((resolve) => {
                this.passwordCallback = resolve;
              });
            },
          }
        )
        .then(async () => {
          // Authentication successful!
          const sessionString = this.client.session.save();
          saveSession({
            sessionString,
            apiId: finalApiId,
            apiHash: finalApiHash,
            savedAt: new Date().toISOString(),
          });

          const me = await this.client.getMe();
          this.currentUser = {
            id: me.id ? me.id.toString() : '',
            firstName: me.firstName || '',
            lastName: me.lastName || '',
            username: me.username || '',
            phone: me.phone || '',
          };
          this.isAuthenticated = true;
          this.loginStatus = 'authenticated';
          this.qrCodeDataUrl = null;
          this.qrCodeRawUrl = null;
          this.isLoggingIn = false;
          addLog('success', `Login concluído com sucesso! Bem-vindo(a), ${me.firstName}!`);
          this.notify('auth_state', this.getState());
        })
        .catch((err) => {
          this.isLoggingIn = false;
          this.errorMessage = err.message || 'Falha ao autenticar com QR Code.';
          this.loginStatus = 'error';
          addLog('error', `Falha no processo de login: ${this.errorMessage}`);
          this.notify('auth_state', this.getState());
        });

      return this.getState();
    } catch (err) {
      this.isLoggingIn = false;
      this.loginStatus = 'error';
      this.errorMessage = err.message;
      addLog('error', `Erro ao inicializar cliente Telegram: ${err.message}`);
      this.notify('auth_state', this.getState());
      throw err;
    }
  }

  async provide2FaPassword(password) {
    if (this.passwordCallback) {
      addLog('info', 'Enviando senha de verificação em duas etapas...');
      const cb = this.passwordCallback;
      this.passwordCallback = null;
      this.loginStatus = 'waiting_qr_scan';
      this.notify('auth_state', this.getState());
      cb(password);
      return { success: true };
    }
    throw new Error('Nenhuma solicitação de senha 2FA pendente.');
  }

  async logout() {
    addLog('info', 'Desconectando da conta Telegram...');
    this.isAuthenticated = false;
    this.loginStatus = 'idle';
    this.currentUser = null;
    this.qrCodeDataUrl = null;
    this.qrCodeRawUrl = null;
    this.errorMessage = null;
    this.isLoggingIn = false;
    this.dialogsCache.clear();
    clearSession();

    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (_) {}
      this.client = null;
    }

    addLog('success', 'Conta desconectada com sucesso.');
    this.notify('auth_state', this.getState());
    return { success: true };
  }

  async getDialogs() {
    if (!this.isAuthenticated || !this.client) {
      throw new Error('Cliente Telegram não autenticado. Faça login primeiro.');
    }

    addLog('info', 'Buscando lista de grupos e canais da sua conta...');
    const dialogs = await this.client.getDialogs({ limit: 100 });
    const formatted = [];
    this.dialogsCache.clear();

    for (const d of dialogs) {
      // We only care about groups and channels for posting
      if (d.isGroup || d.isChannel) {
        const idStr = d.id ? d.id.toString() : '';
        const entity = d.entity;
        
        // Cache dialog and entity for sending messages reliably
        this.dialogsCache.set(idStr, {
          dialog: d,
          entity: entity,
          inputEntity: d.inputEntity,
        });

        formatted.push({
          id: idStr,
          title: d.title || 'Sem título',
          isGroup: d.isGroup,
          isChannel: d.isChannel,
          username: entity && entity.username ? entity.username : null,
          participantsCount: entity && entity.participantsCount ? entity.participantsCount : null,
          unreadCount: d.unreadCount || 0,
        });
      }
    }

    // Sort alphabetically by title
    formatted.sort((a, b) => a.title.localeCompare(b.title));
    addLog('success', `${formatted.length} grupos/canais carregados com sucesso.`);
    return formatted;
  }

  async sendMessage(targetId, messageText, filePath = null) {
    if (!this.isAuthenticated || !this.client) {
      throw new Error('Cliente Telegram não autenticado.');
    }

    if (!targetId) {
      throw new Error('Nenhum grupo ou canal foi selecionado.');
    }

    if ((!messageText || !messageText.trim()) && !filePath) {
      throw new Error('O texto da mensagem ou a foto devem ser informados.');
    }

    // Ensure dialogs are in cache for reliable entity resolution
    if (this.dialogsCache.size === 0) {
      try {
        await this.getDialogs();
      } catch (_) {}
    }

    // Resolve target entity
    let target = null;
    const cached = this.dialogsCache.get(targetId.toString());
    if (cached) {
      target = cached.inputEntity || cached.entity || cached.dialog;
    } else {
      try {
        target = await this.client.getInputEntity(targetId);
      } catch (_) {
        try {
          target = await this.client.getEntity(targetId);
        } catch (_) {
          target = targetId;
        }
      }
    }

    const captionText = messageText ? messageText.trim() : '';

    if (filePath) {
      // Send Photo with Caption
      try {
        const result = await this.client.sendFile(target, {
          file: filePath,
          caption: captionText,
          parseMode: 'md',
          forceDocument: false,
        });
        return {
          success: true,
          messageId: result.id,
          date: result.date,
          hasPhoto: true,
        };
      } catch (fileErr) {
        addLog('warning', `Tentativa de envio de foto com Markdown falhou: ${fileErr.message}. Tentando como texto simples...`);
        const result = await this.client.sendFile(target, {
          file: filePath,
          caption: captionText,
          forceDocument: false,
        });
        return {
          success: true,
          messageId: result.id,
          date: result.date,
          hasPhoto: true,
        };
      }
    } else {
      // Send Text Message
      try {
        const result = await this.client.sendMessage(target, {
          message: captionText,
          parseMode: 'md',
        });
        return {
          success: true,
          messageId: result.id,
          date: result.date,
          hasPhoto: false,
        };
      } catch (parseErr) {
        addLog('warning', `Aviso ao formatar Markdown: ${parseErr.message}. Enviando como texto simples...`);
        const result = await this.client.sendMessage(target, {
          message: captionText,
        });
        return {
          success: true,
          messageId: result.id,
          date: result.date,
          hasPhoto: false,
        };
      }
    }
  }
}

const telegramService = new TelegramService();

module.exports = telegramService;
