import {
  CommandParams,
  InteractiveCommandParams,
  InteractivePromptOutput,
  ReceiveOutputResult,
} from './types';
import { doReceiveOutputNonBlocking, doSendInput } from './command';
import { createLogger } from './utils/logger';

const logger = createLogger('interactive');

/**
 * Monitor the output of an interactive command, detect prompts, and send responses as needed.
 */
export async function monitorCommandOutput(
  params: InteractiveCommandParams
): Promise<string> {
  const executionTimeout = params.executionTimeout || 60000; // 60 seconds default
  const pollInterval = params.pollInterval || 500; // 500ms default

  let accumulatedOutput = '';
  let accumulatedStderr = '';
  const startTime = Date.now();
  const usedPrompts = new Set<string>();

  logger.debug('Starting interactive command execution', {
    executionTimeout,
    pollInterval,
    promptCount: params.prompts.length,
  });

  try {
    const generator = pollCommandWithTimeout(
      params,
      executionTimeout,
      pollInterval
    );

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
      const detectedPrompt = await detectPromptPattern(
        result.output,
        params.prompts
      );
      if (detectedPrompt) {
        // Create a unique key for the prompt (handle cases where pattern might be undefined)
        const patternSource =
          detectedPrompt.pattern?.source || 'custom-detector';
        const promptKey = `${patternSource}:${detectedPrompt.response}`;

        if (!usedPrompts.has(promptKey)) {
          usedPrompts.add(promptKey);

          const detectionMethod = detectedPrompt.asyncDetector
            ? 'async-detector'
            : detectedPrompt.detector
              ? 'sync-detector'
              : 'pattern';

          logger.debug('Detected prompt, sending response', {
            detectionMethod,
            pattern: detectedPrompt.pattern?.source,
            isSecure: detectedPrompt.isSecure,
            response: detectedPrompt.response,
          });

          const response = detectedPrompt.response + '\n';
          await doSendInput({
            ...params,
            input: response,
          });
        }
      }

      // Check execution timeout
      if (Date.now() - startTime > executionTimeout) {
        throw new Error(
          `Interactive command timed out after ${executionTimeout}ms`
        );
      }
    }
  } catch (error) {
    logger.debug('Interactive command execution failed', error);
    throw error;
  }

  return accumulatedStderr || accumulatedOutput;
}

export async function detectPromptPattern(
  output: string,
  prompts: InteractivePromptOutput[]
): Promise<InteractivePromptOutput | null> {
  if (!output) return null;

  for (const prompt of prompts) {
    // Validate that prompt has at least one detection method
    if (!prompt.pattern && !prompt.detector && !prompt.asyncDetector) {
      logger.debug('Prompt missing detection method', {
        response: prompt.response,
      });
      continue;
    }

    try {
      let matched = false;
      let response = '';

      // Check async detector first (highest priority)
      if (prompt.asyncDetector) {
        response = await prompt.asyncDetector(output);
        if (response) {
          logger.debug('Async detector matched', {
            output: prompt.isSecure ? '[HIDDEN]' : output,
          });
          return { ...prompt, response };
        }
      }
      // Check sync detector
      else if (prompt.detector) {
        matched = prompt.detector(output);
        if (matched) {
          logger.debug('Sync detector matched', {
            output: prompt.isSecure ? '[HIDDEN]' : output,
          });
          return prompt;
        }
      }
      // Fall back to regex pattern
      else if (prompt.pattern) {
        matched = prompt.pattern.test(output);
        if (matched) {
          logger.debug('Pattern matched', {
            pattern: prompt.pattern.source,
            output: prompt.isSecure ? '[HIDDEN]' : output,
          });
          return prompt;
        }
      }
    } catch (error) {
      logger.debug('Detection method error', {
        error: error instanceof Error ? error.message : String(error),
        output: prompt.isSecure ? '[HIDDEN]' : output,
      });

      // Try fallback to pattern if available
      if (prompt.pattern) {
        try {
          if (prompt.pattern.test(output)) {
            logger.debug('Pattern fallback matched after detector error', {
              pattern: prompt.pattern.source,
              output: prompt.isSecure ? '[HIDDEN]' : output,
            });
            return prompt;
          }
        } catch (patternError) {
          logger.debug('Pattern fallback also failed', {
            error:
              patternError instanceof Error
                ? patternError.message
                : String(patternError),
          });
        }
      }
    }
  }

  return null;
}

export async function* pollCommandWithTimeout(
  params: CommandParams,
  executionTimeout: number,
  pollInterval: number
): AsyncGenerator<ReceiveOutputResult> {
  const startTime = Date.now();
  let currentInterval = pollInterval;

  while (Date.now() - startTime < executionTimeout) {
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

  throw new Error(`Polling timed out after ${executionTimeout}ms`);
}
