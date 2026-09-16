/** Decorative hanging vines for the marketplace — web UI only, not email. */
export function GiftVineDecor() {
  return (
    <div className="gift-vine-decor" aria-hidden>
      <img
        className="gift-vine gift-vine--left"
        src="/decor/marketplace-vine-left.png"
        alt=""
        decoding="async"
      />
      <img
        className="gift-vine gift-vine--right"
        src="/decor/marketplace-vine-right.png"
        alt=""
        decoding="async"
      />
    </div>
  );
}
