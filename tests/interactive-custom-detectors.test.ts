import { detectPromptPattern } from '../src/interactive';
import { InteractivePromptOutput } from '../src/types';

describe('Custom Detector Tests', () => {
  describe('detectPromptPattern with custom detectors', () => {
    it('should use sync detector when provided', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          detector: (output: string): boolean =>
            output.includes('custom-sync-trigger'),
          response: 'sync-response',
        },
      ];

      const result = await detectPromptPattern(
        'some custom-sync-trigger text',
        prompts
      );
      expect(result).not.toBeNull();
      expect(result?.response).toBe('sync-response');
    });

    it('should use async detector when provided', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          asyncDetector: async (output: string): Promise<string> => {
            await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async work
            return output.includes('async-trigger') ? 'async-response' : '';
          },
        },
      ];

      const result = await detectPromptPattern(
        'some async-trigger text',
        prompts
      );
      expect(result).not.toBeNull();
      expect(result?.response).toBe('async-response');
    });

    it('should prioritize async detector over sync detector', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          detector: (): boolean => true, // Would always match
          asyncDetector: async (output: string): Promise<string> =>
            output.includes('priority-test') ? 'async-priority' : '',
        },
      ];

      const result = await detectPromptPattern('priority-test', prompts);
      expect(result).not.toBeNull();
      expect(result?.response).toBe('async-priority');

      // Test that sync detector is not used when async detector doesn't match
      const result2 = await detectPromptPattern('no-match', prompts);
      expect(result2).toBeNull();
    });

    it('should prioritize sync detector over regex pattern', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          pattern: /.*/, // Would always match
          detector: (output: string): boolean =>
            output.includes('sync-priority'),
          response: 'sync-wins',
        },
      ];

      const result = await detectPromptPattern('sync-priority', prompts);
      expect(result).not.toBeNull();
      expect(result?.response).toBe('sync-wins');

      // Test that pattern is not used when sync detector doesn't match
      const result2 = await detectPromptPattern('no-match', prompts);
      expect(result2).toBeNull();
    });

    it('should fall back to regex pattern when no custom detectors provided', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          pattern: /pattern-test/,
          response: 'pattern-response',
        },
      ];

      const result = await detectPromptPattern('pattern-test', prompts);
      expect(result).not.toBeNull();
      expect(result?.response).toBe('pattern-response');
    });

    it('should handle detector errors and fall back to pattern', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          detector: (): boolean => {
            throw new Error('Detector error');
          },
          pattern: /fallback-pattern/,
          response: 'fallback-response',
        },
      ];

      const result = await detectPromptPattern('fallback-pattern', prompts);
      expect(result).not.toBeNull();
      expect(result?.response).toBe('fallback-response');
    });

    it('should handle async detector errors and fall back to pattern', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          asyncDetector: async (): Promise<string> => {
            throw new Error('Async detector error');
          },
          pattern: /async-fallback/,
          response: 'async-fallback-response',
        },
      ];

      const result = await detectPromptPattern('async-fallback', prompts);
      expect(result).not.toBeNull();
      expect(result?.response).toBe('async-fallback-response');
    });

    it('should return null when no detection method provided', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          response: 'invalid-prompt',
        } as InteractivePromptOutput, // Type assertion to bypass TypeScript validation for testing
      ];

      const result = await detectPromptPattern('any text', prompts);
      expect(result).toBeNull();
    });

    it('should return null when all detection methods fail', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          detector: (): boolean => {
            throw new Error('Sync error');
          },
          pattern: /wont-match/,
          response: 'wont-work',
        },
      ];

      const result = await detectPromptPattern('different text', prompts);
      expect(result).toBeNull();
    });

    it('should handle multiple prompts with mixed detection methods', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          pattern: /pattern1/,
          response: 'pattern-response',
        },
        {
          detector: (output: string): boolean =>
            output.includes('blocking-call'),
          response: 'sync-response',
        },
        {
          asyncDetector: async (output: string): Promise<string> =>
            output.includes('promise-await') ? 'async-response' : '',
        },
      ];

      // Test pattern matching
      let result = await detectPromptPattern('pattern1', prompts);
      expect(result?.response).toBe('pattern-response');

      // Test sync detector
      result = await detectPromptPattern('blocking-call', prompts);
      expect(result?.response).toBe('sync-response');

      // Test async detector
      result = await detectPromptPattern('promise-await', prompts);
      expect(result?.response).toBe('async-response');
    });

    it('should return first matching prompt in order', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          detector: (): boolean => true,
          response: 'first-match',
        },
        {
          detector: (): boolean => true,
          response: 'second-match',
        },
      ];

      const result = await detectPromptPattern('any text', prompts);
      expect(result?.response).toBe('first-match');
    });

    it('should handle secure prompts with custom detectors', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          detector: (output: string): boolean => output.includes('password'),
          response: 'secret123',
          isSecure: true,
        },
      ];

      const result = await detectPromptPattern('Enter password:', prompts);
      expect(result).not.toBeNull();
      expect(result?.response).toBe('secret123');
      expect(result?.isSecure).toBe(true);
    });

    it('should handle complex async detection logic', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          asyncDetector: async (output: string): Promise<string> => {
            // Simulate complex async logic (e.g., API call, file read, etc.)
            const mockedResponse = 'yes';
            await new Promise((resolve) => setTimeout(resolve, 50));
            const lines = output.split('\n');
            return lines.some(
              (line) =>
                line.trim().startsWith('>>') && line.includes('continue')
            )
              ? mockedResponse
              : '';
          },
        },
      ];

      const complexOutput = `
Some output
>> Do you want to continue? (y/n)
More output
`;

      const result = await detectPromptPattern(complexOutput, prompts);
      expect(result).not.toBeNull();
      expect(result?.response).toBe('yes');
    });

    it('should handle empty output gracefully', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          detector: (): boolean => true,
          response: 'should-not-match',
        },
      ];

      const result = await detectPromptPattern('', prompts);
      expect(result).toBeNull();
    });

    it('should handle null output gracefully', async () => {
      const prompts: InteractivePromptOutput[] = [
        {
          detector: (): boolean => true,
          response: 'should-not-match',
        },
      ];

      const result = await detectPromptPattern(
        null as unknown as string,
        prompts
      );
      expect(result).toBeNull();
    });
  });
});
