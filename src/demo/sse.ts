const sseClients = new Set<ReadableStreamDefaultController>();

export function broadcastSSE(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const controller of sseClients) {
    try {
      controller.enqueue(new TextEncoder().encode(message));
    } catch {
      sseClients.delete(controller);
    }
  }
}

export { sseClients };
