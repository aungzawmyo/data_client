export type AppCommand =
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-100'
  | 'fit-schema'
  | 'layout-horizontal'
  | 'layout-vertical'
  | 'layout-square'
  | 'layout-custom'
  | 'layout-radial'

export function emitAppCommand(action: AppCommand): void {
  window.dispatchEvent(new CustomEvent('data-client:command', { detail: { action } }))
}

export function onAppCommand(handler: (action: AppCommand) => void): () => void {
  const listener = (event: Event) => {
    const action = (event as CustomEvent<{ action: AppCommand }>).detail?.action
    if (action) handler(action)
  }
  window.addEventListener('data-client:command', listener)
  return () => window.removeEventListener('data-client:command', listener)
}
