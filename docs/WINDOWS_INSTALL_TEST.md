# Windows clean install validation

Estado: checklist reproducible y script de validacion de build agregados el 2026-06-04.

## Build y check

```powershell
npm run build
npm run check:windows-build -- dist/win-unpacked
```

El script valida:

- `BiguAnalytics.exe`
- `resources/app.asar`
- `resources/app.asar.unpacked`
- `resources/icon.ico`
- Puppeteer via `puppeteer-core`
- `ffmpeg-static` y `ffprobe-static` fuera de asar
- preload incluido por config de `src/**/*`
- assets requeridos para icono

## Checklist de instalacion limpia

1. Ejecutar `BiguAnalytics-Setup-1.0.0.exe` en una cuenta Windows sin repo ni Node instalados.
2. Confirmar que abre desde acceso directo de escritorio y menu inicio.
3. Crear partido, cargar MP4 local, tagear un evento y cerrar la app.
4. Confirmar datos en AppData (`%APPDATA%\BiguAnalytics\data`), no en `Program Files`.
5. Exportar PDF y verificar que Puppeteer renderiza portada/header, KPIs, graficos, heatmap, alertas y notas.
6. Exportar un clip MP4 local y confirmar que ffmpeg/ffprobe no dependen de instalacion global.
7. Verificar que preload, estilos y assets cargan sin consola de errores.

## Firma

El build actual usa `signAndEditExecutable: false`. Es instalable sin firma de codigo, pero Windows SmartScreen puede mostrar advertencia hasta configurar certificado y reputacion.
