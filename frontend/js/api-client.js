/**
 * PromptSpeak API Client
 *
 * Unified client for REST API and WebSocket connections.
 * Powers all frontend UIs (ops-center, mission-briefing, dashboard).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE = window.API_BASE || 'http://localhost:3000';
const WS_BASE = window.WS_BASE || 'ws://localhost:3000';

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Make an API request.
 */
async function apiRequest(method, endpoint, body = null, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Actor': options.actor || 'frontend',
      ...options.headers,
    },
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error: ${method} ${endpoint}`, error);
    throw error;
  }
}

// Convenience methods
const api = {
  get: (endpoint, options) => apiRequest('GET', endpoint, null, options),
  post: (endpoint, body, options) => apiRequest('POST', endpoint, body, options),
  patch: (endpoint, body, options) => apiRequest('PATCH', endpoint, body, options),
  delete: (endpoint, options) => apiRequest('DELETE', endpoint, null, options),
};

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT RUNTIME API
// ═══════════════════════════════════════════════════════════════════════════════

const agents = {
  /**
   * Get agent roster.
   */
  async getRoster(options = {}) {
    const params = new URLSearchParams();
    if (options.status) params.set('status', Array.isArray(options.status) ? options.status.join(',') : options.status);
    if (options.agentType) params.set('agentType', options.agentType);
    if (options.limit) params.set('limit', options.limit);
    if (options.includeOffline) params.set('includeOffline', 'true');

    const query = params.toString();
    return api.get(`/api/v1/runtime/agents/roster${query ? '?' + query : ''}`);
  },

  /**
   * Get agent stats.
   */
  async getStats() {
    return api.get('/api/v1/runtime/agents/stats');
  },

  /**
   * Get single agent.
   */
  async get(agentId) {
    return api.get(`/api/v1/runtime/agents/${agentId}`);
  },

  /**
   * Send heartbeat.
   */
  async heartbeat(agentId, data = {}) {
    return api.post(`/api/v1/runtime/agents/${agentId}/heartbeat`, data);
  },

  /**
   * Update agent status.
   */
  async setStatus(agentId, status, reason) {
    return api.post(`/api/v1/runtime/agents/${agentId}/status`, { status, reason });
  },

  /**
   * Pause agent.
   */
  async pause(agentId, reason) {
    return api.post(`/api/v1/runtime/agents/${agentId}/pause`, { reason });
  },

  /**
   * Set agent as decoy.
   */
  async setDecoy(agentId, reason) {
    return api.post(`/api/v1/runtime/agents/${agentId}/decoy`, { reason });
  },

  /**
   * Burn agent.
   */
  async burn(agentId, reason) {
    return api.post(`/api/v1/runtime/agents/${agentId}/burn`, { reason });
  },

  /**
   * Get compromise info.
   */
  async getCompromise(agentId) {
    return api.get(`/api/v1/runtime/agents/${agentId}/compromise`);
  },

  /**
   * Recalculate compromise score.
   */
  async recalculateCompromise(agentId) {
    return api.post(`/api/v1/runtime/agents/${agentId}/compromise/recalculate`);
  },

  /**
   * Check for stale agents.
   */
  async checkStale() {
    return api.post('/api/v1/runtime/agents/check-stale');
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MISSION API
// ═══════════════════════════════════════════════════════════════════════════════

const missions = {
  /**
   * List missions.
   */
  async list(options = {}) {
    const params = new URLSearchParams();
    if (options.status) params.set('status', Array.isArray(options.status) ? options.status.join(',') : options.status);
    if (options.missionType) params.set('missionType', options.missionType);
    if (options.limit) params.set('limit', options.limit);

    const query = params.toString();
    return api.get(`/api/v1/missions${query ? '?' + query : ''}`);
  },

  /**
   * Get mission stats.
   */
  async getStats() {
    return api.get('/api/v1/missions/stats');
  },

  /**
   * Get single mission.
   */
  async get(missionId) {
    return api.get(`/api/v1/missions/${missionId}`);
  },

  /**
   * Create mission.
   */
  async create(mission) {
    return api.post('/api/v1/missions', mission);
  },

  /**
   * Update mission.
   */
  async update(missionId, updates) {
    return api.patch(`/api/v1/missions/${missionId}`, updates);
  },

  /**
   * Delete mission.
   */
  async delete(missionId) {
    return api.delete(`/api/v1/missions/${missionId}`);
  },

  /**
   * Validate mission.
   */
  async validate(missionId) {
    return api.post(`/api/v1/missions/${missionId}/validate`);
  },

  /**
   * Deploy mission.
   */
  async deploy(missionId, agentIds, approvedBy) {
    return api.post(`/api/v1/missions/${missionId}/deploy`, { agentIds, approvedBy });
  },

  /**
   * Pause mission.
   */
  async pause(missionId, reason) {
    return api.post(`/api/v1/missions/${missionId}/pause`, { reason });
  },

  /**
   * Resume mission.
   */
  async resume(missionId) {
    return api.post(`/api/v1/missions/${missionId}/resume`);
  },

  /**
   * Complete mission.
   */
  async complete(missionId, summary) {
    return api.post(`/api/v1/missions/${missionId}/complete`, { summary });
  },

  /**
   * Cancel mission.
   */
  async cancel(missionId, reason) {
    return api.post(`/api/v1/missions/${missionId}/cancel`, { reason });
  },

  /**
   * Get mission events.
   */
  async getEvents(missionId, limit) {
    const query = limit ? `?limit=${limit}` : '';
    return api.get(`/api/v1/missions/${missionId}/events${query}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD API
// ═══════════════════════════════════════════════════════════════════════════════

const dashboard = {
  /**
   * Get dashboard metrics.
   */
  async getMetrics() {
    return api.get('/api/v1/dashboard/metrics');
  },

  /**
   * Get activity feed.
   */
  async getActivity(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.types) params.set('types', options.types.join(','));

    const query = params.toString();
    return api.get(`/api/v1/dashboard/activity${query ? '?' + query : ''}`);
  },

  /**
   * Get health status.
   */
  async getHealth() {
    return api.get('/api/v1/dashboard/health');
  },

  /**
   * Get historical metrics.
   */
  async getHistorical(type, options = {}) {
    const params = new URLSearchParams();
    params.set('type', type);
    if (options.granularity) params.set('granularity', options.granularity);
    if (options.since) params.set('since', options.since);
    if (options.limit) params.set('limit', options.limit);

    return api.get(`/api/v1/dashboard/metrics/historical?${params.toString()}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// BROADCAST API
// ═══════════════════════════════════════════════════════════════════════════════

const broadcasts = {
  /**
   * Push frame to all agents.
   */
  async push(frame, options = {}) {
    return api.post('/api/v1/broadcasts/push', {
      frame,
      targetAgents: options.targetAgents,
      priority: options.priority,
      message: options.message,
    });
  },

  /**
   * Push frame to specific agent.
   */
  async pushToAgent(agentId, frame) {
    return api.post(`/api/v1/broadcasts/push/${agentId}`, { frame });
  },

  /**
   * Get broadcast status.
   */
  async getStatus(broadcastId) {
    return api.get(`/api/v1/broadcasts/status/${broadcastId}`);
  },

  /**
   * Get broadcast history.
   */
  async getHistory(limit) {
    const query = limit ? `?limit=${limit}` : '';
    return api.get(`/api/v1/broadcasts/history${query}`);
  },

  /**
   * Get broadcast stats.
   */
  async getStats() {
    return api.get('/api/v1/broadcasts/stats');
  },

  /**
   * Get current frame version.
   */
  async getFrameVersion() {
    return api.get('/api/v1/broadcasts/frame-version');
  },

  /**
   * Get agents needing sync.
   */
  async getAgentsNeedingSync(version) {
    const query = version ? `?version=${version}` : '';
    return api.get(`/api/v1/broadcasts/needs-sync${query}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEBSOCKET CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

class EventStream {
  constructor() {
    this.ws = null;
    this.clientId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.handlers = new Map();
    this.connected = false;
  }

  /**
   * Connect to WebSocket server.
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws/events`);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.connected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error', error);
        reject(error);
      };
    });
  }

  /**
   * Disconnect from WebSocket server.
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * Handle incoming message.
   */
  handleMessage(message) {
    const { type, data, timestamp } = message;

    // Handle system messages
    if (type === 'connected') {
      this.clientId = data.clientId;
      this.emit('connected', data);
      return;
    }

    if (type === 'heartbeat' || type === 'pong') {
      return;
    }

    // Emit to registered handlers
    this.emit(type, { data, timestamp });
    this.emit('*', { type, data, timestamp });
  }

  /**
   * Subscribe to event type.
   */
  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type).add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /**
   * Emit to handlers.
   */
  emit(type, data) {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error('Event handler error', error);
        }
      });
    }
  }

  /**
   * Subscribe to specific event types on server.
   */
  subscribe(eventTypes, agentId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        eventTypes,
        agentId,
      }));
    }
  }

  /**
   * Unsubscribe from event types.
   */
  unsubscribe(eventTypes) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        eventTypes,
      }));
    }
  }

  /**
   * Send ping to keep connection alive.
   */
  ping() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }

  /**
   * Schedule reconnection attempt.
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('reconnect_failed', {});
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(() => {
        // Will trigger onclose and schedule another reconnect
      });
    }, delay);
  }
}

// Create singleton instance
const eventStream = new EventStream();

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Expose to global scope for use in HTML files
window.PromptSpeakAPI = {
  api,
  agents,
  missions,
  dashboard,
  broadcasts,
  eventStream,
  API_BASE,
  WS_BASE,
};

// Also export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    api,
    agents,
    missions,
    dashboard,
    broadcasts,
    eventStream,
  };
}
