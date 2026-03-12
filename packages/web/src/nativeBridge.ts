export interface NativeMessage {
  id: string
  protocolVersion: number
  method: string
  payload?: any
}

export interface NativeResponse<T = any> {
  id?: string
  protocolVersion?: number
  method?: string
  ok: boolean
  result?: T
  error?: string | { code?: string; message?: string }
}

declare global {
  interface Window {
    chromeCollect?: {
      invoke: (method: string, payload?: any) => Promise<NativeResponse>
    }
  }
}

const DEFAULT_TIMEOUT = 20000

async function timeoutPromise<T>(promise: Promise<T>, timeoutMs: number, method: string) {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Native call ${method} timed out`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!))
}

export async function invokeNative<T = any>(method: string, payload?: any, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  const invoker = window.chromeCollect?.invoke
  if (!invoker) {
    throw new Error('未检测到 Chrome Collect 桌面端')
  }
  const response = await timeoutPromise(invoker(method, payload), timeoutMs, method)
  if (!response?.ok) {
    const errorMessage = typeof response?.error === 'string'
      ? response.error
      : response?.error?.message
    throw new Error(errorMessage || `Native call ${method} failed`)
  }
  return response.result as T
}
