import { validateHttpUrl, createTimeoutController } from '@/packages/runtime/security';

describe('HTTP Security Validation', () => {
  // Store original environment variables
  const originalEnv = process.env.PATCH_ALLOWED_HOSTS;

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.PATCH_ALLOWED_HOSTS = originalEnv;
    } else {
      delete process.env.PATCH_ALLOWED_HOSTS;
    }
  });

  describe('validateHttpUrl', () => {
    describe('Protocol validation', () => {
      it('allows http protocol', () => {
        process.env.PATCH_ALLOWED_HOSTS = 'example.com';
        expect(() => validateHttpUrl('http://example.com')).not.toThrow();
      });

      it('allows https protocol', () => {
        process.env.PATCH_ALLOWED_HOSTS = 'example.com';
        expect(() => validateHttpUrl('https://example.com')).not.toThrow();
      });

      it('rejects ftp protocol', () => {
        expect(() => validateHttpUrl('ftp://example.com')).toThrow(
          'Protocol not allowed: ftp:. Only http: and https: are permitted.'
        );
      });

      it('rejects file protocol', () => {
        expect(() => validateHttpUrl('file:///etc/passwd')).toThrow(
          'Protocol not allowed: file:. Only http: and https: are permitted.'
        );
      });

      it('rejects javascript protocol', () => {
        expect(() => validateHttpUrl('javascript:alert(1)')).toThrow(
          'Protocol not allowed: javascript:. Only http: and https: are permitted.'
        );
      });

      it('rejects data protocol', () => {
        expect(() => validateHttpUrl('data:text/html,<script>alert(1)</script>')).toThrow(
          'Protocol not allowed: data:. Only http: and https: are permitted.'
        );
      });
    });

    describe('Invalid URL handling', () => {
      it('rejects malformed URLs', () => {
        expect(() => validateHttpUrl('not-a-url')).toThrow('Invalid URL: not-a-url');
        expect(() => validateHttpUrl('http://')).toThrow('Invalid URL: http://');
        expect(() => validateHttpUrl('')).toThrow('Invalid URL: ');
      });
    });

    describe('Private network blocking', () => {
      beforeEach(() => {
        // Allow any host for private network tests
        process.env.PATCH_ALLOWED_HOSTS = 'localhost,127.0.0.1,10.0.0.1,192.168.1.1,172.16.0.1,169.254.169.254,::1';
      });

      it('blocks localhost variants', () => {
        expect(() => validateHttpUrl('http://localhost:3000')).toThrow(
          'Private network access forbidden: localhost'
        );
        expect(() => validateHttpUrl('http://LOCALHOST:3000')).toThrow(
          'Private network access forbidden: localhost'
        );
      });

      it('blocks 127.x.x.x addresses', () => {
        expect(() => validateHttpUrl('http://127.0.0.1:3000')).toThrow(
          'Private network access forbidden: 127.0.0.1'
        );
        expect(() => validateHttpUrl('http://127.1.1.1')).toThrow(
          'Private network access forbidden: 127.1.1.1'
        );
        expect(() => validateHttpUrl('http://127.255.255.255')).toThrow(
          'Private network access forbidden: 127.255.255.255'
        );
      });

      it('blocks 10.x.x.x private range', () => {
        expect(() => validateHttpUrl('http://10.0.0.1')).toThrow(
          'Private network access forbidden: 10.0.0.1'
        );
        expect(() => validateHttpUrl('http://10.255.255.255')).toThrow(
          'Private network access forbidden: 10.255.255.255'
        );
      });

      it('blocks 192.168.x.x private range', () => {
        expect(() => validateHttpUrl('http://192.168.1.1')).toThrow(
          'Private network access forbidden: 192.168.1.1'
        );
        expect(() => validateHttpUrl('http://192.168.255.255')).toThrow(
          'Private network access forbidden: 192.168.255.255'
        );
      });

      it('blocks 172.16-31.x.x private range', () => {
        expect(() => validateHttpUrl('http://172.16.0.1')).toThrow(
          'Private network access forbidden: 172.16.0.1'
        );
        expect(() => validateHttpUrl('http://172.31.255.255')).toThrow(
          'Private network access forbidden: 172.31.255.255'
        );
        expect(() => validateHttpUrl('http://172.20.1.1')).toThrow(
          'Private network access forbidden: 172.20.1.1'
        );
      });

      it('blocks AWS metadata service (169.254.x.x)', () => {
        expect(() => validateHttpUrl('http://169.254.169.254/metadata')).toThrow(
          'Private network access forbidden: 169.254.169.254'
        );
        expect(() => validateHttpUrl('http://169.254.1.1')).toThrow(
          'Private network access forbidden: 169.254.1.1'
        );
      });

      it('blocks IPv6 localhost (::1)', () => {
        expect(() => validateHttpUrl('http://[::1]:3000')).toThrow(
          'Private network access forbidden: ::1'
        );
      });

      it('blocks IPv6 private ranges', () => {
        expect(() => validateHttpUrl('http://[fc00::1]')).toThrow(
          'Private network access forbidden: fc00::1'
        );
        expect(() => validateHttpUrl('http://[fd12:3456:789a:bcde::1]')).toThrow(
          'Private network access forbidden: fd12:3456:789a:bcde::1'
        );
      });

      it('blocks 0.0.0.0', () => {
        expect(() => validateHttpUrl('http://0.0.0.0')).toThrow(
          'Private network access forbidden: 0.0.0.0'
        );
      });

      it('allows public IP addresses', () => {
        process.env.PATCH_ALLOWED_HOSTS = '8.8.8.8,1.1.1.1,172.15.255.255,172.32.0.1';
        
        expect(() => validateHttpUrl('http://8.8.8.8')).not.toThrow();
        expect(() => validateHttpUrl('http://1.1.1.1')).not.toThrow();
        
        // Edge cases around private ranges
        expect(() => validateHttpUrl('http://172.15.255.255')).not.toThrow(); // Before 172.16.x.x
        expect(() => validateHttpUrl('http://172.32.0.1')).not.toThrow(); // After 172.31.x.x
      });
    });

    describe('Host allowlist validation', () => {
      it('uses default allowed hosts when no environment variable set', () => {
        delete process.env.PATCH_ALLOWED_HOSTS;
        
        expect(() => validateHttpUrl('https://api.openai.com')).not.toThrow();
        expect(() => validateHttpUrl('https://api.anthropic.com')).not.toThrow();
        expect(() => validateHttpUrl('https://hooks.slack.com')).not.toThrow();
        
        expect(() => validateHttpUrl('https://evil.com')).toThrow(
          'Host not allowed: evil.com. Allowed hosts: api.openai.com, api.anthropic.com, hooks.slack.com'
        );
      });

      it('uses environment variable for allowed hosts', () => {
        process.env.PATCH_ALLOWED_HOSTS = 'example.com,test.org,api.custom.com';
        
        expect(() => validateHttpUrl('https://example.com')).not.toThrow();
        expect(() => validateHttpUrl('https://test.org')).not.toThrow();
        expect(() => validateHttpUrl('https://api.custom.com')).not.toThrow();
        
        expect(() => validateHttpUrl('https://api.openai.com')).toThrow(
          'Host not allowed: api.openai.com. Allowed hosts: example.com, test.org, api.custom.com'
        );
      });

      it('handles whitespace in environment variable', () => {
        process.env.PATCH_ALLOWED_HOSTS = ' example.com , test.org ,  api.custom.com  ';
        
        expect(() => validateHttpUrl('https://example.com')).not.toThrow();
        expect(() => validateHttpUrl('https://test.org')).not.toThrow();
        expect(() => validateHttpUrl('https://api.custom.com')).not.toThrow();
      });

      it('allows subdomains when configured', () => {
        process.env.PATCH_ALLOWED_HOSTS = 'api.example.com,sub.test.org';
        
        expect(() => validateHttpUrl('https://api.example.com')).not.toThrow();
        expect(() => validateHttpUrl('https://sub.test.org')).not.toThrow();
        
        // Should not allow parent domains
        expect(() => validateHttpUrl('https://example.com')).toThrow(
          'Host not allowed: example.com'
        );
      });
    });

    describe('Port blocking', () => {
      beforeEach(() => {
        process.env.PATCH_ALLOWED_HOSTS = 'example.com';
      });

      it('blocks SSH port (22)', () => {
        expect(() => validateHttpUrl('http://example.com:22')).toThrow(
          'Port not allowed: 22. Common service ports are blocked.'
        );
      });

      it('blocks Telnet port (23)', () => {
        expect(() => validateHttpUrl('http://example.com:23')).toThrow(
          'Port not allowed: 23. Common service ports are blocked.'
        );
      });

      it('blocks SMTP port (25)', () => {
        expect(() => validateHttpUrl('http://example.com:25')).toThrow(
          'Port not allowed: 25. Common service ports are blocked.'
        );
      });

      it('blocks DNS port (53)', () => {
        expect(() => validateHttpUrl('http://example.com:53')).toThrow(
          'Port not allowed: 53. Common service ports are blocked.'
        );
      });

      it('blocks Windows RPC port (135)', () => {
        expect(() => validateHttpUrl('http://example.com:135')).toThrow(
          'Port not allowed: 135. Common service ports are blocked.'
        );
      });

      it('blocks NetBIOS port (139)', () => {
        expect(() => validateHttpUrl('http://example.com:139')).toThrow(
          'Port not allowed: 139. Common service ports are blocked.'
        );
      });

      it('blocks SMB port (445)', () => {
        expect(() => validateHttpUrl('http://example.com:445')).toThrow(
          'Port not allowed: 445. Common service ports are blocked.'
        );
      });

      it('allows common web ports', () => {
        expect(() => validateHttpUrl('http://example.com:80')).not.toThrow();
        expect(() => validateHttpUrl('https://example.com:443')).not.toThrow();
        expect(() => validateHttpUrl('http://example.com:8080')).not.toThrow();
        expect(() => validateHttpUrl('http://example.com:3000')).not.toThrow();
      });

      it('allows URLs without explicit port', () => {
        expect(() => validateHttpUrl('http://example.com')).not.toThrow();
        expect(() => validateHttpUrl('https://example.com')).not.toThrow();
      });
    });

    describe('Complex URL validation', () => {
      beforeEach(() => {
        process.env.PATCH_ALLOWED_HOSTS = 'api.example.com';
      });

      it('validates URLs with paths', () => {
        expect(() => validateHttpUrl('https://api.example.com/v1/api')).not.toThrow();
        expect(() => validateHttpUrl('https://api.example.com/path/to/resource')).not.toThrow();
      });

      it('validates URLs with query parameters', () => {
        expect(() => validateHttpUrl('https://api.example.com/api?key=value&param=test')).not.toThrow();
      });

      it('validates URLs with fragments', () => {
        expect(() => validateHttpUrl('https://api.example.com/page#section')).not.toThrow();
      });

      it('validates complex URLs', () => {
        expect(() => validateHttpUrl('https://api.example.com:8080/v1/api?key=value&param=test#section')).not.toThrow();
      });
    });

    describe('SSRF attack prevention', () => {
      it('prevents access to admin interfaces', () => {
        process.env.PATCH_ALLOWED_HOSTS = 'localhost';
        expect(() => validateHttpUrl('http://localhost:3000/admin')).toThrow(
          'Private network access forbidden: localhost'
        );
      });

      it('prevents AWS metadata service access', () => {
        process.env.PATCH_ALLOWED_HOSTS = '169.254.169.254';
        expect(() => validateHttpUrl('http://169.254.169.254/metadata')).toThrow(
          'Private network access forbidden: 169.254.169.254'
        );
      });

      it('prevents internal service access', () => {
        process.env.PATCH_ALLOWED_HOSTS = 'api.openai.com,api.anthropic.com';
        expect(() => validateHttpUrl('http://internal-service:8080/secrets')).toThrow(
          'Host not allowed: internal-service'
        );
      });

      it('prevents file access', () => {
        expect(() => validateHttpUrl('file:///etc/passwd')).toThrow(
          'Protocol not allowed: file:'
        );
      });
    });
  });

  describe('createTimeoutController', () => {
    it('creates AbortController with default 30 second timeout', (done) => {
      const controller = createTimeoutController();
      
      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
      
      // Verify timeout is set (should abort after 30 seconds)
      setTimeout(() => {
        expect(controller.signal.aborted).toBe(false);
        done();
      }, 100);
    });

    it('creates AbortController with custom timeout', (done) => {
      const controller = createTimeoutController(200);
      
      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
      
      // Should abort after 200ms
      setTimeout(() => {
        expect(controller.signal.aborted).toBe(true);
        done();
      }, 300);
    });

    it('clears timeout when controller is manually aborted', (done) => {
      const controller = createTimeoutController(1000);
      
      expect(controller.signal.aborted).toBe(false);
      
      // Manually abort
      controller.abort();
      
      setTimeout(() => {
        expect(controller.signal.aborted).toBe(true);
        done();
      }, 50);
    });

    it('handles concurrent timeout and manual abort', (done) => {
      const controller = createTimeoutController(100);
      
      // Manually abort before timeout
      setTimeout(() => {
        controller.abort();
      }, 50);
      
      setTimeout(() => {
        expect(controller.signal.aborted).toBe(true);
        done();
      }, 150);
    });
  });
});