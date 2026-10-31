import { Button } from "../../../../design-system/Button";
import styles from "./ModelPagination.module.scss";

/** Controlled pagination retained for future model browsing. */
export interface ModelPaginationProps {
  /** Accessible name identifying the paginated list. */
  readonly label: string;
  /** Current zero-based page index. */
  readonly page: number;
  /** Total number of pages. */
  readonly pageCount: number;
  /** Select a zero-based page index. */
  readonly onPageChange: (page: number) => void;
}

/**
 * Render model page controls; provider paging is currently disabled at its call site.
 * @param {ModelPaginationProps} props - Page state and selection callback.
 * @returns {React.ReactElement | null} Controls when more than one page exists.
 */
export function ModelPagination({
  label,
  page,
  pageCount,
  onPageChange,
}: ModelPaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label={label}>
      <Button
        className={styles.button}
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <span>
        Page {page + 1} of {pageCount}
      </span>
      <Button
        className={styles.button}
        disabled={page === pageCount - 1}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
