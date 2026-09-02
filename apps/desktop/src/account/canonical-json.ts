export function canonicalJson(value: unknown): string { return JSON.stringify(sort(value)); }

export function compareUnicode(left: string, right: string): number {
  const leftPoints = Array.from(left), rightPoints = Array.from(right);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index++) {
    const difference = leftPoints[index].codePointAt(0)! - rightPoints[index].codePointAt(0)!;
    if (difference) return difference < 0 ? -1 : 1;
  }
  return leftPoints.length < rightPoints.length ? -1 : leftPoints.length > rightPoints.length ? 1 : 0;
}

function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareUnicode(left, right)).map(([key, item]) => [key, sort(item)]));
}
