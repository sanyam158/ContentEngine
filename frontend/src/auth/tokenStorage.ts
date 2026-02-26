export const AUTH_TOKEN_STORAGE_KEY = 'contentengine.auth.token';
export const AUTH_EXPIRED_EVENT_NAME = 'contentengine:auth-expired';

export const getStoredAuthToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
};

export const setStoredAuthToken = (token: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
};

export const clearStoredAuthToken = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

export const notifyAuthExpired = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT_NAME));
};
