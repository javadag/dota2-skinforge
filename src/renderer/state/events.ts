/**
 * Dota 2 SkinForge — Decoupled Application Event Bus
 * Eliminates direct cross-component dependencies using native EventTarget.
 */

const bus = new EventTarget()

export function on<T = unknown>(event: string, callback: (detail: T) => void): void {
  bus.addEventListener(event, ((e: Event) => {
    const custom = e as CustomEvent<T>
    callback(custom.detail)
  }) as EventListener)
}

export function off(event: string, callback: EventListener): void {
  bus.removeEventListener(event, callback)
}

export function emit<T = unknown>(event: string, detail?: T): void {
  bus.dispatchEvent(new CustomEvent(event, { detail }))
}
