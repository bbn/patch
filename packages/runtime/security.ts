/**
 * Security utilities for URL validation and SSRF protection
 */

// Default allowed hosts - can be overridden via environment variable
const DEFAULT_ALLOWED_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'hooks.slack.com',
];

// Get allowed hosts from environment or use defaults
function getAllowedHosts(): string[] {
  const envHosts = process.env.PATCH_ALLOWED_HOSTS;
  if (envHosts) {
    return envHosts.split(',').map(host => host.trim());
  }
  return DEFAULT_ALLOWED_HOSTS;
}

/**
 * Check if a hostname represents a private network address
 */
function isPrivateNetwork(hostname: string): boolean {
  // Block localhost variants
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname.toLowerCase())) {
    return true;
  }
  
  // Block private IP ranges
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    
    // 10.0.0.0/8 (10.0.0.0 to 10.255.255.255)
    if (a === 10) return true;
    
    // 172.16.0.0/12 (172.16.0.0 to 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    
    // 192.168.0.0/16 (192.168.0.0 to 192.168.255.255)
    if (a === 192 && b === 168) return true;
    
    // 169.254.0.0/16 (AWS metadata service and link-local)
    if (a === 169 && b === 254) return true;
    
    // Loopback range 127.0.0.0/8
    if (a === 127) return true;
  }
  
  // Block IPv6 private ranges (simplified check)
  if (hostname.includes('::1') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
    return true;
  }
  
  return false;
}

/**
 * Validate HTTP URL for security - prevents SSRF attacks
 */
export function validateHttpUrl(urlString: string): void {
  let url: URL;
  
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }
  
  // Only allow HTTP and HTTPS protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Protocol not allowed: ${url.protocol}. Only http: and https: are permitted.`);
  }
  
  // Block private networks
  if (isPrivateNetwork(url.hostname)) {
    throw new Error(`Private network access forbidden: ${url.hostname}`);
  }
  
  // Check against allowlist
  const allowedHosts = getAllowedHosts();
  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname}. Allowed hosts: ${allowedHosts.join(', ')}`);
  }
  
  // Additional security checks
  if (url.port && ['22', '23', '25', '53', '135', '139', '445'].includes(url.port)) {
    throw new Error(`Port not allowed: ${url.port}. Common service ports are blocked.`);
  }
}

/**
 * Create an AbortController with timeout
 */
export function createTimeoutController(timeoutMs: number = 30000): AbortController {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  // Clear timeout if operation completes normally
  const originalSignal = controller.signal;
  const cleanup = () => clearTimeout(timeoutId);
  originalSignal.addEventListener('abort', cleanup);
  
  return controller;
}