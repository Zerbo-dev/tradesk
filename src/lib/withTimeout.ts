/**
 * Fait échouer proprement une promesse après `ms` millisecondes, plutôt
 * que de laisser une route serverless tourner jusqu'à sa limite dure
 * (Vercel tue alors la fonction sans message d'erreur exploitable).
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout (${ms / 1000}s) sur ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
