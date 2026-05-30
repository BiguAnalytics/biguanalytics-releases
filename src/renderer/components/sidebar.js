// @ts-check

/** SVG icons as strings */
const ICONS = {
  home: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
  play: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
  barChart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>',
  pencil: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z"></path><path d="M13.5 6.5l4 4"></path></svg>',
  calendar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
  settings: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
  chevronRight: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
  logo: '<svg version="1.0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 893 875" preserveAspectRatio="xMidYMid meet"><g transform="translate(0.000000,875.000000) scale(0.100000,-0.100000)" stroke="none"><path id="grafico-linea-nodos" fill="#FFFFFF" class="path-personalizado" d="M7385 7066 c-56 -25 -70 -51 -70 -130 0 -67 -3 -74 -46 -141 -26 -38 -84 -131 -129 -205 -46 -74 -111 -180 -146 -235 -79 -125 -166 -267 -258 -415 -87 -141 -78 -127 -177 -285 -45 -71 -116 -185 -158 -252 -58 -93 -81 -123 -97 -123 -14 0 -49 34 -115 113 -89 107 -93 114 -95 163 -2 62 -15 89 -57 114 -92 56 -186 -13 -172 -125 6 -50 4 -57 -35 -121 -23 -37 -45 -75 -48 -83 -4 -9 -25 -47 -48 -86 -23 -38 -63 -110 -91 -160 -28 -49 -98 -174 -157 -277 -58 -102 -106 -190 -106 -195 0 -4 -11 -24 -24 -43 -22 -32 -81 -138 -153 -270 -16 -30 -40 -73 -53 -95 -12 -22 -45 -80 -73 -130 -27 -49 -57 -101 -67 -115 -10 -14 -25 -41 -33 -60 -9 -19 -42 -80 -74 -136 -32 -55 -83 -144 -113 -197 -30 -53 -59 -96 -65 -96 -5 0 -52 68 -104 152 -52 84 -137 220 -188 302 -52 83 -149 238 -215 345 -67 107 -150 241 -185 296 -60 96 -63 104 -62 158 2 43 -3 64 -18 84 -28 38 -67 55 -111 47 -72 -12 -108 -66 -97 -143 5 -31 2 -49 -7 -60 -8 -10 -74 -118 -148 -242 -73 -124 -150 -252 -170 -285 -20 -33 -97 -161 -170 -285 -180 -303 -214 -359 -221 -360 -3 0 -25 35 -49 78 -67 118 -147 257 -207 359 -50 86 -54 95 -50 145 9 110 -70 174 -165 135 -50 -21 -72 -66 -65 -128 5 -41 2 -53 -22 -86 -15 -21 -49 -76 -75 -123 -27 -47 -63 -107 -81 -135 -18 -27 -92 -151 -165 -275 -74 -124 -166 -280 -207 -348 -40 -67 -73 -125 -73 -128 0 -3 -11 -21 -23 -39 l-24 -35 -169 258 c-94 141 -188 285 -210 319 -21 35 -41 63 -44 63 -3 0 -47 -69 -99 -153 -52 -83 -108 -174 -126 -202 -18 -27 -74 -117 -125 -200 -51 -82 -103 -166 -115 -185 -12 -19 -49 -80 -83 -135 -33 -55 -139 -230 -237 -390 -97 -159 -181 -299 -187 -310 -17 -36 48 47 187 240 76 105 151 208 167 230 177 244 292 405 476 665 136 192 143 201 152 195 5 -3 93 -132 196 -288 103 -155 195 -292 205 -305 l17 -22 58 97 c71 121 171 290 346 583 295 494 337 566 344 583 15 39 40 15 104 -100 36 -64 103 -185 149 -268 79 -141 83 -154 85 -213 1 -58 4 -66 33 -93 42 -36 75 -45 124 -30 52 16 79 65 72 136 -4 47 -1 56 65 165 58 96 110 186 167 282 5 10 105 176 221 370 116 194 220 368 230 386 10 17 24 32 31 32 6 0 51 -64 98 -142 109 -181 369 -597 538 -863 123 -193 126 -198 120 -244 -11 -78 43 -141 120 -141 69 0 132 89 108 152 -6 17 -4 33 8 58 19 38 134 244 196 350 20 36 79 139 130 230 50 91 103 185 117 210 36 63 101 180 198 355 45 83 106 191 135 240 29 50 67 117 85 150 18 33 59 105 90 160 55 97 86 152 145 263 16 28 33 52 39 51 6 0 56 -54 110 -120 98 -118 99 -121 100 -174 1 -63 28 -99 88 -117 32 -9 44 -8 79 7 53 24 73 62 66 129 -4 44 -1 57 23 91 24 36 155 246 291 469 28 44 86 137 129 206 101 161 202 324 393 635 152 248 153 250 192 256 57 9 95 56 95 115 0 59 -21 97 -64 118 -41 19 -61 20 -101 2z"/><path id="contorno-superior-izq" fill="#163A5F" class="path-personalizado" d="M1111 6090 c8 -11 70 -101 139 -201 69 -99 175 -251 235 -337 61 -87 171 -242 244 -347 74 -104 135 -192 137 -194 7 -8 144 23 144 33 0 6 -71 111 -158 233 -86 123 -193 274 -237 338 -44 63 -115 163 -157 223 -42 59 -77 113 -78 120 0 9 536 12 2648 12 l2648 0 22 38 c12 20 31 52 43 70 l21 32 -2832 0 c-2816 0 -2832 0 -2819 -20z"/><path id="triangulo-borde-der" fill="#163A5F" class="path-personalizado" d="M7013 6040 l-42 -70 241 0 c235 0 240 0 227 -19 -76 -106 -138 -192 -159 -222 -70 -100 -347 -494 -395 -561 -31 -43 -50 -78 -43 -78 20 1 188 37 192 41 1 2 16 24 32 49 17 25 90 131 164 235 318 453 456 651 474 683 6 9 -61 12 -321 12 l-328 0 -42 -70z"/><path id="pato-cuerpo-superior" fill="#CF2A2D" class="path-personalizado" d="M1720 5784 c0 -6 280 -407 390 -559 44 -60 85 -118 92 -128 13 -17 19 -17 138 12 416 99 725 135 1170 135 419 0 705 -30 1116 -119 384 -83 690 -135 803 -138 l74 -2 75 130 c178 310 224 399 218 426 -7 36 8 94 36 135 50 75 166 95 242 43 43 -29 86 -105 86 -150 0 -27 14 -52 66 -116 60 -76 84 -97 84 -75 0 5 52 91 115 192 64 101 120 191 126 202 10 18 -49 18 -2411 18 -1331 0 -2420 -3 -2420 -6z"/><path id="pato-ala-cola" fill="#CF2A2D" class="path-personalizado" d="M6814 5718 c-84 -130 -234 -369 -234 -374 0 -3 -19 -35 -43 -72 -37 -56 -44 -75 -44 -118 -1 -88 -50 -153 -132 -174 -112 -28 -231 59 -231 171 0 28 -13 49 -67 112 -37 42 -70 74 -74 70 -14 -16 -209 -371 -209 -382 0 -8 60 -11 204 -11 196 0 328 11 496 43 l65 12 83 120 c45 66 95 138 110 160 16 22 48 69 73 105 25 36 96 138 157 226 62 89 112 167 112 173 0 7 -36 11 -110 11 l-109 0 -47 -72z"/><path id="triangulo-base-principal" fill="#163A5F" class="path-personalizado" d="M3175 5063 c-331 -27 -572 -67 -1005 -168 -301 -70 -528 -107 -843 -136 -150 -14 -597 -7 -700 11 -38 7 -71 10 -73 7 -7 -7 128 -87 236 -139 276 -133 567 -226 871 -277 100 -17 392 -41 496 -41 l91 0 6 -67 c16 -185 50 -403 61 -391 2 2 28 45 59 97 42 71 54 100 50 120 -3 15 -1 46 5 68 40 149 243 181 328 52 23 -35 28 -54 28 -103 0 -39 6 -70 16 -86 9 -14 59 -101 112 -195 53 -93 102 -178 109 -187 11 -16 25 2 114 155 129 218 427 717 490 821 41 67 49 88 55 147 5 53 12 76 33 104 107 140 316 71 323 -108 1 -49 8 -69 45 -127 24 -38 67 -107 96 -153 l52 -85 53 14 c135 38 499 90 751 109 115 8 210 16 211 18 1 1 25 43 52 92 28 50 63 112 78 138 15 26 25 50 22 53 -2 3 -65 14 -138 25 -176 26 -402 69 -663 124 -240 50 -499 89 -695 105 -121 9 -625 12 -726 3z"/><path id="triangulo-interno-sombra" fill="#163A5F" class="path-personalizado" d="M7060 4949 c-64 -7 -261 -56 -415 -103 -207 -62 -539 -95 -795 -78 -125 8 -168 8 -176 -1 -7 -7 -26 -38 -44 -71 -18 -32 -45 -81 -61 -108 -16 -27 -29 -50 -29 -52 0 -2 145 -6 323 -9 352 -6 450 -14 757 -57 408 -57 519 -61 1235 -47 244 5 451 5 510 -1 55 -5 102 -7 104 -5 11 8 -87 94 -138 122 -62 32 -212 78 -382 117 -139 31 -154 39 -209 108 -87 109 -190 163 -353 185 -88 12 -229 12 -327 0z"/><path id="triangulo-detalle-inferior" fill="#163A5F" class="path-personalizado" d="M3674 4203 c-97 -164 -196 -329 -219 -368 -209 -347 -242 -409 -247 -471 -7 -76 -28 -117 -76 -148 -126 -82 -282 1 -282 150 0 41 -15 73 -121 265 -67 121 -125 219 -129 219 -6 0 -164 -259 -178 -291 -6 -14 108 -269 245 -547 393 -803 489 -1058 554 -1467 12 -77 24 -147 26 -155 7 -23 29 35 78 205 116 400 157 797 133 1278 -14 292 -14 582 1 687 14 98 62 262 98 335 79 157 236 309 390 379 l41 18 -38 63 c-21 35 -48 82 -60 104 -11 23 -24 41 -29 41 -5 0 -89 -134 -187 -297z"/><path id="base-inferior-sombra" fill="#CF2A2D" class="path-personalizado" d="M5531 4351 l-95 -6 -31 -55 c-18 -30 -92 -161 -165 -290 -191 -339 -205 -364 -275 -485 -58 -100 -63 -113 -59 -155 13 -111 -96 -207 -210 -186 -81 15 -146 97 -146 184 0 36 -10 59 -55 131 -61 94 -101 158 -285 451 -68 107 -124 197 -127 199 -7 9 -117 -51 -173 -94 -127 -98 -213 -235 -262 -415 -21 -77 -23 -107 -23 -315 l0 -230 78 -105 c43 -58 137 -190 210 -295 124 -177 281 -400 429 -607 34 -49 63 -88 64 -88 2 0 54 73 117 163 63 89 197 279 298 422 100 143 222 316 271 385 48 69 117 166 152 215 86 120 91 127 209 296 146 207 384 547 509 723 l107 151 -57 6 c-67 8 -347 8 -481 0z"/><path id="bloque-inferior-izq" fill="#CF2A2D" class="path-personalizado" d="M4920 4324 c-151 -16 -490 -69 -551 -87 l-39 -12 108 -175 c217 -350 265 -425 276 -438 12 -12 12 -13 279 463 50 88 103 181 119 208 15 26 28 49 28 52 0 8 -73 4 -220 -11z"/><path id="bloque-inferior-der" fill="#163A5F" class="path-personalizado" d="M6210 4223 c-193 -275 -195 -277 -306 -434 -44 -63 -174 -247 -289 -409 -115 -162 -246 -347 -290 -410 -45 -63 -132 -186 -193 -272 -144 -203 -320 -451 -392 -553 -31 -44 -112 -159 -180 -255 -67 -96 -130 -183 -139 -193 -16 -17 -21 -12 -92 88 -41 58 -151 212 -244 344 -94 131 -226 317 -294 414 -68 97 -129 182 -137 188 -12 10 -14 -7 -14 -105 l0 -117 208 -290 c114 -160 221 -312 238 -337 34 -52 272 -383 301 -421 l19 -24 23 29 c13 16 62 85 110 154 48 69 138 197 201 285 149 210 270 381 340 480 31 44 122 172 201 285 80 113 232 327 337 475 105 149 208 295 229 325 304 430 593 841 593 845 0 1 -21 6 -47 9 -27 4 -60 9 -74 12 -24 5 -34 -5 -109 -113z"/></g></svg>'
};

const NAV_ITEMS = [
  { id: 'home', label: 'Inicio', icon: 'home', enabled: true },
  { id: 'tagging', label: 'Tagging', icon: 'play', enabled: true },
  { id: 'dashboard', label: 'Dashboard', icon: 'barChart', enabled: true },
  { id: 'tactical', label: 'Tablero', icon: 'pencil', enabled: true },
  { id: 'season', label: 'Temporada', icon: 'calendar', enabled: true },
];

const BOTTOM_ITEMS = [
  { id: 'settings', label: 'Ajustes', icon: 'settings', enabled: true },
];

let isExpanded = true; // Start expanded on Home

export function getBiguLogoSvg() {
  return ICONS.logo;
}

/**
 * Gets initials from a display name.
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || 'JG';
}

/**
 * Formats a user role for display.
 * @param {string} role
 * @returns {string}
 */
function formatRole(role) {
  return role
    .toLowerCase()
    .replace(/^\w/, char => char.toUpperCase());
}

/**
 * Updates the sidebar user profile.
 * @param {HTMLElement} sidebar
 * @param {{name?: string, role?: string}} user
 */
function updateSidebarProfile(sidebar, user) {
  const name = user.name || 'Jorge G.';
  const role = user.role || 'ENTRENADOR';
  const avatar = sidebar.querySelector('[data-profile-avatar]');
  const nameEl = sidebar.querySelector('[data-profile-name]');
  const roleEl = sidebar.querySelector('[data-profile-role]');

  if (avatar) avatar.textContent = getInitials(name);
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = formatRole(role);
}

/**
 * Loads user settings and updates the sidebar profile.
 * @param {HTMLElement} sidebar
 */
async function loadSidebarProfile(sidebar) {
  try {
    const settings = await window.api?.settings?.get?.();
    updateSidebarProfile(sidebar, settings?.user || {});
  } catch {
    updateSidebarProfile(sidebar, {});
  }
}

/**
 * Creates the sidebar DOM element.
 * @param {string} activeId - Currently active navigation item ID
 * @param {function} onNavigate - Callback when nav item is clicked
 * @returns {HTMLElement}
 */
export function createSidebar(activeId = 'home', onNavigate = () => {}) {
  const sidebar = document.createElement('aside');
  sidebar.className = `sidebar${isExpanded ? ' expanded' : ''}`;
  sidebar.id = 'sidebar';

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">${ICONS.logo}</div>
    </div>
    <nav class="sidebar-nav">
      ${NAV_ITEMS.map(item => `
        <div class="sidebar-item${item.id === activeId ? ' active' : ''}${!item.enabled ? ' disabled' : ''}" data-nav="${item.id}">
          <div class="sidebar-item-icon">${ICONS[item.icon]}</div>
          <span class="sidebar-item-label">${item.label}</span>
        </div>
      `).join('')}
      <div class="sidebar-spacer"></div>
      <div class="sidebar-divider"></div>
      ${BOTTOM_ITEMS.map(item => `
        <div class="sidebar-item${item.id === activeId ? ' active' : ''}${!item.enabled ? ' disabled' : ''}" data-nav="${item.id}">
          <div class="sidebar-item-icon">${ICONS[item.icon]}</div>
          <span class="sidebar-item-label">${item.label}</span>
        </div>
      `).join('')}
    </nav>
    <div class="sidebar-profile" aria-label="Perfil de usuario">
      <div class="sidebar-profile-avatar" data-profile-avatar>JG</div>
      <div class="sidebar-profile-details">
        <span class="sidebar-profile-name" data-profile-name>Jorge G.</span>
        <span class="sidebar-profile-role" data-profile-role>Entrenador</span>
      </div>
    </div>
    <div class="sidebar-toggle" id="sidebar-toggle">
      ${ICONS.chevronRight}
    </div>
  `;

  loadSidebarProfile(sidebar);

  // Event: toggle expand/collapse
  const toggleBtn = sidebar.querySelector('#sidebar-toggle');
  toggleBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    sidebar.classList.toggle('expanded', isExpanded);
  });

  // Event: nav item click
  sidebar.querySelectorAll('.sidebar-item:not(.disabled)').forEach(item => {
    item.addEventListener('click', () => {
      const navId = item.dataset.nav;
      setSidebarActive(navId);
      onNavigate(navId);
    });
  });

  return sidebar;
}

/**
 * Sets the expanded state of the sidebar.
 * @param {boolean} expanded
 */
export function setSidebarExpanded(expanded) {
  isExpanded = expanded;
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('expanded', isExpanded);
  }
}

/**
 * Sets the active sidebar item from the current route.
 * @param {string} activeId
 */
export function setSidebarActive(activeId) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.querySelectorAll('.sidebar-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.nav === activeId);
  });
}
