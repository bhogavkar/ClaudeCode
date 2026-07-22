import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Central axios instance.
 *
 * - Attaches the in-memory access token to every request.
 * - On a 401, transparently attempts a single refresh (via the httpOnly cookie)
 *   and replays the original request. Concurrent 401s share one refresh call.
 */
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const { data } = await axios.post<{ accessToken: string }>(
    '/api/auth/refresh',
    {},
    { withCredentials: true },
  );
  setAccessToken(data.accessToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const isAuthCall = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        refreshPromise ??= performRefresh().finally(() => {
          refreshPromise = null;
        });
        const token = await refreshPromise;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        setAccessToken(null);
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
    return Promise.reject(error);
  },
);

export default api;
