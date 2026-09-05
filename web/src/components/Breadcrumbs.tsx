import { Link } from "react-router-dom";

export type Crumb = {
  label: string;
  to?: string;
};

type Props = {
  items: Crumb[];
};

/** Trail like Cards › Choose a card › Send */
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

/** Shared Cards section crumb. Browse cards is home for every role. */
export const cardsCrumb: Crumb = { label: "Cards", to: "/marketplace" };

export const chooseCardCrumb: Crumb = {
  label: "Choose a card",
  to: "/marketplace",
};

export const myCardsCrumb: Crumb = { label: "My cards", to: "/cards" };

export const historyCrumb: Crumb = { label: "History", to: "/sent" };

export const adminCrumb: Crumb = { label: "Admin", to: "/admin" };

/** @deprecated Use cardsCrumb */
export const emailsCrumb = cardsCrumb;
