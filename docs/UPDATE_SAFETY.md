# Update Safety y Backup Local

## Instalacion y actualizaciones

- Instalar una version nueva encima no debe borrar AppData.
- Desinstalar la aplicacion no debe borrar datos locales salvo que exista una opcion explicita y confirmada para eliminar datos.
- Nunca borrar datos locales en una actualizacion automatica o manual.
- El almacenamiento local `data/{matchId}/match.json` es la fuente portable del partido y debe preservarse entre versiones.

## Export de partido

- El export de partido genera un archivo `.biguanalytics` o `.zip` con `manifest.json`, `match/match.json` y archivos asociados del partido.
- Incluye eventos, secuencias, posesion, score, notas del entrenador, analisis IA cacheado, dibujos, frames y metadata cloud no sensible si existen.
- No se exportan sesiones, tokens ni secretos.
- Si el partido usa MP4 local, el video no se incluye por defecto. El export conserva referencia de nombre, tamano, duracion, hash y ruta original para ayudar a ubicar el archivo.

## Import de partido

- El import valida `manifest.json`, version de schema y `match.json`.
- Si el ID ya existe, el usuario debe elegir reemplazar, importar como copia o cancelar.
- El partido importado se escribe en AppData local y debe aparecer en Home inmediatamente.

## Backup completo

- `Exportar backup local` crea un ZIP con todos los partidos locales legibles y settings no sensibles.
- No se exportan sesiones, tokens ni secretos.
- Backups y exports nunca deben incluir API keys, Supabase tokens, refresh tokens ni datos de sesion.
