import { Link } from "react-router-dom";

export type Crumb = {
  label: string;
  to?: string;
};

type Props = {
  items: Crumb[];
};

/** Trail like Home > Cards > Browse cards > … */
export function Breadcrumbs({ items }: Props) {
  if (items.length === 0) return null;
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`}>
              {i > 0 ? (
                <span className="breadcrumbs-sep" aria-hidden>
                  ›
                </span>
              ) : null}
              {last || !item.to ? (
                <span
                  className={last ? "breadcrumbs-current" : undefined}
                  aria-current={last ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link to={item.to}>{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Shared Cards section crumb - hub is the Cards homepage. */
export const cardsCrumb: Crumb = { label: "Cards", to: "/emails" };

/** @deprecated Use cardsCrumb */
export const emailsCrumb = cardsCrumb;
