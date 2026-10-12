// The weekly analyst and publisher run on local hardware against a local model and must never
// reach a paid API. Two checks, both run before any work: no cloud credential is present in the
// environment (a library that finds one may use it without being asked), and the model endpoint
// is loopback. scripts/workforce/weekly.sh repeats the first check in shell before node starts.

/** Variables whose mere presence refuses the run. Names only; values are never read or printed. */
export const REFUSED_ENV = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
] as const;

/** Names of refused variables that are set (an empty string counts as set). */
export function refusedEnv(env: Record<string, string | undefined>): string[] {
  return REFUSED_ENV.filter((k) => env[k] !== undefined);
}

export const DEFAULT_MODEL_URL = 'http://127.0.0.1:11434/v1';
export const DEFAULT_MODEL = 'gpt-oss:120b';

/** Throws unless the URL points at this machine. A tailnet or LAN host is refused too. */
export function assertLoopback(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`model url is not a URL: ${url}`);
  }
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
    throw new Error(`model url must be loopback (127.0.0.1), got host ${host}`);
  }
}

/** Throws with the offending names when the environment could route a call to a paid API. */
export function assertLocalOnly(env: Record<string, string | undefined>, modelUrl: string): void {
  const bad = refusedEnv(env);
  if (bad.length) {
    throw new Error(`refusing to run: ${bad.join(', ')} set in the environment. Unset it; this job is local-only.`);
  }
  assertLoopback(modelUrl);
}
