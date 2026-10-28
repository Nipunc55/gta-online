// Minimal pub/sub used to decouple gameplay systems (gunshots, crimes, kills...).
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const list = this.listeners.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(type, data) {
    const list = this.listeners.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](data);
  }
}
