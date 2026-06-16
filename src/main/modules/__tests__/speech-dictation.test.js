import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import speechDictationModule from '../speech-dictation.js';

const {
  createSpeechDictationService,
  getNativeSpeechErrorMessage,
  sanitizeSpeechOptions,
} = speechDictationModule;
const nativeScriptSource = readFileSync(new URL('../../native/windows-speech-dictation.ps1', import.meta.url), 'utf8');

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => {
    child.emit('exit', 0);
    return true;
  });
  return child;
}

describe('speech dictation service', () => {
  it('sanitizes renderer speech options before spawning native dictation', () => {
    expect(sanitizeSpeechOptions({ language: 'es-AR', deviceId: 'ignored' })).toEqual({ language: 'es-AR' });
    expect(sanitizeSpeechOptions({ language: 'es-ES' })).toEqual({ language: 'es-ES' });
    expect(sanitizeSpeechOptions({ language: 'en-US' })).toEqual({ language: 'es-AR' });
    expect(sanitizeSpeechOptions({ language: '../bad' })).toEqual({ language: 'es-AR' });
    expect(sanitizeSpeechOptions(null)).toEqual({ language: 'es-AR' });
  });

  it('streams native speech results to the requesting webContents', async () => {
    const child = createFakeChild();
    const spawn = vi.fn(() => child);
    const webContents = { id: 7, send: vi.fn(), once: vi.fn(), isDestroyed: () => false };
    const service = createSpeechDictationService({
      platform: 'win32',
      spawn,
      app: { getPath: () => 'C:\\Temp' },
      fs: {
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(() => 'script'),
        writeFileSync: vi.fn(),
      },
    });

    await expect(service.start(webContents, { language: 'es-AR' })).resolves.toEqual({
      ok: true,
      engine: 'windows-sapi',
      language: 'es-AR',
    });

    expect(spawn).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-File', expect.stringContaining('windows-speech-dictation.ps1'), '-Language', 'es-AR']),
      expect.objectContaining({ windowsHide: true }),
    );

    child.stdout.emit('data', `${JSON.stringify({ type: 'ready', language: 'es-ES' })}\n`);
    child.stdout.emit('data', `${JSON.stringify({ type: 'result', transcript: 'ruck ganado', confidence: 0.73 })}\n`);

    expect(webContents.send).toHaveBeenCalledWith('speech:status', {
      status: 'listening',
      engine: 'windows-sapi',
      language: 'es-ES',
    });
    expect(webContents.send).toHaveBeenCalledWith('speech:result', {
      transcript: 'ruck ganado',
      confidence: 0.73,
      engine: 'windows-sapi',
      isFinal: true,
    });
  });

  it('stops the active native dictation process for a webContents', async () => {
    const child = createFakeChild();
    const service = createSpeechDictationService({
      platform: 'win32',
      spawn: () => child,
      app: { getPath: () => 'C:\\Temp' },
      fs: {
        mkdirSync: vi.fn(),
        readFileSync: vi.fn(() => 'script'),
        writeFileSync: vi.fn(),
      },
    });
    const webContents = { id: 9, send: vi.fn(), once: vi.fn(), isDestroyed: () => false };

    await service.start(webContents, { language: 'es-AR' });
    expect(service.stop(9)).toEqual({ ok: true });

    expect(child.kill).toHaveBeenCalled();
    expect(webContents.send).toHaveBeenCalledWith('speech:status', {
      status: 'idle',
      engine: 'windows-sapi',
    });
  });

  it('maps unavailable Windows recognizer errors to a clear popup message', () => {
    expect(getNativeSpeechErrorMessage({ code: 'recognizer-unavailable', available: 'en-US' })).toBe(
      'Windows no tiene un reconocedor de voz en espanol instalado. Instala Espanol en Configuracion > Hora e idioma > Voz.',
    );
  });

  it('requires a Spanish Windows recognizer instead of falling back to English', () => {
    expect(nativeScriptSource).toContain('TwoLetterISOLanguageName -eq "es"');
    expect(nativeScriptSource).not.toContain('"en-US"');
  });

  it('loads a rugby terms grammar to bias Spanish dictation toward match vocabulary', () => {
    expect(nativeScriptSource).toContain('$rugbyTerms = @(');
    expect(nativeScriptSource).toContain('"ruck"');
    expect(nativeScriptSource).toContain('"maul"');
    expect(nativeScriptSource).toContain('"line out"');
    expect(nativeScriptSource).toContain('"scrum"');
    expect(nativeScriptSource).toContain('New-Object System.Speech.Recognition.Choices');
    expect(nativeScriptSource).toContain('LoadGrammar($rugbyGrammar)');
  });

  it('forces UTF-8 stdout so accented transcripts arrive intact in Electron', () => {
    expect(nativeScriptSource).toContain('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8');
    expect(nativeScriptSource).toContain('$OutputEncoding = [System.Text.Encoding]::UTF8');
  });
});
