import { Gear } from '@/lib/models/gear';
import { POST } from '@/app/api/gears/[gearId]/route';

// Mock the Gear model and its implementation
jest.mock('@/lib/models/gear');

// Utility function to create test requests
const createRequest = (body: any, gearId: string = 'A') => new Request(
  `http://localhost:3000/api/gears/${gearId}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }
);

describe('Gear Forwarding API Route', () => {
  let mockGearA: any;
  let mockGearB: any;
  let originalFetch: typeof global.fetch;
  
  beforeAll(() => {
    // Save the original fetch implementation
    originalFetch = global.fetch;
    // Mock fetch globally
    global.fetch = jest.fn();
  });

  afterAll(() => {
    // Restore original fetch implementation
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock gears with the real implementation for processInput
    mockGearA = {
      id: 'A',
      processInput: jest.fn().mockImplementation(async (source, message) => {
        // Simulate the real processInput behavior which calls process()
        const output = 'Output from Gear A';
        
        // Mock process method to call forwardOutputToGears
        await mockGearA.forwardOutputToGears(output);
        
        return output;
      }),
      outputUrls: ['/api/gears/B'], // Gear A is connected to Gear B
      forwardOutputToGears: jest.fn().mockResolvedValue(undefined)
    };
    
    mockGearB = {
      id: 'B',
      processInput: jest.fn().mockResolvedValue('Output from Gear B'),
      outputUrls: [],
      forwardOutputToGears: jest.fn().mockResolvedValue(undefined)
    };

    // Mock the Gear.findById to return our mock gears
    (Gear.findById as jest.Mock).mockImplementation((gearId) => {
      if (gearId === 'A') return Promise.resolve(mockGearA);
      if (gearId === 'B') return Promise.resolve(mockGearB);
      return Promise.resolve(null);
    });
  });

  it('should forward output from Gear A to Gear B when processing input', async () => {
    // Mock the forwardOutputToGears method to use our mocked fetch
    mockGearA.forwardOutputToGears = jest.fn().mockImplementation(async (output) => {
      console.log(`Forwarding output from A to output gears: ${output}`);
      
      for (const url of mockGearA.outputUrls) {
        const newMessageId = '123456789'; // Fixed ID for testing
        try {
          // Construct full URL (similar to the real implementation)
          let fullUrl = url;
          if (url.startsWith('/')) {
            const origin = 'http://localhost:3000';
            fullUrl = `${origin}${url}`;
          }
          
          // Call the global fetch which is already mocked
          await fetch(fullUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source_gear_id: mockGearA.id,
              message_id: newMessageId,
              data: output,
            }),
          });
        } catch (error) {
          console.error(`Error forwarding to ${url}: ${error}`);
        }
      }
    });
    
    // Configure the fetch mock to simulate API call to Gear B
    (global.fetch as jest.Mock).mockImplementation(async (url, options) => {
      // For our test, we want to actually call the POST route handler for Gear B
      // whenever our mock forwards data from Gear A to Gear B
      if (url === 'http://localhost:3000/api/gears/B') {
        const body = JSON.parse(options.body as string);
        
        // Create a request object to pass to our route handler
        const request = createRequest({
          message: body.data,
          source: body.source_gear_id
        }, 'B');
        
        // Call the actual handler for Gear B (with params for Gear B)
        const gearBParams = Promise.resolve({ gearId: 'B' });
        
        // This simulates the API route being called with Gear B's data
        const response = await POST(request, { params: gearBParams });
        
        // Return a response similar to what fetch would return
        return {
          ok: response.status === 200,
          status: response.status,
          json: async () => await response.json(),
          text: async () => await response.text()
        };
      }
      
      // For any other fetch calls, just return OK
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => ""
      };
    });

    // Act: Send a POST request to Gear A
    const response = await POST(
      createRequest({ message: 'Test input message', source: 'test' }),
      { params: Promise.resolve({ gearId: 'A' }) }
    );
    
    // Assert: Response from Gear A is successful
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ output: 'Output from Gear A' });
    
    // Verify: Gear A processed the input
    expect(mockGearA.processInput).toHaveBeenCalledWith('test', 'Test input message');
    
    // Verify: Gear A forwarded its output to Gear B
    expect(mockGearA.forwardOutputToGears).toHaveBeenCalledWith('Output from Gear A');
    
    // Verify: fetch was called with Gear B's API endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/gears/B',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Output from Gear A')
      })
    );
    
    // Verify: Gear B also processed the input forwarded from Gear A
    expect(mockGearB.processInput).toHaveBeenCalledWith('A', 'Output from Gear A');
  });

  it('should not forward if Gear A has no output URLs configured', async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup: Gear A exists but has no output URLs
    mockGearA.outputUrls = [];
    
    // Redefine forwardOutputToGears for this test
    mockGearA.forwardOutputToGears = jest.fn().mockImplementation(async (output) => {
      console.log(`Forwarding output from A to output gears (empty): ${output}`);
      // Since outputUrls is empty, this should do nothing
    });
    
    // Act: Send a POST request to Gear A
    const response = await POST(
      createRequest({ message: 'Test input message', source: 'test' }),
      { params: Promise.resolve({ gearId: 'A' }) }
    );
    
    // Assert: Response from Gear A is successful
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ output: 'Output from Gear A' });
    
    // Verify: Gear A processed the input
    expect(mockGearA.processInput).toHaveBeenCalledWith('test', 'Test input message');
    
    // Verify: Gear A's forwardOutputToGears was called (but with no URLs to forward to)
    expect(mockGearA.forwardOutputToGears).toHaveBeenCalledWith('Output from Gear A');
    
    // Verify: fetch was not called since there are no output URLs
    expect(global.fetch).not.toHaveBeenCalled();
    
    // Verify: Gear B did not process any input
    expect(mockGearB.processInput).not.toHaveBeenCalled();
  });

  it('should handle errors when Gear B is not found', async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup: Gear A exists and is connected to Gear B, but Gear B doesn't exist
    (Gear.findById as jest.Mock)
      .mockImplementation(async (gearId) => {
        if (gearId === 'A') return mockGearA;
        return null; // Gear B not found
      });
    
    // Make sure output URLs are properly set
    mockGearA.outputUrls = ['/api/gears/B'];
    
    // Mock forwardOutputToGears to use our mocked fetch
    mockGearA.forwardOutputToGears = jest.fn().mockImplementation(async (output) => {
      for (const url of mockGearA.outputUrls) {
        try {
          let fullUrl = url;
          if (url.startsWith('/')) {
            const origin = 'http://localhost:3000';
            fullUrl = `${origin}${url}`;
          }
          
          await fetch(fullUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source_gear_id: mockGearA.id,
              message_id: '123456789',
              data: output,
            }),
          });
        } catch (error) {
          console.error(`Error forwarding to ${url}: ${error}`);
        }
      }
    });
    
    // Configure fetch mock to return a 404 for Gear B
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Gear not found' }),
      text: async () => 'Gear not found'
    });

    // Act: Send a POST request to Gear A
    const response = await POST(
      createRequest({ message: 'Test input message', source: 'test' }),
      { params: Promise.resolve({ gearId: 'A' }) }
    );
    
    // Assert: Response from Gear A is still successful
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ output: 'Output from Gear A' });
    
    // Verify: Gear A processed the input
    expect(mockGearA.processInput).toHaveBeenCalledWith('test', 'Test input message');
    
    // Verify: Gear A attempted to forward its output
    expect(mockGearA.forwardOutputToGears).toHaveBeenCalledWith('Output from Gear A');
    
    // Verify: fetch was called with Gear B's API endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/gears/B',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Output from Gear A')
      })
    );
  });
});