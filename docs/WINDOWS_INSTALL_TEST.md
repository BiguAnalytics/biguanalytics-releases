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
- PDF via Chromium embebido de Electron y `webContents.printToPDF()`
- `ffmpeg-static` y `ffprobe-static` fuera de asar
- preload incluido por config de `src/**/*`
- assets requeridos para icono

## Checklist de instalacion limpia

1. Ejecutar el instalador versionado `BiguAnalytics-Setup-<version>.exe` en una cuenta Windows sin repo ni Node instalados.
2. Confirmar que abre desde acceso directo de escritorio y menu inicio.
3. Crear partido, cargar MP4 local, tagear un evento y cerrar la app.
4. Confirmar datos en AppData (`%APPDATA%\BiguAnalytics\data`), no en `Program Files`.
5. Exportar PDF y verificar portada/header, KPIs, graficos, heatmap, alertas, notas y logo.
6. Exportar un clip MP4 local y confirmar que ffmpeg/ffprobe no dependen de instalacion global.
7. Verificar que preload, estilos y assets cargan sin consola de errores.

## Firma

El build actual usa `signAndEditExecutable: false`. Es instalable sin firma de codigo, pero Windows SmartScreen puede mostrar advertencia hasta configurar certificado y reputacion.

## Estado de la verificacion actual

El 2026-08-05 `npx electron-builder --win nsis --x64 --publish never` genero correctamente `dist/BiguAnalytics-Setup-1.0.5.exe`. El instalador se valido como archivo autocontenido, se instalo silenciosamente en una carpeta temporal fuera de `dist/win-unpacked` y el ejecutable instalado permanecio activo durante el smoke test de arranque.

La carpeta instalada paso `npm run check:windows-build -- tmp/clean-install-final` y contenia `BiguAnalytics.exe`, `resources/app.asar`, `resources/icon.ico` y `resources/app.asar.unpacked`. La carpeta temporal se elimino despues de la prueba. La ejecucion manual sobre una cuenta nueva del club y la firma de codigo siguen siendo verificaciones operativas separadas.
