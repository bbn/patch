import { POST } from '@/apps/web/app/api/inlet/[id]/route';
import { runPatch } from '@/packages/runtime/runPatch';
import { logError, logWarning } from '@/lib/logger';

jest.mock('@/packages/runtime/runPatch', () => ({
  runPatch: jest.fn()
}));

jest.mock('@/lib/logger', () => ({
  logError: jest.fn(),
  logWarning: jest.fn()
}));

describe('Inlet API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createRequest = (body: any, method = 'POST') => {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    // Only add body for methods that support it
    if (method !== 'GET' && method !== 'HEAD') {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    
    return new Request('http://localhost:3000/api/inlet/test-patch', options);
  };

  const testParams = { id: 'test-patch-id' };

  describe('Method validation', () => {
    it('returns 405 for non-POST methods', async () => {
      const response = await POST(createRequest({}, 'GET'), { params: testParams });
      expect(response.status).toBe(405);
      expect(await response.text()).toBe('Method Not Allowed');
    });
  });

  describe('Input validation', () => {
    it('returns 400 for missing patch ID', async () => {
      const response = await POST(createRequest({}), { params: { id: '' } });
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid patch ID');
      expect(logWarning).toHaveBeenCalledWith('inlet-route', 'Invalid patch ID provided: ');
    });

    it('returns 400 for null patch ID', async () => {
      const response = await POST(createRequest({}), { params: { id: null as any } });
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid patch ID');
    });

    it('returns 400 for whitespace-only patch ID', async () => {
      const response = await POST(createRequest({}), { params: { id: '   ' } });
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid patch ID');
    });

    it('returns 400 for invalid JSON payload', async () => {
      const response = await POST(createRequest('invalid-json'), { params: testParams });
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid JSON payload');
      expect(logWarning).toHaveBeenCalledWith('inlet-route', expect.stringContaining('Invalid JSON payload'));
    });
  });

  describe('Patch execution', () => {
    it('returns streaming response for successful patch execution', async () => {
      const mockGenerator = (async function* () {
        yield { type: 'RunStart', runId: 'test-run', ts: Date.now() };
        yield { type: 'RunComplete', runId: 'test-run', ts: Date.now() };
      })();

      (runPatch as jest.Mock).mockReturnValue(mockGenerator);

      const response = await POST(createRequest({ input: 'test' }), { params: testParams });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(runPatch).toHaveBeenCalledWith(expect.any(Object), { input: 'test' });
    });

    it('handles patch execution startup errors', async () => {
      const error = new Error('Patch not found');
      (runPatch as jest.Mock).mockImplementation(() => {
        throw error;
      });

      const response = await POST(createRequest({ input: 'test' }), { params: testParams });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(logError).toHaveBeenCalledWith('inlet-route', 'Failed to start patch execution for test-patch-id: Patch not found', error);
      
      // Verify response has a body (error stream)
      expect(response.body).toBeDefined();
    });

    it('handles empty JSON payload', async () => {
      const mockGenerator = (async function* () {
        yield { type: 'RunStart', runId: 'test-run', ts: Date.now() };
      })();

      (runPatch as jest.Mock).mockReturnValue(mockGenerator);

      const request = new Request('http://localhost:3000/api/inlet/test-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const response = await POST(request, { params: testParams });

      expect(response.status).toBe(200);
      expect(runPatch).toHaveBeenCalledWith(expect.any(Object), {});
    });
  });

  describe('Error logging', () => {
    it('logs structured error information', async () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      (runPatch as jest.Mock).mockImplementation(() => {
        throw error;
      });

      await POST(createRequest({ input: 'test' }), { params: testParams });

      expect(logError).toHaveBeenCalledWith('inlet-route', 'Failed to start patch execution for test-patch-id: Test error', error);
    });

    it('handles non-Error objects', async () => {
      (runPatch as jest.Mock).mockImplementation(() => {
        throw 'String error';
      });

      await POST(createRequest({ input: 'test' }), { params: testParams });

      expect(logError).toHaveBeenCalledWith('inlet-route', 'Failed to start patch execution for test-patch-id: String error', 'String error');
    });
  });
});