import type { ActivityItem } from './types';
import { AGENT_MAP } from './constants';

export type WsMessageHandler = (activity: ActivityItem) => void;
export type WsConnectionHandler = (connected: boolean) => void;

export class TeamWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageId = 0;
  private onMessage: WsMessageHandler;
  private onConnection: WsConnectionHandler;
  private disposed = false;

  constructor(url: string, onMessage: WsMessageHandler, onConnection: WsConnectionHandler) {
    this.url = url;
    this.onMessage = onMessage;
    this.onConnection = onConnection;
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
      this.onConnection(true);
      this.sendConnectFrame();
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data);
        const activity = this.parseMessage(parsed);
        if (activity) {
          this.onMessage(activity);
        }
      } catch {
        // Not JSON or unparseable
      }
    };

    this.ws.onclose = () => {
      this.onConnection(false);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.onConnection(false);
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

  private sendConnectFrame(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const frame = {
      type: 'req',
      id: `team-${++this.messageId}`,
      method: 'connect',
      params: {
        minProtocol: 1,
        maxProtocol: 1,
        client: {
          id: 'team-dashboard',
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

    // Check if 'from' or 'to' matches a known agent
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();
    let agentId: string | null = null;

    for (const [id] of AGENT_MAP) {
      if (fromLower.includes(id) || toLower.includes(id)) {
        agentId = id;
        break;
      }
    }

    // Also check in message content
    if (!agentId) {
      const content = JSON.stringify(msg).toLowerCase();
      for (const [id] of AGENT_MAP) {
        if (content.includes(id)) {
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
