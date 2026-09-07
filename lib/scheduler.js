const telegramService = require('./telegram');
const { loadConfig, saveConfig, addLog } = require('./store');

class SchedulerService {
  constructor() {
    this.timer = null;
    this.tickInterval = null;
    this.isRunning = false;
    this.isPaused = false;
    this.targetGroupId = '';
    this.targetGroupName = '';
    this.messageTemplate = '';
    this.photoPath = null;
    this.photoUrl = null;
    this.intervalSeconds = 600; // default 10 minutes
    this.randomJitter = 0;
    this.startedAt = null;
    this.lastSentAt = null;
    this.nextRunAt = null;
    this.totalSent = 0;
    this.totalErrors = 0;
    this.lastError = null;
    this.listeners = new Set();
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
        console.error('Erro ao notificar scheduler listener:', err.message);
      }
    }
  }

  getStatus() {
    const now = Date.now();
    let secondsUntilNext = 0;
    if (this.isRunning && !this.isPaused && this.nextRunAt) {
      secondsUntilNext = Math.max(0, Math.ceil((this.nextRunAt - now) / 1000));
    }

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      targetGroupId: this.targetGroupId,
      targetGroupName: this.targetGroupName,
      messageTemplate: this.messageTemplate,
      photoPath: this.photoPath,
      photoUrl: this.photoUrl,
      hasPhoto: !!this.photoPath,
      intervalSeconds: this.intervalSeconds,
      randomJitter: this.randomJitter,
      startedAt: this.startedAt,
      lastSentAt: this.lastSentAt,
      nextRunAt: this.nextRunAt,
      secondsUntilNext,
      totalSent: this.totalSent,
      totalErrors: this.totalErrors,
      lastError: this.lastError,
    };
  }

  // Resolve spintax e.g. {Olá|Oi|E aí} and variables
  formatMessage(template) {
    if (!template) return '';

    let text = template;

    // 1. Spintax: {opt1|opt2|opt3}
    const spintaxRegex = /\{([^{}]+)\}/g;
    text = text.replace(spintaxRegex, (match, content) => {
      // If content has '|', it's spintax
      if (content.includes('|')) {
        const choices = content.split('|');
        const chosen = choices[Math.floor(Math.random() * choices.length)].trim();
        return chosen;
      }
      return match; // Not spintax, keep for variable replacement
    });

    // 2. Dynamic Variables
    const now = new Date();
    const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const data = now.toLocaleDateString('pt-BR');
    const timestamp = Math.floor(now.getTime() / 1000).toString();
    const aleatorio = Math.random().toString(36).substring(2, 7).toUpperCase();

    text = text
      .replace(/\{hora\}/gi, hora)
      .replace(/\{time\}/gi, hora)
      .replace(/\{data\}/gi, data)
      .replace(/\{date\}/gi, data)
      .replace(/\{timestamp\}/gi, timestamp)
      .replace(/\{aleatorio\}/gi, aleatorio)
      .replace(/\{random\}/gi, aleatorio);

    return text;
  }

  async sendOnce(isManualTest = false) {
    if (!this.targetGroupId) {
      throw new Error('Nenhum grupo foi selecionado.');
    }

    const message = this.formatMessage(this.messageTemplate);
    const targetLabel = this.targetGroupName || this.targetGroupId;

    const actionText = this.photoPath ? 'foto com legenda' : 'mensagem';
    addLog(
      'info',
      `${isManualTest ? '[TESTE MANUAL]' : '[AUTO]'} Enviando ${actionText} para "${targetLabel}"...`,
      { messagePreview: message.slice(0, 80), hasPhoto: !!this.photoPath }
    );

    try {
      const result = await telegramService.sendMessage(this.targetGroupId, message, this.photoPath);
      this.totalSent++;
      this.lastSentAt = new Date().toISOString();
      this.lastError = null;

      addLog(
        'success',
        `${this.photoPath ? 'Foto com legenda enviada' : 'Mensagem enviada'} com sucesso para "${targetLabel}"! (ID da msg: ${result.messageId})`
      );

      this.notify('post_success', {
        targetGroupId: this.targetGroupId,
        targetGroupName: this.targetGroupName,
        sentAt: this.lastSentAt,
        messagePreview: message,
        hasPhoto: !!this.photoPath,
      });

      this.notify('status_change', this.getStatus());
      return { success: true, message, messageId: result.messageId, hasPhoto: !!this.photoPath };
    } catch (err) {
      this.totalErrors++;
      this.lastError = err.message;
      addLog('error', `Falha ao enviar ${actionText} para "${targetLabel}": ${err.message}`);

      this.notify('post_error', {
        targetGroupId: this.targetGroupId,
        targetGroupName: this.targetGroupName,
        error: err.message,
      });

      this.notify('status_change', this.getStatus());
      throw err;
    }
  }

  start({ targetGroupId, targetGroupName, messageTemplate, intervalSeconds, randomJitter = 0, sendImmediately = true, photoPath = null, photoUrl = null }) {
    if (!telegramService.isAuthenticated) {
      throw new Error('Você precisa fazer login no Telegram antes de iniciar o agendador.');
    }

    if (!targetGroupId) {
      throw new Error('Selecione um grupo antes de iniciar.');
    }

    if (!photoPath && (!messageTemplate || !messageTemplate.trim())) {
      throw new Error('Digite a mensagem/legenda ou selecione uma foto.');
    }

    const interval = Math.max(5, Number(intervalSeconds) || 60);

    this.stop(); // Clear any existing

    this.targetGroupId = targetGroupId.toString();
    this.targetGroupName = targetGroupName || targetGroupId.toString();
    this.messageTemplate = messageTemplate || '';
    this.photoPath = photoPath || null;
    this.photoUrl = photoUrl || null;
    this.intervalSeconds = interval;
    this.randomJitter = Number(randomJitter) || 0;
    this.isRunning = true;
    this.isPaused = false;
    this.startedAt = new Date().toISOString();

    // Save configuration
    saveConfig({
      selectedGroupId: this.targetGroupId,
      selectedGroupName: this.targetGroupName,
      messageText: this.messageTemplate,
      photoPath: this.photoPath,
      photoUrl: this.photoUrl,
      intervalValue: this.intervalSeconds,
      randomJitter: this.randomJitter,
    });

    const hasPhotoMsg = this.photoPath ? ' (com Foto)' : '';
    addLog(
      'info',
      `Agendador iniciado! Grupo: "${this.targetGroupName}"${hasPhotoMsg}, Intervalo: ${this.intervalSeconds}s (jitter: ±${this.randomJitter}s).`
    );

    // Setup 1-second tick for UI countdown
    this.tickInterval = setInterval(() => {
      if (this.isRunning && !this.isPaused && this.nextRunAt) {
        this.notify('tick', this.getStatus());
      }
    }, 1000);

    if (sendImmediately) {
      this.sendOnce(false).catch((err) => {
        console.error('Erro no primeiro envio:', err.message);
      }).finally(() => {
        this.scheduleNext();
      });
    } else {
      this.scheduleNext();
    }

    this.notify('status_change', this.getStatus());
    return this.getStatus();
  }

  scheduleNext() {
    if (!this.isRunning || this.isPaused) return;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Apply jitter (+/- randomJitter seconds)
    let extra = 0;
    if (this.randomJitter > 0) {
      extra = (Math.random() * 2 - 1) * this.randomJitter;
    }
    const finalSeconds = Math.max(5, Math.round(this.intervalSeconds + extra));
    const delayMs = finalSeconds * 1000;

    this.nextRunAt = Date.now() + delayMs;
    this.notify('status_change', this.getStatus());

    this.timer = setTimeout(async () => {
      if (!this.isRunning || this.isPaused) return;

      try {
        await this.sendOnce(false);
      } catch (err) {
        console.error('Erro na execução periódica:', err.message);
      } finally {
        this.scheduleNext();
      }
    }, delayMs);
  }

  pause() {
    if (!this.isRunning) return this.getStatus();

    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.nextRunAt = null;
      addLog('warning', 'Agendador de postagens pausado.');
    } else {
      addLog('info', 'Agendador de postagens retomado.');
      this.scheduleNext();
    }

    this.notify('status_change', this.getStatus());
    return this.getStatus();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.isPaused = false;
    this.nextRunAt = null;

    if (wasRunning) {
      addLog('info', 'Agendador de postagens parado.');
    }

    this.notify('status_change', this.getStatus());
    return this.getStatus();
  }
}

const schedulerService = new SchedulerService();

module.exports = schedulerService;
