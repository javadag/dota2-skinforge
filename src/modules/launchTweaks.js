import { DOM } from './dom.js';

// Steam Launch Options Tweaker
export function updateLaunchString() {
  const flags = [];
  if (DOM.twNovid && DOM.twNovid.checked) flags.push('-novid');
  if (DOM.twMap && DOM.twMap.checked) flags.push('-map dota');
  if (DOM.twHigh && DOM.twHigh.checked) flags.push('-high');
  if (DOM.twConsole && DOM.twConsole.checked) flags.push('-console');
  if (DOM.twNojoy && DOM.twNojoy.checked) flags.push('-nojoy');
  if (DOM.twDx11 && DOM.twDx11.checked) flags.push('-dx11');

  if (DOM.launchOutput) {
    DOM.launchOutput.textContent = flags.join(' ');
  }
}
