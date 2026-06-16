// @ts-check
const { createAIBackendApp } = require('./app');
const { getAIBackendListenConfig } = require('./listen-config');

const { host, port } = getAIBackendListenConfig(process.env);
const app = createAIBackendApp();

app.listen(port, host, () => {
  console.info(JSON.stringify({
    at: new Date().toISOString(),
    service: 'biguanalytics-ai',
    host,
    port,
    ok: true,
  }));
});
