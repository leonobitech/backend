/**
 * Verifica que un valor no sea null ni undefined.
 * Si lo es, lanza un error. Si no, refina el tipo a NonNullable<T>.
 */
export function assertIsDefined<T>(
  value: T,
  message = "Valor requerido pero no definido"
): asserts value is NonNullable<T> {
  if (value == null) {
    throw new Error(message);
  }
}
