import { api } from "../api/client";
import {
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

/** Parse a Canva ZIP in the browser and list placeholders + image slots (no upload). */
export async function scanCanvaZipPlaceholders(zipFile: File): Promise<{
  placeholders: PlaceholderDef[];
  imageSlots: ImageSlotDef[];
  htmlPath: string;
}> {
  const { html, htmlPath } = await parseCanvaZip(zipFile);
  const { slots } = syncImageSlotsWithHtml(html);
  return {
    placeholders: syncPlaceholdersWithHtml(html),
    imageSlots: slots,
    htmlPath,
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
  },
) {
  const { html, assets } = await parseCanvaZip(zipFile);
  const uploads: Array<{ fileName: string; path: string; url: string }> = [];

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
      url: uploaded.url,
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
  let compiledHtml = rewriteCanvaAssetUrls(preSynced.html, uploads);
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

  try {
    const { file, height } = await rasterizeEmailHtmlToFile(
      compiledHtml,
      emailWidth,
    );
    try {
      await api.purgeCompiledAssets(token, templateId);
    } catch {
      /* optional */
    }
    const { asset: compiled } = await api.uploadTemplateAsset(
      token,
      templateId,
      file,
      "compiled",
    );
    previewUrl = compiled.url;
    emailHeight = height;
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
    },
    compiledHtml,
    previewUrl,
  });

  return { compiledHtml, imageCount, previewUrl, placeholders, imageSlots };
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
  await api.saveTemplateVersion(token, templateId, {
    designJson: {
      ...designJson,
      mode: "canva_html",
      width: emailWidth,
      height,
    },
    compiledHtml,
    previewUrl: asset.url,
  });
  return { previewUrl: asset.url, width: emailWidth, height };
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
  },
) {
  const { blob, fileName, width } = await fileToDesignImageBlob(file);
  const uploadFile = new File([blob], fileName, {
    type: blob.type || "image/png",
  });

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
    compiled.url,
    width,
    alt ?? "Gratitude card",
  );

  const previousSlots =
    options?.previousImageSlots ??
    parseImageSlotsFromDesignJson(options?.previousDesignJson);
  const synced = syncImageSlotsWithHtml(compiledHtml, previousSlots);
  compiledHtml = synced.html;
  const imageSlots = synced.slots;

  await api.saveTemplateVersion(token, templateId, {
    designJson: {
      ...(options?.previousDesignJson ?? {}),
      mode: "image_import",
      source: "upload",
      width,
      importedAt: new Date().toISOString(),
      imageSlots,
    },
    compiledHtml,
    previewUrl: compiled.url,
  });

  return { compiledHtml, previewUrl: compiled.url, width, imageSlots };
}
