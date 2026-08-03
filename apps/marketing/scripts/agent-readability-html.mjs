const MAIN_ELEMENT_PATTERN = /<main\b[^>]*>/giu;
const MAIN_ID_ATTRIBUTE_PATTERN =
  /\s[iI][dD]\s*=\s*(?:"main"|'main'|main(?=\s|\/?>))/u;

/**
 * Returns whether raw HTML contains a main element whose id is exactly "main".
 *
 * Attribute order and unrelated attributes do not affect the result. Requiring
 * the exact id keeps the check aligned with the marketing skip-link target.
 *
 * @param {string} html
 * @returns {boolean}
 */
export function hasMainLandmark(html) {
  return (
    html
      .match(MAIN_ELEMENT_PATTERN)
      ?.some((element) => MAIN_ID_ATTRIBUTE_PATTERN.test(element)) ?? false
  );
}
