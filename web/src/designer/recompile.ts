import { Canvas } from "fabric";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  type DesignerDesignJson,
} from "./compile";
import { exportCanvasToEmailHtml } from "./exportHtml";
import { canvasToPreviewPngDataUrl } from "./previewPng";

export type DesignCompileResult = {
  compiledHtml: string;
  previewPngDataUrl: string;
};

/** Offscreen compile of a saved designer canvas → email HTML + 2× PNG. */
export async function exportDesignJsonToEmailHtml(
  design: Pick<DesignerDesignJson, "canvas"> &
    Partial<Pick<DesignerDesignJson, "width" | "height" | "frame">>,
  alt?: string,
): Promise<string> {
  const { compiledHtml } = await exportDesignJsonCompiled(design, alt);
  return compiledHtml;
}

/** Offscreen compile: email HTML + 2× PNG for sharp Outlook paste. */
export async function exportDesignJsonCompiled(
  design: Pick<DesignerDesignJson, "canvas"> &
    Partial<Pick<DesignerDesignJson, "width" | "height" | "frame">>,
  alt?: string,
): Promise<DesignCompileResult> {
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
    // Let Fabric finish image decode / layout before rasterizing.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const compiledHtml = exportCanvasToEmailHtml(canvas, {
      width,
      height,
      frame: design.frame,
      alt,
    });
    const previewPngDataUrl = await canvasToPreviewPngDataUrl(
      canvas,
      design.frame,
    );
    return { compiledHtml, previewPngDataUrl };
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
