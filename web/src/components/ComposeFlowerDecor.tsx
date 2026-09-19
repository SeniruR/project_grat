import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** One cosmos branch on the send page — web UI only, not email. */
export function ComposeFlowerDecor() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("app-page-decor"));
  }, []);

  if (!host) return null;

  return createPortal(
    <div className="compose-flower-decor" aria-hidden>
      <img
        className="compose-flower-bush"
        src="/decor/compose-flower-bush.png"
        alt=""
        decoding="async"
      />
    </div>,
    host,
  );
}
