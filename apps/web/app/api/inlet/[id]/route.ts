import { runPatch } from '@patch/runtime';

function generatorToStream<T>(gen: AsyncGenerator<T>) {
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await gen.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(`data: ${JSON.stringify(value)}\n\n`);
      } catch (err) {
        controller.enqueue(
          `event: error\ndata: ${JSON.stringify({
            message: err instanceof Error ? err.message : String(err),
          })}\n\n`
        );
        controller.close();
      }
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // TODO: configure CORS headers if web UI runs on a different origin

  const payload = await req.json().catch(() => ({}));

  let gen: AsyncGenerator<unknown>;
  try {
    gen = runPatch(params.id, payload);
  } catch (err) {
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          `event: error\ndata: ${JSON.stringify({
            message: err instanceof Error ? err.message : String(err),
          })}\n\n`
        );
        controller.close();
      },
    });
    return new Response(errorStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const stream = generatorToStream(gen);

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
