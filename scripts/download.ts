import { mkdir } from 'fs/promises';
import path from 'path';

const folder = 'external';

const base = 'https://mahjongsoul.game.yo-star.com/';
const fetchMJ = (relativeUrl: string) => fetch(new URL(relativeUrl, base));

async function write(fragment: string, response: Response) {
  const fullPath = path.join(folder, fragment);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await Bun.write(fullPath, await response.clone().arrayBuffer());
}

async function fetchJson(fragment: string, download = false) {
  const response = await fetchMJ(fragment);
  if (download) await write(fragment, response);
  return await response.json();
}

function resolve(resolver: any, fragment: string) {
  const version = resolver.res[fragment].prefix;
  return [version, fragment].join('/');
}

async function downloadResource(resolver: any, fragment: string) {
  const url = resolve(resolver, fragment);
  const response = await fetchMJ(url);
  await write(fragment, response);
  return response;
}

const versionInfo = await fetchJson('version.json', true);
const resolver = await fetchJson(`resversion${versionInfo.version}.json`);

async function downloadConfig(resolver: any) {
  const configResponse = await downloadResource(resolver, 'config.json');
  return await configResponse.json();
}

async function downloadGateway(config: any) {
  const url = new URL(config.ip[0].region_urls[0].url);
  url.searchParams.set('service', 'ws-gateway'); // could be ws-game-gateway as well...
  url.searchParams.set('protocol', 'ws');
  url.searchParams.set('ssl', 'true');
  const serverListResponse = await fetch(url);
  await write('server.json', serverListResponse);
}

const resources = [
  'res/proto/liqi.json',
  'res/proto/config.proto',
  'res/config/lqc.lqbin',
];

await Promise.allSettled(resources.map(downloadResource.bind(null, resolver)));
await downloadConfig(resolver).then(downloadGateway);
