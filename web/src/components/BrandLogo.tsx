type LogoProps = {
  size?: number;
  wordmark?: boolean;
};

/** Simply Thoughts wordmark. The size is the logo height in pixels. */
export function BrandLogo({ size = 28, wordmark: _wordmark = true }: LogoProps) {
  return (
    <span className="brand-lockup">
      <img
        className="brand-lockup-mark"
        src="/thoughts-logo.png"
        alt="Simply Thoughts"
        style={{ height: size, width: "auto" }}
      />
    </span>
  );
}
