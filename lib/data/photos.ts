import type { Photo } from "@/lib/types";

/**
 * Licensed photographs matched to house recipes. Each entry records the photographer, licence
 * and source page. A recipe without an entry shows a designed placeholder, labelled as such.
 * Only add a photo here after checking that it actually shows the dish.
 */
export const PHOTOS: Record<string, Photo> = {};
