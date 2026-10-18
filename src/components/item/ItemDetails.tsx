import { itemFacts, type ItemFact, type ItemFactsLink } from "./item-format";
import { ItemSection } from "./ItemSection";

function FactValue({ fact }: { fact: ItemFact }) {
  switch (fact.kind) {
    case "date":
      return <time dateTime={fact.dateTime}>{fact.text}</time>;
    case "address":
      return fact.href ? (
        <a href={fact.href} title={fact.full} target="_blank" rel="noopener noreferrer" className="link break-all">
          {fact.text}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span title={fact.full} className="break-all">
          {fact.text}
        </span>
      );
    case "text":
      return <span className="tabular">{fact.text}</span>;
  }
}

/** The quiet facts about an item: dates, addresses, language and length. Label beside value from small screens up. */
export function ItemDetails({ link }: { link: ItemFactsLink }) {
  const facts = itemFacts(link);
  return (
    <ItemSection id="item-details" title="Details">
      <dl className="space-y-2.5 text-sm">
        {facts.map((fact) => (
          <div key={fact.label} className="sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-x-6">
            <dt className="text-muted">{fact.label}</dt>
            <dd className="min-w-0 text-ink-soft">
              <FactValue fact={fact} />
            </dd>
          </div>
        ))}
      </dl>
    </ItemSection>
  );
}
