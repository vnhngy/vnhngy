// Wraps src/app.html (the body-only page published as a claude.ai Artifact) into:
//   index.html             – standalone page you can open in any browser
//   desktop/app/index.html – the page the desktop app loads, with window-chrome tweaks
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const body = readFileSync(new URL('src/app.html', here), 'utf8');

const page = (extraHead = '') => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${extraHead}</head>
<body style="margin:0">
${body}
</body>
</html>
`;

writeFileSync(new URL('index.html', here), page());
console.log('wrote reminders/index.html');

// Desktop: the title bar is hidden on macOS, so the top of the window becomes a drag area
// and the sidebar leaves room for the traffic-light buttons.
const desktopCss = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'none'">
<style>
html.desktop .topbar, html.desktop .brand { -webkit-app-region: drag; }
html.desktop .topbar button, html.desktop .topbar input, html.desktop .topbar select,
html.desktop .topbar .seg, html.desktop .topbar a { -webkit-app-region: no-drag; }
html.platform-darwin .side-scroll { padding-top: 40px; }
html.desktop ::-webkit-scrollbar { width: 10px; height: 10px; }
html.desktop ::-webkit-scrollbar-thumb { background: var(--line); border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
html.desktop ::-webkit-scrollbar-track { background: transparent; }
</style>
`;
mkdirSync(new URL('desktop/app/', here), { recursive: true });
writeFileSync(new URL('desktop/app/index.html', here), page(desktopCss));
console.log('wrote reminders/desktop/app/index.html');
