/**
 * PostgREST builders only hit the network when they are awaited or then()'d.
 * `void client.from(...).upsert(...)` builds the query and never sends it.
 */
export function runQuery(
  query: PromiseLike<{ error: unknown }>,
  onError?: (error: unknown) => void,
): Promise<void> {
  return Promise.resolve(query).then(
    (result) => {
      if (result?.error) {
        if (onError) onError(result.error);
        else console.error(result.error);
      }
    },
    (err) => {
      if (onError) onError(err);
      else console.error(err);
    },
  );
}
