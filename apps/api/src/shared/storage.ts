import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

// The uploader must send the same Content-Type header, it is part of the signature.
export function presignPut(key: string): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: PROOF_CONTENT_TYPE }), {
    expiresIn: URL_TTL_SEC,
  });
}

export function presignGet(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: URL_TTL_SEC });
}
