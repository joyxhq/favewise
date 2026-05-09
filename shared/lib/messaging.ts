import type {
  MessageMap,
  MessageType,
  MessageRequest,
  MessageResult,
  MessageResponse,
  BroadcastEvent,
  SuccessResponse,
  ErrorResponse,
} from '~/shared/types/messages'
import { ERROR_CODES } from '~/shared/types/messages'

/**
 * Typed `sendMessage` client. Usage:
 *
 *   const res = await send('scan.latest.get')
 *   if (res.ok) console.log(res.data)
 */
export async function send<K extends MessageType>(
  type: K,
  ...args: MessageRequest<K> extends void ? [] : [payload: MessageRequest<K>]
): Promise<MessageResponse<MessageResult<K>>> {
  const message = {
    type,
    payload: args[0],
    requestId: `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    sentAt: Date.now(),
  }
  try {
    const res = (await chrome.runtime.sendMessage(message)) as
      | MessageResponse<MessageResult<K>>
      | undefined
    if (!res) {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.UNKNOWN,
          message: 'Background did not respond',
          retryable: true,
        },
      }
    }
    return res
  } catch (err) {
    return {
      ok: false,
      error: {
        code: ERROR_CODES.UNKNOWN,
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      },
    }
  }
}

/** Assert a response is successful; throws with a useful message otherwise. */
export function unwrap<T>(res: MessageResponse<T>): T {
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`)
  return res.data
}

/** Narrow helper: return data on success, `fallback` on failure. */
export function unwrapOr<T>(res: MessageResponse<T>, fallback: T): T {
  return res.ok ? res.data : fallback
}

export function ok<T>(data: T): SuccessResponse<T> {
  return { ok: true, data }
}

export function err(code: string, message: string, retryable?: boolean): ErrorResponse {
  return { ok: false, error: { code, message, retryable } }
}

/* ---------- Background dispatch helpers ---------- */

export type Handler<K extends MessageType> = (
  payload: MessageRequest<K>,
) => Promise<MessageResponse<MessageResult<K>>>

export type HandlerMap = { [K in MessageType]?: Handler<K> }

/**
 * Build a typed message dispatcher for `background.ts`. Missing handlers
 * return an UNKNOWN error, which surfaces obviously during development.
 */
export function createDispatcher(handlers: HandlerMap) {
  return async function dispatch(message: {
    type: string
    payload?: unknown
    requestId?: string
  }): Promise<MessageResponse<unknown>> {
    const key = message.type as MessageType
    const handler = handlers[key] as
      | ((payload: unknown) => Promise<MessageResponse<unknown>>)
      | undefined
    if (!handler) {
      return err(ERROR_CODES.UNKNOWN, `Unknown message type: ${message.type}`)
    }
    try {
      return await handler(message.payload)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[Favewise] Handler error for', message.type, e)
      return err(ERROR_CODES.UNKNOWN, msg, true)
    }
  }
}

/* ---------- Sidepanel broadcast subscription ---------- */

export function onBroadcast(
  listener: (event: BroadcastEvent) => void,
): () => void {
  const ourId = chrome.runtime.id
  const fn = (message: unknown, sender: chrome.runtime.MessageSender) => {
    if (sender.id !== ourId) return
    if (isBroadcastEvent(message)) listener(message)
  }
  chrome.runtime.onMessage.addListener(fn)
  return () => chrome.runtime.onMessage.removeListener(fn)
}

function isBroadcastEvent(m: unknown): m is BroadcastEvent {
  if (!m || typeof m !== 'object') return false
  const t = (m as { type?: string }).type
  return (
    t === 'scan.progress' ||
    t === 'scan.completed' ||
    t === 'scan.failed' ||
    t === 'deadLinks.progress' ||
    t === 'inbox.updated'
  )
}

/** Safe helper for firing broadcast events from the background. */
export function broadcast(event: BroadcastEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {
    /* no receiver is fine */
  })
}

export type { MessageType, MessageRequest, MessageResult, MessageResponse, BroadcastEvent } from '~/shared/types/messages'
