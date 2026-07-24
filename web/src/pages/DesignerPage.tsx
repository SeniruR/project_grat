import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  Line,
  Polygon,
  Rect,
  Shadow,
  Textbox,
  type FabricObject,
  type TPointerEventInfo,
  type TPointerEvent,
} from "fabric";
import { api, type TemplateSummary } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  absoluteUploadUrl,
  collectFieldNames,
  type DesignerDesignJson,
} from "../designer/compile";
import { exportCanvasToEmailHtml } from "../designer/exportHtml";
import { importEmailHtmlToCanvas } from "../designer/importHtml";
import { attachAlignmentGuides } from "../designer/alignmentGuides";
import { bakeScaledTarget, compensateWhileScaling, scaleObjectWithCanvas } from "../designer/bakeScale";
import {
  canvasToPreviewPngDataUrl,
  previewDataUrlToFile,
} from "../designer/previewPng";

type CtxMenu = {
  clientX: number;
  clientY: number;
  kind: "object" | "canvas";
  /** Locked when menu opens — don't re-read active object later */
  targetType: "image" | "shape" | "text" | "canvas";
  targetId?: string;
};

type CropSession = {
  image: FabricImage;
  frame: Rect;
};

const FONT_OPTIONS = [
  { label: "IBM Plex Sans", value: "IBM Plex Sans" },
  { label: "IBM Plex Serif", value: "IBM Plex Serif" },
  { label: "Segoe UI", value: "Segoe UI" },
  { label: "Calibri", value: "Calibri" },
  { label: "Arial", value: "Arial" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Verdana", value: "Verdana" },
  { label: "Trebuchet MS", value: "Trebuchet MS" },
  { label: "Courier New", value: "Courier New" },
] as const;

function isImage(obj: FabricObject | undefined | null): obj is FabricImage {
  if (!obj) return false;
  const t = (obj.type ?? "").toLowerCase();
  return t === "image" || obj instanceof FabricImage;
}

function isText(obj: FabricObject | undefined | null): obj is Textbox {
  if (!obj) return false;
  const t = (obj.type ?? "").toLowerCase();
  return t === "textbox" || t === "i-text" || t === "text" || obj instanceof Textbox;
}

function normalizeStorageKey(key: string) {
  return key.replace(/\\/g, "/");
}

function imageUsesAsset(obj: FabricImage, storageKey: string) {
  const key = normalizeStorageKey(storageKey);
  const tagged = (obj as FabricImage & { gratAssetKey?: string }).gratAssetKey;
  if (typeof tagged === "string" && normalizeStorageKey(tagged) === key) {
    return true;
  }
  const src =
    typeof obj.getSrc === "function"
      ? obj.getSrc()
      : typeof (obj as FabricImage & { src?: string }).src === "string"
        ? (obj as FabricImage & { src?: string }).src
        : "";
  if (!src) return false;
  return src.includes(key) || src.includes(encodeURI(key));
}

function findCanvasImagesForAsset(canvas: Canvas, storageKey: string) {
  return canvas.getObjects().filter((o): o is FabricImage => {
    if (!isImage(o)) return false;
    if ((o as FabricObject & { gratCropFrame?: boolean }).gratCropFrame) {
      return false;
    }
    return imageUsesAsset(o, storageKey);
  });
}

function colorFromFill(fill: unknown, fallback = "#0f6b5c") {
  return typeof fill === "string" && fill.startsWith("#") ? fill : fallback;
}

function normalizeFont(font: unknown) {
  const value = typeof font === "string" ? font.trim() : FONT_OPTIONS[0].value;
  const primary = value.split(",")[0]?.trim().replace(/['"]/g, "") ?? value;
  const match = FONT_OPTIONS.find(
    (f) =>
      f.value.toLowerCase() === primary.toLowerCase() ||
      f.label.toLowerCase() === primary.toLowerCase(),
  );
  return match?.value ?? FONT_OPTIONS[0].value;
}

function clampMenuPosition(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
) {
  const pad = 10;
  const maxLeft = Math.max(pad, window.innerWidth - width - pad);
  const maxTop = Math.max(pad, window.innerHeight - height - pad);
  return {
    left: Math.min(Math.max(pad, clientX), maxLeft),
    top: Math.min(Math.max(pad, clientY), maxTop),
  };
}

/** Spread new objects around the canvas center so they don’t stack in the top-left. */
function nextDropPoint(
  canvas: Canvas,
  objectWidth: number,
  objectHeight: number,
) {
  const living = canvas
    .getObjects()
    .filter((o) => !(o as FabricObject & { gratCropFrame?: boolean }).gratCropFrame);
  const n = living.length;
  const stagger = (n % 7) * 36;
  const cw = canvas.getWidth() || DESIGN_WIDTH;
  const ch = canvas.getHeight() || DESIGN_HEIGHT;
  const left = Math.round(cw / 2 - objectWidth / 2 - 60 + stagger);
  const top = Math.round(ch / 2 - objectHeight / 2 - 40 + (n % 5) * 28);
  return {
    left: Math.max(32, Math.min(left, cw - objectWidth - 32)),
    top: Math.max(32, Math.min(top, ch - objectHeight - 32)),
  };
}

function nextFieldKey(canvas: Canvas) {
  const used = new Set<string>();
  for (const o of canvas.getObjects()) {
    const key = (o as FabricObject & { gratField?: string }).gratField;
    if (typeof key === "string" && key.trim()) used.add(key.trim());
  }
  if (!used.has("message")) return "message";
  let i = 2;
  while (used.has(`message${i}`)) i += 1;
  return `message${i}`;
}

function starPolygonPoints(outerR: number, innerR: number, spikes = 5) {
  const points: { x: number; y: number }[] = [];
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes; i += 1) {
    points.push({
      x: Math.cos(rot) * outerR,
      y: Math.sin(rot) * outerR,
    });
    rot += step;
    points.push({
      x: Math.cos(rot) * innerR,
      y: Math.sin(rot) * innerR,
    });
    rot += step;
  }
  return points;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 3 && h.length !== 6) return null;
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLin(rgb.r);
  const g = toLin(rgb.g);
  const b = toLin(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function isBoldWeight(weight: unknown) {
  if (weight === "bold" || weight === "bolder") return true;
  const n = Number(weight);
  return Number.isFinite(n) && n >= 600;
}

function readShadow(obj: FabricObject): {
  on: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
} {
  const shadow = obj.shadow as
    | Shadow
    | { color?: string; blur?: number; offsetX?: number; offsetY?: number }
    | string
    | null
    | undefined;
  if (!shadow || typeof shadow === "string") {
    return { on: false, color: "#000000", blur: 4, offsetX: 2, offsetY: 2 };
  }
  const color =
    typeof shadow.color === "string" && shadow.color.trim()
      ? shadow.color.startsWith("#")
        ? shadow.color.slice(0, 7)
        : "#000000"
      : "#000000";
  return {
    on: true,
    color,
    blur: Math.round(Number(shadow.blur ?? 4)),
    offsetX: Math.round(Number(shadow.offsetX ?? 2)),
    offsetY: Math.round(Number(shadow.offsetY ?? 2)),
  };
}

export function DesignerPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const htmlDraftFromCard =
    typeof (location.state as { htmlDraft?: unknown } | null)?.htmlDraft ===
    "string"
      ? ((location.state as { htmlDraft: string }).htmlDraft ?? "").trim()
      : "";
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const canEditRef = useRef(false);
  const cropRef = useRef<CropSession | null>(null);
  const menuTargetRef = useRef<FabricObject | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const guidesApiRef = useRef<{
    afterKeyboardNudge: (targets: FabricObject[]) => void;
    clear: () => void;
    detach: () => void;
  } | null>(null);

  const [template, setTemplate] = useState<TemplateSummary | null>(null);
  const [toolsTab, setToolsTab] = useState<"objects" | "page">("objects");
  const [fill, setFill] = useState("#0f6b5c");
  const [bg, setBg] = useState("#ffffff");
  const [frameRadius, setFrameRadius] = useState(0);
  const [frameBorderWidth, setFrameBorderWidth] = useState(0);
  const [frameBorderColor, setFrameBorderColor] = useState("#1c2420");
  const [canvasW, setCanvasW] = useState(DESIGN_WIDTH);
  const [canvasH, setCanvasH] = useState(DESIGN_HEIGHT);
  /** Visual fit so the full design stays on-screen when the window is small */
  const [viewScale, setViewScale] = useState(1);
  const [menuStroke, setMenuStroke] = useState("#1c2420");
  const [menuStrokeWidth, setMenuStrokeWidth] = useState(0);
  const [menuDash, setMenuDash] = useState<"none" | "short" | "long">("none");
  const [menuRadius, setMenuRadius] = useState(0);
  const [menuFont, setMenuFont] = useState<string>(FONT_OPTIONS[0].value);
  const [menuFontSize, setMenuFontSize] = useState(22);
  const [menuBold, setMenuBold] = useState(false);
  const [menuItalic, setMenuItalic] = useState(false);
  const [menuUnderline, setMenuUnderline] = useState(false);
  const [menuAlign, setMenuAlign] = useState<"left" | "center" | "right">("left");
  const [menuOpacity, setMenuOpacity] = useState(100);
  const [menuShadowOn, setMenuShadowOn] = useState(false);
  const [menuShadowColor, setMenuShadowColor] = useState("#000000");
  const [menuShadowBlur, setMenuShadowBlur] = useState(4);
  const [menuShadowX, setMenuShadowX] = useState(2);
  const [menuShadowY, setMenuShadowY] = useState(2);
  const [menuAngle, setMenuAngle] = useState(0);
  const [defaultFont, setDefaultFont] = useState<string>(FONT_OPTIONS[0].value);
  const [defaultFontSize, setDefaultFontSize] = useState(22);
  const [defaultFontColor, setDefaultFontColor] = useState("#1c2420");
  const [menu, setMenu] = useState<CtxMenu | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [menuFill, setMenuFill] = useState("#0f6b5c");
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Save & compile");
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const readyRef = useRef(false);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const historyLockRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [leavePrompt, setLeavePrompt] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [assetDeletePrompt, setAssetDeletePrompt] = useState<{
    id: string;
    fileName: string;
    storageKey: string;
    usedCount: number;
  } | null>(null);

  const markDirty = useCallback(() => {
    if (!readyRef.current || !canEditRef.current) return;
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  const clearDirty = useCallback(() => {
    dirtyRef.current = false;
    setDirty(false);
  }, []);

  const syncHistoryButtons = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const pushHistory = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || historyLockRef.current || !readyRef.current) return;
    const json = JSON.stringify(
      canvas.toObject(["gratField", "gratAssetKey"]),
    );
    const stack = historyRef.current;
    const idx = historyIndexRef.current;
    if (idx >= 0 && stack[idx] === json) {
      syncHistoryButtons();
      return;
    }
    const next = stack.slice(0, idx + 1);
    next.push(json);
    if (next.length > 40) next.shift();
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  const canEdit =
    !!template &&
    (template.owner.id === user?.id || user?.role === "ADMIN");
  canEditRef.current = canEdit;

  const refreshSelectionLabel = useCallback(() => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj || (obj as FabricObject & { gratCropFrame?: boolean }).gratCropFrame) {
      return;
    }
    if (isText(obj)) {
      setMenuFont(normalizeFont(obj.fontFamily));
      setMenuFontSize(Math.round(Number(obj.fontSize ?? 22)));
      setMenuFill(colorFromFill(obj.fill, "#1c2420"));
      setMenuBold(isBoldWeight(obj.fontWeight));
      setMenuItalic(obj.fontStyle === "italic");
      setMenuUnderline(Boolean(obj.underline));
      const align = obj.textAlign;
      setMenuAlign(
        align === "center" || align === "right" ? align : "left",
      );
      const shadow = readShadow(obj);
      setMenuShadowOn(shadow.on);
      setMenuShadowColor(shadow.color);
      setMenuShadowBlur(shadow.blur);
      setMenuShadowX(shadow.offsetX);
      setMenuShadowY(shadow.offsetY);
    }
    setMenuOpacity(Math.round((obj.opacity ?? 1) * 100));
    setMenuAngle(Math.round((((obj.angle ?? 0) % 360) + 360) % 360));
  }, []);

  const restoreHistory = useCallback(
    async (index: number) => {
      const canvas = fabricRef.current;
      const raw = historyRef.current[index];
      if (!canvas || raw == null) return;
      historyLockRef.current = true;
      try {
        await canvas.loadFromJSON(JSON.parse(raw));
        canvas.getObjects().forEach((o) => {
          if ((o as FabricObject & { gratCropFrame?: boolean }).gratCropFrame) {
            canvas.remove(o);
          }
        });
        canvas.requestRenderAll();
        historyIndexRef.current = index;
        syncHistoryButtons();
        markDirty();
        refreshSelectionLabel();
      } finally {
        historyLockRef.current = false;
      }
    },
    [markDirty, refreshSelectionLabel, syncHistoryButtons],
  );

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    void restoreHistory(historyIndexRef.current - 1);
  }, [restoreHistory]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    void restoreHistory(historyIndexRef.current + 1);
  }, [restoreHistory]);

  const pushHistoryRef = useRef(pushHistory);
  pushHistoryRef.current = pushHistory;
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;

  const closeMenu = useCallback(() => {
    setMenu(null);
    menuTargetRef.current = null;
  }, []);

  const clampCanvasSize = useCallback((w: number, h: number) => {
    return {
      w: Math.min(1200, Math.max(320, Math.round(w))),
      h: Math.min(1600, Math.max(400, Math.round(h))),
    };
  }, []);

  const resizeDesignCanvas = useCallback(
    (nextW: number, nextH: number, opts?: { markDirty?: boolean }) => {
      const { w, h } = clampCanvasSize(nextW, nextH);
      const canvas = fabricRef.current;
      const prevW = Math.max(1, canvas?.getWidth() || canvasW);
      const prevH = Math.max(1, canvas?.getHeight() || canvasH);
      const sx = w / prevW;
      const sy = h / prevH;
      setCanvasW(w);
      setCanvasH(h);
      if (canvas) {
        // Scale every object with the stage so a 600→800 resize doesn't leave
        // a small card floating in a larger empty canvas (PNG/HTML mismatch).
        // Bake scale into width/height/radius/fontSize when possible so later
        // edits and HTML export stay aligned with the PNG.
        if (
          Number.isFinite(sx) &&
          Number.isFinite(sy) &&
          (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001)
        ) {
          for (const obj of canvas.getObjects()) {
            if ((obj as { gratCropFrame?: boolean }).gratCropFrame) continue;
            scaleObjectWithCanvas(obj, sx, sy);
          }
        }
        canvas.setDimensions({ width: w, height: h });
        canvas.requestRenderAll();
      }
      if (opts?.markDirty !== false) markDirty();
    },
    [clampCanvasSize, markDirty, canvasW, canvasH],
  );

  // Scale the design to fit the visible stage (does not change design W×H).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    let timer = 0;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const pad = 24;
        const banner = el.querySelector(".crop-banner");
        const bannerH = banner
          ? (banner as HTMLElement).getBoundingClientRect().height + 8
          : 0;
        const availW = Math.max(120, el.clientWidth - pad);
        const availH = Math.max(120, el.clientHeight - pad - bannerH);
        const next = Math.min(1, availW / canvasW, availH / canvasH);
        const rounded = Math.round(next * 1000) / 1000;
        setViewScale((prev) =>
          Math.abs(prev - rounded) < 0.002 ? prev : rounded,
        );
      }, 50);
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [canvasW, canvasH, cropping, ready]);

  // Keep Fabric pointer mapping correct after CSS fit-scale changes.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !ready) return;
    const id = window.requestAnimationFrame(() => {
      canvas.calcOffset?.();
      canvas.requestRenderAll();
    });
    return () => window.cancelAnimationFrame(id);
  }, [viewScale, canvasW, canvasH, ready]);

  /** Stretch current objects so their bounding box fills the canvas (fixes
   * layouts saved after a size change that didn't scale content). */
  const fitContentToCanvas = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objs = canvas
      .getObjects()
      .filter((o) => !(o as { gratCropFrame?: boolean }).gratCropFrame);
    if (!objs.length) return;

    let minL = Infinity;
    let minT = Infinity;
    let maxR = -Infinity;
    let maxB = -Infinity;
    for (const obj of objs) {
      const b = obj.getBoundingRect();
      minL = Math.min(minL, b.left);
      minT = Math.min(minT, b.top);
      maxR = Math.max(maxR, b.left + b.width);
      maxB = Math.max(maxB, b.top + b.height);
    }
    const bw = Math.max(1, maxR - minL);
    const bh = Math.max(1, maxB - minT);
    const cw = Math.max(1, canvas.getWidth());
    const ch = Math.max(1, canvas.getHeight());
    const sx = cw / bw;
    const sy = ch / bh;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
    if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) {
      setNotice("Layout already fills the canvas.");
      return;
    }

    for (const obj of objs) {
      obj.set({
        left: (obj.left ?? 0) - minL,
        top: (obj.top ?? 0) - minT,
      });
    }
    for (const obj of objs) {
      scaleObjectWithCanvas(obj, sx, sy);
    }
    canvas.requestRenderAll();
    markDirty();
    setNotice(
      "Scaled layout to fill the canvas. Save & compile to update the preview.",
    );
  }, [markDirty]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setMenuPos(
      clampMenuPosition(menu.clientX, menu.clientY, rect.width, rect.height),
    );
  }, [menu, menuFont, menuFontSize, menuStrokeWidth, menuRadius, menuAngle]);

  const cancelCrop = useCallback(() => {
    const canvas = fabricRef.current;
    const session = cropRef.current;
    if (!canvas || !session) return;
    canvas.remove(session.frame);
    session.image.set({ selectable: true, evented: true });
    canvas.setActiveObject(session.image);
    cropRef.current = null;
    setCropping(false);
    canvas.requestRenderAll();
    refreshSelectionLabel();
  }, [refreshSelectionLabel]);

  const applyCrop = useCallback(() => {
    const canvas = fabricRef.current;
    const session = cropRef.current;
    if (!canvas || !session) return;

    const { image, frame } = session;
    const angle = image.angle ?? 0;
    if (Math.abs(angle) > 0.5) {
      setError("Straighten the image (angle 0) before cropping.");
      return;
    }

    const scaleX = image.scaleX || 1;
    const scaleY = image.scaleY || 1;
    const imgLeft = image.left ?? 0;
    const imgTop = image.top ?? 0;
    const frameLeft = frame.left ?? 0;
    const frameTop = frame.top ?? 0;
    const frameW = frame.getScaledWidth();
    const frameH = frame.getScaledHeight();

    const prevCropX = image.cropX || 0;
    const prevCropY = image.cropY || 0;

    // Frame position relative to current visible image top-left, in source pixels
    let relX = (frameLeft - imgLeft) / scaleX;
    let relY = (frameTop - imgTop) / scaleY;
    let newW = frameW / scaleX;
    let newH = frameH / scaleY;

    // Clamp inside current visible bitmap
    const maxW = image.width || newW;
    const maxH = image.height || newH;
    relX = Math.max(0, Math.min(relX, maxW - 8));
    relY = Math.max(0, Math.min(relY, maxH - 8));
    newW = Math.max(8, Math.min(newW, maxW - relX));
    newH = Math.max(8, Math.min(newH, maxH - relY));

    image.set({
      cropX: prevCropX + relX,
      cropY: prevCropY + relY,
      width: newW,
      height: newH,
      left: frameLeft,
      top: frameTop,
      selectable: true,
      evented: true,
    });
    image.setCoords();

    canvas.remove(frame);
    cropRef.current = null;
    setCropping(false);
    canvas.setActiveObject(image);
    canvas.requestRenderAll();
    setNotice("Crop applied.");
    setError(null);
    refreshSelectionLabel();
  }, [refreshSelectionLabel]);

  const startCrop = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !canEditRef.current) return;
    if (cropRef.current) cancelCrop();

    const obj = canvas.getActiveObject();
    if (!isImage(obj)) {
      setError("Select an image first, then start crop.");
      return;
    }
    if (Math.abs(obj.angle ?? 0) > 0.5) {
      setError("Rotate angle must be 0 to crop. Reset rotation first.");
      return;
    }

    const bound = obj.getBoundingRect();
    const frame = new Rect({
      left: bound.left,
      top: bound.top,
      width: Math.max(24, bound.width),
      height: Math.max(24, bound.height),
      fill: "rgba(15, 107, 92, 0.15)",
      stroke: "#0f6b5c",
      strokeWidth: 2,
      strokeDashArray: [8, 4],
      cornerColor: "#0f6b5c",
      cornerStyle: "circle",
      transparentCorners: false,
      borderColor: "#0f6b5c",
      lockRotation: true,
      excludeFromExport: true,
    });
    (frame as FabricObject & { gratCropFrame?: boolean }).gratCropFrame = true;
    frame.setControlsVisibility({ mtr: false });

    obj.set({ selectable: false, evented: false });
    canvas.add(frame);
    canvas.setActiveObject(frame);
    cropRef.current = { image: obj, frame };
    setCropping(true);
    setMenu(null);
    setError(null);
    setNotice("Drag the green frame, then Apply crop.");
    canvas.requestRenderAll();
    refreshSelectionLabel();
  }, [cancelCrop, refreshSelectionLabel]);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const { template: t } = await api.template(token, id);
        if (!cancelled) setTemplate(t);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  useEffect(() => {
    if (!template || !canvasEl.current || fabricRef.current) return;

    const canvas = new Canvas(canvasEl.current, {
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
      fireRightClick: true,
      controlsAboveOverlay: true,
    });
    fabricRef.current = canvas;

    const latest = template.versions[0];
    const design = latest?.designJson as Partial<DesignerDesignJson> | undefined;
    const draftHtml = htmlDraftFromCard;

    (async () => {
      const applyImport = async (html: string, fromUnsaved: boolean) => {
        canvas.backgroundColor = "#ffffff";
        const imported = await importEmailHtmlToCanvas(canvas, html);
        if (imported.background) setBg(imported.background);
        if (imported.frame) {
          setFrameRadius(imported.frame.radius ?? 0);
          setFrameBorderWidth(imported.frame.borderWidth ?? 0);
          setFrameBorderColor(imported.frame.borderColor ?? "#1c2420");
        }
        if (imported.width || imported.height) {
          const sized = {
            w: Math.min(
              1200,
              Math.max(320, Math.round(imported.width ?? DESIGN_WIDTH)),
            ),
            h: Math.min(
              1600,
              Math.max(400, Math.round(imported.height ?? DESIGN_HEIGHT)),
            ),
          };
          setCanvasW(sized.w);
          setCanvasH(sized.h);
          canvas.setDimensions({ width: sized.w, height: sized.h });
        }
        if (imported.objectCount > 0) {
          setNotice(
            fromUnsaved
              ? `Loaded your current HTML from the card page (${imported.objectCount} object${imported.objectCount === 1 ? "" : "s"}). Save & compile to keep it.`
              : `Imported ${imported.objectCount} object${imported.objectCount === 1 ? "" : "s"} from HTML (${canvas.getWidth()}×${canvas.getHeight()}). Save & compile to keep this as a designer layout.${
                  imported.warnings.length ? ` ${imported.warnings[0]}` : ""
                }`,
          );
        } else {
          setNotice(
            imported.warnings[0] ??
              "Couldn’t rebuild shapes from this HTML. Set canvas size on the Page tab, or edit on the HTML tab.",
          );
        }
        return fromUnsaved;
      };

      let loadedFromUnsaved = false;

      // Prefer HTML from the card page (even if not saved yet) over an old canvas
      if (draftHtml) {
        loadedFromUnsaved = await applyImport(draftHtml, true);
        // Clear router state so refresh uses saved data
        navigate(location.pathname, { replace: true, state: null });
      } else if (design?.mode === "designer" && design.canvas) {
        const w = typeof design.width === "number" ? design.width : DESIGN_WIDTH;
        const h = typeof design.height === "number" ? design.height : DESIGN_HEIGHT;
        const sized = {
          w: Math.min(1200, Math.max(320, Math.round(w))),
          h: Math.min(1600, Math.max(400, Math.round(h))),
        };
        setCanvasW(sized.w);
        setCanvasH(sized.h);
        canvas.setDimensions({ width: sized.w, height: sized.h });

        await canvas.loadFromJSON(design.canvas);
        canvas.getObjects().forEach((o) => {
          if ((o as FabricObject & { gratCropFrame?: boolean }).gratCropFrame) {
            canvas.remove(o);
          } else {
            bakeScaledTarget(o);
          }
        });
        if (typeof design.canvas.background === "string") {
          setBg(design.canvas.background);
        } else if (typeof canvas.backgroundColor === "string") {
          setBg(canvas.backgroundColor);
        }
        if (design.frame) {
          setFrameRadius(design.frame.radius ?? 0);
          setFrameBorderWidth(design.frame.borderWidth ?? 0);
          setFrameBorderColor(design.frame.borderColor ?? "#1c2420");
        }
      } else {
        const html = latest?.compiledHtml?.trim() ?? "";
        if (html) {
          await applyImport(html, false);
        }
      }

      canvas.requestRenderAll();
      readyRef.current = true;
      setReady(true);
      if (loadedFromUnsaved) {
        // Keep dirty so Save & compile is obvious
        dirtyRef.current = true;
        setDirty(true);
      } else {
        clearDirty();
      }
      historyRef.current = [];
      historyIndexRef.current = -1;
      pushHistoryRef.current();
    })().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load design");
      readyRef.current = true;
      setReady(true);
      pushHistoryRef.current();
    });

    const onDirty = () => {
      markDirty();
      if (!historyLockRef.current) {
        requestAnimationFrame(() => pushHistoryRef.current());
      }
    };
    const onScaling = (opt: { target?: FabricObject }) => {
      if (!opt.target) return;
      // Keep corners/stroke visually stable without baking mid-drag
      // (baking while Fabric's transform is active causes a temporary border).
      compensateWhileScaling(opt.target);
    };
    const onModifiedBake = (opt: { target?: FabricObject }) => {
      if (!opt.target) return;
      bakeScaledTarget(opt.target);
      opt.target.setCoords();
      canvas.requestRenderAll();
    };
    canvas.on("object:added", onDirty);
    canvas.on("object:removed", onDirty);
    canvas.on("object:modified", onModifiedBake);
    canvas.on("object:modified", onDirty);
    canvas.on("object:scaling", onScaling);
    canvas.on("object:skewing", onDirty);

    const onSelection = () => refreshSelectionLabel();
    canvas.on("selection:created", onSelection);
    canvas.on("selection:updated", onSelection);
    canvas.on("selection:cleared", onSelection);

    const onMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      const evt = opt.e as MouseEvent;
      if (evt.button !== 2) {
        setMenu(null);
        return;
      }
      evt.preventDefault();
      if (!canEditRef.current) return;

      if (opt.target) {
        if ((opt.target as FabricObject & { gratCropFrame?: boolean }).gratCropFrame) {
          return;
        }
        canvas.setActiveObject(opt.target);
        canvas.requestRenderAll();
        const imageTarget = isImage(opt.target);
        const textTarget = isText(opt.target);
        menuTargetRef.current = opt.target;
        setMenuFill(
          colorFromFill(
            opt.target.fill,
            textTarget ? "#1c2420" : "#0f6b5c",
          ),
        );
        setMenuStroke(
          typeof opt.target.stroke === "string" ? opt.target.stroke : "#1c2420",
        );
        setMenuStrokeWidth(Number(opt.target.strokeWidth ?? 0));
        const dash = opt.target.strokeDashArray;
        setMenuDash(
          Array.isArray(dash) && dash[0] >= 10
            ? "long"
            : Array.isArray(dash) && dash.length
              ? "short"
              : "none",
        );
        let radius = 0;
        if (imageTarget) {
          const clip = opt.target.clipPath as Rect | undefined;
          if (clip && typeof clip.rx === "number") radius = clip.rx;
        } else if (typeof (opt.target as Rect).rx === "number") {
          radius = (opt.target as Rect).rx ?? 0;
        }
        setMenuRadius(radius);
        if (textTarget) {
          const textObj = opt.target as Textbox;
          setMenuFont(normalizeFont(textObj.fontFamily));
          setMenuFontSize(Math.round(Number(textObj.fontSize ?? 22)));
          setMenuBold(isBoldWeight(textObj.fontWeight));
          setMenuItalic(textObj.fontStyle === "italic");
          setMenuUnderline(Boolean(textObj.underline));
          const align = textObj.textAlign;
          setMenuAlign(
            align === "center" || align === "right" ? align : "left",
          );
          const shadow = readShadow(textObj);
          setMenuShadowOn(shadow.on);
          setMenuShadowColor(shadow.color);
          setMenuShadowBlur(shadow.blur);
          setMenuShadowX(shadow.offsetX);
          setMenuShadowY(shadow.offsetY);
        }
        setMenuOpacity(Math.round((opt.target.opacity ?? 1) * 100));
        setMenuAngle(Math.round((((opt.target.angle ?? 0) % 360) + 360) % 360));
        setMenuPos(
          clampMenuPosition(evt.clientX, evt.clientY, 280, 560),
        );
        setMenu({
          clientX: evt.clientX,
          clientY: evt.clientY,
          kind: "object",
          targetType: imageTarget ? "image" : textTarget ? "text" : "shape",
        });
      } else {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        menuTargetRef.current = null;
        setMenuFill(
          typeof canvas.backgroundColor === "string"
            ? canvas.backgroundColor
            : "#ffffff",
        );
        setMenuPos(clampMenuPosition(evt.clientX, evt.clientY, 220, 120));
        setMenu({
          clientX: evt.clientX,
          clientY: evt.clientY,
          kind: "canvas",
          targetType: "canvas",
        });
      }
      refreshSelectionLabel();
    };
    canvas.on("mouse:down", onMouseDown);

    const onKey = (e: KeyboardEvent) => {
      if (!canEditRef.current) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        undoRef.current();
        return;
      }
      if (
        mod &&
        (e.key.toLowerCase() === "y" ||
          (e.key.toLowerCase() === "z" && e.shiftKey))
      ) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        redoRef.current();
        return;
      }
      if (e.key === "Escape") {
        if (cropRef.current) cancelCrop();
        setMenu(null);
        return;
      }
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (cropRef.current) return;
        const target = canvas.getActiveObject();
        if (
          !target ||
          (target as FabricObject & { gratCropFrame?: boolean }).gratCropFrame
        ) {
          return;
        }
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        target.set({
          left: (target.left ?? 0) + dx,
          top: (target.top ?? 0) + dy,
        });
        target.setCoords();
        // Same snap + green/orange guides as mouse drag (brief flash)
        guidesApiRef.current?.afterKeyboardNudge([target]);
        canvas.requestRenderAll();
        markDirty();
        requestAnimationFrame(() => pushHistoryRef.current());
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (cropRef.current) return;
        const active = canvas.getActiveObjects();
        if (active.length) {
          active.forEach((obj) => canvas.remove(obj));
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          refreshSelectionLabel();
        }
      }
    };
    window.addEventListener("keydown", onKey);

    const guidesApi = attachAlignmentGuides(canvas);
    guidesApiRef.current = guidesApi;

    return () => {
      window.removeEventListener("keydown", onKey);
      guidesApi.detach();
      guidesApiRef.current = null;
      canvas.off("object:added", onDirty);
      canvas.off("object:removed", onDirty);
      canvas.off("object:modified", onModifiedBake);
      canvas.off("object:modified", onDirty);
      canvas.off("object:scaling", onScaling);
      canvas.off("object:skewing", onDirty);
      canvas.dispose();
      fabricRef.current = null;
      cropRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || cropping) return;
    canvas.backgroundColor = bg;
    canvas.requestRenderAll();
  }, [bg, cropping]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function addRect() {
    const canvas = fabricRef.current;
    if (!canvas || !canEdit || cropping) return;
    const width = 180;
    const height = 110;
    const pos = nextDropPoint(canvas, width, height);
    const rect = new Rect({
      left: pos.left,
      top: pos.top,
      width,
      height,
      fill,
      rx: 8,
      ry: 8,
      stroke: "#1c2420",
      strokeWidth: 0,
    });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
  }

  function addCircle() {
    const canvas = fabricRef.current;
    if (!canvas || !canEdit || cropping) return;
    const radius = 60;
    const pos = nextDropPoint(canvas, radius * 2, radius * 2);
    const circle = new Circle({
      left: pos.left,
      top: pos.top,
      radius,
      fill,
      stroke: "#1c2420",
      strokeWidth: 0,
    });
    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.requestRenderAll();
  }

  function addOval() {
    const canvas = fabricRef.current;
    if (!canvas || !canEdit || cropping) return;
    const rx = 90;
    const ry = 55;
    const pos = nextDropPoint(canvas, rx * 2, ry * 2);
    const oval = new Ellipse({
      left: pos.left,
      top: pos.top,
      rx,
      ry,
      fill,
      stroke: "#1c2420",
      strokeWidth: 0,
    });
    canvas.add(oval);
    canvas.setActiveObject(oval);
    canvas.requestRenderAll();
  }

  function addLine() {
    const canvas = fabricRef.current;
    if (!canvas || !canEdit || cropping) return;
    const width = 220;
    const height = 4;
    const pos = nextDropPoint(canvas, width, height);
    const line = new Line(
      [pos.left, pos.top + 2, pos.left + width, pos.top + 2],
      {
        stroke: fill,
        strokeWidth: 3,
        fill: "",
      },
    );
    canvas.add(line);
    canvas.setActiveObject(line);
    canvas.requestRenderAll();
  }

  function addStar() {
    const canvas = fabricRef.current;
    if (!canvas || !canEdit || cropping) return;
    const size = 120;
    const pos = nextDropPoint(canvas, size, size);
    const star = new Polygon(starPolygonPoints(size / 2, size / 4.5), {
      left: pos.left,
      top: pos.top,
      fill,
      stroke: "#1c2420",
      strokeWidth: 0,
    });
    canvas.add(star);
    canvas.setActiveObject(star);
    canvas.requestRenderAll();
  }

  function addTextField() {
    const canvas = fabricRef.current;
    if (!canvas || !canEdit || cropping) return;
    const key = nextFieldKey(canvas);
    const sample = `{{${key}}}`;
    const width = Math.min(
      360,
      Math.max(160, Math.round(sample.length * defaultFontSize * 0.62)),
    );
    const height = Math.round(defaultFontSize * 1.45);
    const pos = nextDropPoint(canvas, width, height);
    const box = new Textbox(sample, {
      left: pos.left,
      top: pos.top,
      width,
      fontSize: defaultFontSize,
      fill: defaultFontColor,
      fontFamily: defaultFont,
      textAlign: "left",
      originX: "left",
      originY: "top",
    });
    box.set("gratField", key);
    const sized = box as Textbox & { initDimensions?: () => void; dirty?: boolean };
    sized.dirty = true;
    sized.initDimensions?.();
    // Keep fully inside the card after font metrics settle
    const bounds = box.getBoundingRect();
    const cw = canvas.getWidth() || DESIGN_WIDTH;
    const ch = canvas.getHeight() || DESIGN_HEIGHT;
    if (bounds.left < 32) box.set("left", (box.left ?? 0) + (32 - bounds.left));
    if (bounds.top < 32) box.set("top", (box.top ?? 0) + (32 - bounds.top));
    if (bounds.left + bounds.width > cw - 32) {
      box.set(
        "left",
        (box.left ?? 0) - (bounds.left + bounds.width - (cw - 32)),
      );
    }
    if (bounds.top + bounds.height > ch - 32) {
      box.set(
        "top",
        (box.top ?? 0) - (bounds.top + bounds.height - (ch - 32)),
      );
    }
    box.setCoords();
    canvas.add(box);
    canvas.setActiveObject(box);
    canvas.requestRenderAll();
    refreshSelectionLabel();
  }

  async function addImageFromFile(
    file: File | null,
    dropAt?: { clientX: number; clientY: number },
  ) {
    if (!file || !canEdit || !token || !id || cropping) return;
    const ok = /image\/(jpeg|png|gif|webp)/i.test(file.type);
    if (!ok) {
      setError("Use a JPEG, PNG, GIF, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be 2MB or smaller.");
      return;
    }
    setError(null);
    try {
      const { asset } = await api.uploadTemplateAsset(token, id, file);
      await addImageFromAsset(asset.storageKey, dropAt);
      const { template: fresh } = await api.template(token, id);
      setTemplate(fresh);
      setNotice(`Added “${file.name}”. Save & compile to update the email preview.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image add failed");
    }
  }

  async function addImageFromAsset(
    storageKey: string,
    dropAt?: { clientX: number; clientY: number },
  ) {
    const canvas = fabricRef.current;
    if (!canvas || !canEdit || cropping) return;
    const url = absoluteUploadUrl(storageKey);
    const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    const cw = canvas.getWidth() || DESIGN_WIDTH;
    const ch = canvas.getHeight() || DESIGN_HEIGHT;
    const maxW = Math.min(cw - 80, 360);
    const scale = Math.min(1, maxW / (img.width || 1));
    const displayW = (img.width || 1) * scale;
    const displayH = (img.height || 1) * scale;
    const pos = nextDropPoint(canvas, displayW, displayH);
    let left = pos.left;
    let top = pos.top;

    if (dropAt) {
      // Use Fabric's visible canvas (upperCanvasEl) — the original <canvas> ref
      // is wrapped/hidden and gives wrong drop coordinates.
      const surface =
        (canvas as Canvas & { upperCanvasEl?: HTMLCanvasElement }).upperCanvasEl ??
        canvas.getElement();
      canvas.calcOffset?.();
      try {
        const scene = canvas.getScenePoint({
          clientX: dropAt.clientX,
          clientY: dropAt.clientY,
        } as TPointerEvent);
        left = scene.x - displayW / 2;
        top = scene.y - displayH / 2;
      } catch {
        const rect = surface.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          left = ((dropAt.clientX - rect.left) / rect.width) * cw - displayW / 2;
          top = ((dropAt.clientY - rect.top) / rect.height) * ch - displayH / 2;
        }
      }
      left = Math.max(16, Math.min(left, cw - displayW - 16));
      top = Math.max(16, Math.min(top, ch - displayH - 16));
    }

    img.set({
      left,
      top,
      scaleX: scale,
      scaleY: scale,
    });
    img.set("gratAssetKey", normalizeStorageKey(storageKey));
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
  }

  function requestDeleteAsset(asset: {
    id: string;
    fileName: string;
    storageKey: string;
  }) {
    if (!canEdit || cropping || !token || !id) return;
    const canvas = fabricRef.current;
    const usedCount = canvas
      ? findCanvasImagesForAsset(canvas, asset.storageKey).length
      : 0;
    setAssetDeletePrompt({
      id: asset.id,
      fileName: asset.fileName,
      storageKey: asset.storageKey,
      usedCount,
    });
  }

  async function confirmDeleteAsset() {
    if (!assetDeletePrompt || !token || !id || !canEdit) return;
    const { id: assetId, fileName, storageKey, usedCount } = assetDeletePrompt;
    const canvas = fabricRef.current;
    setAssetDeletePrompt(null);
    setError(null);
    try {
      if (canvas && usedCount > 0) {
        const matches = findCanvasImagesForAsset(canvas, storageKey);
        canvas.discardActiveObject();
        matches.forEach((obj) => canvas.remove(obj));
        canvas.requestRenderAll();
        markDirty();
      }
      await api.deleteTemplateAsset(token, id, assetId);
      const { template: fresh } = await api.template(token, id);
      setTemplate(fresh);
      setNotice(
        usedCount > 0
          ? `Removed “${fileName}” and ${usedCount} image(s) from the canvas. Save & compile to refresh the preview.`
          : `Removed uploaded file “${fileName}”.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete image failed");
    }
  }

  function layer(action: "front" | "back" | "forward" | "backward") {
    const canvas = fabricRef.current;
    const obj =
      (menuTargetRef.current &&
      canvas?.getObjects().includes(menuTargetRef.current)
        ? menuTargetRef.current
        : null) ?? canvas?.getActiveObject();
    if (!canvas || !obj || !canEdit || cropping) return;
    if (action === "front") canvas.bringObjectToFront(obj);
    if (action === "back") canvas.sendObjectToBack(obj);
    if (action === "forward") canvas.bringObjectForward(obj);
    if (action === "backward") canvas.sendObjectBackwards(obj);
    canvas.requestRenderAll();
    closeMenu();
  }

  function deleteSelected() {
    const canvas = fabricRef.current;
    if (!canvas || !canEdit || cropping) return;

    const fromMenu = menuTargetRef.current;
    const active = canvas.getActiveObject();
    const toRemove: FabricObject[] = [];

    if (fromMenu && canvas.getObjects().includes(fromMenu)) {
      toRemove.push(fromMenu);
    } else if (active) {
      const type = (active.type ?? "").toLowerCase();
      if (type === "activeselection" || type === "activeSelection".toLowerCase()) {
        // Fabric ActiveSelection
        const sel = active as FabricObject & {
          getObjects?: () => FabricObject[];
          forEachObject?: (fn: (o: FabricObject) => void) => void;
        };
        if (sel.forEachObject) sel.forEachObject((o) => toRemove.push(o));
        else if (sel.getObjects) toRemove.push(...sel.getObjects());
      } else {
        toRemove.push(active);
      }
    }

    if (!toRemove.length) {
      setError("Nothing selected to delete.");
      closeMenu();
      return;
    }

    canvas.discardActiveObject();
    toRemove.forEach((obj) => canvas.remove(obj));
    menuTargetRef.current = null;
    canvas.requestRenderAll();
    refreshSelectionLabel();
    closeMenu();
    setNotice(
      `Deleted ${toRemove.length} object(s). Click Save & compile to refresh the email preview.`,
    );
    setError(null);
  }

  function applyMenuColor(next: string) {
    const canvas = fabricRef.current;
    if (!canvas || !canEdit) return;
    setMenuFill(next);
    if (menu?.kind === "canvas") {
      setBg(next);
      canvas.backgroundColor = next;
      canvas.requestRenderAll();
      return;
    }
    const obj = menuTargetRef.current ?? canvas?.getActiveObject();
    if (!obj) return;
    if (isImage(obj)) return;
    obj.set("fill", next);
    if (!isText(obj)) setFill(next);
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyStrokeColor(next: string) {
    const canvas = fabricRef.current;
    const obj = menuTargetRef.current ?? canvas?.getActiveObject();
    if (!canvas || !obj || !canEdit || isImage(obj)) return;
    setMenuStroke(next);
    obj.set("stroke", next);
    if ((obj.strokeWidth ?? 0) <= 0) {
      obj.set("strokeWidth", 2);
      setMenuStrokeWidth(2);
    }
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyStrokeWidth(width: number) {
    const canvas = fabricRef.current;
    const obj = menuTargetRef.current ?? canvas?.getActiveObject();
    if (!canvas || !obj || !canEdit || isImage(obj)) return;
    const w = Math.max(0, Math.min(24, width));
    setMenuStrokeWidth(w);
    obj.set({
      strokeWidth: w,
      stroke: w > 0 ? menuStroke || "#1c2420" : obj.stroke,
    });
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyDash(style: "none" | "short" | "long") {
    const canvas = fabricRef.current;
    const obj = menuTargetRef.current ?? canvas?.getActiveObject();
    if (!canvas || !obj || !canEdit || isImage(obj)) return;
    setMenuDash(style);
    const dash =
      style === "short" ? [6, 4] : style === "long" ? [14, 8] : undefined;
    obj.set("strokeDashArray", dash);
    if (style !== "none" && (obj.strokeWidth ?? 0) <= 0) {
      obj.set({ strokeWidth: 2, stroke: menuStroke || "#1c2420" });
      setMenuStrokeWidth(2);
    }
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyCornerRadius(radius: number) {
    const canvas = fabricRef.current;
    const obj = menuTargetRef.current ?? canvas?.getActiveObject();
    if (!canvas || !obj || !canEdit) return;
    const r = Math.max(0, Math.min(120, radius));
    setMenuRadius(r);

    if (obj.type === "rect" || obj.type === "Rect") {
      (obj as Rect).set({ rx: r, ry: r });
    } else if (isImage(obj)) {
      const w = obj.width ?? 0;
      const h = obj.height ?? 0;
      const clip = new Rect({
        width: w,
        height: h,
        rx: r,
        ry: r,
        originX: "center",
        originY: "center",
      });
      obj.set("clipPath", r > 0 ? clip : undefined);
    }
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyFont(next: string) {
    const canvas = fabricRef.current;
    const obj =
      (menuTargetRef.current && isText(menuTargetRef.current)
        ? menuTargetRef.current
        : null) ?? canvas?.getActiveObject();
    if (!canvas || !obj || !canEdit || !isText(obj)) return;
    const font = normalizeFont(next);
    setMenuFont(font);
    obj.set({ fontFamily: font });
    const box = obj as Textbox & { initDimensions?: () => void; dirty?: boolean };
    box.dirty = true;
    box.initDimensions?.();
    obj.setCoords();
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyFontSize(size: number) {
    const canvas = fabricRef.current;
    const obj =
      (menuTargetRef.current && isText(menuTargetRef.current)
        ? menuTargetRef.current
        : null) ?? canvas?.getActiveObject();
    if (!canvas || !obj || !canEdit || !isText(obj)) return;
    const next = Math.max(10, Math.min(96, Math.round(size)));
    setMenuFontSize(next);
    obj.set({ fontSize: next });
    const box = obj as Textbox & { initDimensions?: () => void; dirty?: boolean };
    box.dirty = true;
    box.initDimensions?.();
    obj.setCoords();
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function activeText(): Textbox | null {
    const canvas = fabricRef.current;
    const obj =
      (menuTargetRef.current && isText(menuTargetRef.current)
        ? menuTargetRef.current
        : null) ?? canvas?.getActiveObject();
    if (!obj || !isText(obj)) return null;
    return obj;
  }

  function reflowText(obj: Textbox) {
    const box = obj as Textbox & { initDimensions?: () => void; dirty?: boolean };
    box.dirty = true;
    box.initDimensions?.();
    obj.setCoords();
  }

  function applyBold(next: boolean) {
    const canvas = fabricRef.current;
    const obj = activeText();
    if (!canvas || !obj || !canEdit) return;
    setMenuBold(next);
    obj.set({ fontWeight: next ? "bold" : "normal" });
    reflowText(obj);
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyItalic(next: boolean) {
    const canvas = fabricRef.current;
    const obj = activeText();
    if (!canvas || !obj || !canEdit) return;
    setMenuItalic(next);
    obj.set({ fontStyle: next ? "italic" : "normal" });
    reflowText(obj);
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyUnderline(next: boolean) {
    const canvas = fabricRef.current;
    const obj = activeText();
    if (!canvas || !obj || !canEdit) return;
    setMenuUnderline(next);
    obj.set({ underline: next });
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyAlign(next: "left" | "center" | "right") {
    const canvas = fabricRef.current;
    const obj = activeText();
    if (!canvas || !obj || !canEdit) return;
    setMenuAlign(next);
    obj.set({ textAlign: next });
    reflowText(obj);
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyOpacity(percent: number) {
    const canvas = fabricRef.current;
    const obj = menuTargetRef.current ?? canvas?.getActiveObject();
    if (!canvas || !obj || !canEdit) return;
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    setMenuOpacity(p);
    obj.set({ opacity: p / 100 });
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyTextShadow(patch: {
    on?: boolean;
    color?: string;
    blur?: number;
    offsetX?: number;
    offsetY?: number;
  }) {
    const canvas = fabricRef.current;
    const obj = activeText();
    if (!canvas || !obj || !canEdit) return;
    const on = patch.on ?? menuShadowOn;
    const color = patch.color ?? menuShadowColor;
    const blur = patch.blur ?? menuShadowBlur;
    const offsetX = patch.offsetX ?? menuShadowX;
    const offsetY = patch.offsetY ?? menuShadowY;
    if (patch.on != null) setMenuShadowOn(patch.on);
    if (patch.color != null) setMenuShadowColor(patch.color);
    if (patch.blur != null) setMenuShadowBlur(patch.blur);
    if (patch.offsetX != null) setMenuShadowX(patch.offsetX);
    if (patch.offsetY != null) setMenuShadowY(patch.offsetY);

    if (!on) {
      obj.set({ shadow: undefined });
    } else {
      obj.set({
        shadow: new Shadow({
          color,
          blur: Math.max(0, blur),
          offsetX,
          offsetY,
        }),
      });
    }
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function applyAngle(degrees: number) {
    const canvas = fabricRef.current;
    const obj = menuTargetRef.current ?? canvas?.getActiveObject();
    if (!canvas || !obj || !canEdit || cropping) return;
    const next = Math.round((((degrees % 360) + 360) % 360));
    setMenuAngle(next);
    obj.set("angle", next);
    obj.setCoords();
    canvas.requestRenderAll();
    commitObjectChange();
  }

  function nudgeAngle(delta: number) {
    applyAngle(menuAngle + delta);
  }

  function commitObjectChange() {
    markDirty();
    pushHistory();
  }

  async function saveAndCompile() {
    const canvas = fabricRef.current;
    if (!canvas || !token || !id || !canEdit || !template) return;
    if (cropRef.current) {
      setError("Apply or cancel crop before saving.");
      return;
    }
    setBusy(true);
    setBusyLabel("Preparing…");
    setError(null);
    setNotice(null);
    try {
      canvas.discardActiveObject();
      for (const obj of canvas.getObjects()) {
        if (typeof obj.setCoords === "function") obj.setCoords();
      }
      canvas.requestRenderAll();

      // Let React paint "Saving…" before heavy canvas work blocks the thread
      await new Promise<void>((r) => setTimeout(r, 40));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const stageW = Math.round(canvas.getWidth() || canvasW);
      const stageH = Math.round(canvas.getHeight() || canvasH);
      setCanvasW(stageW);
      setCanvasH(stageH);

      const raw = canvas.toObject(["gratField", "gratAssetKey"]);
      const fields = collectFieldNames(raw);
      const designJson: DesignerDesignJson = {
        mode: "designer",
        width: stageW,
        height: stageH,
        canvas: raw as Record<string, unknown>,
        fields,
        frame: {
          radius: frameRadius,
          borderWidth: frameBorderWidth,
          borderColor: frameBorderColor,
        },
      };

      const frame = {
        radius: frameRadius,
        borderWidth: frameBorderWidth,
        borderColor: frameBorderColor,
      };

      setBusyLabel("Exporting HTML…");
      await new Promise<void>((r) => setTimeout(r, 20));

      const compiledHtml = exportCanvasToEmailHtml(canvas, {
        width: stageW,
        height: stageH,
        frame,
        alt: template.name,
      });

      setBusyLabel("Rendering PNG preview…");
      await new Promise<void>((r) => setTimeout(r, 20));
      const previewPng = await canvasToPreviewPngDataUrl(canvas, frame);

      setBusyLabel("Saving…");
      try {
        await api.purgeCompiledAssets(token, id);
      } catch {
        // Old previews are optional to clean up
      }

      const { asset } = await api.uploadTemplateAsset(
        token,
        id,
        previewDataUrlToFile(previewPng, "preview.png"),
        "compiled",
      );

      await api.saveTemplateVersion(token, id, {
        designJson: designJson as unknown as Record<string, unknown>,
        compiledHtml,
        previewUrl: asset.url,
      });

      setNotice(
        "Saved design, email HTML, and 1:1 PNG preview. Click Done to see it on the card page.",
      );
      clearDirty();
      const { template: fresh } = await api.template(token, id);
      setTemplate(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
      setBusyLabel("Save & compile");
    }
  }

  function leaveDesigner(mode: "done" | "cancel" | "back") {
    if (!template) return;
    if (dirtyRef.current) {
      setLeavePrompt(
        mode === "done"
          ? "You have unsaved changes. Leave without saving? Your last Save & compile will be kept."
          : "Leave without saving? All modifications since the last Save & compile will be lost.",
      );
      return;
    }
    navigate(`/cards/${template.id}`);
  }

  function confirmLeave() {
    if (!template) return;
    setLeavePrompt(null);
    navigate(`/cards/${template.id}`);
  }

  if (!template && !error) {
    return (
      <div className="page">
        <p className="muted">Loading designer…</p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/cards">Back</Link>
      </div>
    );
  }

  return (
    <div className="designer-page" onClick={closeMenu}>
      <header className="designer-top">
        <div>
          <p className="back">
            <button
              type="button"
              className="back-link"
              onClick={() => leaveDesigner("back")}
            >
              ← {template.name}
            </button>
          </p>
          <h1>Designer</h1>
          <p className="lede">
            Icons add objects. Right-click to edit. Drag to move — green guides
            mark page center/edges; orange dashed guides snap to other objects.{" "}
            <strong>Save &amp; compile</strong> exports email HTML.{" "}
            <strong>Done</strong> returns to the card page.
            {dirty ? " · Unsaved changes" : ""}
          </p>
        </div>
        <div className="actions">
          {canEdit ? (
            <>
              <button
                type="button"
                className="ghost"
                disabled={busy || !ready || cropping || !canUndo}
                onClick={() => undo()}
                title="Undo (Ctrl+Z)"
              >
                Undo
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy || !ready || cropping || !canRedo}
                onClick={() => redo()}
                title="Redo (Ctrl+Y)"
              >
                Redo
              </button>
              <button
                type="button"
                disabled={busy || !ready || cropping}
                onClick={() => void saveAndCompile()}
                title="Save the layout and refresh the email HTML"
              >
                {busy ? busyLabel : "Save & compile"}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => leaveDesigner("done")}
            title="Return to the card page (asks if you have unsaved changes)"
          >
            Done
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || cropping}
            onClick={() => leaveDesigner("cancel")}
            title="Discard unsaved edits and leave"
          >
            Cancel
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="designer-layout">
        <aside className="designer-tools panel" onClick={(e) => e.stopPropagation()}>
          <div className="tools-tags" role="tablist" aria-label="Designer panels">
            <button
              type="button"
              role="tab"
              className={`tools-tag ${toolsTab === "objects" ? "active" : ""}`}
              aria-selected={toolsTab === "objects"}
              onClick={() => setToolsTab("objects")}
            >
              Objects
            </button>
            <button
              type="button"
              role="tab"
              className={`tools-tag ${toolsTab === "page" ? "active" : ""}`}
              aria-selected={toolsTab === "page"}
              onClick={() => setToolsTab("page")}
            >
              Page
            </button>
          </div>

          {toolsTab === "objects" ? (
            <>
              <div className="icon-tools" role="toolbar" aria-label="Add shapes">
                <button
                  type="button"
                  className="icon-tool"
                  title="Text"
                  aria-label="Add text"
                  disabled={!canEdit || cropping}
                  onClick={addTextField}
                >
                  <span className="icon-tool-t" aria-hidden>
                    T
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-tool"
                  title="Rectangle"
                  aria-label="Add rectangle"
                  disabled={!canEdit || cropping}
                  onClick={addRect}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <rect x="4" y="6" width="16" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-tool"
                  title="Circle"
                  aria-label="Add circle"
                  disabled={!canEdit || cropping}
                  onClick={addCircle}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-tool"
                  title="Line"
                  aria-label="Add line"
                  disabled={!canEdit || cropping}
                  onClick={addLine}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M5 17 L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-tool"
                  title="Oval"
                  aria-label="Add oval"
                  disabled={!canEdit || cropping}
                  onClick={addOval}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <ellipse cx="12" cy="12" rx="8" ry="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-tool"
                  title="Star"
                  aria-label="Add star"
                  disabled={!canEdit || cropping}
                  onClick={addStar}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path
                      d="M12 3.5l2.2 4.6 5 .7-3.6 3.5.9 5.1L12 15.4 7.5 17.4l.9-5.1L4.8 8.8l5-.7L12 3.5z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <label className={`file-pick ${!canEdit || cropping ? "is-disabled" : ""}`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  disabled={!canEdit || cropping}
                  onChange={(e) => void addImageFromFile(e.target.files?.[0] ?? null)}
                />
                <span className="file-pick-btn">Choose image</span>
                <span className="file-pick-name muted">
                  Or drag onto the canvas · JPEG/PNG/GIF/WebP
                </span>
              </label>

              {(template.assets ?? []).filter((a) => !a.fileName.startsWith("compiled-"))
                .length > 0 ? (
                <div>
                  <p className="muted small">Uploaded assets</p>
                  <ul className="asset-pick">
                    {(template.assets ?? [])
                      .filter((a) => !a.fileName.startsWith("compiled-"))
                      .slice(0, 12)
                      .map((a) => (
                        <li key={a.id} className="asset-pick-row">
                          <button
                            type="button"
                            className="ghost asset-btn"
                            disabled={!canEdit || cropping}
                            onClick={() => void addImageFromAsset(a.storageKey)}
                            title={`Add to canvas: ${a.fileName}`}
                          >
                            <span className="asset-btn-name">{a.fileName}</span>
                          </button>
                          <button
                            type="button"
                            className="ghost danger-text asset-remove"
                            disabled={!canEdit || cropping}
                            onClick={() => requestDeleteAsset(a)}
                            aria-label={`Remove ${a.fileName}`}
                            title="Remove uploaded file"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              <section className="defaults-section">
                <h2>Defaults</h2>
                <div
                  className="defaults-preview"
                  style={{ background: bg }}
                  aria-label="Preview of default text and shape colors on the canvas background"
                >
                  <span
                    className="defaults-preview-text"
                    style={{
                      fontFamily: defaultFont,
                      fontSize: Math.min(28, Math.max(14, defaultFontSize * 0.85)),
                      color: defaultFontColor,
                    }}
                  >
                    Sample text
                  </span>
                  <span
                    className="defaults-preview-shape"
                    style={{ background: fill }}
                    title="Shape color"
                  />
                </div>
                {contrastRatio(defaultFontColor, bg) < 2.8 ? (
                  <p className="warn-hint">
                    Font color is hard to see on this canvas background.{" "}
                    <button
                      type="button"
                      className="linkish"
                      disabled={!canEdit || cropping}
                      onClick={() =>
                        setDefaultFontColor(
                          relativeLuminance(bg) < 0.45 ? "#ffffff" : "#1c2420",
                        )
                      }
                    >
                      Fix contrast
                    </button>
                  </p>
                ) : null}
                <label className="color-row">
                  <span>Shape color</span>
                  <input
                    type="color"
                    value={fill}
                    onChange={(e) => setFill(e.target.value)}
                    disabled={!canEdit || cropping}
                    title="Fill for new shapes / stroke for new lines"
                  />
                </label>
                <label className="field-block">
                  <span>Font</span>
                  <select
                    className="ctx-select"
                    value={defaultFont}
                    disabled={!canEdit || cropping}
                    style={{ fontFamily: defaultFont }}
                    onChange={(e) => setDefaultFont(e.target.value)}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Font size</span>
                  <input
                    type="range"
                    min={10}
                    max={96}
                    value={defaultFontSize}
                    disabled={!canEdit || cropping}
                    onChange={(e) => setDefaultFontSize(Number(e.target.value))}
                  />
                  <span className="muted small">{defaultFontSize}px</span>
                </label>
                <label className="color-row">
                  <span>Font color</span>
                  <input
                    type="color"
                    value={defaultFontColor}
                    onChange={(e) => setDefaultFontColor(e.target.value)}
                    disabled={!canEdit || cropping}
                  />
                </label>
                <p className="muted small tip">
                  Applies to new objects only. Right-click existing ones to edit.
                </p>
              </section>
            </>
          ) : (
            <>
              <h2>Canvas size</h2>
              <div className="canvas-size-row">
                <label className="field-block">
                  <span>Width</span>
                  <input
                    type="number"
                    min={320}
                    max={1200}
                    step={10}
                    value={canvasW}
                    disabled={!canEdit || cropping}
                    onChange={(e) => {
                      const w = Number(e.target.value);
                      if (!Number.isFinite(w)) return;
                      resizeDesignCanvas(w, canvasH);
                    }}
                  />
                </label>
                <label className="field-block">
                  <span>Height</span>
                  <input
                    type="number"
                    min={400}
                    max={1600}
                    step={10}
                    value={canvasH}
                    disabled={!canEdit || cropping}
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      if (!Number.isFinite(h)) return;
                      resizeDesignCanvas(canvasW, h);
                    }}
                  />
                </label>
              </div>
              <div className="canvas-size-presets" role="group" aria-label="Size presets">
                {(
                  [
                    [600, 800, "Card"],
                    [600, 600, "Square"],
                    [640, 480, "Landscape"],
                    [800, 600, "Wide"],
                    [800, 800, "Square 800"],
                  ] as const
                ).map(([w, h, label]) => (
                  <button
                    key={`${w}x${h}`}
                    type="button"
                    className={`ghost small ${canvasW === w && canvasH === h ? "active" : ""}`}
                    disabled={!canEdit || cropping}
                    onClick={() => resizeDesignCanvas(w, h)}
                  >
                    {label} {w}×{h}
                  </button>
                ))}
              </div>
              <p className="muted small tip">
                Changing size scales all objects to the new canvas. Then Save
                &amp; compile so the preview matches.
              </p>
              {canEdit && !cropping ? (
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => fitContentToCanvas()}
                  title="Stretch the current layout to fill the canvas"
                >
                  Fit layout to canvas
                </button>
              ) : null}
              <p className="muted small tip">
                Size is saved with the design and used in exported email HTML
                (320–1200 × 400–1600).
              </p>

              <label className="color-row">
                <span>Canvas background</span>
                <input
                  type="color"
                  value={bg}
                  onChange={(e) => {
                    setBg(e.target.value);
                    markDirty();
                  }}
                  disabled={!canEdit || cropping}
                />
              </label>

              <h2>Screen frame</h2>
              <label className="field-block">
                <span>Corner radius</span>
                <input
                  type="range"
                  min={0}
                  max={48}
                  value={frameRadius}
                  disabled={!canEdit || cropping}
                  onChange={(e) => {
                    setFrameRadius(Number(e.target.value));
                    markDirty();
                  }}
                />
                <span className="muted small">{frameRadius}px</span>
              </label>
              <label className="field-block">
                <span>Border width</span>
                <input
                  type="range"
                  min={0}
                  max={16}
                  value={frameBorderWidth}
                  disabled={!canEdit || cropping}
                  onChange={(e) => {
                    setFrameBorderWidth(Number(e.target.value));
                    markDirty();
                  }}
                />
                <span className="muted small">{frameBorderWidth}px</span>
              </label>
              <label className="color-row">
                <span>Border color</span>
                <input
                  type="color"
                  value={frameBorderColor}
                  onChange={(e) => {
                    setFrameBorderColor(e.target.value);
                    markDirty();
                  }}
                  disabled={!canEdit || cropping || frameBorderWidth === 0}
                />
              </label>
              <p className="muted small tip">
                Frame styles are included in the exported HTML. Classic Outlook
                Desktop may ignore rounded corners (see Desktop vs Web preview).
              </p>
            </>
          )}
        </aside>

        <div
          className={`designer-stage panel ${dragOver ? "is-dragover" : ""}`}
          ref={stageRef}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          onDragEnter={(e) => {
            e.preventDefault();
            if (!canEdit || cropping) return;
            if ([...e.dataTransfer.types].includes("Files")) setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = canEdit && !cropping ? "copy" : "none";
          }}
          onDragLeave={(e) => {
            if (!stageRef.current?.contains(e.relatedTarget as Node)) {
              setDragOver(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!canEdit || cropping) return;
            const file = [...e.dataTransfer.files].find((f) =>
              /image\/(jpeg|png|gif|webp)/i.test(f.type),
            );
            if (!file) {
              setError("Drop a JPEG, PNG, GIF, or WebP image.");
              return;
            }
            void addImageFromFile(file, {
              clientX: e.clientX,
              clientY: e.clientY,
            });
          }}
        >
          {dragOver ? (
            <div className="drop-hint" aria-hidden>
              Drop image to add
            </div>
          ) : null}
          {cropping ? (
            <div className="crop-banner">
              <span>Resize the crop frame, then apply.</span>
              <div className="crop-actions">
                <button type="button" onClick={applyCrop}>
                  Apply crop
                </button>
                <button type="button" className="ghost" onClick={cancelCrop}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <div className="designer-stage-center">
            <div
              className="designer-fit-shell"
              style={{
                width: canvasW * viewScale,
                height: canvasH * viewScale,
              }}
            >
              <div
                className="designer-fit-scale"
                style={{
                  width: canvasW,
                  height: canvasH,
                  transform: `scale(${viewScale})`,
                }}
              >
                <div
                  className="designer-frame"
                  style={{
                    borderRadius: frameRadius,
                    borderWidth: frameBorderWidth,
                    borderStyle: frameBorderWidth > 0 ? "solid" : "none",
                    borderColor: frameBorderColor,
                  }}
                >
                  <canvas ref={canvasEl} />
                </div>
              </div>
            </div>
            {viewScale < 0.995 ? (
              <p className="designer-fit-label muted small">
                Fit {Math.round(viewScale * 100)}% · resize window to zoom
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {leavePrompt ? (
        <div
          className="app-modal-backdrop"
          role="presentation"
          onClick={() => setLeavePrompt(null)}
        >
          <div
            className="app-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            aria-describedby="leave-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="leave-title">Unsaved changes</h2>
            <p id="leave-desc">{leavePrompt}</p>
            <div className="app-modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setLeavePrompt(null)}
              >
                Keep editing
              </button>
              <button type="button" className="danger" onClick={confirmLeave}>
                Leave without saving
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assetDeletePrompt ? (
        <div
          className="app-modal-backdrop"
          role="presentation"
          onClick={() => setAssetDeletePrompt(null)}
        >
          <div
            className="app-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="asset-del-title"
            aria-describedby="asset-del-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="asset-del-title">Remove uploaded image?</h2>
            <p id="asset-del-desc">
              {assetDeletePrompt.usedCount > 0 ? (
                <>
                  <strong>{assetDeletePrompt.fileName}</strong> is used{" "}
                  <strong>{assetDeletePrompt.usedCount}</strong> time
                  {assetDeletePrompt.usedCount === 1 ? "" : "s"} on this card.
                  Removing it will also delete those canvas image(s). This cannot
                  be undone from the file library (canvas changes still need Save
                  &amp; compile).
                </>
              ) : (
                <>
                  Remove <strong>{assetDeletePrompt.fileName}</strong> from
                  uploads? It is not currently on the canvas.
                </>
              )}
            </p>
            <div className="app-modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setAssetDeletePrompt(null)}
              >
                Keep file
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void confirmDeleteAsset()}
              >
                {assetDeletePrompt.usedCount > 0
                  ? "Remove file and canvas images"
                  : "Remove file"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {menu && canEdit ? (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ top: menuPos.top, left: menuPos.left }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <p className="ctx-title">
            {menu.targetType === "canvas"
              ? "Canvas"
              : menu.targetType === "image"
                ? "Image"
                : menu.targetType === "text"
                  ? "Text"
                  : "Shape"}
          </p>
          {menu.targetType === "text" ? (
            <>
              <label className="color-row ctx-row">
                <span>Text color</span>
                <input
                  type="color"
                  value={menuFill}
                  onChange={(e) => applyMenuColor(e.target.value)}
                />
              </label>
              <label className="field-block ctx-row">
                <span>Font</span>
                <select
                  className="ctx-select"
                  value={menuFont}
                  onChange={(e) => applyFont(e.target.value)}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option
                      key={f.value}
                      value={f.value}
                      style={{ fontFamily: f.value }}
                    >
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block ctx-row">
                <span>Font size</span>
                <input
                  type="range"
                  min={10}
                  max={96}
                  value={menuFontSize}
                  onChange={(e) => applyFontSize(Number(e.target.value))}
                />
                <span className="muted small">{menuFontSize}px</span>
              </label>
              <div className="ctx-style-row" role="group" aria-label="Text style">
                <button
                  type="button"
                  className={`ctx-toggle ${menuBold ? "active" : ""}`}
                  aria-pressed={menuBold}
                  title="Bold"
                  onClick={() => applyBold(!menuBold)}
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  className={`ctx-toggle ${menuItalic ? "active" : ""}`}
                  aria-pressed={menuItalic}
                  title="Italic"
                  onClick={() => applyItalic(!menuItalic)}
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className={`ctx-toggle ${menuUnderline ? "active" : ""}`}
                  aria-pressed={menuUnderline}
                  title="Underline"
                  onClick={() => applyUnderline(!menuUnderline)}
                >
                  <span className="ctx-toggle-u">U</span>
                </button>
              </div>
              <div className="ctx-style-row" role="group" aria-label="Alignment">
                <button
                  type="button"
                  className={`ctx-toggle ${menuAlign === "left" ? "active" : ""}`}
                  aria-pressed={menuAlign === "left"}
                  title="Align left"
                  onClick={() => applyAlign("left")}
                >
                  Left
                </button>
                <button
                  type="button"
                  className={`ctx-toggle ${menuAlign === "center" ? "active" : ""}`}
                  aria-pressed={menuAlign === "center"}
                  title="Align center"
                  onClick={() => applyAlign("center")}
                >
                  Center
                </button>
                <button
                  type="button"
                  className={`ctx-toggle ${menuAlign === "right" ? "active" : ""}`}
                  aria-pressed={menuAlign === "right"}
                  title="Align right"
                  onClick={() => applyAlign("right")}
                >
                  Right
                </button>
              </div>
              <label className="ctx-check ctx-row">
                <input
                  type="checkbox"
                  checked={menuShadowOn}
                  onChange={(e) => applyTextShadow({ on: e.target.checked })}
                />
                <span>Text shadow</span>
              </label>
              {menuShadowOn ? (
                <>
                  <label className="color-row ctx-row">
                    <span>Shadow color</span>
                    <input
                      type="color"
                      value={menuShadowColor}
                      onChange={(e) =>
                        applyTextShadow({ color: e.target.value })
                      }
                    />
                  </label>
                  <label className="field-block ctx-row">
                    <span>Shadow blur</span>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      value={menuShadowBlur}
                      onChange={(e) =>
                        applyTextShadow({ blur: Number(e.target.value) })
                      }
                    />
                    <span className="muted small">{menuShadowBlur}px</span>
                  </label>
                  <label className="field-block ctx-row">
                    <span>Shadow offset X</span>
                    <input
                      type="range"
                      min={-20}
                      max={20}
                      value={menuShadowX}
                      onChange={(e) =>
                        applyTextShadow({ offsetX: Number(e.target.value) })
                      }
                    />
                    <span className="muted small">{menuShadowX}px</span>
                  </label>
                  <label className="field-block ctx-row">
                    <span>Shadow offset Y</span>
                    <input
                      type="range"
                      min={-20}
                      max={20}
                      value={menuShadowY}
                      onChange={(e) =>
                        applyTextShadow({ offsetY: Number(e.target.value) })
                      }
                    />
                    <span className="muted small">{menuShadowY}px</span>
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          {menu.targetType === "shape" ? (
            <>
              <label className="color-row ctx-row">
                <span>Fill color</span>
                <input
                  type="color"
                  value={menuFill}
                  onChange={(e) => applyMenuColor(e.target.value)}
                />
              </label>
              <label className="color-row ctx-row">
                <span>Line color</span>
                <input
                  type="color"
                  value={menuStroke}
                  onChange={(e) => applyStrokeColor(e.target.value)}
                />
              </label>
              <label className="field-block ctx-row">
                <span>Line width</span>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={menuStrokeWidth}
                  onChange={(e) => applyStrokeWidth(Number(e.target.value))}
                />
                <span className="muted small">{menuStrokeWidth}px</span>
              </label>
              <label className="field-block ctx-row">
                <span>Line style</span>
                <select
                  className="ctx-select"
                  value={menuDash}
                  onChange={(e) =>
                    applyDash(e.target.value as "none" | "short" | "long")
                  }
                >
                  <option value="none">Solid</option>
                  <option value="short">Dashed (short gaps)</option>
                  <option value="long">Dashed (long gaps)</option>
                </select>
              </label>
              <label className="field-block ctx-row">
                <span>Corner radius</span>
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={menuRadius}
                  onChange={(e) => applyCornerRadius(Number(e.target.value))}
                />
                <span className="muted small">{menuRadius}px</span>
              </label>
            </>
          ) : null}
          {menu.targetType === "canvas" ? (
            <label className="color-row ctx-row">
              <span>Background</span>
              <input
                type="color"
                value={menuFill}
                onChange={(e) => applyMenuColor(e.target.value)}
              />
            </label>
          ) : null}
          {menu.targetType === "image" ? (
            <>
              <button type="button" className="ctx-item" onClick={startCrop}>
                Crop image…
              </button>
              <label className="field-block ctx-row">
                <span>Corner radius</span>
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={menuRadius}
                  onChange={(e) => applyCornerRadius(Number(e.target.value))}
                />
                <span className="muted small">{menuRadius}px</span>
              </label>
            </>
          ) : null}
          {menu.kind === "object" ? (
            <>
              <label className="field-block ctx-row">
                <span>Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={menuOpacity}
                  onChange={(e) => applyOpacity(Number(e.target.value))}
                />
                <span className="muted small">{menuOpacity}%</span>
              </label>
              <label className="field-block ctx-row">
                <span>Rotate</span>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={menuAngle}
                  onChange={(e) => applyAngle(Number(e.target.value))}
                />
                <span className="muted small">{menuAngle}°</span>
              </label>
              <div className="ctx-rotate-row">
                <button
                  type="button"
                  className="ctx-item"
                  onClick={() => nudgeAngle(-90)}
                >
                  −90°
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={() => nudgeAngle(90)}
                >
                  +90°
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={() => applyAngle(0)}
                >
                  Reset
                </button>
              </div>
              <button
                type="button"
                className="ctx-item"
                onClick={() => layer("forward")}
              >
                Bring forward
              </button>
              <button
                type="button"
                className="ctx-item"
                onClick={() => layer("backward")}
              >
                Send backward
              </button>
              <button
                type="button"
                className="ctx-item ctx-danger"
                onClick={deleteSelected}
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
