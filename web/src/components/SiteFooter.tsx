export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <p>
        © {year} Gratitude. Customer Experience Division.
      </p>
    </footer>
  );
}
