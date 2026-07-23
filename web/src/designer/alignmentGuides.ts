import { Point, type Canvas, type FabricObject } from "fabric";

export type AlignGuide = {
  orientation: "v" | "h";
  pos: number;
  kind: "page" | "object";
};

/** Distance (px) within which edges/centers snap to guides. */
const SNAP_PX = 12;

function isSkip(obj: FabricObject) {
  return Boolean((obj as FabricObject & { gratCropFrame?: boolean }).gratCropFrame);
}

type SnapTarget = { pos: number; kind: "page" | "object" };

/** Axis-aligned box from center + scaled size (scene coordinates). */
function boundsOf(obj: FabricObject) {
  const center = obj.getCenterPoint();
  const w = obj.getScaledWidth();
  const h = obj.getScaledHeight();
  return {
    left: center.x - w / 2,
    top: center.y - h / 2,
    right: center.x + w / 2,
    bottom: center.y + h / 2,
    cx: center.x,
    cy: center.y,
    width: w,
    height: h,
  };
}

function collectTargets(canvas: Canvas, moving: FabricObject) {
  const cw = canvas.getWidth() || 0;
  const ch = canvas.getHeight() || 0;
  const vertical: SnapTarget[] = [
    { pos: cw / 2, kind: "page" },
    { pos: 0, kind: "page" },
    { pos: cw, kind: "page" },
  ];
  const horizontal: SnapTarget[] = [
    { pos: ch / 2, kind: "page" },
    { pos: 0, kind: "page" },
    { pos: ch, kind: "page" },
  ];

  const movingSet = new Set<FabricObject>([moving]);
  const maybeGroup = moving as FabricObject & { getObjects?: () => FabricObject[] };
  if (typeof maybeGroup.getObjects === "function") {
    for (const child of maybeGroup.getObjects()) movingSet.add(child);
  }

  for (const obj of canvas.getObjects()) {
    if (isSkip(obj) || movingSet.has(obj)) continue;
    const b = boundsOf(obj);
    vertical.push(
      { pos: b.left, kind: "object" },
      { pos: b.cx, kind: "object" },
      { pos: b.right, kind: "object" },
    );
    horizontal.push(
      { pos: b.top, kind: "object" },
      { pos: b.cy, kind: "object" },
      { pos: b.bottom, kind: "object" },
    );
  }

  return { vertical, horizontal };
}

function bestSnap(
  edges: Array<{ name: "left" | "cx" | "right" | "top" | "cy" | "bottom"; value: number }>,
  targets: SnapTarget[],
): { delta: number; guide: AlignGuide } | null {
  let best: { dist: number; delta: number; guide: AlignGuide } | null = null;
  for (const edge of edges) {
    const orientation: "v" | "h" =
      edge.name === "left" || edge.name === "cx" || edge.name === "right"
        ? "v"
        : "h";
    for (const target of targets) {
      const dist = Math.abs(edge.value - target.pos);
      if (dist > SNAP_PX) continue;
      const better =
        !best ||
        dist < best.dist - 0.01 ||
        (Math.abs(dist - best.dist) <= 0.01 &&
          target.kind === "page" &&
          best.guide.kind !== "page");
      if (better) {
        best = {
          dist,
          delta: target.pos - edge.value,
          guide: {
            orientation,
            pos: target.pos,
            kind: target.kind,
          },
        };
      }
    }
  }
  return best ? { delta: best.delta, guide: best.guide } : null;
}

/** Snap moving object to page center / edges and other objects; return active guides. */
export function snapObjectWhileMoving(
  canvas: Canvas,
  moving: FabricObject,
): AlignGuide[] {
  if (isSkip(moving)) return [];

  const { vertical, horizontal } = collectTargets(canvas, moving);
  const b = boundsOf(moving);
  const guides: AlignGuide[] = [];

  const vSnap = bestSnap(
    [
      { name: "left", value: b.left },
      { name: "cx", value: b.cx },
      { name: "right", value: b.right },
    ],
    vertical,
  );
  const hSnap = bestSnap(
    [
      { name: "top", value: b.top },
      { name: "cy", value: b.cy },
      { name: "bottom", value: b.bottom },
    ],
    horizontal,
  );

  let dx = 0;
  let dy = 0;
  if (vSnap) {
    dx = vSnap.delta;
    guides.push(vSnap.guide);
  }
  if (hSnap) {
    dy = hSnap.delta;
    guides.push(hSnap.guide);
  }

  if (dx !== 0 || dy !== 0) {
    const center = moving.getCenterPoint();
    // Move by center so originX/originY cannot desync bounds from left/top
    moving.setPositionByOrigin(
      new Point(center.x + dx, center.y + dy),
      "center",
      "center",
    );
    moving.setCoords();
  }

  return guides;
}

export function drawAlignGuides(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
  guides: AlignGuide[],
) {
  if (!guides.length) return;
  const w = canvas.getWidth() || 0;
  const h = canvas.getHeight() || 0;

  ctx.save();
  for (const g of guides) {
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.setLineDash(g.kind === "page" ? [] : [5, 4]);
    ctx.strokeStyle = g.kind === "page" ? "#0f6b5c" : "#e85d04";
    if (g.orientation === "v") {
      const x = Math.round(g.pos) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    } else {
      const y = Math.round(g.pos) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  for (const g of guides) {
    if (g.kind !== "page") continue;
    ctx.fillStyle = "#0f6b5c";
    if (g.orientation === "v") {
      const x = g.pos;
      const mid = h / 2;
      ctx.beginPath();
      ctx.moveTo(x, mid - 8);
      ctx.lineTo(x - 5, mid);
      ctx.lineTo(x + 5, mid);
      ctx.closePath();
      ctx.fill();
    } else {
      const y = g.pos;
      const mid = w / 2;
      ctx.beginPath();
      ctx.moveTo(mid - 8, y);
      ctx.lineTo(mid, y - 5);
      ctx.lineTo(mid, y + 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}

/** Attach snap + guide drawing to a Fabric canvas. */
export function attachAlignmentGuides(canvas: Canvas) {
  let guides: AlignGuide[] = [];
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    if (!guides.length) return;
    guides = [];
    canvas.requestRenderAll();
  };

  const scheduleClear = (ms = 600) => {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      clearTimer = null;
      clear();
    }, ms);
  };

  const onMoving = (opt: { target?: FabricObject }) => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    const target = opt.target;
    if (!target) {
      guides = [];
      return;
    }
    guides = snapObjectWhileMoving(canvas, target);
  };

  const onAfterRender = (opt: { ctx: CanvasRenderingContext2D }) => {
    drawAlignGuides(canvas, opt.ctx, guides);
  };

  /** After arrow-key nudges: snap to nearby guides and show lines briefly. */
  const afterKeyboardNudge = (targets: FabricObject[]) => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    const living = targets.filter((o) => !isSkip(o));
    if (!living.length) {
      guides = [];
      canvas.requestRenderAll();
      return;
    }
    // Snap/show for each selected object; keep union of guides
    const all: AlignGuide[] = [];
    for (const obj of living) {
      all.push(...snapObjectWhileMoving(canvas, obj));
    }
    // Dedupe by orientation+pos+kind
    const seen = new Set<string>();
    guides = all.filter((g) => {
      const key = `${g.orientation}:${g.pos}:${g.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    canvas.requestRenderAll();
    scheduleClear(700);
  };

  canvas.on("object:moving", onMoving);
  canvas.on("object:modified", clear);
  canvas.on("mouse:up", clear);
  canvas.on("after:render", onAfterRender);

  return {
    detach: () => {
      if (clearTimer) clearTimeout(clearTimer);
      canvas.off("object:moving", onMoving);
      canvas.off("object:modified", clear);
      canvas.off("mouse:up", clear);
      canvas.off("after:render", onAfterRender);
      guides = [];
    },
    afterKeyboardNudge,
    clear,
  };
}
