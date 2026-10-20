import { describe, expect, it, vi } from "vitest";
import { runQuery } from "./run-query";

describe("runQuery", () => {
  it("actually executes a thenable query", async () => {
    let executed = false;
    const builder: PromiseLike<{ error: unknown }> = {
      then(onfulfilled, onrejected) {
        executed = true;
        return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
      },
    };
    await runQuery(builder);
    expect(executed).toBe(true);
  });

  it("reports builder errors", async () => {
    const onError = vi.fn();
    await runQuery(Promise.resolve({ error: { message: "nope" } }), onError);
    expect(onError).toHaveBeenCalledWith({ message: "nope" });
  });
});