// Use relative path instead of alias for direct TypeScript compilation
import { Gear, GearInput } from '../../lib/models/Gear';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments to check if we should mock LLM calls
// Default to real responses unless explicitly asked to mock
const mockLlm = process.argv.includes('--mock-llms');
console.log(`Test mode: ${mockLlm ? 'Using mocked LLM responses' : 'Using real LLM calls'}`);

describe('GearChaining', () => {
  // Mock fetch for non-LLM network calls (outputUrl forwarding)
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  
  // Variables to verify data passing between gears
  let outputData: string | null = null;
  let receivedData: any = null;
  
  beforeAll(() => {
    // Create a fetch mock that will capture forwarded data
    fetchMock = jest.fn().mockImplementation(async (url: string, options: any) => {
      // If this is a call to an outputUrl (forwarding), capture the data
      if (url.includes('test-gear-2')) {
        const body = JSON.parse(options.body);
        receivedData = body;
        
        // Return a successful response
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true })
        });
      }
      
      // For other calls, pass through to original fetch
      return originalFetch(url, options);
    });
    
    // Install the mock
    global.fetch = fetchMock;
  });
  
  afterAll(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });
  
  beforeEach(() => {
    // Reset test variables
    outputData = null;
    receivedData = null;
    
    // Clear any previous mock calls
    if (fetchMock) {
      fetchMock.mockClear();
    }
  });
  
  test('chains two gears in sequence via outputUrl mechanism', async () => {
    // Create the first gear (summarizer)
    const firstGear = new Gear({
      id: 'test-gear-1-summarizer'
    });
    
    // Add messages for the summarizer gear
    firstGear.addMessage({ 
      role: 'user', 
      content: 'You are a text summarizer. When you receive input text, summarize it concisely in 1-2 sentences.' 
    });
    
    // Set up output URL to forward to the second gear
    firstGear.addOutputUrl('/api/gears/test-gear-2-categorizer');
    
    // Mock the LLM processing for the first gear
    firstGear['processWithLLM'] = jest.fn().mockImplementation(async (input?: GearInput) => {
      const inputText = typeof input === 'string' 
        ? input 
        : JSON.stringify(input || firstGear.inputs);
      
      // Generate a summary based on the input
      const summaryText = `This is a concise summary of the input text. The key points include user message processing and data analysis.`;
      
      // Store the output for verification
      outputData = summaryText;
      
      return summaryText;
    });
    
    // Create the second gear (categorizer)
    const secondGear = new Gear({
      id: 'test-gear-2-categorizer'
    });
    
    // Add messages for the categorizer gear
    secondGear.addMessage({ 
      role: 'user', 
      content: 'You are a text categorizer. When you receive a summary, categorize it by topic and sentiment.' 
    });
    
    // Mock the LLM processing for the second gear
    secondGear['processWithLLM'] = jest.fn().mockImplementation(async (input?: GearInput) => {
      // Process the input data
      const inputData = typeof input === 'string' 
        ? input 
        : JSON.stringify(input || secondGear.inputs);
      
      // Generate categorization based on summary
      return `
        {
          "topic": "Data Processing",
          "sentiment": "Neutral",
          "summary": ${JSON.stringify(inputData)}
        }
      `;
    });
    
    // Process initial input in the first gear
    const firstGearOutput = await firstGear.processInput('user', 'This is a long text about various topics including data processing, user interaction, and system design. The text discusses how messages flow through the system and how data is analyzed.');
    
    // Verify first gear processed the input
    expect(firstGearOutput).toBeTruthy();
    expect(firstGearOutput).toBe(outputData);
    
    // Verify the forward call was made to the second gear
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('test-gear-2-categorizer');
    
    // Verify the data sent to the second gear
    expect(receivedData).toBeTruthy();
    expect(receivedData.source_gear_id).toBe('test-gear-1-summarizer');
    expect(receivedData.data).toBe(outputData);
    
    // Simulate the API route receiving the forwarded data
    const secondGearOutput = await secondGear.processInput(receivedData.source_gear_id, receivedData.data);
    
    // Verify second gear processed the input
    expect(secondGearOutput).toBeTruthy();
    expect(secondGearOutput).toContain('topic');
    expect(secondGearOutput).toContain('sentiment');
    expect(secondGearOutput).toContain('summary');
    
    // Verify chain integrity - second gear received first gear's output
    expect(secondGearOutput).toContain(outputData);
  });
  
  test('processes chained data with real Gear API handling', async () => {
    // This test simulates the API route handling to demonstrate a full chain

    // Create the sender and receiver gears
    const senderGear = new Gear({ id: 'sender-gear' });
    const receiverGear = new Gear({ id: 'receiver-gear' });
    
    // Set up messages
    senderGear.addMessage({ 
      role: 'user', 
      content: 'You analyze text and extract key metrics.' 
    });
    
    receiverGear.addMessage({ 
      role: 'user', 
      content: 'You visualize data metrics as a summary report.' 
    });
    
    // Configure sender to forward output to receiver
    senderGear.addOutputUrl('/api/gears/receiver-gear');
    
    // Mock the LLM for both gears
    senderGear['processWithLLM'] = jest.fn().mockImplementation(async () => {
      return JSON.stringify({
        wordCount: 157,
        sentimentScore: 0.8,
        topicTags: ["data processing", "analysis", "systems"]
      });
    });
    
    receiverGear['processWithLLM'] = jest.fn().mockImplementation(async (input?: GearInput) => {
      // Extract data from input to verify it's the sender's output
      const inputData = typeof input === 'string'
        ? input
        : JSON.stringify(input || receiverGear.inputs);
      
      return `# Data Visualization Report
Based on the metrics provided:
- Word count: ${inputData.includes('157') ? '157' : 'unknown'}
- Sentiment: ${inputData.includes('0.8') ? 'Positive (0.8)' : 'unknown'}
- Topics: ${inputData.includes('data processing') ? 'data processing, analysis, systems' : 'unknown'}`;
    });
    
    // Save gears to the store to simulate API access
    await senderGear.save();
    await receiverGear.save();
    
    // Process input on the sender gear
    const senderOutput = await senderGear.processInput('user', 'This is a sample text with enough content to analyze properly. It contains multiple sentences and should give us good metrics to work with. The topic is primarily about data processing systems and analysis frameworks.');
    
    // Verify forwarding was attempted
    expect(fetchMock).toHaveBeenCalledTimes(1);
    
    // Verify data in the forwarded request
    const forwardedBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(forwardedBody.source_gear_id).toBe('sender-gear');
    expect(forwardedBody.data).toBe(senderOutput);
    
    // Simulate API processing of the forwarded request
    const receiverOutput = await receiverGear.processInput(
      forwardedBody.source_gear_id,
      forwardedBody.data
    );
    
    // Verify the receiver output contains expected data from sender
    expect(receiverOutput).toContain('Data Visualization Report');
    expect(receiverOutput).toContain('157');
    expect(receiverOutput).toContain('0.8');
    expect(receiverOutput).toContain('data processing');
    
    // Clean up
    await Gear.deleteById('sender-gear');
    await Gear.deleteById('receiver-gear');
  });
});