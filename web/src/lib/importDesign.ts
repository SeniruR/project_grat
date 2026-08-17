import { api } from "../api/client";
import {
  createZipImagePreviewUrls,
  parseCanvaZip,
  rewriteCanvaAssetUrls,
} from "./importCanvaZip";
import {
  buildImageEmailHtml,
  fileToDesignImageBlob,
} from "./importDesignImage";
import {
  inferEmailWidth,
  rasterizeEmailHtmlToFile,
} from "./rasterizeEmailHtml";
import {
  applyHtmlVerticalCrop,
  cropPngDataUrl,
  dataUrlToPngFile,
  detectWhiteVerticalMargins,
} from "./trimEmailWhiteMargins";
import {
  parseIgnoredPlaceholdersFromDesignJson,
  parsePlaceholdersFromDesignJson,
  syncPlaceholdersWithHtml,
  type PlaceholderDef,
} from "./mergeFields";
import {
  parseImageSlotsFromDesignJson,
  syncImageSlotsWithHtml,
  type ImageSlotDef,
} from "./imageSlots";
import { resolveMediaUrl, rewriteMediaUrlsInHtml } from "./mediaUrl";

function resolveDefaultSubjectForSave(
  options?: {
    defaultSubject?: string;
    previousDesignJson?: Record<string, unknown>;
  },
): string | undefined {
  if (typeof options?.defaultSubject === "string") {
    return options.defaultSubject.trim().slice(0, 300);
  }
  const prev = options?.previousDesignJson?.defaultSubject;
  if (typeof prev === "string") return prev.trim().slice(0, 300);
  return undefined;
}

/** Parse a Canva ZIP in the browser and list placeholders + image slots (no upload). */
export async function scanCanvaZipPlaceholders(zipFile: File): Promise<{
  placeholders: PlaceholderDef[];
  imageSlots: ImageSlotDef[];
  htmlPath: string;
  /** blob: URLs created for thumbs - revoke when discarding the scan. */
  previewObjectUrls: string[];
}> {
  const { html, htmlPath, assets } = await parseCanvaZip(zipFile);
  const { slots } = syncImageSlotsWithHtml(html);
  const previews = createZipImagePreviewUrls(assets);
  const imageSlots = slots.map((slot) => {
    const previewSrc = previews.resolve(slot.originalSrc) ?? undefined;
    return previewSrc ? { ...slot, previewSrc } : slot;
  });
  return {
    placeholders: syncPlaceholdersWithHtml(html),
    imageSlots,
    htmlPath,
    previewObjectUrls: previews.urls,
  };
}

/**
 * Import a Canva Email HTML ZIP into an existing template:
 * upload images + fonts, rewrite src/url(...), save compiledHtml,
 * detect {{placeholders}}, and rasterize a PNG snapshot for Outlook paste.
 *
 * Snapshot is built from local ZIP blob: URLs first (no cross-origin fetch),
 * so CORS cannot block the PNG thumbnail.
 */
export async function importCanvaZipToTemplate(
  token: string,
  templateId: string,
  zipFile: File,
  options?: {
    previousPlaceholders?: PlaceholderDef[];
    previousImageSlots?: ImageSlotDef[];
    previousDesignJson?: Record<string, unknown>;
    ignoredPlaceholders?: string[];
    /** When true, crop solid white letterboxing above/below the design. */
    trimWhiteMargins?: boolean;
    /** Owner-configured subject Compose should start with. */
    defaultSubject?: string;
  },
) {
  const { html, assets } = await parseCanvaZip(zipFile);
  const defaultSubject = resolveDefaultSubjectForSave(options);

  const previous =
    options?.previousPlaceholders ??
    parsePlaceholdersFromDesignJson(options?.previousDesignJson);
  const previousSlots =
    options?.previousImageSlots ??
    parseImageSlotsFromDesignJson(options?.previousDesignJson);
  const ignored =
    options?.ignoredPlaceholders ??
    parseIgnoredPlaceholdersFromDesignJson(options?.previousDesignJson);

  // data: URLs work inside the rasterize iframe; blob: URLs often do not.
  const localUploads: Array<{
    fileName: string;
    path: string;
    url: string;
  }> = [];
  for (const a of assets) {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(reader.error ?? new Error("Could not read ZIP asset"));
      reader.readAsDataURL(a.blob);
    });
    localUploads.push({
      fileName: a.fileName,
      path: a.path,
      url,
    });
  }

  const preSynced = syncImageSlotsWithHtml(html, previousSlots);
  const emailWidth = inferEmailWidth(preSynced.html);

  let previewUrl: string | null = null;
  let emailHeight = 800;
  let trimMeta: { enabled: boolean; top: number; bottom: number } | null =
    null;
  let htmlCrop: {
    top: number;
    bottom: number;
    height: number;
    width: number;
  } | null = null;
  let snapshotError: string | null = null;
  let snapshotFile: File | null = null;

  try {
    const localHtml = rewriteCanvaAssetUrls(preSynced.html, localUploads);
    const raster = await rasterizeEmailHtmlToFile(localHtml, emailWidth);
    snapshotFile = raster.file;
    emailHeight = raster.height;

    if (options?.trimWhiteMargins) {
      const crop = await detectWhiteVerticalMargins(
        raster.dataUrl,
        raster.width,
        raster.height,
        raster.pixelRatio,
      );
      if (crop) {
        const cropped = await cropPngDataUrl(
          raster.dataUrl,
          crop,
          raster.pixelRatio,
        );
        snapshotFile = await dataUrlToPngFile(cropped.dataUrl);
        emailHeight = cropped.height;
        htmlCrop = crop;
        trimMeta = { enabled: true, top: crop.top, bottom: crop.bottom };
      } else {
        trimMeta = { enabled: true, top: 0, bottom: 0 };
      }
    }
  } catch (err) {
    snapshotError =
      err instanceof Error ? err.message : "PNG snapshot failed";
    snapshotFile = null;
  }

  const remoteUploads: Array<{
    fileName: string;
    path: string;
    url: string;
  }> = [];
  for (const asset of assets) {
    const file = new File([asset.blob], asset.fileName, {
      type:
        asset.blob.type ||
        (asset.kind === "font" ? "font/ttf" : "image/png"),
    });
    const { asset: uploaded } = await api.uploadTemplateAsset(
      token,
      templateId,
      file,
      "source",
    );
    remoteUploads.push({
      fileName: asset.fileName,
      path: asset.path,
      url: resolveMediaUrl(uploaded.url) ?? uploaded.url,
    });
  }

  let compiledHtml = rewriteMediaUrlsInHtml(
    rewriteCanvaAssetUrls(preSynced.html, remoteUploads),
  );
  if (htmlCrop) {
    compiledHtml = applyHtmlVerticalCrop(compiledHtml, htmlCrop);
  }
  const synced = syncImageSlotsWithHtml(compiledHtml, preSynced.slots);
  compiledHtml = synced.html;
  const imageSlots = synced.slots;
  const placeholders = syncPlaceholdersWithHtml(
    compiledHtml,
    previous,
    ignored,
  );
  const imageCount = assets.filter((a) => a.kind === "image").length;

  if (snapshotFile) {
    try {
      try {
        await api.purgeCompiledAssets(token, templateId);
      } catch {
        /* optional */
      }
      const { asset: compiled } = await api.uploadTemplateAsset(
        token,
        templateId,
        snapshotFile,
        "compiled",
      );
      previewUrl = resolveMediaUrl(compiled.url) ?? compiled.url;
    } catch (err) {
      snapshotError =
        err instanceof Error ? err.message : "Could not upload PNG snapshot";
      previewUrl = null;
    }
  }

  await api.saveTemplateVersion(token, templateId, {
    designJson: {
      ...(options?.previousDesignJson ?? {}),
      mode: "canva_html",
      source: "canva_zip",
      importedAt: new Date().toISOString(),
      imageCount,
      fontCount: assets.filter((a) => a.kind === "font").length,
      width: emailWidth,
      height: emailHeight,
      placeholders,
      imageSlots,
      ignoredPlaceholders: ignored,
      ...(defaultSubject !== undefined ? { defaultSubject } : {}),
      ...(trimMeta
        ? {
            trimWhiteMargins: trimMeta.enabled,
            trimWhiteTop: trimMeta.top,
            trimWhiteBottom: trimMeta.bottom,
          }
        : { trimWhiteMargins: false }),
      ...(snapshotError ? { snapshotError } : {}),
    },
    compiledHtml,
    previewUrl,
  });

  return {
    compiledHtml,
    imageCount,
    previewUrl,
    placeholders,
    imageSlots,
    trimmedWhiteMargins: Boolean(trimMeta?.top || trimMeta?.bottom),
    snapshotError,
  };
}

/** Rebuild PNG snapshot from stored Canva HTML (no ZIP re-upload). */
export async function regenerateCanvaSnapshot(
  token: string,
  templateId: string,
  compiledHtml: string,
  designJson: Record<string, unknown>,
) {
  const emailWidth =
    typeof designJson.width === "number"
      ? designJson.width
      : inferEmailWidth(compiledHtml);

  const htmlForRaster = rewriteMediaUrlsInHtml(compiledHtml);
  const { file, height } = await rasterizeEmailHtmlToFile(
    htmlForRaster,
    emailWidth,
  );
  try {
    await api.purgeCompiledAssets(token, templateId);
  } catch {
    /* optional */
  }
  const { asset } = await api.uploadTemplateAsset(
    token,
    templateId,
    file,
    "compiled",
  );
  const previewUrl = resolveMediaUrl(asset.url) ?? asset.url;
  await api.saveTemplateVersion(token, templateId, {
    designJson: {
      ...designJson,
      mode: "canva_html",
      width: emailWidth,
      height,
    },
    compiledHtml: htmlForRaster,
    previewUrl,
  });
  return { previewUrl, width: emailWidth, height };
}

/**
 * Import a PNG/JPEG/PDF as a single-image email (not selectable text).
 */
export async function importDesignImageToTemplate(
  token: string,
  templateId: string,
  file: File,
  alt?: string,
  options?: {
    previousImageSlots?: ImageSlotDef[];
    previousDesignJson?: Record<string, unknown>;
    defaultSubject?: string;
  },
) {
  const { blob, fileName, width } = await fileToDesignImageBlob(file);
  const uploadFile = new File([blob], fileName, {
    type: blob.type || "image/png",
  });
  const defaultSubject = resolveDefaultSubjectForSave(options);

  try {
    await api.purgeCompiledAssets(token, templateId);
  } catch {
    /* optional */
  }

  const { asset: compiled } = await api.uploadTemplateAsset(
    token,
    templateId,
    uploadFile,
    "compiled",
  );

  // Also keep a source copy for the assets list when it was a user image
  if (!/\.pdf$/i.test(file.name)) {
    try {
      await api.uploadTemplateAsset(token, templateId, file, "source");
    } catch {
      /* optional duplicate */
    }
  }

  let compiledHtml = buildImageEmailHtml(
    resolveMediaUrl(compiled.url) ?? compiled.url,
    width,
    alt ?? "Gratitude card",
  );

  const previousSlots =
    options?.previousImageSlots ??
    parseImageSlotsFromDesignJson(options?.previousDesignJson);
  const synced = syncImageSlotsWithHtml(compiledHtml, previousSlots);
  compiledHtml = synced.html;
  const imageSlots = synced.slots;
  const previewUrl = resolveMediaUrl(compiled.url) ?? compiled.url;

  await api.saveTemplateVersion(token, templateId, {
    designJson: {
      ...(options?.previousDesignJson ?? {}),
      mode: "image_import",
      source: "upload",
      width,
      importedAt: new Date().toISOString(),
      imageSlots,
      ...(defaultSubject !== undefined ? { defaultSubject } : {}),
    },
    compiledHtml,
    previewUrl,
  });

  return { compiledHtml, previewUrl, width, imageSlots };
}
