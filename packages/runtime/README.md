# Patch Runtime

A secure streaming runtime for executing patches in topological order.

## Security Features

### SSRF Protection
The runtime includes comprehensive Server-Side Request Forgery (SSRF) protection:

- **Host Allowlist**: Only permitted hosts can be accessed via HTTP nodes
- **Private Network Blocking**: Prevents access to localhost, private IP ranges, and cloud metadata services
- **Protocol Restrictions**: Only HTTP and HTTPS are allowed
- **Port Filtering**: Common service ports (SSH, Telnet, SMTP, etc.) are blocked

### Configuration

Set allowed hosts via environment variable:
```bash
export PATCH_ALLOWED_HOSTS="api.openai.com,api.anthropic.com,hooks.slack.com"
```

Default allowed hosts:
- `api.openai.com`
- `api.anthropic.com`
- `hooks.slack.com`

### HTTP Request Security

- **30-second timeouts** prevent hanging requests
- **Proper Content-Type headers** for JSON communication
- **HTTP status validation** catches server errors
- **AbortController** support for request cancellation

## Blocked Networks

The following are automatically blocked to prevent SSRF attacks:

- `localhost`, `127.0.0.1`, `::1` (loopback)
- `10.0.0.0/8` (private class A)
- `172.16.0.0/12` (private class B)
- `192.168.0.0/16` (private class C)
- `169.254.0.0/16` (link-local, AWS metadata)
- IPv6 private ranges

## Usage

```typescript
import { runPatch } from './packages/runtime/runPatch';
import { registerLocalFn } from './packages/runtime/localFns';

// Register local functions
registerLocalFn('double', (x: number) => x * 2);

// Execute patch
const patch = {
  nodes: [
    { id: 'A', kind: 'local', fn: 'double' },
    { id: 'B', kind: 'http', url: 'https://api.openai.com/v1/chat/completions' }
  ],
  edges: [{ source: 'A', target: 'B' }]
};

for await (const event of runPatch(patch, 5)) {
  console.log(event);
}
```

## Error Handling

The runtime provides detailed error messages for:
- Invalid URLs or blocked hosts
- HTTP timeouts and failures
- Missing local functions
- Patch validation errors
- Cycle detection in graphs