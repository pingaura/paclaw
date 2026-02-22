import type { ActivityItem } from './types';
import { AGENT_MAP } from './constants';

// Word-boundary regex per agent to avoid false positives (e.g. "message" matching "sage")
const AGENT_PATTERNS = new Map(
  [...AGENT_MAP.keys()].map((id) => [id, new RegExp(`\\b${id}\\b`, 'i')])
);

export type WsMessageHandler = (activity: ActivityItem) => void;
export type WsStatusHandler = (status: WsStatus) => void;

export interface WsStatus {
  connected: boolean;
  /** Non-null when permanently rejected (won't auto-reconnect) */
  error: string | null;
}

// Close reasons that indicate permanent rejection — no point retrying
const PERMANENT_REJECTIONS = ['pairing required', 'gateway token', 'unauthorized', 'invalid connect params', 'must be equal to constant', 'protocol mismatch'];

export class TeamWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageId = 0;
  private onMessage: WsMessageHandler;
  private onStatus: WsStatusHandler;
  private disposed = false;

  constructor(url: string, onMessage: WsMessageHandler, onStatus: WsStatusHandler) {
    this.url = url;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  connect(): void {
    if (this.disposed) return;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.onStatus({ connected: true, error: null });
      this.sendConnectFrame();
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data);

        // Check for error responses from the gateway (e.g. pairing required)
        if (parsed.error?.message) {
          const errMsg = parsed.error.message as string;
          if (this.isPermanentRejection(errMsg)) {
            this.onStatus({ connected: false, error: errMsg });
            this.disposed = true;
            this.ws?.close();
            return;
          }
        }

        const activity = this.parseMessage(parsed);
        if (activity) {
          this.onMessage(activity);
        }
      } catch {
        // Not JSON or unparseable
      }
    };

    this.ws.onclose = (event) => {
      const reason = event.reason || '';

      // If the gateway gave a permanent rejection reason, stop reconnecting
      if (this.isPermanentRejection(reason)) {
        this.onStatus({ connected: false, error: reason });
        this.disposed = true;
        return;
      }

      this.onStatus({ connected: false, error: null });
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose, so don't duplicate logic here
    };
  }

  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private isPermanentRejection(message: string): boolean {
    const lower = message.toLowerCase();
    return PERMANENT_REJECTIONS.some((r) => lower.includes(r));
  }

  private sendConnectFrame(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const frame = {
      type: 'req',
      id: `team-${++this.messageId}`,
      method: 'connect',
      params: {
        minProtocol: 2,
        maxProtocol: 2,
        client: {
          id: 'webchat-ui',
          displayName: 'Team Dashboard',
          version: '1.0.0',
          mode: 'webchat',
          platform: 'web',
        },
        role: 'operator',
        scopes: [],
      },
    };
    this.ws.send(JSON.stringify(frame));
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private parseMessage(msg: Record<string, unknown>): ActivityItem | null {
    // Try to identify agent from message fields
    const params = (msg.params || {}) as Record<string, unknown>;
    const from = (params.from as string) || '';
    const to = (params.to as string) || '';
    const method = (msg.method as string) || '';

    // Check if 'from' or 'to' matches a known agent (word-boundary match)
    let agentId: string | null = null;

    for (const [id, regex] of AGENT_PATTERNS) {
      if (regex.test(from) || regex.test(to)) {
        agentId = id;
        break;
      }
    }

    // Also check in full message content
    if (!agentId) {
      const content = JSON.stringify(msg);
      for (const [id, regex] of AGENT_PATTERNS) {
        if (regex.test(content)) {
          agentId = id;
          break;
        }
      }
    }

    if (!agentId) return null;

    const agent = AGENT_MAP.get(agentId)!;

    // Classify message type
    let type: ActivityItem['type'] = 'message';
    if (method === 'connect' || method === 'disconnect') {
      type = 'system';
    } else if (msg.error) {
      type = 'error';
    } else if (method.includes('assign') || method.includes('delegate')) {
      type = 'coordination';
    }

    // Extract summary
    let summary = method || 'activity';
    const msgContent = params.message || params.content || params.text;
    if (typeof msgContent === 'string') {
      summary = msgContent.length > 150 ? msgContent.slice(0, 147) + '...' : msgContent;
    } else if (method) {
      summary = `${method} ${from ? `from ${from}` : ''} ${to ? `to ${to}` : ''}`.trim();
    }

    return {
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      agentId,
      agentName: agent.name,
      agentEmoji: agent.emoji,
      type,
      summary,
    };
  }
}
