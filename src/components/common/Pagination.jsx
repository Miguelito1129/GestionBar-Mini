import { useEffect, useMemo, useState } from "react";

export const LIST_PAGE_SIZE = 10;

export function PaginationTabs({ totalItems, page, onPageChange, pageSize = LIST_PAGE_SIZE }) {
  const pageCount = Math.ceil(totalItems / pageSize);
  if (pageCount <= 1) return null;

  const currentPage = Math.min(Math.max(page, 1), pageCount);
  return (
    <nav className="list-pagination" aria-label="Páginas de la lista">
      {Array.from({ length: pageCount }, (_, index) => {
        const pageNumber = index + 1;
        return (
          <button
            type="button"
            key={pageNumber}
            className={currentPage === pageNumber ? "is-active" : ""}
            aria-current={currentPage === pageNumber ? "page" : undefined}
            onClick={() => onPageChange(pageNumber)}
          >
            {pageNumber}
          </button>
        );
      })}
    </nav>
  );
}

export function useListPagination(items, pageSize = LIST_PAGE_SIZE) {
  const [requestedPage, setRequestedPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, pageCount);

  useEffect(() => {
    if (requestedPage !== page) setRequestedPage(page);
  }, [requestedPage, page]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, pageItems, setPage: setRequestedPage };
}
