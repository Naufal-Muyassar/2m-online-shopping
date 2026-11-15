import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../shared/errors";
import { asyncHandler, validate } from "../../shared/http";
import { catalogKeyFromFile, getObject } from "../../shared/storage";

// Public: catalogue photos for product cards and pages. Each upload gets a fresh key, so a file never changes.
export const catalogImageRoutes = Router();

const fileParams = z.object({
  file: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/),
});

catalogImageRoutes.get(
  "/:file",
  validate(fileParams, "params"),
  asyncHandler(async (req, res) => {
    const object = await getObject(catalogKeyFromFile(req.params.file as string));
    if (!object) throw new AppError(404, "IMAGE_NOT_FOUND", "Image not found");
    res.setHeader("Content-Type", object.contentType);
    if (object.contentLength !== undefined) res.setHeader("Content-Length", String(object.contentLength));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    object.body.on("error", () => res.destroy());
    object.body.pipe(res);
  }),
);
