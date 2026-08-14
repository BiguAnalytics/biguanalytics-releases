# BiguAnalytics — Design System
**Versión:** 1.0  
**Fecha:** Mayo 2026  
**Destino:** Documento de referencia para IA codeadora (Claude Code / Codex)  
**Plataforma:** Electron + HTML/CSS/JS, Windows Desktop

---

## 0. Filosofía de Diseño

BiguAnalytics es una herramienta profesional de uso interno. El diseño debe comunicar **autoridad técnica y precisión**, no ser llamativo por sí mismo. La interfaz desaparece durante el tagging — el analista se olvida de la app y piensa en el partido. Cuando termina, el dashboard habla solo.

**Referencia visual principal:** exactamente.com.ar — fondo muy oscuro, gradientes suaves tipo neblina, tipografía bold con alto contraste, sensación de profundidad sin ser recargado.

**Principio core:** *Mínima UI durante el trabajo, máxima información durante el análisis.*

---

## 1. Paleta de Colores

### Colores Base (tokens CSS — usar siempre como variables)

```css
:root {
  /* Fondos */
  --color-bg-base:        #080E1A;  /* Fondo global — más oscuro que #0F2340 */
  --color-bg-surface:     #0D1829;  /* Paneles, cards, sidebars */
  --color-bg-elevated:    #122035;  /* Modales, popups, elementos flotantes */
  --color-bg-hover:       #1A2D47;  /* Estados hover en items */

  /* Marca Bigua */
  --color-brand-navy:     #0F2340;  /* Azul marino oficial del club */
  --color-brand-red:      #C8102E;  /* Rojo Bigua — acento principal */
  --color-brand-white:    #FFFFFF;

  /* UI Funcional */
  --color-accent:         #C8102E;  /* Acento activo, CTA, highlights */
  --color-accent-hover:   #E8152F;  /* Hover del acento */
  --color-accent-muted:   rgba(200, 16, 46, 0.15); /* Fondo suave de acento */

  /* Texto */
  --color-text-primary:   #F0F4F8;  /* Texto principal */
  --color-text-secondary: #8A9BB0;  /* Labels, subtítulos, metadata */
  --color-text-muted:     #4A5D70;  /* Placeholders, texto desactivado */
  --color-text-inverse:   #080E1A;  /* Texto sobre fondos claros */

  /* Bordes */
  --color-border:         rgba(255, 255, 255, 0.06);
  --color-border-strong:  rgba(255, 255, 255, 0.12);
  --color-border-accent:  rgba(200, 16, 46, 0.4);

  /* Gradientes */
  --gradient-bg:          radial-gradient(ellipse at 20% 0%, rgba(15, 35, 64, 0.8) 0%, transparent 60%),
                          radial-gradient(ellipse at 80% 100%, rgba(200, 16, 46, 0.06) 0%, transparent 50%),
                          #080E1A;
  --gradient-surface:     linear-gradient(135deg, #0D1829 0%, #0A1520 100%);
  --gradient-card:        linear-gradient(145deg, rgba(255,255,255,0.03) 0%, transparent 100%);
  --gradient-accent-glow: radial-gradient(ellipse at center, rgba(200, 16, 46, 0.2) 0%, transparent 70%);
  --gradient-navy-glow:   radial-gradient(ellipse at top, rgba(15, 35, 64, 0.9) 0%, transparent 60%);
}
```

### Colores de Estado para Tags / Eventos

```css
:root {
  --tag-ganado:     #1DB954;  /* Verde — resultado positivo */
  --tag-perdido:    #C8102E;  /* Rojo Bigua — resultado negativo */
  --tag-sucio:      #F59E0B;  /* Amarillo/ámbar — resultado neutro/sucio */
  --tag-ataque:     #3B82F6;  /* Azul — contexto ataque */
  --tag-defensa:    #8B5CF6;  /* Violeta — contexto defensa */
  --tag-try:        #10B981;  /* Verde esmeralda — puntos */
  --tag-penal:      #EF4444;  /* Rojo claro — disciplina */
  --tag-nota:       #6366F1;  /* Índigo — notas libres */
  --tag-kick:       #06B6D4;  /* Cyan — kicks */
  --tag-tarjeta-amarilla: #F59E0B;
  --tag-tarjeta-roja:     #C8102E;
}
```

---

## 2. Tipografía

### Fuentes

- **Marca / Títulos impactantes:** `Arial Black`, `Arial-BoldMT`, fallback `sans-serif` — peso visual máximo
- **UI / Datos / Labels:** `Arial`, fallback `Helvetica Neue`, `sans-serif`
- **Datos numéricos grandes (KPIs):** `Arial Black` — los números del dashboard deben ser bold y grandes

```css
:root {
  --font-brand:   'Arial Black', Arial, sans-serif;
  --font-ui:      Arial, 'Helvetica Neue', sans-serif;

  /* Tamaños */
  --text-xs:    11px;
  --text-sm:    12px;
  --text-base:  14px;
  --text-md:    16px;
  --text-lg:    18px;
  --text-xl:    22px;
  --text-2xl:   28px;
  --text-3xl:   36px;
  --text-4xl:   48px;

  /* Line heights */
  --leading-tight:  1.2;
  --leading-normal: 1.5;
  --leading-loose:  1.8;
}
```

### Jerarquía tipográfica

| Rol | Font | Tamaño | Weight | Color |
|---|---|---|---|---|
| Nombre app / Logo texto | Arial Black | 20px | 900 | `#F0F4F8` con `Analytics` en `#C8102E` |
| Título de sección | Arial Black | 18px | 900 | `--color-text-primary` |
| KPI número grande | Arial Black | 48px | 900 | depende de estado |
| Label de KPI | Arial | 11px | 400 | `--color-text-secondary` |
| Cuerpo / datos | Arial | 14px | 400 | `--color-text-primary` |
| Metadata / timestamp | Arial | 12px | 400 | `--color-text-secondary` |
| Hotkey badge | Arial Black | 11px | 900 | `--color-brand-red` |

---

## 3. Espaciado y Layout

```css
:root {
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;
  --space-12:  48px;
  --space-16:  64px;

  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:  12px;
  --radius-xl:  16px;
  --radius-full: 9999px;

  --sidebar-width:      56px;   /* Sidebar colapsado (solo íconos) */
  --sidebar-width-open: 220px;  /* Sidebar expandido */
  --topbar-height:      48px;
  --player-controls-h:  54px;
  --timeline-height:    clamp(220px, 24vh, 280px); /* Timeline operativa responsive */
  --tagging-panel-w:    clamp(360px, 30vw, 460px);
}
```

### Grid del Layout Principal (Pantalla de Tagging)

```
┌─────────────────────────────────────────────────────────────┐
│ TOPBAR (48px) — partido, estado, acciones                  │
├──────┬──────────────────────────────────────┬───────────────┤
│      │                                      │ PANEL OPERAT. │
│ SIDE │           VIDEO PLAYER               │ 360–460px     │
│ BAR  │                                      │ estado / tag  │
│ 56px │                                      │ secuencia /   │
│      │                                      │ inspector     │
│      ├──────────────────────────────────────┤               │
│      │ PLAYER CONTROLS (54px)               │               │
├──────┴──────────────────────────────────────┴───────────────┤
│ TIMELINE (clamp(220px, 24vh, 280px)) — tracks por evento    │
├─────────────────────────────────────────────────────────────┤
│ HOTKEY HINTS (40px, colapsable)                             │
└─────────────────────────────────────────────────────────────┘
```

### Grid del Dashboard

```
┌─────────────────────────────────────────────────────┐
│  TOPBAR (48px)                                        │
├───┬─────────────────────────────────────────────────┤
│ S │  HEADER DEL PARTIDO (resultado, fecha, equipos)  │
│ I ├──────────────────┬──────────────────────────────┤
│ D │  KPI ROW (4 KPIs │ KPI ROW — full width          │
│ E ├──────────────────┴──────────────────────────────┤
│ B │  SECCIÓN POR SECCIÓN (2 o 3 columnas)            │
│ A │  cada sección es colapsable                      │
│ R │                                                   │
│   │                                                   │
└───┴─────────────────────────────────────────────────┘
```

---

## 4. Componentes

### 4.1 Sidebar de Navegación

**Comportamiento:** Siempre colapsado (56px, solo íconos) durante el tagging. Se puede expandir hovereando o con un toggle. En el dashboard puede estar expandido por defecto.

**Estructura:**
```
[Logo BiguAnalytics — 40px]
─────────────────
[⌂] Inicio        (ícono: home)
[▶] Tagging       (ícono: play)
[📊] Dashboard    (ícono: bar chart)
[▣] Clips         (ícono: clips)
[✏] Tablero       (ícono: pencil)
[📅] Temporada    (ícono: calendar)
─────────────────
(espaciador flex)
─────────────────
[⚙️] Ajustes
─────────────────
[Avatar] Nombre usuario
```

Heatmap pertenece al Dashboard y no es una entrada independiente de navegación. El dibujo sobre video es contextual a Tagging; Tablero es la superficie independiente para trabajo táctico.

**Estilos:**
```css
.sidebar {
  background: var(--color-bg-surface);
  border-right: 1px solid var(--color-border);
  width: var(--sidebar-width);
  transition: width 200ms ease;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 150ms, color 150ms;
}

.sidebar-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.sidebar-item.active {
  background: var(--color-accent-muted);
  color: var(--color-accent);
}

/* Indicador de badge (ej: "1 partido sin taggear") */
.sidebar-badge {
  background: var(--color-accent);
  color: white;
  font: 700 10px var(--font-brand);
  border-radius: var(--radius-full);
  padding: 1px 5px;
  margin-left: auto;
}
```

---

### 4.2 Topbar

**Siempre visible, altura fija 48px.**

Estructura:
```
[Logo] [Bigua 17 — 18 Los Cardos · Fecha 3]   [● tageando]  [⬇ exportar] [···]
```

```css
.topbar {
  height: var(--topbar-height);
  background: rgba(8, 14, 26, 0.95);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
  gap: var(--space-4);
  position: sticky;
  top: 0;
  z-index: 100;
}

.topbar-match-info {
  font: 700 14px var(--font-brand);
  color: var(--color-text-primary);
  /* Scores del partido en rojo */
}

.topbar-score-local  { color: var(--color-brand-red); }
.topbar-score-rival  { color: var(--color-text-secondary); }

.topbar-status-recording {
  display: flex;
  align-items: center;
  gap: 6px;
  font: 400 12px var(--font-ui);
  color: var(--color-brand-red);
}

.topbar-status-recording::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-brand-red);
  animation: pulse-red 1.5s ease-in-out infinite;
}

@keyframes pulse-red {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
```

---

### 4.3 Reproductor de Video

**El video ocupa el máximo espacio disponible.** No hay chrome innecesario encima del video.

```css
.video-container {
  position: relative;
  flex: 1;
  background: #000;
  overflow: hidden;
}

.video-container video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Overlay canvas para dibujo */
.video-draw-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none; /* activar solo en modo dibujo */
  cursor: crosshair;
}

/* Overlay semi-transparente cuando hay popup de tag activo */
.video-tag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 15;
  pointer-events: none;
}
```

**Controles del reproductor:**
```css
.player-controls {
  height: var(--player-controls-h);
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-4);
}

.player-scrubber {
  flex: 1;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-bg-hover);
  cursor: pointer;
  position: relative;
}

.player-scrubber-progress {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-full);
  position: relative;
}

/* Thumb del scrubber */
.player-scrubber-progress::after {
  content: '';
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 0 0 2px var(--color-accent);
}

.player-time {
  font: 400 12px var(--font-ui);
  color: var(--color-text-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.player-speed-btn {
  font: 700 11px var(--font-brand);
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 2px 7px;
  cursor: pointer;
}

.player-speed-btn.active {
  color: var(--color-accent);
  border-color: var(--color-border-accent);
}
```

---

### 4.4 Popup de Tag (componente más crítico de la app)

**Aparece al presionar una hotkey dentro del panel operativo. El video NO se pausa y los controles permanecen visibles.**

```css
.tag-popup {
  width: min(420px, 100%);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-xl);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7),
              0 0 0 1px rgba(200, 16, 46, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.05);
  overflow: hidden;
  
  /* Animación de entrada */
  animation: popup-enter 120ms ease-out;
}

@keyframes popup-enter {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.tag-popup-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: rgba(200, 16, 46, 0.08);
}

.tag-popup-event-name {
  font: 900 13px var(--font-brand);
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tag-popup-question {
  font: 400 11px var(--font-ui);
  color: var(--color-text-secondary);
  margin-left: auto;
}

/* Grid de opciones del tag */
.tag-popup-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  padding: var(--space-3);
}

/* Para eventos con solo 2 opciones, usa 2 columnas */
.tag-popup-options.cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.tag-option-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: var(--space-2) var(--space-1);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 100ms;
}

.tag-option-btn:hover,
.tag-option-btn.selected {
  border-color: var(--color-border-accent);
  background: var(--color-accent-muted);
}

.tag-option-key {
  font: 900 10px var(--font-brand);
  color: var(--color-accent);
  text-transform: uppercase;
}

.tag-option-label {
  font: 400 11px var(--font-ui);
  color: var(--color-text-primary);
  text-align: center;
}

/* Campo de nota */
.tag-note-field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--color-border);
}

.tag-note-input {
  flex: 1;
  background: transparent;
  border: none;
  font: 400 12px var(--font-ui);
  color: var(--color-text-primary);
  outline: none;
}

.tag-note-input::placeholder {
  color: var(--color-text-muted);
}

.tag-mic-btn {
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 150ms;
}

.tag-mic-btn:hover  { color: var(--color-accent); }
.tag-mic-btn.active { color: var(--color-accent); animation: pulse-red 1s infinite; }

/* Botón confirmar */
.tag-confirm-btn {
  width: 100%;
  padding: var(--space-3);
  background: var(--color-accent);
  color: white;
  font: 700 13px var(--font-brand);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: none;
  cursor: pointer;
  transition: background 150ms;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

.tag-confirm-btn:hover { background: var(--color-accent-hover); }

/* Auto-close hint */
.tag-autoclose-hint {
  font: 400 10px var(--font-ui);
  color: var(--color-text-muted);
  margin-left: auto;
}
```

**Comportamiento del popup:**
- Aparece en 120ms con animación de escala + slide
- Si el analista no interactúa en 8 segundos, se cierra solo (configurable)
- `Escape` cierra sin guardar
- `Enter` confirma si hay al menos una opción seleccionada
- Las teclas numéricas (1, 2, 3) seleccionan opciones en orden
- El video continúa reproduciéndose mientras el popup está abierto

---

### 4.5 Timeline de Eventos (estilo editor de video)

**Inspiración:** Adobe Premiere / DaVinci Resolve — tracks horizontales, bloques de colores, cabeza lectora roja.

```css
.timeline {
  height: var(--timeline-height);
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.timeline-tracks {
  position: relative;
  min-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Cabeza lectora (posición actual del video) */
.timeline-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-accent);
  z-index: 20;
  pointer-events: none;
}

.timeline-playhead::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--color-accent);
  border-bottom: none;
}

/* Regla de tiempo (timestamps en la parte superior) */
.timeline-ruler {
  height: 20px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg-surface);
  z-index: 10;
}

.timeline-ruler-tick {
  font: 400 10px var(--font-ui);
  color: var(--color-text-muted);
  position: absolute;
  transform: translateX(-50%);
}

/* Track row */
.timeline-track {
  height: 22px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--color-border);
  position: relative;
}

.timeline-track-label {
  position: sticky;
  left: 0;
  width: 64px;
  min-width: 64px;
  font: 400 10px var(--font-ui);
  color: var(--color-text-muted);
  background: var(--color-bg-surface);
  z-index: 5;
  padding-left: var(--space-2);
  border-right: 1px solid var(--color-border);
}

/* Bloque de evento en la timeline */
.timeline-block {
  position: absolute;
  height: 14px;
  min-width: 10px;
  border-radius: 2px;
  cursor: pointer;
  transition: filter 100ms, transform 100ms;
  top: 50%;
  transform: translateY(-50%);
}

.timeline-block:hover {
  filter: brightness(1.3);
  transform: translateY(-50%) scaleY(1.3);
  z-index: 5;
}

/* Tooltipo del bloque al hover */
.timeline-block-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  font: 400 11px var(--font-ui);
  color: var(--color-text-primary);
  white-space: nowrap;
  pointer-events: none;
  z-index: 30;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}

/* Colores de bloques por tipo de resultado */
.timeline-block.ganado     { background: var(--tag-ganado); }
.timeline-block.perdido    { background: var(--tag-perdido); }
.timeline-block.sucio      { background: var(--tag-sucio); }
.timeline-block.ataque     { background: var(--tag-ataque); }
.timeline-block.try        { background: var(--tag-try); }
.timeline-block.nota       { background: var(--tag-nota); }

/* Leyenda de colores */
.timeline-legend {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.timeline-legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font: 400 10px var(--font-ui);
  color: var(--color-text-muted);
}

.timeline-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
```

---

### 4.6 Cards de KPI (Dashboard)

```css
.kpi-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  position: relative;
  overflow: hidden;
  transition: border-color 200ms;
}

/* Gradiente sutil en la card */
.kpi-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--gradient-card);
  pointer-events: none;
}

/* Estado alerta (métrica por debajo del umbral) */
.kpi-card.alert {
  border-color: rgba(200, 16, 46, 0.4);
  background: rgba(200, 16, 46, 0.04);
}

.kpi-card.alert .kpi-value { color: var(--color-accent); }

/* Estado positivo */
.kpi-card.positive .kpi-value { color: var(--tag-ganado); }

.kpi-label {
  font: 400 11px var(--font-ui);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: var(--space-2);
}

.kpi-value {
  font: 900 48px var(--font-brand);
  color: var(--color-text-primary);
  line-height: 1;
  margin-bottom: var(--space-1);
}

.kpi-value.medium { font-size: 36px; }
.kpi-value.small  { font-size: 28px; }

.kpi-delta {
  font: 400 11px var(--font-ui);
  color: var(--color-text-muted);
}

.kpi-delta.positive { color: var(--tag-ganado); }
.kpi-delta.negative { color: var(--color-accent); }

/* Indicador de alerta */
.kpi-alert-badge {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: pulse-red 2s ease-in-out infinite;
}
```

---

### 4.7 Secciones del Dashboard

```css
.dashboard-section {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: var(--space-4);
}

.dashboard-section-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer; /* secciones colapsables */
  user-select: none;
}

.dashboard-section-title {
  font: 900 13px var(--font-brand);
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.dashboard-section-chevron {
  margin-left: auto;
  color: var(--color-text-muted);
  transition: transform 200ms;
}

.dashboard-section.collapsed .dashboard-section-chevron {
  transform: rotate(-90deg);
}

.dashboard-section-body {
  padding: var(--space-5);
}

/* Grid de contenido dentro de la sección */
.dashboard-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
.dashboard-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-4); }
```

---

### 4.8 Gráficos (Chart.js)

**Configuración global de Chart.js para respetar el design system:**

```javascript
// chart-defaults.js
Chart.defaults.color = '#8A9BB0';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.06)';
Chart.defaults.font.family = 'Arial, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.color = '#8A9BB0';
Chart.defaults.plugins.tooltip.backgroundColor = '#122035';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleColor = '#F0F4F8';
Chart.defaults.plugins.tooltip.bodyColor = '#8A9BB0';
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 8;

// Paleta de colores para gráficos de comparación local vs rival
const CHART_COLORS = {
  local:        '#C8102E',
  localLight:   'rgba(200, 16, 46, 0.3)',
  rival:        '#3B82F6',
  rivalLight:   'rgba(59, 130, 246, 0.3)',
  neutral:      '#4A5D70',
  positive:     '#1DB954',
  warning:      '#F59E0B',
};
```

---

### 4.9 Pantalla de Inicio (Home)

**Estructura:** Sidebar expandido + área principal con cards de partido.

```css
.home-header {
  padding: var(--space-8) var(--space-8) var(--space-6);
}

.home-welcome {
  font: 900 28px var(--font-brand);
  color: var(--color-text-primary);
  margin-bottom: var(--space-1);
}

.home-welcome span { color: var(--color-accent); }

.home-subtitle {
  font: 400 14px var(--font-ui);
  color: var(--color-text-secondary);
}

/* KPI row en el home */
.home-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
  padding: 0 var(--space-8) var(--space-6);
}

/* Lista de partidos */
.match-list {
  padding: 0 var(--space-8);
}

.match-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.match-list-title {
  font: 900 16px var(--font-brand);
  color: var(--color-text-primary);
}

.match-list-new-btn {
  font: 700 12px var(--font-brand);
  color: var(--color-accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

/* Grid de cards de partido */
.match-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

.match-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 200ms, transform 200ms;
}

.match-card:hover {
  border-color: var(--color-border-strong);
  transform: translateY(-2px);
}

.match-card-thumbnail {
  height: 100px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

/* Botón play sobre el thumbnail */
.match-card-play {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255,255,255,0.2);
}

.match-card-body {
  padding: var(--space-4);
}

.match-card-title {
  font: 700 13px var(--font-brand);
  color: var(--color-text-primary);
  margin-bottom: var(--space-1);
}

.match-card-meta {
  font: 400 11px var(--font-ui);
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}

.match-card-badges {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

/* Badge de resultado */
.badge {
  font: 700 10px var(--font-brand);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge.victoria { background: rgba(29, 185, 84, 0.15); color: var(--tag-ganado); }
.badge.derrota  { background: rgba(200, 16, 46, 0.15); color: var(--color-accent); }
.badge.empate   { background: rgba(245, 158, 11, 0.15); color: var(--tag-sucio); }
.badge.analizado     { background: rgba(30, 45, 64, 1); color: var(--color-text-secondary); border: 1px solid var(--color-border); }
.badge.sin-analizar  { background: rgba(245, 158, 11, 0.1); color: var(--tag-sucio); border: 1px solid rgba(245,158,11,0.2); }

/* Card "Nuevo partido" */
.match-card-new {
  border: 1px dashed var(--color-border-strong);
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 160px;
  color: var(--color-text-muted);
  transition: color 200ms, border-color 200ms;
}

.match-card-new:hover {
  color: var(--color-accent);
  border-color: var(--color-border-accent);
}
```

---

### 4.10 Hotkey Hints Bar

**Barra colapsable debajo de los controles del reproductor. Solo visible si el analista la activa o en el primer uso.**

```css
.hotkey-bar {
  height: 32px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-4);
  background: rgba(8, 14, 26, 0.6);
  border-top: 1px solid var(--color-border);
  overflow-x: auto;
  scrollbar-width: none;
}

.hotkey-hint {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  white-space: nowrap;
  font: 400 11px var(--font-ui);
  color: var(--color-text-muted);
}

.hotkey-key {
  font: 900 10px var(--font-brand);
  color: var(--color-accent);
  background: rgba(200, 16, 46, 0.1);
  border: 1px solid var(--color-border-accent);
  border-radius: 3px;
  padding: 1px 5px;
  text-transform: uppercase;
}
```

---

### 4.11 Logo y Marca

**Logo BiguAnalytics:**
- Isotipo: triángulo invertido azul marino con interior rojo (escudo del club) + línea de analytics/gráfico de puntos en gris superpuesta
- Texto: `Bigu` en Arial Black blanco + `Analytics` en Arial Black rojo (`#C8102E`)
- En la sidebar colapsada: solo el isotipo (40px)
- En la sidebar expandida: isotipo (24px) + texto
- En el topbar: isotipo (20px) + texto si hay espacio

**Logo del club (Bigua RC):**
- Usado en: pantalla de login (si aplica), PDF exportado, pantalla de inicio (discreto)
- No mezclar los dos logos en el mismo espacio visual

---

### 4.12 Fondo y Gradientes de Ambiente

**Aplicar en el `body` y en el `main` de cada pantalla:**

```css
body {
  background: var(--gradient-bg);
  min-height: 100vh;
}

/* Efecto de "neblina" de fondo — igual que exactamente.com.ar */
.ambient-glow-left {
  position: fixed;
  top: -20%;
  left: -10%;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(15, 35, 64, 0.6) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.ambient-glow-red {
  position: fixed;
  bottom: -10%;
  right: 5%;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 16, 46, 0.04) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
```

---

## 5. Pantallas — Especificación por Vista

### 5.1 Home / Lista de Partidos
- Sidebar expandido (220px)
- Header con bienvenida personalizada ("Bienvenido, Jorge 👋")
- 4 KPIs de temporada (% rucks ganados, penales promedio, % line outs, etc.)
- Grid 3 columnas de match cards + card "Nuevo partido"
- Fondo con gradiente de ambiente

### 5.2 Tagging (pantalla principal de trabajo)
- Sidebar **colapsado** (56px, solo íconos)
- Topbar fijo con info del partido + indicador REC
- Área principal dividida en video a la izquierda y panel operativo a la derecha (`360–460px`)
- El panel operativo es una superficie única con estados mutuamente excluyentes: estado del partido, popup de tag, popup de secuencia e inspector de evento
- El popup de tag no cubre el video: se presenta dentro del panel operativo para conservar visibles el reproductor, los controles y la timeline
- Player controls bajo el video (scrubber, tiempo, velocidad y botones), con altura de `54px`
- Timeline responsive (`clamp(220px, 24vh, 280px)`) con tracks y bloques de colores
- Hotkey bar colapsable de `40px`
- El inspector edita el evento seleccionado de forma contextual; no se muestra una lista lateral persistente de eventos

### 5.3 Dashboard
- Sidebar colapsado o semi-expandido
- Header del partido con score prominente
- KPI row (4 KPIs principales)
- Secciones colapsables por categoría (Set Pieces, Rucks, Kicks, etc.)
- Toggle local/visitante o vista comparada side-by-side
- Botón exportar PDF sticky en topbar

### 5.4 Dibujo sobre Video
- Herramienta contextual dentro de Tagging o desde la timeline, con canvas activo sobre el frame
- Toolbar flotante de herramientas en la esquina inferior izquierda del video
- Paleta de colores + grosor de trazo

### 5.5 Heatmap
- Sección del Dashboard, no pantalla ni ruta independiente
- Canvas/SVG del campo de rugby con zonas clickeables y foco navegable desde el Dashboard
- Filtros por tipo de evento, equipo, período y zona
- Intensidad de color mediante gradiente rojo; el filtro activo debe quedar visible

### 5.6 Tablero Táctico
- Canvas en blanco con campo de rugby de fondo
- Mismas herramientas de dibujo
- Sin video, sin partido activo — standalone

### 5.7 Asistencia con IA
- La asistencia de IA es opcional y se presenta como una capacidad de análisis, sin selector de proveedor en la interfaz
- Gemini es el único proveedor oficial inicial; la UI no expone nombres de modelos, API keys ni credenciales
- Estados visuales mínimos: no disponible/no configurada, analizando, resultado listo y error o límite alcanzado
- El estado de carga debe ser no bloqueante para el resto del Dashboard; el resultado debe mantener su vínculo con el partido y el período analizado

---

## 6. Efectos y Micro-interacciones

- **Hover en sidebar items:** fondo `--color-bg-hover`, color texto a primario — 150ms ease
- **Click en bloque de timeline:** seek instantáneo en video + highlight del bloque (brillo +30%) — feedback visual inmediato
- **Apertura de panel contextual:** scale(0.98→1) + fadeIn — 120ms ease-out
- **Cierre de panel contextual:** scale(1→0.98) + fadeOut — 80ms ease-in
- **KPI card alert:** glow rojo pulsante (2s infinite)
- **Botón confirmar del popup:** fondo oscurece en hover — 100ms
- **Match card hover:** translateY(-2px) + border más visible — 200ms ease
- **Indicador REC:** pulso rojo 1.5s infinite
- **Transición entre pantallas:** fade 150ms

---

## 7. Accesibilidad y UX

- Todos los hotkeys deben ser distinguibles visualmente con el indicador `--color-accent`
- El panel contextual nunca debe tapar los controles del reproductor ni el scrubber
- El panel operativo mantiene una geometría estable; sus estados internos no deben desplazar ni cubrir el video
- En la timeline, el click debe tener área mínima de 20px incluso si el bloque es pequeño
- Todos los textos de datos deben tener `font-variant-numeric: tabular-nums` para alineación
- El foco de teclado nunca debe perderse: al abrir un popup o inspector, el foco va al primer control accionable de ese estado
- `Escape` siempre cierra la superficie contextual más reciente y devuelve el foco al disparador

---

## 8. Archivos y Estructura CSS Recomendada

```
src/
├── styles/
│   ├── tokens.css          ← variables CSS (sección 1, 2, 3)
│   ├── base.css            ← reset, body, tipografía base
│   ├── layout.css          ← sidebar, topbar, grid layouts
│   ├── components/
│   │   ├── sidebar.css
│   │   ├── topbar.css
│   │   ├── video-player.css
│   │   ├── tag-popup.css   ← más crítico — revisar primero
│   │   ├── timeline.css
│   │   ├── kpi-card.css
│   │   ├── dashboard.css
│   │   ├── match-card.css
│   │   └── hotkey-bar.css
│   └── charts.css          ← estilos de contenedores de Chart.js
```

---

## 9. Referencias Visuales

- **Exactamente.com.ar:** fondo oscuro profundo, gradientes de neblina, tipografía bold con alto contraste, sensación de profundidad. Referencia directa para el estilo de fondo y la atmósfera general.
- **LongoMatch:** referencia funcional para el sistema de tagging y la timeline. NO para el estilo visual.
- **Diseño capturado (image 3 y 4 del brief):** referencia directa del layout — respetar la estructura pero mejorar la densidad y el uso del espacio del video.
