/** The banner everybody sees when a finished player shouts at a slow one. */
import { HECKLE_SHOW_MS } from '../../shared/src/constants';
import type { Heckle } from '../../shared/src/types';
import { sfx } from './audio';
import { h, reducedMotion } from '@tggame/base/client/dom';
import { nameOf, store } from './store';

let banner: HTMLElement | null = null;
let hideTimer = 0;
/** The newest heckle already handled. */
let seenSeq = 0;
/** Set after (re)connecting: whatever is in the first state was shouted before we were looking. */
let catchingUp = true;

export function heckleCatchUp(): void {
  catchingUp = true;
}

/** Call with every new state: shows a heckle the first time it is seen. */
export function heckleSeen(heckle: Heckle | null): void {
  const fresh = heckle !== null && heckle.seq !== seenSeq;
  if (heckle) seenSeq = heckle.seq;
  const quiet = catchingUp;
  catchingUp = false;
  if (!fresh || quiet || !heckle) return;

  const forMe = heckle.targetId === store.state?.selfId;
  banner ??= document.body.appendChild(h('div', { class: 'heckle-banner', role: 'status' }));
  banner.className = `heckle-banner l${heckle.level}${forMe ? ' me' : ''}`;
  banner.replaceChildren(h('small', null, `${nameOf(heckle.byId)} to ${forMe ? 'YOU' : nameOf(heckle.targetId)}:`), heckle.text);
  // restart the pop-in even when one heckle replaces another
  banner.hidden = true;
  void banner.offsetWidth;
  banner.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => banner && (banner.hidden = true), HECKLE_SHOW_MS);

  // the slow player gets the full treatment; everyone else just hears the louder ones
  if (forMe || heckle.level > 1) sfx.heckle(forMe ? heckle.level : 1);
  if (forMe) {
    navigator.vibrate?.(heckle.level > 2 ? [120, 60, 120] : heckle.level > 1 ? 120 : 40);
    if (!reducedMotion()) {
      document.body.classList.remove('heckled');
      void document.body.offsetWidth;
      document.body.classList.add('heckled');
    }
  }
}
