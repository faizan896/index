const BAR = "max-w-full rounded-[2px] bg-wash";

/** Section labels and the width of their first line, in page order. */
const SECTIONS = [
  { label: "w-20", line: "w-[44%]" },
  { label: "w-10", line: "w-[30%]" },
  { label: "w-24", line: "w-[38%]" },
] as const;

/** A still skeleton of the detail page: back link, title, meta line, actions, then hairline sections. */
export default function ItemLoading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div aria-hidden="true">
        <div className={`h-4 w-16 ${BAR}`} />

        <div className="mt-8 space-y-2.5">
          <div className={`h-8 w-[86%] sm:h-9 ${BAR}`} />
          <div className={`h-8 w-[52%] sm:h-9 ${BAR}`} />
        </div>
        <div className={`mt-4 h-3.5 w-72 ${BAR}`} />

        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="h-8 w-32 rounded-[var(--radius-control)] border border-rule" />
          <div className={`h-3.5 w-16 ${BAR}`} />
          <div className={`h-3.5 w-20 ${BAR}`} />
          <div className={`h-3.5 w-20 ${BAR}`} />
        </div>

        <div className="mt-12">
          {SECTIONS.map((section) => (
            <div key={section.label} className="border-t border-rule py-7">
              <div className={`h-2.5 ${section.label} ${BAR}`} />
              <div className={`mt-5 h-4 ${section.line} ${BAR}`} />
            </div>
          ))}
          <div className="border-t border-rule py-7">
            <div className={`h-2.5 w-12 ${BAR}`} />
            <div className="mt-5 h-[5.5rem] rounded-[var(--radius-control)] border border-rule" />
          </div>
        </div>
      </div>
    </div>
  );
}
