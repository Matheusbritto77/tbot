// Telegram Userbot Web App
document.addEventListener('DOMContentLoaded', () => {
  // Elements - Header & Status
  const botStatusBadge = document.getElementById('bot-status-badge');
  const botStatusText = document.getElementById('bot-status-text');
  const userProfilePill = document.getElementById('user-profile-pill');
  const headerUserAvatar = document.getElementById('header-user-avatar');
  const headerUserName = document.getElementById('header-user-name');
  const headerUserUsername = document.getElementById('header-user-username');
  const btnLogout = document.getElementById('btn-logout');
  const btnLogoutAlt = document.getElementById('btn-logout-alt');

  // Elements - Auth Section
  const btnToggleGuide = document.getElementById('btn-toggle-guide');
  const apiKeysGuide = document.getElementById('api-keys-guide');
  const credentialsForm = document.getElementById('credentials-form');
  const inputApiId = document.getElementById('input-api-id');
  const inputApiHash = document.getElementById('input-api-hash');
  const btnGenerateQr = document.getElementById('btn-generate-qr');

  // Elements - QR Section
  const qrContainer = document.getElementById('qr-container');
  const qrLoadingSpinner = document.getElementById('qr-loading-spinner');
  const qrImage = document.getElementById('qr-image');
  const qrStatusLabel = document.getElementById('qr-status-label');
  const qrTimerProgress = document.getElementById('qr-timer-progress');
  const qrDirectLink = document.getElementById('qr-direct-link');

  // Elements - 2FA Section
  const passwordForm = document.getElementById('password-form');
  const input2FaPassword = document.getElementById('input-2fa-password');
  const btnSubmitPassword = document.getElementById('btn-submit-password');
  const passwordHintText = document.getElementById('password-hint-text');

  // Elements - Authenticated Profile Card
  const userConnectedCard = document.getElementById('user-connected-card');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileUsername = document.getElementById('profile-username');
  const profilePhone = document.getElementById('profile-phone');

  // Elements - Scheduler Configuration
  const btnRefreshDialogs = document.getElementById('btn-refresh-dialogs');
  const selectGroup = document.getElementById('select-group');
  const groupDetailsHint = document.getElementById('group-details-hint');
  const textareaMessage = document.getElementById('textarea-message');
  const messageCharCounter = document.getElementById('message-char-counter');
  const previewContent = document.getElementById('preview-content');
  const btnRerollPreview = document.getElementById('btn-reroll-preview');
  const inputIntervalValue = document.getElementById('input-interval-value');
  const selectIntervalUnit = document.getElementById('select-interval-unit');
  const inputJitter = document.getElementById('input-jitter');
  const checkSendImmediately = document.getElementById('check-send-immediately');
  // Elements - Photo Upload
  const photoDropZone = document.getElementById('photo-drop-zone');
  const inputPhotoFile = document.getElementById('input-photo-file');
  const dropZoneEmpty = document.getElementById('drop-zone-empty');
  const dropZoneFilled = document.getElementById('drop-zone-filled');
  const photoThumbPreview = document.getElementById('photo-thumb-preview');
  const photoFileName = document.getElementById('photo-file-name');
  const photoFileSize = document.getElementById('photo-file-size');
  const btnRemovePhoto = document.getElementById('btn-remove-photo');
  const previewPhotoContainer = document.getElementById('preview-photo-container');
  const previewPhotoImg = document.getElementById('preview-photo-img');

  // Elements - Scheduler Actions
  const btnStartScheduler = document.getElementById('btn-start-scheduler');
  const btnPauseScheduler = document.getElementById('btn-pause-scheduler');
  const btnStopScheduler = document.getElementById('btn-stop-scheduler');
  const btnTestSend = document.getElementById('btn-test-send');

  // Elements - KPIs
  const kpiBotStatus = document.getElementById('kpi-bot-status');
  const kpiTargetGroup = document.getElementById('kpi-target-group');
  const kpiCountdown = document.getElementById('kpi-countdown');
  const kpiCountdownSub = document.getElementById('kpi-countdown-sub');
  const kpiTotalSent = document.getElementById('kpi-total-sent');
  const kpiLastSentTime = document.getElementById('kpi-last-sent-time');
  const kpiTotalErrors = document.getElementById('kpi-total-errors');
  const kpiLastErrorText = document.getElementById('kpi-last-error-text');

  // Elements - Terminal
  const terminalBody = document.getElementById('terminal-body');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const checkAutoscroll = document.getElementById('check-autoscroll');

  // Application State
  let appState = {
    auth: {
      isAuthenticated: false,
      loginStatus: 'idle',
      currentUser: null,
      qrCodeDataUrl: null,
      qrCodeRawUrl: null,
      qrExpiresAt: null,
      passwordRequired: false,
      passwordHint: null,
      errorMessage: null,
    },
    scheduler: {
      isRunning: false,
      isPaused: false,
      targetGroupId: '',
      targetGroupName: '',
      intervalSeconds: 600,
      secondsUntilNext: 0,
      totalSent: 0,
      totalErrors: 0,
    },
    dialogs: [],
    config: {},
  };

  let qrCountdownTimer = null;

  // 1. Initialize Event Source (SSE)
  function initSSE() {
    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('init', (e) => {
      const data = JSON.parse(e.data);
      if (data.config) {
        applyConfig(data.config);
      }
      if (data.auth) {
        updateAuthState(data.auth);
      }
      if (data.scheduler) {
        updateSchedulerState(data.scheduler);
      }
      if (data.logs && Array.isArray(data.logs)) {
        renderLogs(data.logs);
      }
    });

    eventSource.addEventListener('auth_state', (e) => {
      const data = JSON.parse(e.data);
      updateAuthState(data);
    });

    eventSource.addEventListener('qr_update', (e) => {
      const data = JSON.parse(e.data);
      renderQrCode(data);
    });

    eventSource.addEventListener('scheduler_state', (e) => {
      const data = JSON.parse(e.data);
      updateSchedulerState(data);
    });

    eventSource.addEventListener('tick', (e) => {
      const data = JSON.parse(e.data);
      updateSchedulerTick(data);
    });

    eventSource.addEventListener('post_success', (e) => {
      const data = JSON.parse(e.data);
      addLogEntry({
        timestamp: data.sentAt,
        level: 'success',
        message: `Mensagem enviada com sucesso para "${data.targetGroupName}"!`,
      });
    });

    eventSource.addEventListener('post_error', (e) => {
      const data = JSON.parse(e.data);
      addLogEntry({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Erro ao enviar para "${data.targetGroupName}": ${data.error}`,
      });
    });

    eventSource.addEventListener('logs_cleared', () => {
      terminalBody.innerHTML = '';
    });

    eventSource.onerror = () => {
      console.warn('Conexão SSE perdida. Tentando reconectar...');
    };
  }

  // 2. Auth State Update Handler
  function updateAuthState(auth) {
    appState.auth = auth;

    if (auth.isAuthenticated && auth.currentUser) {
      // Authenticated view
      credentialsForm.classList.add('hidden');
      qrContainer.classList.add('hidden');
      passwordForm.classList.add('hidden');
      userConnectedCard.classList.remove('hidden');
      userProfilePill.classList.remove('hidden');

      const name = `${auth.currentUser.firstName || ''} ${auth.currentUser.lastName || ''}`.trim() || 'Usuário';
      const initials = name.charAt(0).toUpperCase() || 'U';
      const username = auth.currentUser.username ? `@${auth.currentUser.username}` : 'Sem username';
      const phone = auth.currentUser.phone ? `+${auth.currentUser.phone}` : 'Telefone não divulgado';

      headerUserName.textContent = name;
      headerUserUsername.textContent = username;
      headerUserAvatar.textContent = initials;

      profileName.textContent = name;
      profileUsername.textContent = username;
      profilePhone.textContent = phone;
      profileAvatar.textContent = initials;

      updateStatusBadge('connected', `Conectado como ${name}`);
      selectGroup.disabled = false;

      // Automatically load dialogs if not loaded yet
      if (appState.dialogs.length === 0) {
        fetchDialogs();
      }
    } else {
      // Not authenticated
      userConnectedCard.classList.add('hidden');
      userProfilePill.classList.add('hidden');

      if (auth.loginStatus === 'waiting_qr_scan') {
        credentialsForm.classList.add('hidden');
        qrContainer.classList.remove('hidden');
        passwordForm.classList.add('hidden');
        updateStatusBadge('connecting', 'Aguardando leitura do QR');
        if (auth.qrCodeDataUrl) {
          renderQrCode(auth);
        }
      } else if (auth.loginStatus === 'password_needed') {
        credentialsForm.classList.add('hidden');
        qrContainer.classList.add('hidden');
        passwordForm.classList.remove('hidden');
        passwordHintText.textContent = auth.passwordHint
          ? `Dica da senha cadastrada no Telegram: "${auth.passwordHint}"`
          : 'Digite a senha da sua Verificação em Duas Etapas configurada no Telegram.';
        updateStatusBadge('connecting', '2FA Necessário');
      } else if (auth.loginStatus === 'generating') {
        credentialsForm.classList.remove('hidden');
        qrContainer.classList.remove('hidden');
        qrLoadingSpinner.classList.remove('hidden');
        qrImage.classList.add('hidden');
        btnGenerateQr.disabled = true;
        btnGenerateQr.textContent = 'Gerando QR Code...';
        updateStatusBadge('connecting', 'Conectando MTProto...');
      } else {
        // Idle or error
        credentialsForm.classList.remove('hidden');
        qrContainer.classList.add('hidden');
        passwordForm.classList.add('hidden');
        btnGenerateQr.disabled = false;
        btnGenerateQr.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          Gerar QR Code para Login
        `;
        selectGroup.disabled = true;
        selectGroup.innerHTML = '<option value="">Conecte sua conta para carregar seus grupos...</option>';
        updateStatusBadge('disconnected', 'Desconectado');
      }
    }
  }

  function updateStatusBadge(type, text) {
    botStatusBadge.className = `status-pill status-${type}`;
    botStatusText.textContent = text;
  }

  function renderQrCode(data) {
    if (!data.qrCodeDataUrl) return;

    qrLoadingSpinner.classList.add('hidden');
    qrImage.src = data.qrCodeDataUrl;
    qrImage.classList.remove('hidden');

    if (data.qrCodeRawUrl) {
      qrDirectLink.href = data.qrCodeRawUrl;
      qrDirectLink.style.display = 'inline-flex';
    }

    qrStatusLabel.textContent = 'Aponte o Telegram do seu celular para escanear';

    // Start expiration progress countdown
    if (qrCountdownTimer) clearInterval(qrCountdownTimer);
    const duration = 30000;
    const startTime = Date.now();
    const expiresAt = data.qrExpiresAt || startTime + duration;

    qrCountdownTimer = setInterval(() => {
      const now = Date.now();
      const remaining = expiresAt - now;
      if (remaining <= 0) {
        clearInterval(qrCountdownTimer);
        qrTimerProgress.style.width = '0%';
        qrStatusLabel.textContent = 'Renovando QR Code expirado...';
      } else {
        const percent = Math.max(0, Math.min(100, (remaining / duration) * 100));
        qrTimerProgress.style.width = `${percent}%`;
      }
    }, 250);
  }

  // 3. Scheduler State Update Handler
  function updateSchedulerState(scheduler) {
    appState.scheduler = scheduler;

    if (scheduler.isRunning) {
      btnStartScheduler.classList.add('hidden');
      btnPauseScheduler.classList.remove('hidden');
      btnStopScheduler.classList.remove('hidden');

      if (scheduler.isPaused) {
        btnPauseScheduler.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Retomar
        `;
        btnPauseScheduler.className = 'btn btn-success btn-lg';
        kpiBotStatus.textContent = 'Pausado';
        kpiBotStatus.style.color = 'var(--color-warning)';
        kpiCountdownSub.textContent = 'Pausado';
      } else {
        btnPauseScheduler.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
          Pausar
        `;
        btnPauseScheduler.className = 'btn btn-warning btn-lg';
        kpiBotStatus.textContent = 'Ativo';
        kpiBotStatus.style.color = 'var(--color-success)';
      }
      kpiTargetGroup.textContent = scheduler.targetGroupName || 'Grupo selecionado';
    } else {
      btnStartScheduler.classList.remove('hidden');
      btnPauseScheduler.classList.add('hidden');
      btnStopScheduler.classList.add('hidden');

      kpiBotStatus.textContent = 'Inativo';
      kpiBotStatus.style.color = 'var(--text-primary)';
      kpiCountdown.textContent = '--:--';
      kpiCountdownSub.textContent = 'Aguardando início';
      kpiTargetGroup.textContent = 'Nenhum grupo ativo';
    }

    kpiTotalSent.textContent = scheduler.totalSent || 0;
    kpiTotalErrors.textContent = scheduler.totalErrors || 0;

    if (scheduler.lastSentAt) {
      const date = new Date(scheduler.lastSentAt);
      kpiLastSentTime.textContent = `Último: ${date.toLocaleTimeString('pt-BR')}`;
    }

    if (scheduler.lastError) {
      kpiLastErrorText.textContent = scheduler.lastError.slice(0, 35);
      kpiLastErrorText.title = scheduler.lastError;
    } else {
      kpiLastErrorText.textContent = 'Nenhuma falha';
    }

    if (scheduler.secondsUntilNext !== undefined) {
      updateCountdownDisplay(scheduler.secondsUntilNext);
    }
  }

  function updateSchedulerTick(tickData) {
    if (tickData.secondsUntilNext !== undefined) {
      updateCountdownDisplay(tickData.secondsUntilNext);
    }
  }

  function updateCountdownDisplay(seconds) {
    if (!appState.scheduler.isRunning || appState.scheduler.isPaused) {
      kpiCountdown.textContent = '--:--';
      return;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    kpiCountdown.textContent = formatted;
    kpiCountdownSub.textContent = `Intervalo de ${appState.scheduler.intervalSeconds}s`;
  }

  // 4. Config Apply
  function applyConfig(config) {
    appState.config = config;
    if (config.apiId) inputApiId.value = config.apiId;
    if (config.apiHash) inputApiHash.value = config.apiHash;
    if (config.messageText) {
      textareaMessage.value = config.messageText;
      updateCharCounter();
      refreshPreview();
    }
    if (config.intervalValue) {
      // Calculate unit
      const totalSec = Number(config.intervalValue);
      if (totalSec >= 3600 && totalSec % 3600 === 0) {
        inputIntervalValue.value = totalSec / 3600;
        selectIntervalUnit.value = 'hours';
      } else if (totalSec >= 60 && totalSec % 60 === 0) {
        inputIntervalValue.value = totalSec / 60;
        selectIntervalUnit.value = 'minutes';
      } else {
        inputIntervalValue.value = totalSec;
        selectIntervalUnit.value = 'seconds';
      }
    }
    if (config.randomJitter !== undefined) {
      inputJitter.value = config.randomJitter;
    }
    if (config.photoPath && config.photoUrl) {
      currentPhoto = {
        filePath: config.photoPath,
        fileUrl: config.photoUrl,
        fileName: config.photoPath.split('/').pop() || 'foto.jpg',
        fileSize: 0,
      };
      renderPhotoState();
    }
  }

  // 5. Dialogs / Groups Fetcher
  async function fetchDialogs() {
    selectGroup.disabled = true;
    selectGroup.innerHTML = '<option value="">Carregando grupos e canais da sua conta...</option>';
    btnRefreshDialogs.disabled = true;

    try {
      const res = await fetch('/api/dialogs');
      const data = await res.json();

      if (data.success && Array.isArray(data.dialogs)) {
        appState.dialogs = data.dialogs;
        renderDialogsSelect(data.dialogs);
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (err) {
      selectGroup.innerHTML = '<option value="">Erro ao carregar grupos. Tente novamente.</option>';
      groupDetailsHint.textContent = `Erro: ${err.message}`;
    } finally {
      selectGroup.disabled = false;
      btnRefreshDialogs.disabled = false;
    }
  }

  function renderDialogsSelect(dialogs) {
    selectGroup.innerHTML = '';

    if (dialogs.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nenhum grupo ou canal encontrado nesta conta';
      selectGroup.appendChild(opt);
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `-- Selecione um Grupo (${dialogs.length} disponíveis) --`;
    selectGroup.appendChild(placeholder);

    dialogs.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.id;
      const typeBadge = d.isChannel ? '[Canal]' : '[Grupo]';
      const members = d.participantsCount ? ` • ${d.participantsCount} membros` : '';
      opt.textContent = `${typeBadge} ${d.title}${members}`;

      // Re-select previously saved group
      if (appState.config.selectedGroupId && appState.config.selectedGroupId === d.id) {
        opt.selected = true;
      }
      selectGroup.appendChild(opt);
    });

    updateGroupHint();
  }

  function updateGroupHint() {
    const selectedId = selectGroup.value;
    const dialog = appState.dialogs.find((d) => d.id === selectedId);
    if (dialog) {
      const type = dialog.isChannel ? 'Canal' : 'Grupo';
      const user = dialog.username ? ` (@${dialog.username})` : '';
      const members = dialog.participantsCount ? ` com ${dialog.participantsCount} membros` : '';
      groupDetailsHint.textContent = `${type}: ${dialog.title}${user}${members} | ID: ${dialog.id}`;
    } else {
      groupDetailsHint.textContent = 'Selecione o grupo onde você deseja que o bot poste automaticamente.';
    }
  }

  // 6. Message Composer & Preview
  function updateCharCounter() {
    const count = textareaMessage.value.length;
    messageCharCounter.textContent = `${count} caractere${count === 1 ? '' : 's'}`;
  }

  async function refreshPreview() {
    const template = textareaMessage.value;
    if (!template.trim()) {
      previewContent.textContent = 'Digite sua mensagem para visualizar a prévia...';
      return;
    }

    try {
      const res = await fetch('/api/schedule/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      });
      const data = await res.json();
      previewContent.textContent = data.formatted || template;
    } catch (_) {
      previewContent.textContent = template;
    }
  }

  // Insert tag at textarea cursor
  function insertTag(tag) {
    const start = textareaMessage.selectionStart;
    const end = textareaMessage.selectionEnd;
    const text = textareaMessage.value;
    textareaMessage.value = text.substring(0, start) + tag + text.substring(end);
    textareaMessage.focus();
    textareaMessage.selectionStart = textareaMessage.selectionEnd = start + tag.length;
    updateCharCounter();
    refreshPreview();
  }

  // Calculate total seconds from input and unit
  function calculateIntervalSeconds() {
    const val = Math.max(1, Number(inputIntervalValue.value) || 10);
    const unit = selectIntervalUnit.value;
    if (unit === 'hours') return val * 3600;
    if (unit === 'minutes') return val * 60;
    return val;
  }

  // Photo State
  let currentPhoto = {
    filePath: '',
    fileUrl: '',
    fileName: '',
    fileSize: 0,
  };

  function handlePhotoSelected(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione um arquivo de imagem válido (PNG, JPG, WEBP, GIF).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('A imagem não pode ultrapassar 25 MB.');
      return;
    }

    const formData = new FormData();
    formData.append('photo', file);

    if (dropZoneEmpty) {
      dropZoneEmpty.innerHTML = '<div class="spinner"></div><span style="font-size: 0.82rem; color: var(--tg-blue);">Carregando foto...</span>';
    }

    fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          currentPhoto = {
            filePath: data.filePath,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            fileSize: data.fileSize,
          };
          renderPhotoState();
        } else {
          throw new Error(data.error || 'Erro no upload da foto.');
        }
      })
      .catch((err) => {
        alert(`Erro ao processar imagem: ${err.message}`);
        clearPhotoState();
      });
  }

  function renderPhotoState() {
    if (currentPhoto.filePath && currentPhoto.fileUrl) {
      if (dropZoneEmpty) dropZoneEmpty.classList.add('hidden');
      if (dropZoneFilled) dropZoneFilled.classList.remove('hidden');
      if (photoThumbPreview) photoThumbPreview.src = currentPhoto.fileUrl;
      if (photoFileName) photoFileName.textContent = currentPhoto.fileName;
      if (photoFileSize) photoFileSize.textContent = formatBytes(currentPhoto.fileSize);

      if (previewPhotoContainer) previewPhotoContainer.classList.remove('hidden');
      if (previewPhotoImg) previewPhotoImg.src = currentPhoto.fileUrl;
    } else {
      clearPhotoState();
    }
  }

  function clearPhotoState() {
    currentPhoto = { filePath: '', fileUrl: '', fileName: '', fileSize: 0 };
    if (inputPhotoFile) inputPhotoFile.value = '';
    if (dropZoneFilled) dropZoneFilled.classList.add('hidden');
    if (dropZoneEmpty) {
      dropZoneEmpty.classList.remove('hidden');
      dropZoneEmpty.innerHTML = `
        <div class="upload-icon-circle">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </div>
        <div class="drop-zone-texts">
          <span class="drop-zone-title">Clique ou arraste uma foto aqui</span>
          <span class="drop-zone-sub">PNG, JPG, WEBP ou GIF (até 25MB)</span>
        </div>
      `;
    }
    if (previewPhotoContainer) previewPhotoContainer.classList.add('hidden');
    if (previewPhotoImg) previewPhotoImg.src = '';
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Photo Listeners
  if (photoDropZone) {
    photoDropZone.addEventListener('click', (e) => {
      if (e.target.closest('#btn-remove-photo')) return;
      if (inputPhotoFile) inputPhotoFile.click();
    });

    photoDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      photoDropZone.classList.add('dragover');
    });

    photoDropZone.addEventListener('dragleave', () => {
      photoDropZone.classList.remove('dragover');
    });

    photoDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      photoDropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handlePhotoSelected(e.dataTransfer.files[0]);
      }
    });
  }

  if (inputPhotoFile) {
    inputPhotoFile.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handlePhotoSelected(e.target.files[0]);
      }
    });
  }

  if (btnRemovePhoto) {
    btnRemovePhoto.addEventListener('click', (e) => {
      e.stopPropagation();
      fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentPhoto.filePath }),
      }).finally(() => {
        clearPhotoState();
      });
    });
  }

  // Elements - Advanced Auth Options
  const btnToggleAdvanced = document.getElementById('btn-toggle-advanced');
  const advancedCredentialsBox = document.getElementById('advanced-credentials-box');

  if (btnToggleAdvanced && advancedCredentialsBox) {
    btnToggleAdvanced.addEventListener('click', () => {
      advancedCredentialsBox.classList.toggle('hidden');
    });
  }

  // 7. Event Listeners
  if (btnToggleGuide && apiKeysGuide) {
    btnToggleGuide.addEventListener('click', () => {
      apiKeysGuide.classList.toggle('hidden');
    });
  }

  btnGenerateQr.addEventListener('click', async () => {
    const apiId = inputApiId ? inputApiId.value.trim() : '';
    const apiHash = inputApiHash ? inputApiHash.value.trim() : '';

    btnGenerateQr.disabled = true;
    qrContainer.classList.remove('hidden');
    qrLoadingSpinner.classList.remove('hidden');
    qrImage.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/start-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId, apiHash }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar QR Code');
      }
    } catch (err) {
      alert(`Falha ao conectar com Telegram: ${err.message}`);
      btnGenerateQr.disabled = false;
      qrContainer.classList.add('hidden');
    }
  });

  btnSubmitPassword.addEventListener('click', async () => {
    const password = input2FaPassword.value;
    if (!password) {
      alert('Digite sua senha 2FA.');
      return;
    }

    btnSubmitPassword.disabled = true;
    btnSubmitPassword.textContent = 'Validando...';

    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Senha incorreta');
      input2FaPassword.value = '';
    } catch (err) {
      alert(`Erro na senha 2FA: ${err.message}`);
    } finally {
      btnSubmitPassword.disabled = false;
      btnSubmitPassword.textContent = 'Confirmar Senha';
    }
  });

  async function handleLogout() {
    if (!confirm('Deseja realmente desconectar sua conta do Telegram?')) return;

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      alert(`Erro ao desconectar: ${err.message}`);
    }
  }

  btnLogout.addEventListener('click', handleLogout);
  btnLogoutAlt.addEventListener('click', handleLogout);

  btnRefreshDialogs.addEventListener('click', fetchDialogs);
  selectGroup.addEventListener('change', updateGroupHint);

  textareaMessage.addEventListener('input', () => {
    updateCharCounter();
    refreshPreview();
  });

  btnRerollPreview.addEventListener('click', refreshPreview);

  document.querySelectorAll('.btn-tag').forEach((btn) => {
    btn.addEventListener('click', () => {
      insertTag(btn.getAttribute('data-tag'));
    });
  });

  // Action: Start Scheduler
  btnStartScheduler.addEventListener('click', async () => {
    const targetGroupId = selectGroup.value;
    if (!targetGroupId) {
      alert('Por favor, selecione um grupo na lista antes de iniciar.');
      selectGroup.focus();
      return;
    }

    const selectedOption = selectGroup.options[selectGroup.selectedIndex];
    const targetGroupName = selectedOption ? selectedOption.text : targetGroupId;
    const messageTemplate = textareaMessage.value.trim();

    if (!messageTemplate && !currentPhoto.filePath) {
      alert('Por favor, informe uma frase de legenda ou selecione uma foto.');
      textareaMessage.focus();
      return;
    }

    const intervalSeconds = calculateIntervalSeconds();
    if (intervalSeconds < 5) {
      alert('O intervalo mínimo recomendado é de 5 segundos para proteger sua conta.');
      return;
    }

    const randomJitter = Number(inputJitter.value) || 0;
    const sendImmediately = checkSendImmediately ? checkSendImmediately.checked : true;

    btnStartScheduler.disabled = true;

    try {
      const res = await fetch('/api/schedule/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetGroupId,
          targetGroupName,
          messageTemplate,
          photoPath: currentPhoto.filePath || null,
          photoUrl: currentPhoto.fileUrl || null,
          intervalSeconds,
          randomJitter,
          sendImmediately,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao iniciar');
    } catch (err) {
      alert(`Erro ao iniciar agendador: ${err.message}`);
    } finally {
      btnStartScheduler.disabled = false;
    }
  });

  // Action: Pause / Resume Scheduler
  btnPauseScheduler.addEventListener('click', async () => {
    try {
      await fetch('/api/schedule/pause', { method: 'POST' });
    } catch (err) {
      alert(`Erro ao pausar/retomar: ${err.message}`);
    }
  });

  // Action: Stop Scheduler
  btnStopScheduler.addEventListener('click', async () => {
    try {
      await fetch('/api/schedule/stop', { method: 'POST' });
    } catch (err) {
      alert(`Erro ao parar agendador: ${err.message}`);
    }
  });

  // Action: Test Send
  btnTestSend.addEventListener('click', async () => {
    const targetGroupId = selectGroup.value;
    if (!targetGroupId) {
      alert('Selecione um grupo para enviar o teste.');
      return;
    }

    const selectedOption = selectGroup.options[selectGroup.selectedIndex];
    const targetGroupName = selectedOption ? selectedOption.text : targetGroupId;
    const messageTemplate = textareaMessage.value.trim();

    if (!messageTemplate && !currentPhoto.filePath) {
      alert('Digite uma frase de legenda ou selecione uma foto antes de testar.');
      return;
    }

    btnTestSend.disabled = true;
    btnTestSend.textContent = 'Enviando teste...';

    try {
      const res = await fetch('/api/schedule/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetGroupId,
          targetGroupName,
          messageTemplate,
          photoPath: currentPhoto.filePath || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no envio');
      alert(currentPhoto.filePath ? 'Foto com legenda enviada com sucesso no grupo!' : 'Mensagem de teste enviada com sucesso no grupo!');
    } catch (err) {
      alert(`Falha no envio de teste: ${err.message}`);
    } finally {
      btnTestSend.disabled = false;
      btnTestSend.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        Enviar Teste Agora
      `;
    }
  });

  // Action: Clear Terminal Logs
  btnClearLogs.addEventListener('click', async () => {
    try {
      await fetch('/api/logs', { method: 'DELETE' });
      terminalBody.innerHTML = '';
    } catch (err) {
      console.error('Erro ao limpar logs:', err);
    }
  });

  // 8. Terminal Logs Rendering
  function renderLogs(logs) {
    terminalBody.innerHTML = '';
    logs.forEach((log) => {
      addLogEntry(log, false);
    });
  }

  function addLogEntry(log, scroll = true) {
    const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('pt-BR') : '--:--:--';
    const level = log.level || 'info';
    const tagClass = `tag-${level}`;
    const entryClass = `log-${level}`;

    const div = document.createElement('div');
    div.className = `log-entry ${entryClass}`;
    div.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-tag ${tagClass}">${level.toUpperCase()}</span>
      <span class="log-msg">${escapeHtml(log.message)}</span>
    `;

    // Prepend (newest on top) or append
    terminalBody.appendChild(div);

    if (scroll && checkAutoscroll.checked) {
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Start Application
  initSSE();
});
