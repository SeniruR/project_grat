export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <p>
        © {year} Gratitude Bloom. Customer Experience Division.
      </p>
    </footer>
  );
}
