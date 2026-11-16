import { randomUUID } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
});

const URL_TTL_SEC = 300;
const PROOF_CONTENT_TYPE = "image/jpeg";

export const proofKeyFor = (orderId: string): string => `proofs/${orderId}/${randomUUID()}.jpg`;

export const isProofKeyFor = (orderId: string, key: string): boolean =>
  new RegExp(`^proofs/${orderId}/[0-9a-f-]{36}\\.jpg$`).test(key);

// Refund transfer receipts: one fresh key per upload under the refund, checked again when the refund is completed.
export const refundProofKeyFor = (refundId: string): string => `refunds/${refundId}/${randomUUID()}.jpg`;
export const isRefundProofKeyFor = (refundId: string, key: string): boolean =>
  new RegExp(`^refunds/${refundId}/[0-9a-f-]{36}\\.jpg$`).test(key);

// Catalogue photos: one fresh key per upload, so a served image never changes and can be cached for good.
const CATALOG_PREFIX = "catalog/";
const CATALOG_URL_PREFIX = "/api/v1/catalog-images/";
export const catalogImageKey = (): string => `${CATALOG_PREFIX}${randomUUID()}.jpg`;
export const catalogImageUrl = (key: string): string => CATALOG_URL_PREFIX + key.slice(CATALOG_PREFIX.length);
export const catalogKeyFromFile = (file: string): string => CATALOG_PREFIX + file;
// The first image of products.images (the cover) as a served URL, or NULL.
export const coverUrlSql = (alias: string): string =>
  `CASE WHEN cardinality(${alias}.images) > 0 THEN '${CATALOG_URL_PREFIX}' || substr(${alias}.images[1], ${CATALOG_PREFIX.length + 1}) END`;
// Every image of products.images as served URLs, in order.
export const imageUrlsSql = (alias: string): string =>
  `ARRAY(SELECT '${CATALOG_URL_PREFIX}' || substr(k, ${CATALOG_PREFIX.length + 1}) FROM unnest(${alias}.images) WITH ORDINALITY AS i(k, n) ORDER BY n)`;

// The uploader must send the same Content-Type header, it is part of the signature. Proofs and catalogue photos are both JPEG.
export function presignPut(key: string): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: PROOF_CONTENT_TYPE }), {
    expiresIn: URL_TTL_SEC,
  });
}

export interface StoredObject {
  body: NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
}

// Null when the object does not exist.
export async function getObject(key: string): Promise<StoredObject | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!res.Body) return null;
    return {
      body: res.Body as NodeJS.ReadableStream,
      contentType: res.ContentType ?? PROOF_CONTENT_TYPE,
      contentLength: res.ContentLength,
    };
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw err;
  }
}

export function presignGet(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: URL_TTL_SEC });
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return true;
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}
