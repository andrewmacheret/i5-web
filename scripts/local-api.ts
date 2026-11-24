// Runs the Lambda's API on http://localhost:8787, reading WSDOT from this computer.
//   npm run api                 reads WSDOT's live page
//   npm run api -- --fixture    serves the saved copy in test/fixtures, for working offline
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHandler, type HttpResponse } from '../src/lambda/index.ts';
import { httpGet } from '../src/lambda/refresh.ts';
import { MemoryStore } from '../src/lambda/store.ts';

const PORT = 8787;
const useFixture = process.argv.includes('--fixture');
const download = useFixture
  ? async () => readFileSync(new URL('../test/fixtures/express-lanes-2026-11-18.html', import.meta.url), 'utf8')
  : httpGet;

const handler = createHandler(new MemoryStore(), download);
const state = await handler({ refresh: true });
console.log('Read WSDOT:', 'error' in state && state.error ? state.error : 'ok');
setInterval(() => handler({ refresh: true }), 15 * 60_000);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const out = (await handler({
    rawPath: url.pathname,
    queryStringParameters: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
    requestContext: { http: { method: req.method } },
  })) as HttpResponse;
  res.writeHead(out.statusCode, out.headers).end(out.body);
}).listen(PORT, () => console.log(`API on http://localhost:${PORT}/status`));
