// Cost telemetry — fire-and-forget spend events to the checkout worker.
//
// Every paid-API call (Ideogram generation, Remove.bg cutout) reports
// {service, count} to the checkout worker's /admin/flyer-spend rail, which
// accumulates a monthly counter in KV and lets the weekly doc-drift watchdog
// alert when the month's estimated spend crosses the cap. Same discipline as
// the SEMrush unit budget: know what a tool costs BEFORE the invoice does.
//
// Fire-and-forget by design — a telemetry failure must never fail a render.

const RAIL_URL = process.env.CHECKOUT_RAIL_URL || 'https://danzversity-checkout.tony-1f5.workers.dev/admin/flyer-spend';
const RAIL_KEY = process.env.CHECKOUT_RAIL_KEY || '';

// node:https via httpz — undici/fetch is broken on Render (standing rule);
// as a fire-and-forget this would have failed silently forever.
const { postJson } = require('./httpz');
function reportSpend(service, count = 1) {
  if (!RAIL_KEY || !count) return;
  postJson(`${RAIL_URL}?key=${encodeURIComponent(RAIL_KEY)}`, { service, count })
    .catch((e) => console.warn('[telemetry] spend report failed (non-fatal):', e && e.message));
}

module.exports = { reportSpend };
