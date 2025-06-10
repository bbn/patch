# Demo Simple Patch

This patch demonstrates a minimal flow executed by the runtime.

1. Send a POST request to `/api/inlet/demo-simple` with `{ "msg": "Hello" }`.
2. The `echoGear` function returns the same message in an `{ "echo": ... }` object.
3. The revalidate outlet triggers `revalidatePath('/demo')`.
