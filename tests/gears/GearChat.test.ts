import { GearChat } from '@/lib/models/GearChat';
import { Message } from '@/lib/models/types';

describe('GearChat', () => {
  let gearChat: GearChat;
  const gearId = 'test-gear-id';
  
  beforeEach(() => {
    // Initialize GearChat with empty messages
    gearChat = new GearChat([], gearId);
  });
  
  it('should initialize with empty messages', () => {
    expect(gearChat.getMessages()).toEqual([]);
  });
  
  it('should initialize with provided messages', () => {
    const initialMessages: Message[] = [
      { id: '1', role: 'system', content: 'System message' },
      { id: '2', role: 'user', content: 'User message' },
    ];
    
    const chat = new GearChat(initialMessages, gearId);
    expect(chat.getMessages()).toEqual(initialMessages);
  });
  
  it('should add a user message and generate an ID', async () => {
    const message = await gearChat.addMessage({
      role: 'user',
      content: 'Hello, world!'
    });
    
    expect(message).toHaveProperty('id');
    expect(message.role).toBe('user');
    expect(message.content).toBe('Hello, world!');
    
    // Verify message was added to the list
    const messages = gearChat.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(message);
  });
  
  it('should add an assistant message and generate an ID', async () => {
    const message = await gearChat.addMessage({
      role: 'assistant',
      content: 'I am an assistant'
    });
    
    expect(message).toHaveProperty('id');
    expect(message.role).toBe('assistant');
    expect(message.content).toBe('I am an assistant');
    
    // Verify message was added to the list
    const messages = gearChat.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(message);
  });
  
  it('should maintain message order', async () => {
    await gearChat.addMessage({ role: 'system', content: 'System init' });
    await gearChat.addMessage({ role: 'user', content: 'User message 1' });
    await gearChat.addMessage({ role: 'assistant', content: 'Assistant response 1' });
    await gearChat.addMessage({ role: 'user', content: 'User message 2' });
    await gearChat.addMessage({ role: 'assistant', content: 'Assistant response 2' });
    
    const messages = gearChat.getMessages();
    expect(messages).toHaveLength(5);
    
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('System init');
    
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('User message 1');
    
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].content).toBe('Assistant response 1');
    
    expect(messages[3].role).toBe('user');
    expect(messages[3].content).toBe('User message 2');
    
    expect(messages[4].role).toBe('assistant');
    expect(messages[4].content).toBe('Assistant response 2');
  });
  
  it('should handle conversation context persistence', async () => {
    // First, add some messages
    await gearChat.addMessage({ role: 'user', content: 'Hello' });
    await gearChat.addMessage({ role: 'assistant', content: 'Hi there!' });
    
    // Get the current state of messages
    const currentMessages = gearChat.getMessages();
    expect(currentMessages).toHaveLength(2);
    
    // Create a new GearChat instance with the same messages (simulating loading from storage)
    const newGearChat = new GearChat([...currentMessages], gearId);
    
    // Verify the loaded messages match
    const loadedMessages = newGearChat.getMessages();
    expect(loadedMessages).toHaveLength(2);
    expect(loadedMessages[0].role).toBe('user');
    expect(loadedMessages[0].content).toBe('Hello');
    expect(loadedMessages[1].role).toBe('assistant');
    expect(loadedMessages[1].content).toBe('Hi there!');
    
    // Continue the conversation in the new instance
    await newGearChat.addMessage({ role: 'user', content: 'How are you?' });
    await newGearChat.addMessage({ role: 'assistant', content: 'I am doing well, thank you!' });
    
    // Verify the conversation continued properly
    const updatedMessages = newGearChat.getMessages();
    expect(updatedMessages).toHaveLength(4);
    expect(updatedMessages[2].role).toBe('user');
    expect(updatedMessages[2].content).toBe('How are you?');
    expect(updatedMessages[3].role).toBe('assistant');
    expect(updatedMessages[3].content).toBe('I am doing well, thank you!');
  });
});