import { ApiClient } from './api';

describe('ApiClient', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    global.fetch = fetchMock as never;
    fetchMock.mockResolvedValue({ status: 204, text: async () => '' });
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it('does not send a JSON content type for an empty refresh request', async () => {
    await new ApiClient().request('auth/refresh', { method: 'POST', authenticated: false });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(options.headers).has('Content-Type')).toBe(false);
  });

  it('sends a JSON content type when a request has a JSON body', async () => {
    await new ApiClient().request('profile', { method: 'PATCH', body: JSON.stringify({ city: 'Алматы' }) });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
  });
});
