import { getGovernanceDb } from '../persistence/database.js';
import { broadcastSSE } from './sse.js';
import { getPreSeedScenarios, getDemoRunScenarios } from './scenarios.js';
import type { HoldRequest } from '../types/index.js';

let seeded = false;

function insertHold(hold: HoldRequest): void {
  const db = getGovernanceDb()!;
  db.saveHold(hold);
  db.saveAuditEntry({
    timestamp: Date.now(),
    action: 'hold_created',
    actor: hold.agentId,
    details: { holdId: hold.holdId, tool: hold.tool, reason: hold.reason, severity: hold.severity },
  });
  broadcastSSE('hold:created', hold);
}

export function seedDemoHolds(): void {
  if (seeded) return;
  const db = getGovernanceDb()!;
  const existing = db.getPendingHolds();
  if (existing.length > 0) {
    seeded = true;
    return;
  }
  const holds = getPreSeedScenarios();
  for (const hold of holds) {
    insertHold(hold);
  }
  seeded = true;
  console.log(`  Demo: seeded ${holds.length} Salesforce scenario holds`);
}

export function runDemoScenario(): { status: string; holdCount: number } {
  const holds = getDemoRunScenarios();
  holds.forEach((hold, i) => {
    setTimeout(() => insertHold(hold), (i + 1) * 2500);
  });
  return { status: 'running', holdCount: holds.length };
}
