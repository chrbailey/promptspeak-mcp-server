#!/usr/bin/env node
/**
 * PromptSpeak HTTP Server
 *
 * Lightweight Hono server that exposes the governance hold queue
 * via REST API + static UI. Runs alongside the MCP stdio server
 * as a separate process, sharing the same SQLite DB (WAL mode).
 *
 * Endpoints:
 *   GET  /                   — Holds approval UI
 *   ALL  /mcp                — MCP protocol (Streamable HTTP)
 *   GET  /api/holds          — List pending holds
 *   GET  /api/holds/stats    — Hold statistics
 *   GET  /api/holds/:id      — Get single hold
 *   POST /api/holds/:id/approve — Approve a hold
 *   POST /api/holds/:id/reject  — Reject a hold
 *   GET  /api/breakers       — List circuit breaker states
 *   GET  /api/audit          — Recent audit log entries
 *   GET  /api/health         — Health check
 *
 * Auth: Set PS_API_KEYS (comma-separated) to require Bearer tokens on /api/* and /mcp.
 * Webhooks: Set PS_WEBHOOK_URL to receive Slack-format notifications on hold decisions.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import path from 'path';
import { fileURLToPath } from 'url';
import { GovernanceDatabase } from './persistence/database.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from './server-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════════════════

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'governance.db');
const db = new GovernanceDatabase(dbPath);

// ═══════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════

const app = new Hono();

app.use('*', cors());

// ─── Auth Middleware ─────────────────────────────────────────────────────
// Skip if PS_API_KEYS not set (local dev mode = open access)

app.use('/api/*', async (c, next) => {
  const keys = process.env.PS_API_KEYS;
  if (!keys) return next();
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Missing Authorization header' }, 401);
  const validKeys = keys.split(',').map(k => k.trim());
  if (!validKeys.includes(auth.slice(7))) return c.json({ error: 'Invalid API key' }, 401);
  return next();
});

app.use('/mcp', async (c, next) => {
  const keys = process.env.PS_API_KEYS;
  if (!keys) return next();
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Missing Authorization header' }, 401);
  const validKeys = keys.split(',').map(k => k.trim());
  if (!validKeys.includes(auth.slice(7))) return c.json({ error: 'Invalid API key' }, 401);
  return next();
});

// ─── Webhook Dispatcher ─────────────────────────────────────────────────
// Fire on hold creation/decisions. Set PS_WEBHOOK_URL to enable.

async function notifyWebhook(event: string, hold: Record<string, unknown>): Promise<void> {
  const url = process.env.PS_WEBHOOK_URL;
  if (!url) return;
  const payload = {
    text: `Hold ${event}: ${hold.severity} — ${String(hold.reason || '').replace(/_/g, ' ')}`,
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Hold ${hold.holdId}* (${event})\n*Severity:* ${hold.severity}\n*Agent:* ${hold.agentId}\n*Tool:* ${hold.tool}\n*Reason:* ${String(hold.reason || '').replace(/_/g, ' ')}`,
      },
    }],
  };
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('Webhook failed:', e);
  }
}

// ─── Health ──────────────────────────────────────────────────────────────

app.get('/api/health', (c) => {
  const pending = db.getPendingHolds();
  const breakers = db.getAllCircuitBreakers();
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    pendingHolds: pending.length,
    circuitBreakers: breakers.length,
  });
});

// ─── Holds ───────────────────────────────────────────────────────────────

app.get('/api/holds', (c) => {
  const pending = db.getPendingHolds();
  return c.json({ holds: pending, count: pending.length });
});

app.get('/api/holds/stats', (c) => {
  const pending = db.getPendingHolds();
  const decisions = db.getDecisions(1000);

  const byReason: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const hold of pending) {
    byReason[hold.reason] = (byReason[hold.reason] || 0) + 1;
    bySeverity[hold.severity] = (bySeverity[hold.severity] || 0) + 1;
  }

  return c.json({
    pending: pending.length,
    approved: decisions.filter(d => d.state === 'approved').length,
    rejected: decisions.filter(d => d.state === 'rejected').length,
    expired: decisions.filter(d => d.state === 'expired').length,
    byReason,
    bySeverity,
  });
});

app.get('/api/holds/:id', (c) => {
  const hold = db.getHold(c.req.param('id'));
  if (!hold) return c.json({ error: 'Hold not found' }, 404);
  const decisions = db.getDecisionsByHold(c.req.param('id'));
  return c.json({ hold, decisions });
});

app.post('/api/holds/:id/approve', async (c) => {
  const holdId = c.req.param('id');
  const hold = db.getHold(holdId);
  if (!hold) return c.json({ error: 'Hold not found' }, 404);
  if (hold.state !== 'pending') return c.json({ error: `Hold is already ${hold.state}` }, 400);

  const body = await c.req.json().catch(() => ({}));
  const reason = (body as Record<string, string>).reason || 'Approved via Ops Center';

  db.updateHoldState(holdId, 'approved');
  db.saveDecision({
    holdId,
    state: 'approved',
    decidedBy: 'human',
    decidedAt: Date.now(),
    reason,
  });
  db.saveAuditEntry({
    timestamp: Date.now(),
    action: 'hold_approved',
    actor: 'ops-center',
    details: { holdId, reason },
  });

  notifyWebhook('approved', hold as unknown as Record<string, unknown>).catch(() => {});
  return c.json({ success: true, holdId, state: 'approved' });
});

app.post('/api/holds/:id/reject', async (c) => {
  const holdId = c.req.param('id');
  const hold = db.getHold(holdId);
  if (!hold) return c.json({ error: 'Hold not found' }, 404);
  if (hold.state !== 'pending') return c.json({ error: `Hold is already ${hold.state}` }, 400);

  const body = await c.req.json().catch(() => ({}));
  const reason = (body as Record<string, string>).reason || 'Rejected via Ops Center';

  db.updateHoldState(holdId, 'rejected');
  db.saveDecision({
    holdId,
    state: 'rejected',
    decidedBy: 'human',
    decidedAt: Date.now(),
    reason,
  });
  db.saveAuditEntry({
    timestamp: Date.now(),
    action: 'hold_rejected',
    actor: 'ops-center',
    details: { holdId, reason },
  });

  notifyWebhook('rejected', hold as unknown as Record<string, unknown>).catch(() => {});
  return c.json({ success: true, holdId, state: 'rejected' });
});

// ─── Circuit Breakers ────────────────────────────────────────────────────

app.get('/api/breakers', (c) => {
  const breakers = db.getAllCircuitBreakers();
  return c.json({ breakers, count: breakers.length });
});

// ─── Audit Log ───────────────────────────────────────────────────────────

app.get('/api/audit', (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const entries = db.getAuditEntries(Math.min(limit, 500));
  return c.json({ entries, count: entries.length });
});

// ─── Root: Serve holds UI ────────────────────────────────────────────────

app.get('/', (c) => {
  return c.html(holdsPage());
});

// ═══════════════════════════════════════════════════════════════════════════
// HOLDS UI (inline — single file, no build step)
// All DB values are HTML-escaped before rendering via esc().
// ═══════════════════════════════════════════════════════════════════════════

function holdsPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PromptSpeak Hold Queue</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes pulse-border { 0%,100% { border-color: #ef4444; } 50% { border-color: #fca5a5; } }
    .pulse-critical { animation: pulse-border 2s ease-in-out infinite; }
  </style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen font-mono">
  <header class="border-b border-gray-800 px-6 py-4">
    <div class="flex justify-between items-center max-w-6xl mx-auto">
      <div>
        <h1 class="text-xl font-bold tracking-tight">\u039E PromptSpeak <span class="text-gray-500">Hold Queue</span></h1>
      </div>
      <div class="flex items-center gap-3">
        <span id="status-badge" class="px-2 py-1 text-xs rounded bg-gray-800">connecting...</span>
        <button onclick="refresh()" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm">Refresh</button>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-6 py-6">
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <p class="text-xs text-gray-500 uppercase">Pending</p>
        <p id="stat-pending" class="text-3xl font-bold text-yellow-400">-</p>
      </div>
      <div class="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <p class="text-xs text-gray-500 uppercase">Approved</p>
        <p id="stat-approved" class="text-3xl font-bold text-green-400">-</p>
      </div>
      <div class="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <p class="text-xs text-gray-500 uppercase">Rejected</p>
        <p id="stat-rejected" class="text-3xl font-bold text-red-400">-</p>
      </div>
      <div class="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <p class="text-xs text-gray-500 uppercase">Expired</p>
        <p id="stat-expired" class="text-3xl font-bold text-gray-500">-</p>
      </div>
    </div>

    <div id="hold-list" class="space-y-3">
      <p class="text-gray-500 text-center py-8">Loading holds...</p>
    </div>

    <div id="empty-state" class="hidden text-center py-16">
      <p class="text-gray-600 text-lg">No pending holds</p>
      <p class="text-gray-700 text-sm mt-1">Governance pipeline is clear</p>
    </div>

    <div class="mt-8">
      <h2 class="text-sm text-gray-500 uppercase tracking-wider mb-3">Recent Decisions</h2>
      <div id="decision-list" class="space-y-2">
        <p class="text-gray-600 text-sm">Loading...</p>
      </div>
    </div>
  </main>

  <script>
    const API = window.location.origin + '/api';
    let pollInterval;

    function esc(s) {
      if (!s) return '';
      const d = document.createElement('div');
      d.textContent = String(s);
      return d.innerHTML;
    }

    async function refresh() {
      try {
        const [holdsRes, statsRes, auditRes] = await Promise.all([
          fetch(API + '/holds').then(r => r.json()),
          fetch(API + '/holds/stats').then(r => r.json()),
          fetch(API + '/audit?limit=20').then(r => r.json()),
        ]);

        document.getElementById('stat-pending').textContent = statsRes.pending;
        document.getElementById('stat-approved').textContent = statsRes.approved;
        document.getElementById('stat-rejected').textContent = statsRes.rejected;
        document.getElementById('stat-expired').textContent = statsRes.expired;

        const badge = document.getElementById('status-badge');
        badge.textContent = 'connected';
        badge.className = 'px-2 py-1 text-xs rounded bg-green-900 text-green-300';

        const holdList = document.getElementById('hold-list');
        const emptyState = document.getElementById('empty-state');

        if (holdsRes.holds.length === 0) {
          holdList.classList.add('hidden');
          emptyState.classList.remove('hidden');
        } else {
          holdList.classList.remove('hidden');
          emptyState.classList.add('hidden');
          holdList.replaceChildren();
          holdsRes.holds.forEach(function(hold) {
            holdList.appendChild(buildHoldCard(hold));
          });
        }

        const decisionList = document.getElementById('decision-list');
        const holdDecisions = auditRes.entries.filter(function(e) {
          return e.action === 'hold_approved' || e.action === 'hold_rejected';
        });
        decisionList.replaceChildren();
        if (holdDecisions.length === 0) {
          const p = document.createElement('p');
          p.className = 'text-gray-600 text-sm';
          p.textContent = 'No recent decisions';
          decisionList.appendChild(p);
        } else {
          holdDecisions.slice(0, 10).forEach(function(entry) {
            decisionList.appendChild(buildDecisionRow(entry));
          });
        }
      } catch (err) {
        const badge = document.getElementById('status-badge');
        badge.textContent = 'disconnected';
        badge.className = 'px-2 py-1 text-xs rounded bg-red-900 text-red-300';
      }
    }

    function buildHoldCard(hold) {
      const age = Math.round((Date.now() - hold.createdAt) / 60000);
      const ageStr = age < 60 ? age + 'm' : Math.round(age / 60) + 'h';
      const severityBorder = {
        critical: 'border-red-500 pulse-critical',
        high: 'border-orange-500',
        medium: 'border-yellow-500',
        low: 'border-gray-600',
      };
      const severityBadge = {
        critical: 'bg-red-900 text-red-300',
        high: 'bg-orange-900 text-orange-300',
        medium: 'bg-yellow-900 text-yellow-300',
        low: 'bg-gray-800 text-gray-400',
      };

      const card = document.createElement('div');
      card.className = 'bg-gray-900 rounded-lg border-l-4 p-4 ' + (severityBorder[hold.severity] || 'border-gray-700');

      const row = document.createElement('div');
      row.className = 'flex justify-between items-start';

      const info = document.createElement('div');
      info.className = 'flex-1';

      const badges = document.createElement('div');
      badges.className = 'flex items-center gap-2 mb-1';

      const sevSpan = document.createElement('span');
      sevSpan.className = 'px-2 py-0.5 rounded text-xs ' + (severityBadge[hold.severity] || 'bg-gray-800');
      sevSpan.textContent = hold.severity;
      badges.appendChild(sevSpan);

      const reasonSpan = document.createElement('span');
      reasonSpan.className = 'text-xs text-gray-500';
      reasonSpan.textContent = hold.reason.replace(/_/g, ' ');
      badges.appendChild(reasonSpan);

      const ageSpan = document.createElement('span');
      ageSpan.className = 'text-xs text-gray-600';
      ageSpan.textContent = ageStr + ' ago';
      badges.appendChild(ageSpan);

      info.appendChild(badges);

      const detail = document.createElement('p');
      detail.className = 'text-sm';
      detail.innerHTML =
        '<span class="text-gray-400">agent:</span> ' + esc(hold.agentId) +
        ' <span class="text-gray-600">\\u2022</span> ' +
        '<span class="text-gray-400">tool:</span> ' + esc(hold.tool) +
        ' <span class="text-gray-600">\\u2022</span> ' +
        '<span class="text-gray-400">frame:</span> <span class="text-blue-400">' + esc(hold.frame) + '</span>';
      info.appendChild(detail);

      if (hold.evidence && Object.keys(hold.evidence).length > 0) {
        const details = document.createElement('details');
        details.className = 'mt-2';
        const summary = document.createElement('summary');
        summary.className = 'text-xs text-gray-500 cursor-pointer';
        summary.textContent = 'evidence';
        const pre = document.createElement('pre');
        pre.className = 'mt-1 text-xs text-gray-600 overflow-x-auto';
        pre.textContent = JSON.stringify(hold.evidence, null, 2);
        details.appendChild(summary);
        details.appendChild(pre);
        info.appendChild(details);
      }

      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'flex gap-2 ml-4';

      const approveBtn = document.createElement('button');
      approveBtn.className = 'px-3 py-1.5 bg-green-800 hover:bg-green-700 text-green-100 rounded text-sm';
      approveBtn.textContent = 'Approve';
      approveBtn.addEventListener('click', function() { approveHold(hold.holdId); });

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-100 rounded text-sm';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', function() { rejectHold(hold.holdId); });

      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      row.appendChild(actions);
      card.appendChild(row);
      return card;
    }

    function buildDecisionRow(entry) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const isApprove = entry.action === 'hold_approved';
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3 text-sm';

      const icon = document.createElement('span');
      icon.className = isApprove ? 'text-green-500' : 'text-red-500';
      icon.textContent = isApprove ? '\\u2713' : '\\u2717';
      row.appendChild(icon);

      const timeSpan = document.createElement('span');
      timeSpan.className = 'text-gray-500';
      timeSpan.textContent = time;
      row.appendChild(timeSpan);

      const idSpan = document.createElement('span');
      idSpan.className = 'text-gray-400';
      idSpan.textContent = (entry.details.holdId || 'unknown').slice(0, 16) + '...';
      row.appendChild(idSpan);

      const reasonSpan = document.createElement('span');
      reasonSpan.className = 'text-gray-600';
      reasonSpan.textContent = entry.details.reason || '';
      row.appendChild(reasonSpan);

      return row;
    }

    async function approveHold(holdId) {
      const reason = prompt('Approval reason (optional):') || 'Approved via Ops Center';
      await fetch(API + '/holds/' + holdId + '/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason }),
      });
      refresh();
    }

    async function rejectHold(holdId) {
      const reason = prompt('Rejection reason (optional):') || 'Rejected via Ops Center';
      await fetch(API + '/holds/' + holdId + '/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason }),
      });
      refresh();
    }

    refresh();
    pollInterval = setInterval(refresh, 5000);
  </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MCP HTTP TRANSPORT
// ═══════════════════════════════════════════════════════════════════════════

const mcpTransport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // stateless
});

app.all('/mcp', async (c) => {
  return mcpTransport.handleRequest(c.req.raw);
});

// ═══════════════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '3000', 10);

async function start() {
  const mcpServer = await createMcpServer();
  await mcpServer.connect(mcpTransport);

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`\n  PromptSpeak Ops Center`);
    console.log(`  http://localhost:${info.port}\n`);
    console.log(`  Endpoints:`);
    console.log(`    GET  /              \u2014 Hold approval UI`);
    console.log(`    ALL  /mcp           \u2014 MCP protocol (Streamable HTTP)`);
    console.log(`    GET  /api/holds     \u2014 List pending holds`);
    console.log(`    GET  /api/holds/stats`);
    console.log(`    POST /api/holds/:id/approve`);
    console.log(`    POST /api/holds/:id/reject`);
    console.log(`    GET  /api/breakers  \u2014 Circuit breaker states`);
    console.log(`    GET  /api/audit     \u2014 Audit log`);
    console.log(`    GET  /api/health\n`);
    console.log(`  Auth: ${process.env.PS_API_KEYS ? 'enabled (PS_API_KEYS)' : 'disabled (open access)'}`);
    console.log(`  Webhook: ${process.env.PS_WEBHOOK_URL ? 'enabled' : 'disabled'}`);
    console.log(`  DB: ${dbPath}\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });
