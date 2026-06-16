# IA v1: Analisis post-partido

La IA de BiguAnalytics genera analisis tactico desde datos estructurados del partido. No analiza video, imagenes ni frames.

Proveedor activo: backend propio con Gemini 2.5 Flash-Lite. Electron no configura proveedor directo ni guarda API keys de proveedor.

La arquitectura segura actual esta documentada en [AI_SECURITY.md](AI_SECURITY.md).

Resumen:

- Electron no llama directamente al proveedor IA.
- Renderer usa IPC especifico.
- Main process llama al backend propio con un token de cliente revocable.
- El backend aplica autorizacion, rate limits, limites de input y prompts controlados.
- La API key del proveedor (`GEMINI_API_KEY`) existe solo en el entorno del backend.

Cache local:

```text
data/{matchId}/ai-analysis.json
data/{matchId}/ai-analysis-history/
```

La app sigue funcionando sin una API key local. La IA funciona cuando el backend esta configurado y el token del cliente esta autorizado.
