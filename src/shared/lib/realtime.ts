type EventCallback = (data: any) => void;

export class RealtimeProvider {
  private callbacks: Map<string, Set<EventCallback>> = new Map();

  subscribe(channel: string, callback: EventCallback): () => void {
    if (!this.callbacks.has(channel)) {
      this.callbacks.set(channel, new Set());
    }
    this.callbacks.get(channel)!.add(callback);
    return () => {
      this.callbacks.get(channel)?.delete(callback);
    };
  }

  emit(channel: string, data: any) {
    this.callbacks.get(channel)?.forEach((cb) => cb(data));
  }

  destroy() {
    this.callbacks.clear();
  }
}
