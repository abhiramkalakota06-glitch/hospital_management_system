import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

let wss: WebSocketServer | null = null;

export function initWebSocketServer(httpServer: HttpServer): void {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ event: 'connected', payload: { timestamp: new Date().toISOString() } }));

    ws.on('error', () => {
      // Gracefully ignore socket close errors
    });
  });
}

export function broadcastEvent(event: string, payload: unknown): void {
  if (!wss) return;
  const message = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
