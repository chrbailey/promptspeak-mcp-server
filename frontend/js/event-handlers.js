/**
 * UI Event Handlers
 *
 * Handles real-time updates from WebSocket and updates UI accordingly.
 * Works with the API client to provide reactive UI updates.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// UI UPDATE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format timestamp for display.
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) {
    return 'just now';
  } else if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Format compromise score as percentage.
 */
function formatCompromiseScore(score) {
  return `${(score * 100).toFixed(1)}%`;
}

/**
 * Get status badge HTML.
 */
function getStatusBadge(status) {
  const colors = {
    online: 'bg-green-500',
    offline: 'bg-gray-500',
    paused: 'bg-yellow-500',
    decoy: 'bg-purple-500',
    burned: 'bg-red-500',
    compromised: 'bg-red-700',
    active: 'bg-green-500',
    completed: 'bg-blue-500',
    failed: 'bg-red-500',
    draft: 'bg-gray-400',
  };

  const color = colors[status] || 'bg-gray-500';
  return `<span class="px-2 py-1 text-xs font-medium text-white rounded-full ${color}">${status}</span>`;
}

/**
 * Get compromise indicator color.
 */
function getCompromiseColor(score) {
  if (score >= 0.75) return 'text-red-600';
  if (score >= 0.50) return 'text-orange-500';
  if (score >= 0.25) return 'text-yellow-500';
  return 'text-green-500';
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPS-CENTER HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

const opsCenterHandlers = {
  /**
   * Initialize ops-center UI.
   */
  async init() {
    const { agents, eventStream } = window.PromptSpeakAPI;

    // Load initial roster
    await this.refreshRoster();

    // Connect to WebSocket
    try {
      await eventStream.connect();

      // Subscribe to agent events
      eventStream.subscribe(['agent_status', 'threat']);

      // Handle real-time updates
      eventStream.on('agent_status', (event) => {
        this.handleAgentStatusUpdate(event.data);
      });

      eventStream.on('threat', (event) => {
        this.handleThreatAlert(event.data);
      });

      console.log('Ops-center connected to event stream');
    } catch (error) {
      console.error('Failed to connect to event stream', error);
    }

    // Refresh periodically
    setInterval(() => this.refreshRoster(), 30000);
  },

  /**
   * Refresh agent roster.
   */
  async refreshRoster() {
    const { agents } = window.PromptSpeakAPI;

    try {
      const result = await agents.getRoster({ includeOffline: true });
      this.updateRosterUI(result.data);
      this.updateStatsUI(await agents.getStats());
    } catch (error) {
      console.error('Failed to refresh roster', error);
    }
  },

  /**
   * Update roster UI.
   */
  updateRosterUI(roster) {
    const container = document.getElementById('agent-roster');
    if (!container) return;

    if (roster.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-8">No agents registered</p>';
      return;
    }

    container.innerHTML = roster.map(agent => `
      <div class="agent-card p-4 border rounded-lg mb-2 hover:bg-gray-50 cursor-pointer"
           data-agent-id="${agent.agentId}"
           onclick="opsCenterHandlers.selectAgent('${agent.agentId}')">
        <div class="flex justify-between items-start">
          <div>
            <h4 class="font-medium">${agent.name}</h4>
            <p class="text-sm text-gray-500">${agent.agentId}</p>
          </div>
          <div class="text-right">
            ${getStatusBadge(agent.status)}
            <p class="text-xs text-gray-400 mt-1">${formatTimestamp(agent.lastHeartbeatAt || agent.createdAt)}</p>
          </div>
        </div>
        <div class="mt-2 flex items-center gap-4 text-sm">
          <span class="${getCompromiseColor(agent.compromiseScore)}">
            Compromise: ${formatCompromiseScore(agent.compromiseScore)}
          </span>
          ${agent.currentFrame ? '<span class="text-blue-500">Frame: v' + agent.frameVersion + '</span>' : ''}
        </div>
      </div>
    `).join('');
  },

  /**
   * Update stats UI.
   */
  updateStatsUI(stats) {
    const elements = {
      'stat-total': stats.data?.total ?? 0,
      'stat-online': stats.data?.online ?? 0,
      'stat-offline': stats.data?.offline ?? 0,
      'stat-paused': stats.data?.paused ?? 0,
      'stat-compromised': stats.data?.compromised ?? 0,
      'stat-avg-compromise': formatCompromiseScore(stats.data?.avgCompromiseScore ?? 0),
      'stat-active-threats': stats.data?.threatAlerts?.active ?? 0,
      'stat-critical-threats': stats.data?.threatAlerts?.critical ?? 0,
    };

    for (const [id, value] of Object.entries(elements)) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
  },

  /**
   * Handle real-time agent status update.
   */
  handleAgentStatusUpdate(data) {
    console.log('Agent status update:', data);

    // Update the specific agent card
    const card = document.querySelector(`[data-agent-id="${data.agentId}"]`);
    if (card) {
      // Highlight the card briefly
      card.classList.add('ring-2', 'ring-blue-500');
      setTimeout(() => {
        card.classList.remove('ring-2', 'ring-blue-500');
      }, 2000);
    }

    // Refresh full roster to get updated data
    this.refreshRoster();
  },

  /**
   * Handle threat alert.
   */
  handleThreatAlert(data) {
    console.log('Threat alert:', data);

    // Show notification
    this.showNotification(`Threat detected: ${data.threatType}`, 'warning');

    // Refresh roster
    this.refreshRoster();
  },

  /**
   * Select an agent for detailed view.
   */
  async selectAgent(agentId) {
    const { agents } = window.PromptSpeakAPI;

    try {
      const result = await agents.get(agentId);
      this.showAgentDetails(result.data);
    } catch (error) {
      console.error('Failed to get agent details', error);
    }
  },

  /**
   * Show agent details panel.
   */
  showAgentDetails(agent) {
    const panel = document.getElementById('agent-details');
    if (!panel) return;

    panel.innerHTML = `
      <div class="p-4">
        <h3 class="text-lg font-bold">${agent.name}</h3>
        <p class="text-sm text-gray-500">${agent.agentId}</p>

        <div class="mt-4 space-y-2">
          <p><strong>Status:</strong> ${getStatusBadge(agent.status)}</p>
          <p><strong>Type:</strong> ${agent.agentType}</p>
          <p><strong>Compromise Score:</strong>
            <span class="${getCompromiseColor(agent.compromiseScore)}">${formatCompromiseScore(agent.compromiseScore)}</span>
          </p>
          <p><strong>Last Heartbeat:</strong> ${formatTimestamp(agent.lastHeartbeatAt)}</p>
          <p><strong>Frame Version:</strong> ${agent.frameVersion}</p>
          <p><strong>Active Tasks:</strong> ${agent.activeTasks}</p>
        </div>

        <div class="mt-6 space-x-2">
          <button onclick="opsCenterHandlers.pauseAgent('${agent.agentId}')"
                  class="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600">
            Pause
          </button>
          <button onclick="opsCenterHandlers.setDecoy('${agent.agentId}')"
                  class="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600">
            Decoy
          </button>
          <button onclick="opsCenterHandlers.burnAgent('${agent.agentId}')"
                  class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600">
            Burn
          </button>
        </div>
      </div>
    `;

    panel.classList.remove('hidden');
  },

  /**
   * Pause an agent.
   */
  async pauseAgent(agentId) {
    const { agents } = window.PromptSpeakAPI;
    const reason = prompt('Reason for pausing:');
    if (!reason) return;

    try {
      await agents.pause(agentId, reason);
      this.showNotification('Agent paused', 'success');
      this.refreshRoster();
    } catch (error) {
      this.showNotification(`Failed to pause: ${error.message}`, 'error');
    }
  },

  /**
   * Set agent as decoy.
   */
  async setDecoy(agentId) {
    const { agents } = window.PromptSpeakAPI;
    const reason = prompt('Reason for setting as decoy:');
    if (!reason) return;

    try {
      await agents.setDecoy(agentId, reason);
      this.showNotification('Agent set as decoy', 'success');
      this.refreshRoster();
    } catch (error) {
      this.showNotification(`Failed: ${error.message}`, 'error');
    }
  },

  /**
   * Burn an agent.
   */
  async burnAgent(agentId) {
    const { agents } = window.PromptSpeakAPI;
    if (!confirm('Are you sure you want to BURN this agent? This is permanent.')) return;

    const reason = prompt('Reason for burning:');
    if (!reason) return;

    try {
      await agents.burn(agentId, reason);
      this.showNotification('Agent burned', 'success');
      this.refreshRoster();
    } catch (error) {
      this.showNotification(`Failed: ${error.message}`, 'error');
    }
  },

  /**
   * Push frame to all agents.
   */
  async pushToAllAgents() {
    const { broadcasts } = window.PromptSpeakAPI;
    const frameInput = document.getElementById('frame-input');
    if (!frameInput) return;

    const frame = frameInput.value.trim();
    if (!frame) {
      this.showNotification('Enter a frame to push', 'warning');
      return;
    }

    try {
      const result = await broadcasts.push(frame);
      this.showNotification(`Pushed to ${result.data.targetCount} agents`, 'success');

      // Show delivery status
      console.log('Broadcast result:', result.data);
    } catch (error) {
      this.showNotification(`Push failed: ${error.message}`, 'error');
    }
  },

  /**
   * Show notification.
   */
  showNotification(message, type = 'info') {
    const container = document.getElementById('notifications') || document.body;

    const colors = {
      info: 'bg-blue-500',
      success: 'bg-green-500',
      warning: 'bg-yellow-500',
      error: 'bg-red-500',
    };

    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-4 py-2 text-white rounded-lg shadow-lg ${colors[type]} animate-fade-in`;
    notification.textContent = message;

    container.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('animate-fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

const dashboardHandlers = {
  /**
   * Initialize dashboard UI.
   */
  async init() {
    const { dashboard, eventStream } = window.PromptSpeakAPI;

    // Load initial data
    await this.refreshMetrics();
    await this.refreshActivity();

    // Connect to WebSocket
    try {
      await eventStream.connect();

      // Handle all events for activity feed
      eventStream.on('*', (event) => {
        this.addActivityItem(event);
      });

      console.log('Dashboard connected to event stream');
    } catch (error) {
      console.error('Failed to connect to event stream', error);
    }

    // Refresh periodically
    setInterval(() => this.refreshMetrics(), 30000);
    setInterval(() => this.refreshActivity(), 60000);
  },

  /**
   * Refresh metrics.
   */
  async refreshMetrics() {
    const { dashboard } = window.PromptSpeakAPI;

    try {
      const result = await dashboard.getMetrics();
      this.updateMetricsUI(result.data);
    } catch (error) {
      console.error('Failed to refresh metrics', error);
    }
  },

  /**
   * Update metrics UI.
   */
  updateMetricsUI(metrics) {
    // Agents
    this.updateStat('agents-online', metrics.agents.online);
    this.updateStat('agents-total', metrics.agents.total);
    this.updateStat('agents-compromised', metrics.agents.compromised);

    // Missions
    this.updateStat('missions-active', metrics.missions.active);
    this.updateStat('missions-completed', metrics.missions.completedToday);
    this.updateStat('missions-failed', metrics.missions.failed);

    // Threats
    this.updateStat('threats-active', metrics.threats.active);
    this.updateStat('threats-critical', metrics.threats.critical);

    // Activity
    this.updateStat('events-24h', metrics.activity.eventsLast24h);
    this.updateStat('heartbeats-5m', metrics.activity.heartbeatsLast5min);
  },

  /**
   * Update a stat element.
   */
  updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  /**
   * Refresh activity feed.
   */
  async refreshActivity() {
    const { dashboard } = window.PromptSpeakAPI;

    try {
      const result = await dashboard.getActivity({ limit: 20 });
      this.updateActivityUI(result.data);
    } catch (error) {
      console.error('Failed to refresh activity', error);
    }
  },

  /**
   * Update activity feed UI.
   */
  updateActivityUI(activities) {
    const container = document.getElementById('activity-feed');
    if (!container) return;

    container.innerHTML = activities.map(item => `
      <div class="activity-item p-3 border-b hover:bg-gray-50">
        <div class="flex items-start gap-3">
          <span class="activity-icon ${this.getActivityIconClass(item.type, item.severity)}">
            ${this.getActivityIcon(item.type)}
          </span>
          <div class="flex-1">
            <p class="text-sm">${item.message}</p>
            <p class="text-xs text-gray-400">${formatTimestamp(item.timestamp)}</p>
          </div>
        </div>
      </div>
    `).join('');
  },

  /**
   * Add item to activity feed (real-time).
   */
  addActivityItem(event) {
    const container = document.getElementById('activity-feed');
    if (!container) return;

    const item = document.createElement('div');
    item.className = 'activity-item p-3 border-b bg-blue-50 animate-fade-in';
    item.innerHTML = `
      <div class="flex items-start gap-3">
        <span class="activity-icon">📌</span>
        <div class="flex-1">
          <p class="text-sm">${event.type}: ${JSON.stringify(event.data).substring(0, 100)}</p>
          <p class="text-xs text-gray-400">${formatTimestamp(event.timestamp)}</p>
        </div>
      </div>
    `;

    container.insertBefore(item, container.firstChild);

    // Remove highlight after a moment
    setTimeout(() => {
      item.classList.remove('bg-blue-50');
    }, 3000);
  },

  /**
   * Get activity icon.
   */
  getActivityIcon(type) {
    const icons = {
      agent: '🤖',
      mission: '🎯',
      threat: '⚠️',
      system: '⚙️',
    };
    return icons[type] || '📋';
  },

  /**
   * Get activity icon class.
   */
  getActivityIconClass(type, severity) {
    if (severity === 'critical') return 'text-red-600';
    if (severity === 'error') return 'text-orange-500';
    if (severity === 'warning') return 'text-yellow-500';
    return 'text-gray-500';
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPOSE TO GLOBAL SCOPE
// ═══════════════════════════════════════════════════════════════════════════════

window.opsCenterHandlers = opsCenterHandlers;
window.dashboardHandlers = dashboardHandlers;
window.formatTimestamp = formatTimestamp;
window.formatCompromiseScore = formatCompromiseScore;
window.getStatusBadge = getStatusBadge;
window.getCompromiseColor = getCompromiseColor;
