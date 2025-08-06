interface Memory {
  key: string;
  value: any;
  timestamp: Date;
  ttl?: number; // Time to live in seconds
}

export class AgentMemory {
  private memory: Map<string, Memory> = new Map();

  set(key: string, value: any, ttl?: number) {
    this.memory.set(key, {
      key,
      value,
      timestamp: new Date(),
      ttl,
    });
  }

  get(key: string): any {
    const item = this.memory.get(key);
    if (!item) return null;

    // Check TTL
    if (item.ttl) {
      const age = (Date.now() - item.timestamp.getTime()) / 1000;
      if (age > item.ttl) {
        this.memory.delete(key);
        return null;
      }
    }

    return item.value;
  }

  clear() {
    this.memory.clear();
  }
}
