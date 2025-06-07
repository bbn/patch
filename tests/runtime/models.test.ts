import {
  validatePatch,
  validateGearTemplate,
  validateGearInstance,
  validateConfig,
  validateLoggingOptions,
  validatePatchRun,
  parsePatch,
  parseGearTemplate,
  GearPortSchema,
  LoggingOptionsSchema,
  GearTemplateSchema,
  GearInstanceSchema,
  PatchEdgeSchema,
  PatchRunSchema,
  PatchSchema,
  type GearPort,
  type GearTemplate,
  type GearInstance,
  type PatchEdge,
  type Patch,
  type PatchRun,
  type LoggingOptions,
} from '@/packages/runtime/models';

describe('Runtime Data Models', () => {
  describe('GearPort', () => {
    const validPort: GearPort = {
      id: 'input-1',
      name: 'Input Port',
      dataType: 'string',
    };

    it('validates a valid gear port', () => {
      const result = GearPortSchema.safeParse(validPort);
      expect(result.success).toBe(true);
    });

    it('rejects invalid gear port with missing fields', () => {
      const invalidPort = { id: 'test' };
      const result = GearPortSchema.safeParse(invalidPort);
      expect(result.success).toBe(false);
    });
  });

  describe('LoggingOptions', () => {
    const validLoggingOptions: LoggingOptions = {
      level: 'info',
      redact: true,
      sampleRate: 0.5,
    };

    it('validates valid logging options', () => {
      expect(validateLoggingOptions(validLoggingOptions)).toBe(true);
    });

    it('validates minimal logging options', () => {
      const minimal: LoggingOptions = { level: 'debug' };
      expect(validateLoggingOptions(minimal)).toBe(true);
    });

    it('rejects invalid log level', () => {
      const invalid = { level: 'invalid', redact: true };
      expect(validateLoggingOptions(invalid)).toBe(false);
    });

    it('rejects invalid sample rate', () => {
      const invalid = { level: 'info', sampleRate: 1.5 };
      expect(validateLoggingOptions(invalid)).toBe(false);
    });
  });

  describe('GearTemplate', () => {
    const validTemplate: GearTemplate = {
      id: 'template-1',
      name: 'Test Template',
      version: '1.0.0',
      author: 'Test Author',
      description: 'A test template',
      configSchema: { type: 'object', properties: {} },
      defaultConfig: {},
      inputPorts: [{
        id: 'input-1',
        name: 'Input',
        dataType: 'string',
      }],
      outputPorts: [{
        id: 'output-1',
        name: 'Output',
        dataType: 'string',
      }],
      loggingOptions: { level: 'info' },
    };

    it('validates a valid gear template', () => {
      expect(validateGearTemplate(validTemplate)).toBe(true);
    });

    it('parses a valid gear template', () => {
      const result = parseGearTemplate(validTemplate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('template-1');
      }
    });

    it('rejects template with missing required fields', () => {
      const invalid = { id: 'test', name: 'Test' };
      expect(validateGearTemplate(invalid)).toBe(false);
    });

    it('returns errors for invalid template', () => {
      const invalid = { id: 'test' };
      const result = parseGearTemplate(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('GearInstance', () => {
    const validInstance: GearInstance = {
      id: 'instance-1',
      templateId: 'template-1',
      name: 'Test Instance',
      config: { setting1: 'value1' },
      loggingOptions: { level: 'debug' },
    };

    it('validates a valid gear instance', () => {
      expect(validateGearInstance(validInstance)).toBe(true);
    });

    it('validates minimal gear instance', () => {
      const minimal: GearInstance = {
        id: 'instance-1',
        templateId: 'template-1',
      };
      expect(validateGearInstance(minimal)).toBe(true);
    });

    it('rejects instance with invalid config type', () => {
      const invalid = {
        id: 'instance-1',
        templateId: 'template-1',
        config: 'not an object',
      };
      expect(validateGearInstance(invalid)).toBe(false);
    });
  });

  describe('PatchEdge', () => {
    const validEdge: PatchEdge = {
      source: 'node-1',
      target: 'node-2',
    };

    it('validates a valid patch edge', () => {
      const result = PatchEdgeSchema.safeParse(validEdge);
      expect(result.success).toBe(true);
    });

    it('rejects edge with missing target', () => {
      const invalid = { source: 'node-1' };
      const result = PatchEdgeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('PatchRun', () => {
    const validRun: PatchRun = {
      status: 'succeeded',
      startedAt: Date.now(),
      duration: 5000,
      costSummary: {
        totalTokens: 1000,
        promptTokens: 500,
        completionTokens: 500,
        totalCost: 0.02,
        currency: 'USD',
      },
    };

    it('validates a valid patch run', () => {
      expect(validatePatchRun(validRun)).toBe(true);
    });

    it('validates minimal patch run', () => {
      const minimal: PatchRun = {
        status: 'running',
        startedAt: Date.now(),
        duration: 0,
      };
      expect(validatePatchRun(minimal)).toBe(true);
    });

    it('rejects invalid status', () => {
      const invalid = {
        status: 'invalid',
        startedAt: Date.now(),
        duration: 1000,
      };
      expect(validatePatchRun(invalid)).toBe(false);
    });
  });

  describe('Patch', () => {
    const validPatch: Patch = {
      id: 'patch-1',
      name: 'Test Patch',
      description: 'A test patch',
      nodes: [{
        id: 'instance-1',
        templateId: 'template-1',
      }],
      edges: [{
        source: 'instance-1',
        target: 'instance-2',
      }],
      inletIds: ['inlet-1'],
      outletIds: ['outlet-1'],
      loggingOptions: { level: 'info' },
      runHistory: [{
        status: 'succeeded',
        startedAt: Date.now(),
        duration: 1000,
      }],
    };

    it('validates a valid patch', () => {
      expect(validatePatch(validPatch)).toBe(true);
    });

    it('parses a valid patch', () => {
      const result = parsePatch(validPatch);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('patch-1');
      }
    });

    it('validates minimal patch', () => {
      const minimal: Patch = {
        id: 'patch-1',
        name: 'Minimal Patch',
        nodes: [],
        edges: [],
        inletIds: [],
        outletIds: [],
      };
      expect(validatePatch(minimal)).toBe(true);
    });

    it('rejects patch with invalid structure', () => {
      const invalid = {
        id: 'patch-1',
        nodes: 'not an array',
        edges: [],
        inletIds: [],
        outletIds: [],
      };
      expect(validatePatch(invalid)).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('validates valid config objects', () => {
      expect(validateConfig({})).toBe(true);
      expect(validateConfig({ key: 'value' })).toBe(true);
      expect(validateConfig({ nested: { key: 'value' } })).toBe(true);
    });

    it('rejects non-object configs', () => {
      expect(validateConfig('string')).toBe(false);
      expect(validateConfig(123)).toBe(false);
      expect(validateConfig([])).toBe(false);
      expect(validateConfig(null)).toBe(false);
      expect(validateConfig(undefined)).toBe(false);
    });
  });
});