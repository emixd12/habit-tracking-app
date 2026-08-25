export const POSTGREST_PAGE_SIZE = 1_000;
export const USER_SCOPED_READ_ABSOLUTE_CEILING = 100_000;

type PostgrestPage<T> = {
  data: T[] | null;
  error: unknown | null;
};

type PostgrestRangeQuery<T> = {
  range: (from: number, to: number) => PromiseLike<PostgrestPage<T>>;
};

export async function readAllPostgrestRows<T>(input: {
  label: string;
  createQuery: () => PostgrestRangeQuery<T>;
  getRowKey: (row: T) => string;
  pageSize?: number;
  absoluteCeiling?: number;
  absoluteCeilingError?: string;
  duplicateRowPolicy?: "reject" | "ignore";
  nonAdvancingError?: string;
  onPage?: (page: Readonly<{ index: number; rowCount: number }>) => void;
}): Promise<T[]> {
  const pageSize = input.pageSize ?? POSTGREST_PAGE_SIZE;
  const absoluteCeiling =
    input.absoluteCeiling ?? USER_SCOPED_READ_ABSOLUTE_CEILING;

  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("PostgREST page size must be a positive integer.");
  }

  if (!Number.isInteger(absoluteCeiling) || absoluteCeiling < 0) {
    throw new Error("PostgREST absolute read ceiling must be a non-negative integer.");
  }

  const rows: T[] = [];
  const rowKeys = new Set<string>();
  let pageIndex = 0;

  for (let pageStart = 0; ; pageStart += pageSize) {
    const { data, error } = await input
      .createQuery()
      .range(pageStart, pageStart + pageSize - 1);

    if (error) {
      throw error;
    }

    const page = data ?? [];
    input.onPage?.({ index: pageIndex, rowCount: page.length });
    pageIndex += 1;
    let addedRowCount = 0;

    for (const row of page) {
      const rowKey = input.getRowKey(row);

      if (rowKeys.has(rowKey)) {
        if (input.duplicateRowPolicy === "ignore") {
          continue;
        }

        throw new Error(
          `${capitalize(input.label)} pagination did not advance because a duplicate row was returned.`,
        );
      }

      if (rows.length === absoluteCeiling) {
        throw new Error(
          input.absoluteCeilingError ??
            `${capitalize(input.label)} exceed Cadence's absolute read ceiling of ${absoluteCeiling.toLocaleString("en-US")} rows.`,
        );
      }

      rowKeys.add(rowKey);
      rows.push(row);
      addedRowCount += 1;
    }

    if (page.length < pageSize) {
      return rows;
    }

    if (addedRowCount === 0) {
      throw new Error(
        input.nonAdvancingError ??
          `${capitalize(input.label)} pagination did not advance.`,
      );
    }
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;
}
