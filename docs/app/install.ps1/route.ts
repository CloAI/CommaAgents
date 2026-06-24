import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const installScriptPath = resolve(
  process.cwd(),
  '../packages/cli/install/install.ps1',
);

export const dynamic = 'force-static';

export async function GET() {
  const script = await readFile(installScriptPath, 'utf8');

  return new Response(script, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
