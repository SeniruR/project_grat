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
  /** blob: URLs created for thumbs — revoke when discarding the scan. */
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
  const uploads: Array<{ fileName: string; path: string; url: string }> = [];
  const defaultSubject = resolveDefaultSubjectForSave(options);

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
    uploads.push({
      fileName: asset.fileName,
      path: asset.path,
      url: resolveMediaUrl(uploaded.url) ?? uploaded.url,
    });
  }

  const previous =
    options?.previousPlaceholders ??
    parsePlaceholdersFromDesignJson(options?.previousDesignJson);
  const previousSlots =
    options?.previousImageSlots ??
    parseImageSlotsFromDesignJson(options?.previousDesignJson);
  const ignored =
    options?.ignoredPlaceholders ??
    parseIgnoredPlaceholdersFromDesignJson(options?.previousDesignJson);

  // Tag slots on pre-rewrite HTML so ids match the in-browser ZIP scan,
  // then rewrite asset URLs and refresh originalSrc while keeping ids/modes.
  const preSynced = syncImageSlotsWithHtml(html, previousSlots);
  let compiledHtml = rewriteMediaUrlsInHtml(
    rewriteCanvaAssetUrls(preSynced.html, uploads),
  );
  const synced = syncImageSlotsWithHtml(compiledHtml, preSynced.slots);
  compiledHtml = synced.html;
  const imageSlots = synced.slots;

  const placeholders = syncPlaceholdersWithHtml(
    compiledHtml,
    previous,
    ignored,
  );
  const imageCount = assets.filter((a) => a.kind === "image").length;
  const emailWidth = inferEmailWidth(compiledHtml);

  let previewUrl: string | null = null;
  let emailHeight = 800;
  let trimMeta: { enabled: boolean; top: number; bottom: number } | null =
    null;

  try {
    const raster = await rasterizeEmailHtmlToFile(compiledHtml, emailWidth);
    let snapshotFile = raster.file;
    emailHeight = raster.height;

    if (options?.trimWhiteMargins) {
      const crop = await detectWhiteVerticalMargins(
        raster.dataUrl,
        raster.width,
        raster.height,
        raster.pixelRatio,
      );
      if (crop) {
        compiledHtml = applyHtmlVerticalCrop(compiledHtml, crop);
        const cropped = await cropPngDataUrl(
          raster.dataUrl,
          crop,
          raster.pixelRatio,
        );
        snapshotFile = await dataUrlToPngFile(cropped.dataUrl);
        emailHeight = cropped.height;
        trimMeta = { enabled: true, top: crop.top, bottom: crop.bottom };
      } else {
        trimMeta = { enabled: true, top: 0, bottom: 0 };
      }
    }

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
  } catch {
    /* HTML-only import still works */
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

  const { file, height } = await rasterizeEmailHtmlToFile(
    compiledHtml,
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
    compiledHtml,
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
