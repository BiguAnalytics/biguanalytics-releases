# Update Safety y Backup Local

## Instalacion y actualizaciones

- Instalar una version nueva encima no debe borrar AppData.
- Desinstalar la aplicacion no debe borrar datos locales salvo que exista una opcion explicita y confirmada para eliminar datos.
- Nunca borrar datos locales en una actualizacion automatica o manual.
- El almacenamiento local `data/{matchId}/match.json` es la fuente portable del partido y debe preservarse entre versiones.
- Las actualizaciones NSIS de `electron-updater` reemplazan la instalacion de la app, no el directorio `app.getPath('userData')`.
- No agregar scripts de uninstall/update que borren AppData, matches locales, settings, Supabase session, device cache ni offline grace.

## Auto-update Windows con GitHub Releases publico

La app usa `electron-updater` con `electron-builder` y target NSIS. El repo real de codigo sigue privado; los assets de actualizacion se publican manualmente en el repo publico `BiguAnalytics/biguanalytics-releases`.

Configuracion local esperada:

```json
{
  "provider": "github",
  "owner": "BiguAnalytics",
  "repo": "biguanalytics-releases",
  "releaseType": "release"
}
```

El renderer no puede editar este destino y no se deben incluir tokens privados para updates en Electron. No usar tokens de GitHub para el build local: la publicacion del release y sus assets se hace manualmente fuera de Codex.

La app no esta firmada. Windows puede seguir mostrando SmartScreen durante la instalacion inicial y el auto-update no elimina la advertencia de editor desconocido. La falta de firma no bloquea el updater.

Para publicar una actualizacion:

```powershell
npm test
npm run security:check
Remove-Item -Recurse -Force dist
npm run build
npm run check:ai-secrets -- dist
```

Subir al hosting configurado:

- `BiguAnalytics-Setup-<version>.exe`
- `BiguAnalytics-Setup-<version>.exe.blockmap`
- `latest.yml`

En desarrollo no se intenta actualizar automaticamente salvo `BIGU_UPDATER_DEBUG=true`. Si se usa `dev-app-update.yml`, debe apuntar al mismo provider GitHub publico sin secretos.

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
