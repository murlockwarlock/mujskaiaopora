type RequestOptions = RequestInit & { authenticated?: boolean };

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

class ApiClient {
  private accessToken: string | null = null;

  async register(payload: { email: string; password: string; displayName: string }) {
    const session = await this.request<Session>('auth/register', { method: 'POST', body: JSON.stringify(payload), authenticated: false });
    this.accessToken = session.accessToken;
    return session;
  }

  async login(payload: { email: string; password: string }) {
    const session = await this.request<Session>('auth/login', { method: 'POST', body: JSON.stringify(payload), authenticated: false });
    this.accessToken = session.accessToken;
    return session;
  }

  async refresh(): Promise<boolean> {
    try {
      const session = await this.request<Session>('auth/refresh', { method: 'POST', authenticated: false });
      this.accessToken = session.accessToken;
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    await this.request('auth/logout', { method: 'POST', authenticated: false });
    this.accessToken = null;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async request<T = void>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
    const { authenticated = true, headers, ...init } = options;
    const response = await fetch(`${baseUrl}/v1/${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(authenticated && this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        ...headers
      }
    });
    if (response.status === 401 && authenticated && !retried && (await this.refresh())) {
      return this.request<T>(path, options, true);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Не удалось выполнить запрос' }));
      throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

export type Session = {
  accessToken: string;
  user: { id: string; email: string; displayName: string; role: string };
};

export const api = new ApiClient();
