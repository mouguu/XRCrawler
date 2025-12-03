import { PlatformAdapter, PlatformName } from './types';

const adapters = new Map<PlatformName, PlatformAdapter>();

export function registerAdapter(adapter: PlatformAdapter): void {
  adapters.set(adapter.name, adapter);
}

export function getAdapter(name: PlatformName): PlatformAdapter {
  const adapter = adapters.get(name);
  if (!adapter) {
    throw new Error(`No adapter registered for platform: ${name}`);
  }
  return adapter;
}

export function listAdapters(): PlatformAdapter[] {
  return Array.from(adapters.values());
}
