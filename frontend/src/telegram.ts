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

  if (!themeParams.isMounted()) themeParams.mount();
  if (!themeParams.isCssVarsBound()) {
    themeParams.bindCssVars();
  }

  const updateColorScheme = () => {
    document.documentElement.style.colorScheme = themeParams.isDark()
      ? 'dark'
      : 'light';
  };
  updateColorScheme();
  themeParams.isDark.sub(updateColorScheme);

  if (miniApp.isSupported()) {
    if (!miniApp.isMounted()) miniApp.mount();
    if (!miniApp.isCssVarsBound()) miniApp.bindCssVars();
  }
  initialized = true;

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
