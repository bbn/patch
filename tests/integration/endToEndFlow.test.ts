import { registerLocalFn } from '@/packages/runtime/localFns';
import * as revalidateModule from '@/packages/outlets/revalidate';
import { PatchDefinition } from '@/types/Patch';
import { Gear } from '@/lib/models/gear';

// Mock revalidate helper to observe calls
jest.mock('@/packages/outlets/revalidate', () => ({
  revalidate: jest.fn()
}));

// Build the mock patch used by the route
const mockPatch: PatchDefinition = {
  nodes: [
    { id: 'nodeA', kind: 'local', fn: 'doubleGear' },
    { id: 'nodeB', kind: 'local', fn: 'toStringGear' },
    { id: 'outlet', kind: 'local', fn: 'revalidate' }
  ],
  edges: [
    { source: 'nodeA', target: 'nodeB' },
    { source: 'nodeB', target: 'outlet' }
  ]
};

// Mock the API route so we can stub loadPatch
jest.mock('@/apps/web/app/api/inlet/[id]/route', () => {
  const { runPatch } = require('@/packages/runtime/runPatch');

  const loadPatch = jest.fn(async (_id: string) => mockPatch);

  function generatorToStream(gen: AsyncGenerator<any>) {
    return new ReadableStream({
      async pull(controller) {
        const { value, done } = await gen.next();
        if (done) {
          controller.close();
          return;
        }
        const text = `data: ${JSON.stringify(value)}\n\n`;
        controller.enqueue(new TextEncoder().encode(text));
      }
    });
  }

  async function POST(req: Request, { params }: { params: { id: string } }) {
    const payload = await req.json();
    const patch = await loadPatch(params.id);
    const gen = runPatch(patch, payload);
    const stream = generatorToStream(gen);
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  return { __esModule: true, POST, loadPatch };
});

import { POST } from '@/apps/web/app/api/inlet/[id]/route';

describe('Patch Runtime end-to-end flow', () => {
  let doubleGear: Gear;
  let toStringGear: Gear;

  beforeAll(async () => {
    doubleGear = new Gear({ id: 'double-gear' });
    await doubleGear.addMessage({
      role: 'system',
      content: 'Double the input number and return the result.'
    });
    jest
      .spyOn(doubleGear, 'processWithoutLogging')
      .mockImplementation(async (_src, input: any) =>
        ((input.number as number) * 2) as unknown as any
      );

    toStringGear = new Gear({ id: 'toString-gear' });
    await toStringGear.addMessage({
      role: 'system',
      content: 'Convert the number to a labelled string.'
    });
    jest
      .spyOn(toStringGear, 'processWithoutLogging')
      .mockImplementation(async (_src, input: any) => `value=${input}` as any);

    registerLocalFn('doubleGear', (input: any) =>
      doubleGear.processWithoutLogging('runtime', input)
    );
    registerLocalFn('toStringGear', (n: number) =>
      toStringGear.processWithoutLogging('runtime', n as any)
    );
    registerLocalFn('revalidate', async () => {
      await revalidateModule.revalidate(['/demo/path']);
      return 'done';
    });
  });

  it('executes patch via POST route and streams events', async () => {
    const req = new Request('http://test/api/inlet/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: 5 })
    });

    const response = await POST(req, { params: { id: 'inlet' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const text = await response.text();
    const events = text.trim().split('\n\n').map(chunk => JSON.parse(chunk.replace(/^data: /, '')));

    const types = events.map(e => e.type);
    expect(types).toEqual([
      'RunStart',
      'NodeStart',
      'NodeSuccess',
      'NodeStart',
      'NodeSuccess',
      'NodeStart',
      'NodeSuccess',
      'RunComplete'
    ]);

    expect(events[2].nodeId).toBe('nodeA');
    expect(events[2].output).toBe(10);
    expect(events[4].nodeId).toBe('nodeB');
    expect(events[4].output).toBe('value=10');

    expect(doubleGear.systemPrompt()).toContain('Double the input number');
    expect(toStringGear.systemPrompt()).toContain('labelled string');
    expect(revalidateModule.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidateModule.revalidate).toHaveBeenCalledWith(['/demo/path']);
  });
});
