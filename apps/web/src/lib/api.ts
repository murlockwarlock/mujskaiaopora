type RequestOptions = RequestInit & { authenticated?: boolean };
type ApiResponse = { status: number; body: unknown };

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
const accessTokenStorageKey = 'opora.access-token';

class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    if (typeof window !== 'undefined') this.accessToken = window.sessionStorage.getItem(accessTokenStorageKey);
  }

  async register(payload: { email: string; password: string; displayName: string }) {
    const session = await this.request<Session>('auth/register', { method: 'POST', body: JSON.stringify(payload), authenticated: false });
    this.setAccessToken(session.accessToken);
    return session;
  }

  async login(payload: { email: string; password: string }) {
    const session = await this.request<Session>('auth/login', { method: 'POST', body: JSON.stringify(payload), authenticated: false });
    this.setAccessToken(session.accessToken);
    return session;
  }

  async refresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshSession();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async refreshSession(): Promise<boolean> {
    try {
      const session = await this.request<Session>('auth/refresh', { method: 'POST', authenticated: false });
      this.setAccessToken(session.accessToken);
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.request('auth/logout', { method: 'POST', authenticated: false });
    } catch {
      return;
    } finally {
      this.clearAccessToken();
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearAccessToken(): void {
    this.accessToken = null;
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(accessTokenStorageKey);
  }

  private setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
    if (typeof window !== 'undefined') window.sessionStorage.setItem(accessTokenStorageKey, accessToken);
  }

  async request<T = void>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
    const { authenticated = true, headers, ...init } = options;
    const response = await this.send(path, init, {
      'Content-Type': 'application/json',
      ...(authenticated && this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      ...headers
    });
    if (response.status === 401 && authenticated && !retried && (await this.refresh())) {
      return this.request<T>(path, options, true);
    }
    if (response.status < 200 || response.status >= 300) {
      const message = this.getErrorMessage(response.body);
      throw new Error(message);
    }
    if (response.status === 204) return undefined as T;
    return response.body as T;
  }

  private async send(path: string, init: RequestInit, headers: HeadersInit): Promise<ApiResponse> {
    if (typeof XMLHttpRequest === 'undefined') return this.sendWithFetch(path, init, headers);
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(init.method ?? 'GET', `${baseUrl}/v1/${path}`);
      request.withCredentials = true;
      new Headers(headers).forEach((value, key) => request.setRequestHeader(key, value));
      request.onload = () => {
        const body = request.responseText ? this.parseBody(request.responseText) : undefined;
        resolve({ status: request.status, body });
      };
      request.onerror = () => reject(new Error('Не удалось выполнить запрос'));
      request.send((init.body ?? null) as XMLHttpRequestBodyInit | Document | null);
    });
  }

  private async sendWithFetch(path: string, init: RequestInit, headers: HeadersInit): Promise<ApiResponse> {
    const response = await fetch(`${baseUrl}/v1/${path}`, { ...init, credentials: 'include', headers });
    const text = await response.text();
    return { status: response.status, body: text ? this.parseBody(text) : undefined };
  }

  private parseBody(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return { message: 'Не удалось выполнить запрос' };
    }
  }

  private getErrorMessage(body: unknown): string {
    if (!body || typeof body !== 'object' || !('message' in body)) return 'Не удалось выполнить запрос';
    const message = body.message;
    return Array.isArray(message) ? message.join(', ') : typeof message === 'string' ? message : 'Не удалось выполнить запрос';
  }
}

export type Session = {
  accessToken: string;
  user: { id: string; email: string; displayName: string; role: string };
};

export const api = new ApiClient();
