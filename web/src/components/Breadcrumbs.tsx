import { Link } from "react-router-dom";

export type Crumb = {
  label: string;
  to?: string;
};

type Props = {
  items: Crumb[];
};

/** Trail like Home > Emails > Templates > … */
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

/** Shared Emails section crumb — hub is the Emails homepage. */
export const emailsCrumb: Crumb = { label: "Emails", to: "/emails" };
