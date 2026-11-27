/** Small things a game remembers in the browser. Private mode simply forgets them. */

export const getItem = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export const setItem = (k: string, v: string | null): void => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

/** The name, seat token and mute switch every party game keeps, under `<prefix>-…` keys. */
export function savedBits(prefix: string) {
  return {
    name: () => getItem(`${prefix}-name`) ?? '',
    setName: (v: string) => setItem(`${prefix}-name`, v),
    token: () => getItem(`${prefix}-token`) ?? undefined,
    setToken: (v: string | null) => setItem(`${prefix}-token`, v),
    muted: () => getItem(`${prefix}-muted`) === '1',
    setMuted: (m: boolean) => setItem(`${prefix}-muted`, m ? '1' : '0'),
  };
}
