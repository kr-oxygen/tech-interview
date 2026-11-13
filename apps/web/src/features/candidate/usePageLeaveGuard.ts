import { useEffect, useRef } from 'react';

interface Options {
  /** Guard is active while the candidate is inside an open session. */
  active: boolean;
  candidateToken: string | null;
  onBackAttempt: () => void;
}

/**
 * Leaving the page pauses (locks) the session:
 * - beforeunload: native "are you sure?" prompt;
 * - pagehide: sendBeacon tells the server immediately (best-effort; the server also locks
 *   after a grace period when the socket disappears);
 * - Back button: a sentinel history entry turns "Back" into a recorded warning instead of
 *   navigation.
 */
export function usePageLeaveGuard({ active, candidateToken, onBackAttempt }: Options) {
  const onBackRef = useRef(onBackAttempt);
  onBackRef.current = onBackAttempt;

  useEffect(() => {
    if (!active || !candidateToken) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // required by some browsers to show the prompt
    };

    const onPageHide = () => {
      const body = JSON.stringify({ token: candidateToken, type: 'PAGE_UNLOAD', clientTimestamp: Date.now() });
      // text/plain is CORS-safelisted → no preflight, works cross-origin.
      navigator.sendBeacon('/api/candidate/beacon', new Blob([body], { type: 'text/plain' }));
    };

    history.pushState({ tiGuard: true }, '', location.href);
    const onPopState = () => {
      history.pushState({ tiGuard: true }, '', location.href);
      onBackRef.current();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('popstate', onPopState);
    };
  }, [active, candidateToken]);
}
