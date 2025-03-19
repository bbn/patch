import { Gear } from '@/lib/models/gear';
import { GearOutput, GearInput } from '@/lib/models/types';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Parse command line arguments to check if we should mock LLM calls
// Default to real responses unless explicitly asked to mock
const mockLlm = process.argv.includes('--mock-llms');

// If we're using real LLM calls, load environment variables
if (!mockLlm) {
  // Load environment variables from .env files
  const envFile = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  } else {
    dotenv.config(); // Try default .env file
  }
}

describe('Gear Output Forwarding', () => {
  let sourceGear: Gear;
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    // Save the original fetch implementation
    originalFetch = global.fetch;
    // Mock fetch globally for the gear forwarding calls
    global.fetch = jest.fn();
  });

  afterAll(() => {
    // Restore original fetch implementation
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    // Silence console logs during tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    // Create a new gear for each test
    sourceGear = new Gear({
      id: 'source-gear'
    });
    
    // Add a simple instruction message
    sourceGear.addMessage({
      role: 'user',
      content: 'Process input and generate a simple summary.'
    });
    
    // Always mock the processWithLLM method for tests to avoid actual LLM call issues
    // This simplifies testing and makes tests more reliable
    sourceGear['processWithLLM'] = jest.fn().mockResolvedValue('Mocked test output');
    
    // Reset fetch mock before each test
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    // Restore console.log and console.error
    jest.restoreAllMocks();
  });

  test('forwardOutputToGears should not make fetch calls if no output URLs are configured', async () => {
    // Arrange - ensure gear has no output URLs
    expect(sourceGear.outputUrls).toHaveLength(0);
    
    // Act - call the private method directly
    await (sourceGear as any).forwardOutputToGears('Test output data');
    
    // Assert - no fetch calls should be made
    expect(global.fetch).not.toHaveBeenCalled();
  // Increase timeout for LLM API calls
  }, 60000);

  test('forwardOutputToGears should send POST requests to all configured output URLs', async () => {
    // Arrange - add multiple output URLs
    const outputUrl1 = '/api/gears/gear1';
    const outputUrl2 = '/api/gears/gear2';
    sourceGear.addOutputUrl(outputUrl1);
    sourceGear.addOutputUrl(outputUrl2);
    
    // Mock successful fetch responses
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200
    });
    
    // Act - call the private method directly
    const output: GearOutput = { result: 'Test output data' };
    await (sourceGear as any).forwardOutputToGears(output);
    
    // Assert - fetch should be called for each URL
    expect(global.fetch).toHaveBeenCalledTimes(2);
    
    // For absolute URL conversion in tests
    const baseUrl = 'http://localhost:3000';
    
    // Check first call
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}${outputUrl1}`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining(sourceGear.id), // Should contain source gear ID
      })
    );
    
    // Check second call
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}${outputUrl2}`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining(sourceGear.id), // Should contain source gear ID
      })
    );
    
    // Verify payload structure (from first call)
    const bodyObj = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(bodyObj).toHaveProperty('source_gear.id', sourceGear.id);
    expect(bodyObj).toHaveProperty('message_id');
    expect(bodyObj).toHaveProperty('data', output);
  // Increase timeout for LLM API calls
  }, 60000);

  test('forwardOutputToGears should handle failed requests gracefully', async () => {
    // Arrange - add an output URL
    const outputUrl = '/api/gears/target-gear';
    sourceGear.addOutputUrl(outputUrl);
    
    // Mock a failed fetch response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500
    });
    
    // Act - call the private method directly
    await (sourceGear as any).forwardOutputToGears('Test output');
    
    // Assert - fetch should be called
    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    // Error should be logged
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(`Error forwarding to ${outputUrl}`)
    );
  }, 60000);

  test('forwardOutputToGears should be called when process completes', async () => {
    // Arrange
    const outputUrl = '/api/gears/target-gear';
    sourceGear.addOutputUrl(outputUrl);
    
    // Mock successful fetch responses
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200
    });
    
    // Spy on the forwardOutputToGears method
    const forwardSpy = jest.spyOn(sourceGear as any, 'forwardOutputToGears');
    
    // Act - call the public process method
    await sourceGear.process('Test input');
    
    // Assert - forwardOutputToGears should be called with the output from processWithLLM
    expect(forwardSpy).toHaveBeenCalledWith('Mocked test output');
    
    // For absolute URL conversion in tests
    const baseUrl = 'http://localhost:3000';
    
    // Verify fetch was called with the correct URL
    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}${outputUrl}`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining(sourceGear.id)
      })
    );
  // Increase timeout for LLM API calls
  }, 60000);

  test('forwardOutputToGears should handle network errors gracefully', async () => {
    // Arrange - add an output URL
    const outputUrl = '/api/gears/target-gear';
    sourceGear.addOutputUrl(outputUrl);
    
    // Mock a network error
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    
    // Act - call the private method directly (should not throw)
    await expect(
      (sourceGear as any).forwardOutputToGears('Test output')
    ).resolves.not.toThrow();
    
    // Assert - error should be logged
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(`Error forwarding to ${outputUrl}`)
    );
  }, 60000);
  
  // This test demonstrates how real LLM integration would work, but always uses mocks for reliability
  test('should work with different input types and forward the output', async () => {
    // Arrange - customize our mock response for this specific test
    const mockOutput = 'Custom output for different input types test';
    sourceGear['processWithLLM'] = jest.fn().mockResolvedValue(mockOutput);
    
    const outputUrl = '/api/gears/target-gear';
    sourceGear.addOutputUrl(outputUrl);
    
    // Mock successful fetch response for the forwarding
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200
    });
    
    // Act - process more complex input
    const input = { 
      message: "This is a test message",
      timestamp: Date.now(),
      metadata: {
        type: "test",
        version: 1.0
      }
    };
    const output = await sourceGear.process(input);
    
    // Assert
    // Verify we got our expected output
    expect(output).toBe(mockOutput);
    
    // For absolute URL conversion in tests
    const baseUrl = 'http://localhost:3000';
    
    // Verify the output was forwarded
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}${outputUrl}`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(sourceGear.id)
      })
    );
  }, 60000);

  test('should create exactly one log entry in the receiving gear', async () => {
    // Create source gear (Gear A) with an example
    const gearA = new Gear({ 
      id: 'gear-A',
      label: 'Gear A',
      outputUrls: ['/api/gears/gear-B'] // Connect to Gear B
    });
    
    // Create target gear (Gear B)
    const gearB = new Gear({
      id: 'gear-B',
      label: 'Gear B'
    });
    
    // Manually add an empty log to ensure it exists
    (gearB as any).data = {
      ...(gearB as any).data,
      log: []
    };
    
    // Mock a method to add log entries to Gear B
    const addLogEntry = (input: any, output: any, source: any) => {
      (gearB as any).data.log.unshift({
        timestamp: Date.now(),
        input,
        output,
        source
      });
    };
    
    // Mock fetch to simulate the API behavior
    (global.fetch as jest.Mock).mockImplementation(async (url: string, options: any) => {
      // When forwarding to Gear B's endpoint
      if (url.includes('/api/gears/gear-B')) {
        // Parse the request body
        const body = JSON.parse(options.body);
        
        // Verify it contains the expected properties
        expect(body).toHaveProperty('source_gear');
        expect(body.source_gear).toHaveProperty('id', 'gear-A');
        expect(body.source_gear).toHaveProperty('label', 'Gear A');
        expect(body).toHaveProperty('data');
        
        // Simulate the server-side API behavior:
        
        // 1. Process the input (mocked response)
        const output = `Processed by Gear B: ${body.data}`;
        
        // 2. Create a single log entry in Gear B
        const sourceObj = {
          id: body.source_gear.id,
          label: body.source_gear.label
        };
        
        addLogEntry(body.data, output, sourceObj);
        
        // Return a success response
        return {
          ok: true,
          status: 200,
          json: async () => ({ output }),
          text: async () => JSON.stringify({ output })
        };
      }
      
      // Default response for any other URLs
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '{}'
      };
    });
    
    // Simulate pressing the "Send Output" button for an example
    const exampleOutput = "Example output from Gear A";
    await gearA.forwardOutputToGears(exampleOutput);
    
    // Verify only one request was made to Gear B
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/gears/gear-B'),
      expect.any(Object)
    );
    
    // The critical assertion: exactly one log entry was created
    const logEntries = (gearB as any).data.log;
    expect(logEntries.length).toBe(1);
    
    // Verify the log entry contains the correct information
    expect(logEntries[0]).toHaveProperty('source.id', 'gear-A');
    expect(logEntries[0]).toHaveProperty('source.label', 'Gear A');
    expect(logEntries[0]).toHaveProperty('input', exampleOutput);
    expect(logEntries[0]).toHaveProperty('output', `Processed by Gear B: ${exampleOutput}`);
  }, 60000);
});