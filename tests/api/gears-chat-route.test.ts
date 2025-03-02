import { POST } from '@/app/api/gears/[gearId]/chat/route';
import { Gear } from '@/lib/models/Gear';
import { GearChat } from '@/lib/models/GearChat';
import { createIdGenerator, streamText } from 'ai';
import { NextRequest } from 'next/server';

jest.mock('@/lib/models/Gear', () => ({
  ...jest.requireActual('@/lib/models/Gear'),
  Gear: { findById: jest.fn() }
}));

jest.mock('@/lib/models/GearChat', () => {
  return {
    GearChat: jest.fn().mockImplementation(() => ({
      getMessages: jest.fn().mockReturnValue([]),
      addMessage: jest.fn().mockImplementation(async (msg) => ({
        id: 'test-message-id',
        ...msg
      }))
    }))
  };
});

jest.mock('ai', () => ({
  streamText: jest.fn(),
  createIdGenerator: jest.fn().mockReturnValue(() => 'generated-id')
}));

describe('Gears Chat API Route', () => {
  let mockStreamResponse: any;
  let mockOnFinish: Function;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnFinish = jest.fn();
    mockStreamResponse = {
      toDataStreamResponse: jest.fn().mockReturnValue(new Response('test stream'))
    };
    (streamText as jest.Mock).mockImplementation((options) => {
      // Store the onFinish callback so we can call it in tests
      mockOnFinish = options.onFinish;
      return mockStreamResponse;
    });
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
      id: 'test-gear',
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
      messages: expect.arrayContaining([
        { role: 'system', content: 'System prompt for the gear' },
        { role: 'user', content: 'New message' }
      ]),
      experimental_generateMessageId: expect.any(Function)
    }));
    
    expect(createIdGenerator).toHaveBeenCalledWith({
      prefix: 'gear',
      size: 16,
    });
    expect(mockStreamResponse.toDataStreamResponse).toHaveBeenCalled();
  });

  it('handles JSON parsing errors', async () => {
    await expect(async () => {
      await POST(createRequest('invalid-json'), { params: testParams });
    }).rejects.toThrow();
    
    expect(Gear.findById).not.toHaveBeenCalled();
  });

  it('adds the user message to GearChat', async () => {
    const mockGearChatInstance = {
      getMessages: jest.fn().mockReturnValue([]),
      addMessage: jest.fn().mockImplementation(async (msg) => ({
        id: 'test-message-id',
        ...msg
      }))
    };
    
    (GearChat as jest.Mock).mockImplementation(() => mockGearChatInstance);
    
    const mockGear = {
      id: 'test-gear',
      messages: [],
      systemPrompt: jest.fn().mockReturnValue('System prompt')
    };
    
    (Gear.findById as jest.Mock).mockResolvedValue(mockGear);

    await POST(
      createRequest({ messages: [{ role: 'user', content: 'Test message' }] }), 
      { params: testParams }
    );

    // Verify that the user message was added to GearChat
    expect(mockGearChatInstance.addMessage).toHaveBeenCalledWith({
      role: 'user',
      content: 'Test message'
    });
  });

  it('persists the assistant response after streaming completes', async () => {
    const mockGearChatInstance = {
      getMessages: jest.fn().mockReturnValue([]),
      addMessage: jest.fn().mockImplementation(async (msg) => ({
        id: 'test-message-id',
        ...msg
      }))
    };
    
    (GearChat as jest.Mock).mockImplementation(() => mockGearChatInstance);
    
    const mockGear = {
      id: 'test-gear',
      messages: [],
      systemPrompt: jest.fn().mockReturnValue('System prompt')
    };
    
    (Gear.findById as jest.Mock).mockResolvedValue(mockGear);

    await POST(
      createRequest({ messages: [{ role: 'user', content: 'Test message' }] }), 
      { params: testParams }
    );

    // Simulate the onFinish callback being called after streaming completes
    await mockOnFinish({
      response: {
        messages: [
          { role: 'user', content: 'Test message' },
          { role: 'assistant', content: 'This is the assistant response' }
        ]
      }
    });

    // Verify that the assistant message was added to GearChat
    expect(mockGearChatInstance.addMessage).toHaveBeenCalledWith({
      role: 'assistant',
      content: 'This is the assistant response'
    });
  });
});