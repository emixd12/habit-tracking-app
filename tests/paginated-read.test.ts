import { describe, expect, it, vi } from "vitest";

import { readAllPostgrestRows } from "@/lib/db/paginated-read";

describe("readAllPostgrestRows", () => {
  it("reads fixed-size pages until a short final page and preserves query order", async () => {
    const ranges: Array<[number, number]> = [];
    const pages = [
      response([row("a"), row("b")]),
      response([row("c")]),
    ];

    const rows = await readAllPostgrestRows({
      label: "test rows",
      pageSize: 2,
      absoluteCeiling: 10,
      getRowKey: (value) => value.id,
      createQuery: () => ({
        range: vi.fn(async (from: number, to: number) => {
          ranges.push([from, to]);
          return pages.shift() ?? response([]);
        }),
      }),
    });

    expect(rows).toEqual([row("a"), row("b"), row("c")]);
    expect(ranges).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("continues after an exact page and stops on the following empty page", async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce(response([row("a"), row("b")]))
      .mockResolvedValueOnce(response([]));

    await expect(
      readAllPostgrestRows<{ id: string }>({
        label: "test rows",
        pageSize: 2,
        absoluteCeiling: 2,
        getRowKey: (value) => value.id,
        createQuery: () => ({ range }),
      }),
    ).resolves.toEqual([row("a"), row("b")]);

    expect(range).toHaveBeenNthCalledWith(1, 0, 1);
    expect(range).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it("propagates a later page error without returning partial data", async () => {
    const pageError = new Error("page failed");
    const range = vi
      .fn()
      .mockResolvedValueOnce(response([row("a"), row("b")]))
      .mockResolvedValueOnce({ data: null, error: pageError });

    await expect(
      readAllPostgrestRows<{ id: string }>({
        label: "test rows",
        pageSize: 2,
        absoluteCeiling: 10,
        getRowKey: (value) => value.id,
        createQuery: () => ({ range }),
      }),
    ).rejects.toBe(pageError);
  });

  it("rejects duplicate page behavior as non-advancing", async () => {
    const fullPage = [row("a"), row("b")];
    const range = vi
      .fn()
      .mockResolvedValueOnce(response(fullPage))
      .mockResolvedValueOnce(response(fullPage));

    await expect(
      readAllPostgrestRows<{ id: string }>({
        label: "test rows",
        pageSize: 2,
        absoluteCeiling: 10,
        getRowKey: (value) => value.id,
        createQuery: () => ({ range }),
      }),
    ).rejects.toThrow(
      "Test rows pagination did not advance because a duplicate row was returned.",
    );
  });

  it("throws clearly when another page would exceed the absolute ceiling", async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce(response([row("a"), row("b")]))
      .mockResolvedValueOnce(response([row("c")]));

    await expect(
      readAllPostgrestRows<{ id: string }>({
        label: "restore graph rows",
        pageSize: 2,
        absoluteCeiling: 2,
        getRowKey: (value) => value.id,
        createQuery: () => ({ range }),
      }),
    ).rejects.toThrow(
      "Restore graph rows exceed Cadence's absolute read ceiling of 2 rows.",
    );
  });
});

function row(id: string): { id: string } {
  return { id };
}

function response(data: Array<{ id: string }>) {
  return { data, error: null };
}
