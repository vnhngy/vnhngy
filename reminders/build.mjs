// Wraps src/app.html (the body-only page published as a claude.ai Artifact)
// into a standalone index.html you can open directly in any browser.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const body = readFileSync(new URL('src/app.html', here), 'utf8');
writeFileSync(new URL('index.html', here), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
</head>
<body style="margin:0">
${body}
</body>
</html>
`);
console.log('wrote reminders/index.html');
