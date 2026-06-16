const { spawn: defaultSpawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_LANGUAGE = 'es-AR';
const POWERSHELL_EXE = 'powershell.exe';
const SCRIPT_SOURCE_PATH = path.join(__dirname, '../native/windows-speech-dictation.ps1');

/**
 * @param {unknown} options
 * @returns {{language: string}}
 */
function sanitizeSpeechOptions(options) {
  const language = options && typeof options === 'object' && !Array.isArray(options)
    ? String(options.language || '')
    : '';
  return {
    language: /^es(?:-[A-Z]{2})?$/.test(language) ? language : DEFAULT_LANGUAGE,
  };
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
function getNativeSpeechErrorMessage(payload) {
  const code = payload && typeof payload === 'object' ? payload.code : '';
  if (code === 'recognizer-unavailable') {
    return 'Windows no tiene un reconocedor de voz en espanol instalado. Instala Espanol en Configuracion > Hora e idioma > Voz.';
  }
  if (code === 'audio-device') {
    return 'No se pudo abrir el microfono predeterminado de Windows.';
  }
  if (payload && typeof payload === 'object' && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim().slice(0, 220);
  }
  return 'No se pudo iniciar el dictado nativo de Windows.';
}

/**
 * @param {string} text
 * @returns {object|null}
 */
function parseSpeechLine(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function createSpeechDictationService(deps = {}) {
  const platform = deps.platform || process.platform;
  const spawn = deps.spawn || defaultSpawn;
  const fileSystem = deps.fs || fs;
  const app = deps.app || null;
  const scriptSourcePath = deps.scriptSourcePath || SCRIPT_SOURCE_PATH;
  const sessions = new Map();

  const getTempScriptPath = () => {
    const tempRoot = app?.getPath?.('temp') || os.tmpdir();
    const speechDir = path.join(tempRoot, 'BiguAnalytics');
    fileSystem.mkdirSync(speechDir, { recursive: true });
    const scriptPath = path.join(speechDir, 'windows-speech-dictation.ps1');
    fileSystem.writeFileSync(scriptPath, fileSystem.readFileSync(scriptSourcePath, 'utf8'), 'utf8');
    return scriptPath;
  };

  const send = (session, channel, payload) => {
    if (!session.webContents || session.webContents.isDestroyed?.()) return;
    session.webContents.send(channel, payload);
  };

  const stop = (webContentsId) => {
    const session = sessions.get(Number(webContentsId));
    if (!session) return { ok: true };
    session.stopped = true;
    sessions.delete(Number(webContentsId));
    try {
      session.child.kill();
    } catch {
      // The process may have already exited.
    }
    send(session, 'speech:status', { status: 'idle', engine: 'windows-sapi' });
    return { ok: true };
  };

  const handlePayload = (session, payload) => {
    if (!payload?.type) return;
    if (payload.type === 'ready') {
      send(session, 'speech:status', {
        status: 'listening',
        engine: 'windows-sapi',
        language: payload.language || DEFAULT_LANGUAGE,
      });
      return;
    }
    if (payload.type === 'result' || payload.type === 'interim') {
      const transcript = String(payload.transcript || '').trim();
      if (!transcript) return;
      send(session, 'speech:result', {
        transcript,
        confidence: Number(payload.confidence) || 0,
        engine: 'windows-sapi',
        isFinal: payload.type === 'result',
      });
      return;
    }
    if (payload.type === 'error') {
      send(session, 'speech:error', {
        message: getNativeSpeechErrorMessage(payload),
        engine: 'windows-sapi',
      });
    }
  };

  const start = async (webContents, rawOptions = {}) => {
    if (!webContents?.id || typeof webContents.send !== 'function') {
      throw new Error('WebContents invalido para dictado.');
    }
    const options = sanitizeSpeechOptions(rawOptions);
    if (platform !== 'win32') {
      return {
        ok: false,
        engine: 'windows-sapi',
        message: 'El dictado nativo solo esta disponible en Windows.',
      };
    }

    stop(webContents.id);

    const scriptPath = getTempScriptPath();
    const child = spawn(POWERSHELL_EXE, [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Language',
      options.language,
    ], {
      windowsHide: true,
    });

    const session = {
      child,
      webContents,
      stopped: false,
      stdoutBuffer: '',
      stderr: '',
    };
    sessions.set(webContents.id, session);
    webContents.once?.('destroyed', () => stop(webContents.id));

    child.stdout?.on('data', (chunk) => {
      session.stdoutBuffer += String(chunk);
      const lines = session.stdoutBuffer.split(/\r?\n/);
      session.stdoutBuffer = lines.pop() || '';
      lines.map(line => line.trim()).filter(Boolean).forEach((line) => {
        const payload = parseSpeechLine(line);
        if (payload) handlePayload(session, payload);
      });
    });

    child.stderr?.on('data', (chunk) => {
      session.stderr = `${session.stderr}${String(chunk)}`.slice(-800);
    });

    child.on('error', (error) => {
      sessions.delete(webContents.id);
      if (!session.stopped) {
        send(session, 'speech:error', {
          message: getNativeSpeechErrorMessage({ message: error.message }),
          engine: 'windows-sapi',
        });
      }
    });

    child.on('exit', (code) => {
      sessions.delete(webContents.id);
      if (!session.stopped && code !== 0) {
        send(session, 'speech:error', {
          message: getNativeSpeechErrorMessage({ message: session.stderr }),
          engine: 'windows-sapi',
        });
      }
    });

    return {
      ok: true,
      engine: 'windows-sapi',
      language: options.language,
    };
  };

  const stopAll = () => {
    Array.from(sessions.keys()).forEach(stop);
  };

  return {
    start,
    stop,
    stopAll,
  };
}

module.exports = {
  createSpeechDictationService,
  getNativeSpeechErrorMessage,
  sanitizeSpeechOptions,
};
