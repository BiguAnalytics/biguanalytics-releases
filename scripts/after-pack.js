const fs = require('node:fs/promises');
const path = require('node:path');
const ResEdit = require('resedit');

function normalizeVersion(version) {
  const parts = String(version)
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part))
    .slice(0, 4);

  while (parts.length < 4) {
    parts.push(0);
  }

  return parts;
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const appInfo = context.packager.appInfo;
  const executablePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico');
  const executable = ResEdit.NtExecutable.from(await fs.readFile(executablePath));
  const resources = ResEdit.NtExecutableResource.from(executable);
  const versionInfo = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0];
  const language = versionInfo?.getAllLanguagesForStringValues()[0] ?? { lang: 1033, codepage: 1200 };
  const iconGroup = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)[0];
  const iconFile = ResEdit.Data.IconFile.from(await fs.readFile(iconPath));
  const [major, minor, patch, build] = normalizeVersion(appInfo.version);

  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    iconGroup?.id ?? 1,
    iconGroup?.lang ?? language.lang,
    iconFile.icons.map((item) => item.data)
  );

  if (versionInfo) {
    versionInfo.setFileVersion(major, minor, patch, build, language.lang);
    versionInfo.setProductVersion(major, minor, patch, build, language.lang);
    versionInfo.setStringValues(language, {
      CompanyName: appInfo.companyName || 'Bigua Rugby Club',
      FileDescription: appInfo.productName,
      InternalName: appInfo.productFilename,
      LegalCopyright: appInfo.copyright || `Copyright ${new Date().getFullYear()} Bigua Rugby Club`,
      OriginalFilename: `${appInfo.productFilename}.exe`,
      ProductName: appInfo.productName,
    });
    versionInfo.outputToResourceEntries(resources.entries);
  }

  resources.outputResource(executable);
  await fs.writeFile(executablePath, Buffer.from(executable.generate()));
};
