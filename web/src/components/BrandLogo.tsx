type MarkProps = {
  size?: number;
  className?: string;
};

/** Official SLT three-stripe mark, cropped from the SLT Mobitel logo. */
export function BrandMark({ size = 28, className }: MarkProps) {
  return (
    <img
      className={className}
      src="/slt-mark.png"
      alt=""
      height={size}
      width={Math.round(size * (55 / 70))}
      aria-hidden
    />
  );
}

type LogoProps = {
  size?: number;
  wordmark?: boolean;
};

export function BrandLogo({ size = 28, wordmark = true }: LogoProps) {
  return (
    <span className="brand-lockup">
      <BrandMark size={size} className="brand-lockup-mark" />
      {wordmark ? (
        <span className="brand-wordmark">
          Gratitude <em>Bloom</em>
        </span>
      ) : null}
    </span>
  );
}
