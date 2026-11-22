const names = [
  'aera-market',
  'aera-market-app',
  'aeramarket',
  'aera-market-store',
  'aera-marketplace',
  'aera-market-psi',
  'aera-market-one',
  'aera-market-iota',
  'aera-market-eta',
  'aera-market-zeta',
  'aera-s-store',
  'aera-store',
  'aera-market-deadlyghost90',
  'aera-market-git-main-deadlyghost90',
  'aera-market-deadlyghost90s-projects',
  'aera-market-ochre',
  'aera-market-tau',
  'aera-market-rho',
  'aera-market-sigma',
  'aera-market-delta'
];

async function probe(host) {
  const url = `https://${host}.vercel.app/`;
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const body = res.status === 200 ? await res.text() : '';
    const title = /<title>([^<]*)<\/title>/i.exec(body)?.[1] ?? '';
    return { host, status: res.status, title, ours: /aera market/i.test(title) };
  } catch (error) {
    return { host, status: 'ERR', title: '', ours: false, error: error.cause?.code ?? error.message };
  }
}

const results = await Promise.all(names.map(probe));
let found = false;
for (const result of results) {
  if (result.ours) {
    found = true;
    console.log(`FOUND ${result.host} -> ${result.status} "${result.title}"`);
  } else if (result.status === 200) {
    console.log(`200 but not ours: ${result.host} "${result.title}"`);
  }
}
if (!found) console.log('No match among', names.length, 'candidates.');
