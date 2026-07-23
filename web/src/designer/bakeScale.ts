import type { Circle, Ellipse, FabricObject, Rect } from "fabric";

type ScaleBase = {
  rx: number;
  ry: number;
  radius: number;
  strokeWidth: number;
};

const scaleBase = new WeakMap<FabricObject, ScaleBase>();

function isRoundable(type: string) {
  return type === "rect" || type === "ellipse" || type === "circle";
}

function captureBase(obj: FabricObject) {
  if (scaleBase.has(obj)) return scaleBase.get(obj)!;
  const type = (obj.type ?? "").toLowerCase();
  const rect = obj as Rect;
  const ell = obj as Ellipse;
  const circle = obj as Circle;
  const base: ScaleBase = {
    rx: type === "rect" || type === "ellipse" ? (rect.rx ?? ell.rx ?? 0) : 0,
    ry: type === "rect" || type === "ellipse" ? (rect.ry ?? ell.ry ?? 0) : 0,
    radius: type === "circle" ? (circle.radius ?? 0) : 0,
    strokeWidth: obj.strokeWidth ?? 0,
  };
  scaleBase.set(obj, base);
  return base;
}

/**
 * While the pointer is down, Fabric scales via scaleX/scaleY (which also
 * stretches strokes and rx/ry). Counter-scale those props so the on-screen
 * corner radius and stroke stay stable — without baking width/height mid-drag
 * (that fights the active transform and causes temporary "border" glitches,
 * especially on rotated objects).
 */
export function compensateWhileScaling(target: FabricObject) {
  const type = (target.type ?? "").toLowerCase();
  if (type === "activeselection" || type === "group") {
    const group = target as FabricObject & { getObjects?: () => FabricObject[] };
    for (const child of group.getObjects?.() ?? []) {
      compensateWhileScaling(child);
    }
    return;
  }
  if (!isRoundable(type)) return;

  const base = captureBase(target);
  const sx = Math.max(1e-4, Math.abs(target.scaleX ?? 1));
  const sy = Math.max(1e-4, Math.abs(target.scaleY ?? 1));
  const strokeScale = (sx + sy) / 2;

  if (type === "rect") {
    (target as Rect).set({
      rx: base.rx / sx,
      ry: base.ry / sy,
      strokeWidth: base.strokeWidth / strokeScale,
    });
  } else if (type === "ellipse") {
    // Ellipse rx/ry *are* the geometry; leave them — only stabilize stroke.
    target.set({ strokeWidth: base.strokeWidth / strokeScale });
  } else if (type === "circle") {
    target.set({ strokeWidth: base.strokeWidth / strokeScale });
  }
}

/**
 * Fabric applies scaleX/scaleY as a transform, which also stretches rx/ry
 * (rounded corners become "elastic"). Bake scale into geometry and reset
 * scale to 1 so corner radii stay circular in absolute pixels.
 */
export function bakeScaledShape(obj: FabricObject) {
  const type = (obj.type ?? "").toLowerCase();
  const sx = obj.scaleX ?? 1;
  const sy = obj.scaleY ?? 1;
  const base = scaleBase.get(obj);
  scaleBase.delete(obj);

  if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) {
    // Restore absolute stroke/corners if we only compensated
    if (base && type === "rect") {
      const rect = obj as Rect;
      const maxR = Math.min(rect.width ?? 0, rect.height ?? 0) / 2;
      rect.set({
        rx: Math.min(base.rx, maxR),
        ry: Math.min(base.ry, maxR),
        strokeWidth: base.strokeWidth,
      });
      rect.setCoords();
      return true;
    }
    if (base) {
      obj.set({ strokeWidth: base.strokeWidth });
      obj.setCoords();
      return true;
    }
    return false;
  }

  if (type === "rect") {
    const rect = obj as Rect;
    const width = Math.max(1, (rect.width ?? 0) * sx);
    const height = Math.max(1, (rect.height ?? 0) * sy);
    const maxR = Math.min(width, height) / 2;
    const rx = Math.min(Math.max(0, base?.rx ?? rect.rx ?? 0), maxR);
    const ry = Math.min(Math.max(0, base?.ry ?? rect.ry ?? 0), maxR);
    rect.set({
      width,
      height,
      scaleX: 1,
      scaleY: 1,
      rx,
      ry,
      strokeWidth: base?.strokeWidth ?? rect.strokeWidth ?? 0,
    });
    rect.setCoords();
    return true;
  }

  if (type === "ellipse") {
    const ell = obj as Ellipse;
    ell.set({
      rx: Math.max(1, (ell.rx ?? 0) * sx),
      ry: Math.max(1, (ell.ry ?? 0) * sy),
      scaleX: 1,
      scaleY: 1,
      strokeWidth: base?.strokeWidth ?? ell.strokeWidth ?? 0,
    });
    ell.setCoords();
    return true;
  }

  if (type === "circle") {
    const circle = obj as Circle;
    const scale = Math.abs(sx - sy) < 0.02 ? sx : (sx + sy) / 2;
    circle.set({
      radius: Math.max(1, (base?.radius ?? circle.radius ?? 0) * scale),
      scaleX: 1,
      scaleY: 1,
      strokeWidth: base?.strokeWidth ?? circle.strokeWidth ?? 0,
    });
    circle.setCoords();
    return true;
  }

  return false;
}

/** Bake the active target, or each child of a multi-selection. */
export function bakeScaledTarget(target: FabricObject) {
  const type = (target.type ?? "").toLowerCase();
  if (type === "activeselection" || type === "group") {
    const group = target as FabricObject & {
      getObjects?: () => FabricObject[];
    };
    const kids = group.getObjects?.() ?? [];
    let any = false;
    for (const child of kids) {
      if (bakeScaledShape(child)) any = true;
    }
    return any;
  }
  return bakeScaledShape(target);
}
