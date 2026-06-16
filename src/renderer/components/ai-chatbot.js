// @ts-check

const HIDDEN_ROUTE_PARTS = ['tagging', 'video-tagging'];

/**
 * @param {string} route
 * @returns {boolean}
 */
export function shouldShowAIChatbot(route) {
  const value = String(route || '').toLowerCase();
  return !HIDDEN_ROUTE_PARTS.some(part => value.includes(part));
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * @param {object} state
 * @returns {string|undefined}
 */
function getCurrentMatchId(state) {
  return state.route === 'dashboard' && typeof state.params?.matchId === 'string'
    ? state.params.matchId
    : undefined;
}

/**
 * @param {object} state
 * @returns {string}
 */
function getSubtitle(state) {
  return getCurrentMatchId(state) ? 'Preguntame sobre nuestro partido' : 'Preguntame sobre nuestra temporada';
}

/**
 * @param {object} state
 * @returns {string}
 */
function getPlaceholder(state) {
  return getCurrentMatchId(state)
    ? 'Que vimos en nuestro partido?'
    : 'Que tendencia vemos en nuestra temporada?';
}

/**
 * @param {object} state
 */
function ensureInitialMessage(state) {
  if (state.messages.length > 0) return;
  state.messages.push({
    role: 'assistant',
    content: getCurrentMatchId(state)
      ? 'Hola, soy parte del equipo de Bigua y podemos revisar nuestro partido: fortalezas, debilidades, patrones y entrenamientos sugeridos.'
      : 'Hola, soy parte del equipo de Bigua y podemos revisar nuestra temporada y comparar nuestros partidos guardados.',
    evidence: [],
    missingData: [],
  });
}

/**
 * @param {object} state
 * @returns {Array<{role: string, content: string}>}
 */
function getRequestHistory(state) {
  return state.messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-6)
    .map(message => ({ role: message.role, content: message.content }));
}

/**
 * @param {HTMLElement} container
 * @param {object} state
 */
function renderMessages(container, state) {
  state.messages.forEach((message) => {
    const item = el('div', `ai-chatbot-message ai-chatbot-message--${message.role}`);
    const bubble = el('div', 'ai-chatbot-bubble', message.content);
    item.appendChild(bubble);

    if (Array.isArray(message.evidence) && message.evidence.length > 0) {
      const evidence = el('details', 'ai-chatbot-evidence');
      const summary = el('summary', '', 'Evidencia');
      evidence.appendChild(summary);
      const list = el('ul', '');
      message.evidence.forEach((entry) => {
        const li = el('li', '', entry);
        list.appendChild(li);
      });
      evidence.appendChild(list);
      item.appendChild(evidence);
    }

    if (Array.isArray(message.missingData) && message.missingData.length > 0) {
      const missing = el('div', 'ai-chatbot-missing', message.missingData.join(' - '));
      item.appendChild(missing);
    }

    container.appendChild(item);
  });

  if (state.loading) {
    const loading = el('div', 'ai-chatbot-message ai-chatbot-message--assistant');
    loading.appendChild(el('div', 'ai-chatbot-bubble ai-chatbot-bubble--loading', 'Analizando nuestros datos...'));
    container.appendChild(loading);
  }
}

/**
 * @param {object} response
 * @returns {object}
 */
function responseToMessage(response) {
  const evidence = Array.isArray(response?.evidence) && response.evidence.length > 0
    ? response.evidence
    : Array.isArray(response?.usedMetrics)
      ? response.usedMetrics
      : [];
  return {
    role: 'assistant',
    content: response?.answer || 'No pudimos obtener una respuesta.',
    evidence,
    missingData: Array.isArray(response?.missingData) ? response.missingData : [],
  };
}

/**
 * @returns {HTMLElement}
 */
export function createAIChatbot() {
  const root = el('section', 'ai-chatbot-root');
  const state = {
    route: 'home',
    params: {},
    open: false,
    loading: false,
    status: null,
    messages: [],
  };

  async function refreshStatus() {
    if (!window.biguAIChat?.status) return;
    try {
      state.status = await window.biguAIChat.status({ matchId: getCurrentMatchId(state) });
    } catch (error) {
      state.status = {
        available: false,
        hasApiKey: false,
        reason: error instanceof Error ? error.message : 'Nuestro asistente IA no esta disponible.',
      };
    }
    render();
  }

  async function submitQuestion(textarea) {
    const question = textarea.value.trim();
    if (!question || state.loading || !window.biguAIChat?.ask) return;

    state.messages.push({ role: 'user', content: question, evidence: [], missingData: [] });
    textarea.value = '';
    state.loading = true;
    render();

    try {
      const response = await window.biguAIChat.ask(question, {
        matchId: getCurrentMatchId(state),
        scope: 'auto',
        history: getRequestHistory(state),
      });
      state.messages.push(responseToMessage(response));
    } catch (error) {
      state.messages.push({
        role: 'assistant',
        content: error instanceof Error ? error.message : 'No pudimos consultar el asistente IA.',
        evidence: [],
        missingData: [],
      });
    } finally {
      state.loading = false;
      render();
    }
  }

  function render() {
    const visible = shouldShowAIChatbot(state.route);
    root.hidden = !visible;
    document.body.classList.toggle('has-ai-chatbot-visible', visible);
    if (!visible) state.open = false;
    root.innerHTML = '';

    const button = el('button', 'ai-chatbot-button');
    button.type = 'button';
    button.title = 'Asistente Bigua';
    button.dataset.tourId = 'ai-chatbot';
    button.setAttribute('aria-label', 'Asistente Bigua');
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.8 5.5c0-1.1.9-2 2-2h10.4c1.1 0 2 .9 2 2v7.4c0 1.1-.9 2-2 2h-5.1l-4.5 4v-4H6.8c-1.1 0-2-.9-2-2V5.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M8.2 8h7.6M8.2 11h4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `;
    button.addEventListener('click', async () => {
      state.open = !state.open;
      if (state.open) {
        ensureInitialMessage(state);
        render();
        await refreshStatus();
      } else {
        render();
      }
    });

    if (state.open) {
      const panel = el('div', 'ai-chatbot-panel');
      const header = el('header', 'ai-chatbot-header');
      const headerText = el('div', 'ai-chatbot-title-wrap');
      headerText.appendChild(el('strong', '', 'Asistente Bigua'));
      headerText.appendChild(el('span', '', getSubtitle(state)));
      const close = el('button', 'ai-chatbot-close', 'x');
      close.type = 'button';
      close.setAttribute('aria-label', 'Minimizar asistente IA');
      close.addEventListener('click', () => {
        state.open = false;
        render();
      });
      header.appendChild(headerText);
      header.appendChild(close);
      panel.appendChild(header);

      const body = el('div', 'ai-chatbot-body');
      if (state.status && state.status.available === false && state.status.reason) {
        body.appendChild(el('div', 'ai-chatbot-status-warning', state.status.reason));
      }
      renderMessages(body, state);
      panel.appendChild(body);

      const footer = el('form', 'ai-chatbot-footer');
      const textarea = /** @type {HTMLTextAreaElement} */ (el('textarea', 'ai-chatbot-input'));
      textarea.placeholder = getPlaceholder(state);
      textarea.rows = 2;
      textarea.disabled = state.loading || Boolean(state.status && state.status.available === false);
      textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          submitQuestion(textarea);
        }
      });
      const send = el('button', 'ai-chatbot-send', 'Enviar');
      send.type = 'submit';
      send.disabled = state.loading || Boolean(state.status && state.status.available === false);
      footer.addEventListener('submit', (event) => {
        event.preventDefault();
        submitQuestion(textarea);
      });
      footer.appendChild(textarea);
      footer.appendChild(send);
      panel.appendChild(footer);
      root.appendChild(panel);

      requestAnimationFrame(() => {
        body.scrollTop = body.scrollHeight;
      });
    }

    root.appendChild(button);
  }

  window.addEventListener('bigu:route-changed', (event) => {
    const detail = event instanceof CustomEvent ? event.detail : {};
    const nextRoute = detail?.route || 'home';
    const nextMatchId = detail?.params?.matchId;
    const previousMatchId = getCurrentMatchId(state);
    const routeChanged = state.route !== nextRoute || previousMatchId !== nextMatchId;
    state.route = nextRoute;
    state.params = detail?.params || {};
    state.status = null;
    if (routeChanged) state.messages = [];
    render();
  });

  render();
  return root;
}
