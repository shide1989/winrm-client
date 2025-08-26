import {
  CommandParams,
  InteractiveCommandParams,
  InteractivePrompt,
  ReceiveOutputResult,
} from './types';
import { doReceiveOutputNonBlocking, doSendInput } from './command';
import { createLogger } from './utils/logger';

const logger = createLogger('interactive');

export async function executeInteractiveCommand(
  params: InteractiveCommandParams
): Promise<string> {
  const timeout = params.timeout || 60000; // 60 seconds default
  const pollInterval = params.pollInterval || 500; // 500ms default

  let accumulatedOutput = '';
  let accumulatedStderr = '';
  const startTime = Date.now();
  const usedPrompts = new Set<string>();

  logger.debug('Starting interactive command execution', {
    timeout,
    pollInterval,
    promptCount: params.prompts.length,
  });

  try {
    const generator = pollCommandWithTimeout(params, timeout, pollInterval);

    for await (const result of generator) {
      accumulatedOutput += result.output;
      accumulatedStderr += result.stderr;

      logger.debug('Received output chunk', {
        output: result.output,
        stderr: result.stderr,
        isComplete: result.isComplete,
      });

      if (result.isComplete) {
        logger.debug('Command completed');
        break;
      }

      // Check for prompt patterns in the most recent output
      const detectedPrompt = detectPromptPattern(result.output, params.prompts);
      if (detectedPrompt) {
        const promptKey = `${detectedPrompt.pattern.source}:${detectedPrompt.response}`;

        if (!usedPrompts.has(promptKey)) {
          usedPrompts.add(promptKey);

          logger.debug('Detected prompt pattern, sending response', {
            pattern: detectedPrompt.pattern.source,
            isSecure: detectedPrompt.isSecure,
          });

          const response = detectedPrompt.response + '\n';
          await doSendInput({
            ...params,
            input: response,
          });
        }
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(`Interactive command timed out after ${timeout}ms`);
      }
    }
  } catch (error) {
    logger.debug('Interactive command execution failed', error);
    throw error;
  }

  return accumulatedStderr || accumulatedOutput;
}

export function detectPromptPattern(
  output: string,
  prompts: InteractivePrompt[]
): InteractivePrompt | null {
  if (!output) return null;

  for (const prompt of prompts) {
    if (prompt.pattern.test(output)) {
      logger.debug('Pattern matched', {
        pattern: prompt.pattern.source,
        output: prompt.isSecure ? '[HIDDEN]' : output,
      });
      return prompt;
    }
  }

  return null;
}

export async function* pollCommandWithTimeout(
  params: CommandParams,
  timeout: number,
  pollInterval: number
): AsyncGenerator<ReceiveOutputResult> {
  const startTime = Date.now();
  let currentInterval = pollInterval;

  while (Date.now() - startTime < timeout) {
    try {
      const result = await doReceiveOutputNonBlocking(params);

      yield result;

      if (result.isComplete) {
        return;
      }

      // Exponential backoff with max interval of 2 seconds
      if (!result.output && !result.stderr) {
        currentInterval = Math.min(currentInterval * 1.2, 2000);
      } else {
        currentInterval = pollInterval; // Reset interval if we got data
      }

      await new Promise((resolve) => setTimeout(resolve, currentInterval));
    } catch (error) {
      logger.debug('Error during polling', error);
      throw error;
    }
  }

  throw new Error(`Polling timed out after ${timeout}ms`);
}
