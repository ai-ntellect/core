import pino from 'pino';

/**
 * Shared Pino logger for the CortexFlow runtime.
 *
 * Pretty-prints in development with `HH:MM:ss Z` timestamps.
 * Use `logger.child({ sessionId, traceId })` inside every session scope so log
 * lines can be correlated across a full orchestration trace.
 *
 * @example
 * ```ts
 * import logger from '../utils/logger';
 *
 * const log = logger.child({ sessionId: 'abc', traceId: 'trace_123' });
 * log.info({ intent: 'FETCH_MAILS' }, 'Intent classified');
 * log.warn({ confidence: 0.4 }, 'Low confidence — requesting clarification');
 * ```
 */
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  },
});

/**
 * Creates a child logger pre-bound with session and trace identifiers.
 *
 * @param sessionId - Stable session ID returned by `CortexFlowOrchestrator.startSession()`.
 * @param traceId - Correlation ID propagated through all token data and log entries.
 */
export const createLogger = (sessionId?: string, traceId?: string) => {
  return logger.child({ sessionId, traceId });
};

export default logger;
