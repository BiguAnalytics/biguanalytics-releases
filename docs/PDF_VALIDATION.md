# PDF Windows visual validation

Estado: checklist reproducible creado el 2026-06-04 para validar exportaciones PDF en Windows antes de entrega.

## Comando base

```powershell
npm test src/main/modules/__tests__/pdf-export.test.js src/renderer/__tests__/dashboard-print.test.js
```

## Smoke test visual

1. Abrir BiguAnalytics en Windows.
2. Cargar un partido con eventos, zonas, alertas y notas.
3. Ir a Dashboard y exportar PDF.
4. Abrir el PDF generado con el visor predeterminado de Windows.

## Checklist

- Portada/header: logo, equipos, fecha, competencia y licencia visibles.
- KPIs: valores alineados, sin cortes, con tipografia legible.
- graficos: Chart.js renderizado como imagen, sin canvases vacios.
- heatmap: campo completo, zonas e intensidades visibles.
- alertas: indicador rojo y texto legible.
- notas: formato basico preservado y sin overflow.
- paginado: cortes entre secciones sin tapar titulos ni footers.
- Puppeteer: usa `puppeteer-core` con Chromium de Electron y fallback controlado `--no-sandbox`.
- Windows: revisar PDF desde build empaquetado y desde app en desarrollo.

## Resultado

La validacion automatizada cubre payload, renderer de impresion, Chromium de Electron y fallback de sandbox. La inspeccion visual final debe ejecutarse con un PDF real generado desde el build Windows que se entregue al club.
