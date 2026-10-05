// src/notifications/sse.ts - Server-Sent Events manager for live updates
import { Response } from 'express';

type SSEClient = {
  id: string;
  res: Response;
};

class SSEManager {
  private clients: SSEClient[] = [];
  private nextId = 0;

  addClient(res: Response): string {
    const id = `client-${++this.nextId}`;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', id })}\n\n`);

    this.clients.push({ id, res });

    res.on('close', () => {
      this.clients = this.clients.filter(c => c.id !== id);
    });

    return id;
  }

  broadcast(eventType: string, data: any): void {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.res.write(payload);
      } catch {
        // Client disconnected
      }
    }
  }

  get clientCount(): number {
    return this.clients.length;
  }
}

export const sseManager = new SSEManager();
