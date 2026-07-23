import { Canvas } from "fabric";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  type DesignerDesignJson,
} from "./compile";
import { exportCanvasToEmailHtml } from "./exportHtml";

/** Offscreen compile of a saved designer canvas → email HTML (no UI). */
export async function exportDesignJsonToEmailHtml(
  design: Pick<DesignerDesignJson, "canvas"> &
    Partial<Pick<DesignerDesignJson, "width" | "height" | "frame">>,
  alt?: string,
): Promise<string> {
  const width =
    typeof design.width === "number" && design.width > 0
      ? design.width
      : DESIGN_WIDTH;
  const height =
    typeof design.height === "number" && design.height > 0
      ? design.height
      : DESIGN_HEIGHT;

  const el = document.createElement("canvas");
  const canvas = new Canvas(el, {
    width,
    height,
    renderOnAddRemove: false,
  });

  try {
    await canvas.loadFromJSON(design.canvas);
    canvas.requestRenderAll();
    return exportCanvasToEmailHtml(canvas, {
      width,
      height,
      frame: design.frame,
      alt,
    });
  } finally {
    canvas.dispose();
  }
}

export function hasDesignerCanvas(
  designJson: Record<string, unknown> | null | undefined,
): designJson is Record<string, unknown> & {
  mode: string;
  canvas: Record<string, unknown>;
} {
  if (!designJson || typeof designJson !== "object") return false;
  if (designJson.mode !== "designer") return false;
  const canvas = designJson.canvas;
  return Boolean(canvas && typeof canvas === "object");
}
