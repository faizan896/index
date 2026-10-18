const ROW_WIDTHS = ["w-[74%]", "w-[58%]", "w-[83%]", "w-[49%]", "w-[66%]"];

/** A still, hairline skeleton of the list while a page loads. */
export default function LibraryLoading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div className="h-9 w-48 max-w-full rounded-[2px] bg-wash" />
      <ul className="mt-16 border-b border-rule" aria-hidden="true">
        {ROW_WIDTHS.map((width) => (
          <li key={width} className="border-t border-rule py-5">
            <div className={`h-[1.125rem] max-w-full rounded-[2px] bg-wash ${width}`} />
            <div className="mt-3 h-3 w-52 max-w-full rounded-[2px] bg-wash" />
          </li>
        ))}
      </ul>
    </div>
  );
}
