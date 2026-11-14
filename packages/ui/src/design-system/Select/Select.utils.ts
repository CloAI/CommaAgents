import type {
  HighlightSegment,
  SelectOption,
  SelectSection,
} from "./Select.types";

/**
 * Split a query into lowercase terms.
 * @param {string} query - Raw search text.
 * @returns {string[]} Nonempty whitespace-separated terms.
 */
export function parseTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Check that every term appears in the option's searchable text.
 * @param {SelectOption} option - Candidate option.
 * @param {readonly string[]} terms - Lowercase search terms.
 * @returns {boolean} Whether all terms match.
 */
export function matchesTerms(
  option: SelectOption,
  terms: readonly string[],
): boolean {
  const text = [option.label, option.description, option.tag, option.keywords]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => text.includes(term));
}

/**
 * List group names in display order.
 * @param {readonly SelectOption[]} options - All options.
 * @param {readonly string[]} groupOrder - Preferred leading groups, kept even when empty.
 * @returns {string[]} Preferred groups, then other present groups alphabetically.
 */
export function groupNames(
  options: readonly SelectOption[],
  groupOrder: readonly string[],
): string[] {
  const others = new Set<string>();
  for (const option of options) {
    if (option.group !== undefined && !groupOrder.includes(option.group)) {
      others.add(option.group);
    }
  }
  return [...groupOrder, ...[...others].sort()];
}

/**
 * Filter by search text and group, in display order.
 * @param {readonly SelectOption[]} options - All options.
 * @param {string} query - Search text; every term must match.
 * @param {string | undefined} group - Chip to restrict to, or undefined for All.
 * @param {readonly string[]} groupOrder - Preferred group order.
 * @returns {SelectOption[]} Grouped options sorted by label, then ungrouped options under All.
 */
export function filterOptions(
  options: readonly SelectOption[],
  query: string,
  group: string | undefined,
  groupOrder: readonly string[],
): SelectOption[] {
  const terms = parseTerms(query);
  const matching = options.filter((option) => matchesTerms(option, terms));
  const grouped = groupNames(options, groupOrder)
    .filter((name) => group === undefined || group === name)
    .flatMap((name) =>
      matching
        .filter((option) => option.group === name)
        .sort((a, b) => a.label.localeCompare(b.label)),
    );
  const ungrouped =
    group === undefined
      ? matching.filter((option) => option.group === undefined)
      : [];
  return [...grouped, ...ungrouped];
}

/**
 * Split the visible list into runs that share a group.
 * @param {readonly SelectOption[]} visible - Options in display order.
 * @returns {SelectSection[]} Sections carrying each option's visible index.
 */
export function sectionOptions(
  visible: readonly SelectOption[],
): SelectSection[] {
  const sections: {
    group: string | undefined;
    items: SelectSection["items"][number][];
  }[] = [];
  visible.forEach((option, index) => {
    const last = sections.at(-1);
    if (last && last.group === option.group) {
      last.items.push({ option, index });
    } else {
      sections.push({ group: option.group, items: [{ option, index }] });
    }
  });
  return sections;
}

/**
 * Mark the parts of a text that match any search term.
 * @param {string} text - Text to display.
 * @param {readonly string[]} terms - Lowercase search terms.
 * @returns {HighlightSegment[]} Alternating plain and matching runs.
 */
export function highlightSegments(
  text: string,
  terms: readonly string[],
): HighlightSegment[] {
  const lower = text.toLowerCase();
  // Case mapping that changes length would misalign the ranges.
  if (terms.length === 0 || lower.length !== text.length) {
    return [{ text, match: false }];
  }
  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    for (
      let start = lower.indexOf(term);
      start !== -1;
      start = lower.indexOf(term, start + 1)
    ) {
      marked.fill(true, start, start + term.length);
    }
  }
  const segments: HighlightSegment[] = [];
  for (let index = 0; index < text.length; index++) {
    const last = segments.at(-1);
    if (last && last.match === marked[index]) {
      segments[segments.length - 1] = {
        ...last,
        text: last.text + text[index],
      };
    } else {
      segments.push({ text: text[index]!, match: marked[index]! });
    }
  }
  return segments;
}

/**
 * Build the element ID of a visible option.
 * @param {string} baseId - Select identifier prefix.
 * @param {number} index - Index in the visible list.
 * @returns {string} Option element ID.
 */
export function optionId(baseId: string, index: number): string {
  return `${baseId}-option-${index}`;
}
