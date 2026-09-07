require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const telegramService = require('./lib/telegram');
const schedulerService = require('./lib/scheduler');
const { loadConfig, saveConfig, getLogs, clearLogs, addLog } = require('./lib/store');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup uploads folder
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, 'photo-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Server-Sent Events (SSE) clients
const sseClients = new Set();

function broadcastEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

// Hook telegram events
telegramService.addListener((event, data) => {
  broadcastEvent(event, data);
});

// Hook scheduler events
schedulerService.addListener((event, data) => {
  broadcastEvent(event, data);
});

// SSE Endpoint
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('\n');
  sseClients.add(res);

  // Send initial data
  const initial = {
    auth: telegramService.getState(),
    scheduler: schedulerService.getStatus(),
    config: loadConfig(),
    logs: getLogs(),
  };
  res.write(`event: init\ndata: ${JSON.stringify(initial)}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Status
app.get('/api/status', (req, res) => {
  res.json({
    auth: telegramService.getState(),
    scheduler: schedulerService.getStatus(),
    config: loadConfig(),
  });
});

// Start QR code login flow
app.post('/api/auth/start-qr', async (req, res) => {
  try {
    const { apiId, apiHash } = req.body || {};
    const state = await telegramService.startQrLogin(apiId, apiHash);
    broadcastEvent('auth_state', telegramService.getState());
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Provide 2FA password
app.post('/api/auth/password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'A senha 2FA não pode ser vazia.' });
    }
    const result = await telegramService.provide2FaPassword(password);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    schedulerService.stop();
    const result = await telegramService.logout();
    broadcastEvent('auth_state', telegramService.getState());
    broadcastEvent('scheduler_state', schedulerService.getStatus());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dialogs (groups and channels)
app.get('/api/dialogs', async (req, res) => {
  try {
    const dialogs = await telegramService.getDialogs();
    res.json({ success: true, dialogs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload Photo Endpoint
app.post('/api/upload', upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo de imagem enviado.' });
    }
    const filePath = req.file.path;
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      filePath,
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove Photo Endpoint
app.delete('/api/upload', (req, res) => {
  try {
    const { filePath } = req.body || {};
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    }
    schedulerService.photoPath = null;
    schedulerService.photoUrl = null;
    saveConfig({ photoPath: '', photoUrl: '' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Message Preview with Spintax formatting
app.post('/api/schedule/preview', (req, res) => {
  const { template } = req.body;
  const formatted = schedulerService.formatMessage(template || '');
  res.json({ formatted });
});

// Start Scheduler
app.post('/api/schedule/start', (req, res) => {
  try {
    const { targetGroupId, targetGroupName, messageTemplate, intervalSeconds, randomJitter, sendImmediately, photoPath, photoUrl } = req.body;
    const status = schedulerService.start({
      targetGroupId,
      targetGroupName,
      messageTemplate,
      intervalSeconds,
      randomJitter,
      sendImmediately: sendImmediately !== false,
      photoPath,
      photoUrl,
    });
    broadcastEvent('scheduler_state', status);
    res.json({ success: true, status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pause / Resume Scheduler
app.post('/api/schedule/pause', (req, res) => {
  try {
    const status = schedulerService.pause();
    broadcastEvent('scheduler_state', status);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop Scheduler
app.post('/api/schedule/stop', (req, res) => {
  try {
    const status = schedulerService.stop();
    broadcastEvent('scheduler_state', status);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual Test Send
app.post('/api/schedule/test', async (req, res) => {
  try {
    const { targetGroupId, targetGroupName, messageTemplate, photoPath } = req.body;
    if (targetGroupId) {
      schedulerService.targetGroupId = targetGroupId.toString();
      schedulerService.targetGroupName = targetGroupName || targetGroupId.toString();
    }
    if (messageTemplate !== undefined) {
      schedulerService.messageTemplate = messageTemplate;
    }
    if (photoPath !== undefined) {
      schedulerService.photoPath = photoPath;
    }
    const result = await schedulerService.sendOnce(true);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logs
app.get('/api/logs', (req, res) => {
  res.json({ logs: getLogs() });
});

app.delete('/api/logs', (req, res) => {
  clearLogs();
  broadcastEvent('logs_cleared', {});
  res.json({ success: true });
});

// Save config
app.post('/api/config', (req, res) => {
  const updated = saveConfig(req.body);
  res.json({ success: true, config: updated });
});

// Start Server & attempt session restore
app.listen(PORT, async () => {
  console.log(`===================================================`);
  console.log(`🤖 Telegram Userbot Web App rodando em: http://localhost:${PORT}`);
  console.log(`===================================================`);
  await telegramService.init();
});
