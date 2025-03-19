import { POST } from '@/app/api/gears/[gearId]/route';
import { Gear } from '@/lib/models/gear';

jest.mock('@/lib/models/gear', () => ({
  ...jest.requireActual('@/lib/models/gear'),
  Gear: { findById: jest.fn() }
}));

describe('Gears API Route', () => {
  beforeEach(() => jest.clearAllMocks());

  const createRequest = (body: any) => new Request(
    'http://localhost:3000/api/gears/test-gear',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    }
  );

  const testParams = Promise.resolve({ gearId: 'test-gear' });

  it('returns 404 when gear not found', async () => {
    (Gear.findById as jest.Mock).mockResolvedValue(null);
    const response = await POST(createRequest({ message: 'test', source: 'test' }), { params: testParams });
    
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Gear not found');
    expect(Gear.findById).toHaveBeenCalledWith('test-gear');
  });

  it('processes input and returns output', async () => {
    const mockGear = { 
      processInput: jest.fn().mockResolvedValue('Processed output'),
      setIsProcessing: jest.fn().mockResolvedValue(undefined),
      process: jest.fn().mockResolvedValue('Processed output'),
      outputUrls: [],
      log: [],
      data: {},
      setLog: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined)
    };
    (Gear.findById as jest.Mock).mockResolvedValue(mockGear);

    const response = await POST(
      createRequest({ message: 'Test message', source: 'test' }), 
      { params: testParams }
    );
    
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ output: 'Processed output' });
    expect(mockGear.process).toHaveBeenCalled();
  });

  it('handles processing errors', async () => {
    const mockGear = { 
      processInput: jest.fn().mockRejectedValue(new Error('Processing error')),
      setIsProcessing: jest.fn().mockResolvedValue(undefined),
      process: jest.fn().mockRejectedValue(new Error('Processing error')),
      outputUrls: [],
      log: [],
      data: {},
      setLog: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined)
    };
    (Gear.findById as jest.Mock).mockResolvedValue(mockGear);

    const response = await POST(
      createRequest({ message: 'Test message', source: 'test' }), 
      { params: testParams }
    );
    
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Processing error' });
  });

  it('handles invalid JSON', async () => {
    const response = await POST(createRequest('invalid-json'), { params: testParams });
    
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unknown error' });
  });
});