/**
 * Dota 2 SkinForge — Decoupled Application Event Bus
 * Eliminates direct cross-component dependencies using native EventTarget.
 */

const bus = new EventTarget();

export function on(event, callback) {
  bus.addEventListener(event, (e) => callback(e.detail));
}

export function off(event, callback) {
  bus.removeEventListener(event, callback);
}

export function emit(event, detail) {
  bus.dispatchEvent(new CustomEvent(event, { detail }));
}
