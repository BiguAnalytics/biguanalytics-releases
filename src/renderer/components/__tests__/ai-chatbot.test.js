import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { shouldShowAIChatbot } from '../ai-chatbot.js';

const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/app.js'), 'utf8');
const routerSource = readFileSync(resolve(process.cwd(), 'src/renderer/router.js'), 'utf8');
const chatbotSource = readFileSync(resolve(process.cwd(), 'src/renderer/components/ai-chatbot.js'), 'utf8');
const chatbotCss = readFileSync(resolve(process.cwd(), 'src/styles/components/ai-chatbot.css'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8');

describe('AI chatbot renderer integration', () => {
  it('is visible on analysis routes and hidden during tagging', () => {
    expect(shouldShowAIChatbot('home')).toBe(true);
    expect(shouldShowAIChatbot('dashboard')).toBe(true);
    expect(shouldShowAIChatbot('season')).toBe(true);
    expect(shouldShowAIChatbot('settings')).toBe(true);
    expect(shouldShowAIChatbot('tagging')).toBe(false);
    expect(shouldShowAIChatbot('video-tagging')).toBe(false);
  });

  it('mounts globally and responds to route changes without calling Gemini on open', () => {
    expect(appSource).toContain('createAIChatbot');
    expect(routerSource).toContain('bigu:route-changed');
    expect(chatbotSource).toContain('window.biguAIChat.status');
    expect(chatbotSource).toContain('window.biguAIChat.ask');
    expect(chatbotSource).toContain('state.loading');
    expect(chatbotSource).toContain('Analizando nuestros datos...');
    expect(chatbotSource).not.toContain('fetch(');
    expect(chatbotSource).not.toContain('backendUrl');
    expect(chatbotSource).not.toContain('GEMINI_API_KEY');
    expect(chatbotSource).not.toContain('process.env');
  });

  it('uses Bigua first-person plural voice in visible chatbot copy', () => {
    expect(chatbotSource).toContain('Asistente Bigua');
    expect(chatbotSource).toContain('nuestro partido');
    expect(chatbotSource).toContain('nuestra temporada');
    expect(chatbotSource).toContain('podemos');
    expect(chatbotSource).not.toContain('este partido: fortalezas');
    expect(chatbotSource).not.toContain('tendencias de la temporada');
  });

  it('loads local chatbot CSS and follows the floating bottom-right contract', () => {
    expect(indexSource).toContain('components/ai-chatbot.css');
    expect(chatbotCss).toContain('position: fixed');
    expect(chatbotCss).toContain('bottom: 20px');
    expect(chatbotCss).toContain('right: 20px');
    expect(chatbotCss).toContain('var(--color-accent)');
    expect(chatbotCss).toContain('cursor: pointer');
  });
});
