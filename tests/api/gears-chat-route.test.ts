import { POST } from '@/app/api/gears/[gearId]/chat/route';
import { Gear } from '@/lib/models/Gear';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';

jest.mock('@/lib/models/Gear', () => ({
  ...jest.requireActual('@/lib/models/Gear'),
  Gear: { findById: jest.fn() }
}));

jest.mock('ai', () => ({
  streamText: jest.fn()
}));

describe('Gears Chat API Route', () => {
  let mockStreamResponse: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStreamResponse = {
      toDataStreamResponse: jest.fn().mockReturnValue(new Response('test stream'))
    };
    (streamText as jest.Mock).mockReturnValue(mockStreamResponse);
  });

  const createRequest = (body: any) => new NextRequest(
    'http://localhost:3000/api/gears/test-gear/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    }
  );

  const testParams = Promise.resolve({ gearId: 'test-gear' });

  it('returns 404 when gear not found', async () => {
    (Gear.findById as jest.Mock).mockResolvedValue(null);
    const response = await POST(createRequest({ messages: [{ role: 'user', content: 'Hello' }] }), { params: testParams });
    
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Gear not found');
    expect(Gear.findById).toHaveBeenCalledWith('test-gear');
  });

  it('streams chat response', async () => {
    const mockGear = {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Previous message' }
      ],
      systemPrompt: jest.fn().mockReturnValue('System prompt for the gear')
    };
    (Gear.findById as jest.Mock).mockResolvedValue(mockGear);

    await POST(
      createRequest({ messages: [{ role: 'user', content: 'New message' }] }), 
      { params: testParams }
    );
    
    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        { role: 'system', content: 'System prompt for the gear' },
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Previous message' },
        { role: 'user', content: 'New message' }
      ]
    }));
    expect(mockStreamResponse.toDataStreamResponse).toHaveBeenCalled();
  });

  it('handles JSON parsing errors', async () => {
    await expect(async () => {
      await POST(createRequest('invalid-json'), { params: testParams });
    }).rejects.toThrow();
    
    expect(Gear.findById).not.toHaveBeenCalled();
  });
});