import { initFp, miniApp, themeParams, viewport } from '@tma.js/sdk-react';

let initialized = false;

export function initializeTelegram(): boolean {
  if (initialized) {
    return true;
  }

  const result = initFp();

  if (result._tag === 'Left') {
    return false;
  }

  initialized = true;

  themeParams.mount();
  if (!themeParams.isCssVarsBound()) {
    themeParams.bindCssVars();
  }

  if (miniApp.isSupported()) {
    miniApp.mount();
    miniApp.bindCssVars();
  }

  void viewport
    .mount()
    .then(() => {
      if (!viewport.isCssVarsBound()) {
        viewport.bindCssVars();
      }
    })
    .catch(() => undefined);

  miniApp.ready();
  return true;
}
