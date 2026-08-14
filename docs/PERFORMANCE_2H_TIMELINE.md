# Timeline performance >2h

Estado: check automatizado agregado para partidos largos sin incluir video pesado real.

## Comando

```powershell
npm run test:perf:timeline
```

## Escenario cubierto

- Duracion simulada: 2h18m.
- Volumen: 2500 eventos distribuidos en la timeline.
- render inicial: crea los bloques una sola vez.
- seek: calcula posicion exacta con `getTimelineSeekPercent`.
- scroll: preserva `scrollLeft` y usa delegacion de eventos.
- playhead: actualiza solo el indicador durante playback.
- hotkeys: el motor de Tagging sigue separado del render de timeline.

## Limites esperados

- No se incluye MP4 real de mas de 2h en el repositorio.
- El test valida la estructura de render y ausencia de listeners por bloque; no reemplaza una prueba manual con video real del club.
- Si un partido supera ampliamente 2500 eventos, repetir el check aumentando el conteo del helper `createTimelineEvents`.

## Validacion real reproducible

- Fixture temporal MP4: 8280 s (2 h 18 min), 16x16, 1 fps.
- `ffprobe` reporto `duration=8280.000000`.
- Electron cargo metadata con `duration=8280`, `readyState=4` y ejecuto seek a `8279` s.
- `npm run test:perf:timeline`: 37 tests aprobados.
