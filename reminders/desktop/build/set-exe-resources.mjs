// afterPack hook: writes Nudge's icon and version info into Nudge.exe.
// This replaces electron-builder's rcedit step, which needs Wine when building on macOS or Linux.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ResEdit from 'resedit';

const here = path.dirname(fileURLToPath(import.meta.url));

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const { productFilename, version, productName } = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);

  const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);

  const icon = ResEdit.Data.IconFile.from(readFileSync(path.join(here, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  for (const group of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icon.icons.map((i) => i.data));
  }

  const [major = 0, minor = 0, patch = 0] = version.split('.').map((n) => parseInt(n, 10) || 0);
  const info = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] ?? ResEdit.Resource.VersionInfo.createEmpty();
  const lang = { lang: 1033, codepage: 1200 };
  info.setFileVersion(major, minor, patch, 0, 1033);
  info.setProductVersion(major, minor, patch, 0, 1033);
  info.setStringValues(lang, {
    ProductName: productName,
    FileDescription: productName,
    CompanyName: 'vnhngy',
    LegalCopyright: `© ${new Date().getFullYear()} vnhngy`,
    OriginalFilename: `${productFilename}.exe`,
    InternalName: productFilename,
    FileVersion: version,
    ProductVersion: version,
  });
  info.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • set icon and version info on ${productFilename}.exe (${groups.length} icon group${groups.length === 1 ? '' : 's'})`);
}
