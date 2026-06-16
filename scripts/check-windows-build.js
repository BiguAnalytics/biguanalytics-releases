#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const buildDir = path.resolve(projectRoot, process.argv[2] || path.join('dist', 'win-unpacked'));

const requiredPackageFiles = [
  'src/main/main.js',
  'src/main/preload.js',
  'src/renderer/index.html',
  'src/renderer/assets/bigu-logo.svg',
  'build/icon.ico',
];
const requiredAsarFiles = [
  '/src/renderer/assets/bigu-logo.svg',
];

const requiredUnpackedPackages = [
  'ffmpeg-static',
  'ffprobe-static',
];

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

function exists(...segments) {
  return fs.existsSync(path.join(...segments));
}

function findPackageDir(root, packageName) {
  if (!fs.existsSync(root)) return '';
  const direct = path.join(root, packageName);
  if (fs.existsSync(direct)) return direct;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.name === packageName) return fullPath;
      if (entry.name === 'node_modules' || entry.name.startsWith('@')) stack.push(fullPath);
    }
  }
  return '';
}

function loadAsarModule() {
  try {
    return require('@electron/asar');
  } catch {
    try {
      return require('asar');
    } catch {
      return null;
    }
  }
}

function validatePackageConfig(failures) {
  const build = packageJson.build || {};
  const winTargets = Array.isArray(build.win?.target) ? build.win.target : [];
  const targetNames = winTargets.map(target => typeof target === 'string' ? target : target.target);

  assertCondition(targetNames.includes('nsis'), 'electron-builder debe generar target NSIS para Windows.', failures);
  assertCondition(build.win?.signAndEditExecutable === false, 'El build debe desactivar signAndEditExecutable mientras no haya firma configurada.', failures);
  assertCondition(build.nsis?.perMachine === false, 'NSIS debe instalar por usuario para evitar escribir datos en Program Files.', failures);
  assertCondition((build.asarUnpack || []).includes('node_modules/ffmpeg-static/**/*'), 'ffmpeg-static debe quedar fuera de asar.', failures);
  assertCondition((build.asarUnpack || []).includes('node_modules/ffprobe-static/**/*'), 'ffprobe-static debe quedar fuera de asar.', failures);
  assertCondition(Boolean(packageJson.dependencies?.['ffmpeg-static']), 'ffmpeg-static debe estar declarado como dependencia runtime.', failures);
  assertCondition(Boolean(packageJson.dependencies?.['ffprobe-static']), 'ffprobe-static debe estar declarado como dependencia runtime.', failures);
  assertCondition(Boolean(packageJson.devDependencies?.resedit || packageJson.dependencies?.resedit), 'resedit debe estar declarado para el hook afterPack.', failures);

  requiredPackageFiles.forEach((filePath) => {
    assertCondition(exists(projectRoot, filePath), `Falta archivo fuente requerido para packaging: ${filePath}`, failures);
  });
}

function validateBuildOutput(failures) {
  assertCondition(fs.existsSync(buildDir), `No existe la carpeta de build: ${buildDir}`, failures);
  if (!fs.existsSync(buildDir)) return;

  const resourcesDir = path.join(buildDir, 'resources');
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');

  assertCondition(exists(buildDir, 'BiguAnalytics.exe'), 'Falta BiguAnalytics.exe en win-unpacked.', failures);
  assertCondition(exists(resourcesDir, 'app.asar'), 'Falta resources/app.asar.', failures);
  assertCondition(exists(resourcesDir, 'icon.ico'), 'Falta resources/icon.ico.', failures);
  assertCondition(fs.existsSync(unpackedDir), 'Falta resources/app.asar.unpacked.', failures);

  requiredUnpackedPackages.forEach((packageName) => {
    assertCondition(
      Boolean(findPackageDir(path.join(unpackedDir, 'node_modules'), packageName)),
      `Falta ${packageName} en app.asar.unpacked/node_modules.`,
      failures,
    );
  });

  const asarModule = loadAsarModule();
  assertCondition(Boolean(asarModule?.listPackage), 'Falta modulo asar para validar resources/app.asar.', failures);
  if (asarModule?.listPackage) {
    const asarFiles = new Set(asarModule.listPackage(path.join(resourcesDir, 'app.asar')).map(file => file.replaceAll('\\', '/')));
    requiredAsarFiles.forEach((filePath) => {
      assertCondition(asarFiles.has(filePath), `Falta ${filePath} dentro de resources/app.asar.`, failures);
    });
  }
}

function main() {
  const failures = [];
  validatePackageConfig(failures);
  validateBuildOutput(failures);

  if (failures.length > 0) {
    console.error('Windows build validation failed:');
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.info(`Windows build validation passed: ${buildDir}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  findPackageDir,
  loadAsarModule,
  validateBuildOutput,
  validatePackageConfig,
};
