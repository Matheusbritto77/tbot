const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      return data;
    }
  } catch (err) {
    console.error('Erro ao carregar sessão:', err.message);
  }
  return null;
}

function saveSession(sessionData) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar sessão:', err.message);
  }
}

function clearSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
  } catch (err) {
    console.error('Erro ao remover sessão:', err.message);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Erro ao carregar config:', err.message);
  }
  return {
    apiId: process.env.TELEGRAM_API_ID || '',
    apiHash: process.env.TELEGRAM_API_HASH || '',
    selectedGroupId: '',
    selectedGroupName: '',
    messageText: 'Olá a todos! Esta é uma postagem automática enviada às {hora}.',
    photoPath: '',
    photoUrl: '',
    intervalValue: 10,
    intervalUnit: 'minutes', // seconds, minutes, hours
    randomJitter: 5, // extra random seconds +/-
  };
}

function saveConfig(config) {
  try {
    const current = loadConfig();
    const updated = { ...current, ...config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (err) {
    console.error('Erro ao salvar config:', err.message);
    return config;
  }
}

// In-memory log buffer (persisting last 200 logs)
const logs = [];

function addLog(level, message, meta = {}) {
  const logEntry = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    level, // 'info', 'success', 'warning', 'error'
    message,
    meta,
  };
  logs.unshift(logEntry);
  if (logs.length > 200) {
    logs.pop();
  }
  return logEntry;
}

function getLogs() {
  return logs;
}

function clearLogs() {
  logs.length = 0;
}

module.exports = {
  loadSession,
  saveSession,
  clearSession,
  loadConfig,
  saveConfig,
  addLog,
  getLogs,
  clearLogs,
};
