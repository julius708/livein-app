import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const finite = n => typeof n === 'number' && Number.isFinite(n);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = x => x && typeof x === 'object' && !Array.isArray(x);
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const https = s => { try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };

// Whitelist public listing fields and modeled results. Never forward the source
// bundle's internal portfolio_context, client records or arbitrary top-level data.
export function prepareFeed(bundle, now = new Date()) {
  requireThat(plain(bundle) && bundle.schema_version === 'livein-investment-research-1', 'Unsupported research schema');
  requireThat(validDate(bundle.checked_on) && typeof bundle.batch_id === 'string' && bundle.batch_id.length > 0 && bundle.batch_id.length <= 100, 'Missing batch identity/date');
  requireThat(Array.isArray(bundle.properties) && bundle.properties.length <= 1000, 'Invalid properties array');
  const today = now.toISOString().slice(0, 10);
  requireThat(bundle.checked_on <= today, 'Future check date');
  requireThat((Date.parse(today) - Date.parse(bundle.checked_on)) / 86400000 <= 7, 'Research batch is older than seven days');
  const ids = new Set();
  const listings = bundle.properties.map(p => {
    requireThat(plain(p) && typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 150 && !ids.has(p.id), 'Missing/duplicate listing ID'); ids.add(p.id);
    requireThat(https(p.source_url) && typeof p.source_listing_id === 'string' && p.source_listing_id.length > 0, 'Invalid listing source');
    requireThat(validDate(p.source_checked_on) && p.source_checked_on <= bundle.checked_on, 'Invalid source check date');
    const availability = ['listing_visible_seller_unconfirmed', 'seller_confirmed_available', 'reserved', 'sold', 'withdrawn', 'unknown'];
    requireThat(availability.includes(p.availability), 'Unknown availability');
    requireThat(p.seller_confirmed_on === null || validDate(p.seller_confirmed_on) && p.seller_confirmed_on <= bundle.checked_on, 'Invalid seller confirmation');
    requireThat(p.availability !== 'seller_confirmed_available' || p.seller_confirmed_on !== null, 'Seller availability requires evidence date');
    requireThat(plain(p.observed) && finite(p.observed.asking_price_eur) && p.observed.asking_price_eur > 0, 'Invalid asking price');
    for (const k of ['interior_area_m2', 'exterior_area_m2', 'cellar_area_m2', 'reported_monthly_costs_eur', 'commission_eur']) requireThat(p.observed[k] === null || finite(p.observed[k]) && p.observed[k] >= 0, `Invalid/missing nullable ${k}`);
    requireThat(plain(p.model) && finite(p.model.total_investment_eur) && p.model.total_investment_eur >= p.observed.asking_price_eur, 'Invalid total investment');
    const short = p.model.short_term, long = p.model.long_term;
    requireThat(plain(short) && plain(long), 'Both STR and LTR models required');
    const selectResults = model => {
      requireThat(Array.isArray(model.results) && model.results.length === 3 && new Set(model.results.map(r => r.scenario)).size === 3, 'Three unique scenarios required');
      return ['conservative', 'base', 'optimistic'].map(s => {
        const r = model.results.find(r => r.scenario === s);
        requireThat(r && finite(r.annual_net_before_finance_tax_eur) && finite(r.net_yield_pct), 'Invalid scenario result');
        requireThat(Math.abs(r.net_yield_pct - r.annual_net_before_finance_tax_eur / p.model.total_investment_eur * 100) <= .011, 'Yield does not reconcile');
        return { scenario: s, annual_net_before_finance_tax_eur: r.annual_net_before_finance_tax_eur, net_yield_pct: r.net_yield_pct, adr_eur: finite(r.adr_eur) ? r.adr_eur : null, occupancy_pct: finite(r.occupancy_pct) ? r.occupancy_pct : null };
      });
    };
    return {
      external_id: p.id, source_url: p.source_url, source_listing_id: p.source_listing_id,
      city: String(p.city || ''), district: String(p.district || ''), title: String(p.name || ''),
      source_checked_on: p.source_checked_on, seller_confirmed_on: p.seller_confirmed_on,
      availability: p.availability, currency: 'EUR',
      observed: Object.fromEntries(['asking_price_eur', 'interior_area_m2', 'exterior_area_m2', 'cellar_area_m2', 'reported_monthly_costs_eur', 'commission_eur', 'commission_basis'].map(k => [k, p.observed[k] ?? null])),
      total_investment_model_eur: p.model.total_investment_eur,
      primary_strategy: 'short_term_livein_management',
      short_term: { status: short.status || 'unverified', location_adr_verified: short.location_adr_verified === true, legality_verified: short.legality_verified === true, scenarios: selectResults(short) },
      long_term: { status: 'comparison_working_model', scenarios: selectResults(long) },
      // Untrusted imported results cannot approve an investment or trigger a sale.
      investment_approved: false, client_offer_eligible: false, import_state: 'needs_review'
    };
  });
  const data = { schema_version: 'livein-investment-feed-1', batch_id: bundle.batch_id, checked_on: bundle.checked_on, primary_strategy: 'short_term_livein_management', listings };
  return { ...data, digest: hash(data) };
}

export function validateReceipt(feed, receipt) {
  requireThat(plain(receipt) && receipt.status === 'accepted' && receipt.batch_id === feed.batch_id && receipt.digest === feed.digest, 'App did not acknowledge the exact batch');
  const expected = feed.listings.map(p => p.external_id).sort();
  requireThat(Array.isArray(receipt.accepted_external_ids) && receipt.accepted_external_ids.every(x => typeof x === 'string'), 'Invalid accepted ID list');
  requireThat(JSON.stringify([...receipt.accepted_external_ids].sort()) === JSON.stringify(expected), 'Partial/mismatched app import');
  requireThat(typeof receipt.receipt_id === 'string' && receipt.receipt_id.length > 0, 'Missing app receipt ID');
  return true;
}

export async function publishFeed(feed, config, token, fetcher = fetch) {
  requireThat(config.enabled === true, 'App integration is disabled; queue the batch');
  requireThat(config.contract_version === feed.schema_version && config.endpoint_verified === true, 'Import contract is not verified');
  const u = new URL(config.endpoint);
  requireThat(https(config.endpoint) && u.hostname === 'app.live-in.international' && u.pathname === '/api/investments/import' && !u.port && !u.search && !u.hash, 'Import endpoint is outside the approved app');
  requireThat(typeof token === 'string' && token.length >= 16, 'Missing server import token');
  const response = await fetcher(u.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': feed.digest }, body: JSON.stringify(feed) });
  requireThat(response.ok, `App import returned HTTP ${response.status}`);
  const receipt = await response.json();
  validateReceipt(feed, receipt);
  return receipt;
}

async function atomicJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temp, file);
}

async function main() {
  const [input, directory, configFile] = process.argv.slice(2);
  requireThat(input && directory, 'Usage: node feed.mjs RESEARCH.json OUTPUT_DIRECTORY [integration.json]');
  const feed = prepareFeed(JSON.parse(await readFile(input, 'utf8')));
  const dir = resolve(directory);
  await atomicJson(resolve(dir, 'queue', `${feed.digest}.json`), feed);
  await atomicJson(resolve(dir, 'latest-feed.json'), feed);
  const config = configFile ? JSON.parse(await readFile(configFile, 'utf8')) : { enabled: false };
  let receipt;
  if (config.enabled === true) {
    try { receipt = await publishFeed(feed, config, process.env.LIVEIN_INVESTMENT_IMPORT_TOKEN); }
    catch (error) {
      await atomicJson(resolve(dir, 'publication-status.json'), { status: 'pending', batch_id: feed.batch_id, digest: feed.digest, error: error.message, checked_at: new Date().toISOString() });
      throw error;
    }
    await atomicJson(resolve(dir, 'receipts', `${feed.digest}.json`), receipt);
  }
  await atomicJson(resolve(dir, 'publication-status.json'), { status: receipt ? 'accepted' : 'pending_integration', batch_id: feed.batch_id, digest: feed.digest, receipt_id: receipt?.receipt_id ?? null, checked_at: new Date().toISOString() });
  console.log(JSON.stringify({ status: receipt ? 'accepted' : 'pending_integration', records: feed.listings.length, digest: feed.digest }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
