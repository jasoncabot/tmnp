/** localStorage that never throws (private windows, blocked storage, etc). */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`tmnp:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(`tmnp:${key}`, value);
    } catch {
      // Storage unavailable: settings just won't persist.
    }
  },
};
