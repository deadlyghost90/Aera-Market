import { env } from '../config/env';
import { AppError } from '../utils/errors';

/**
 * Backblaze B2 through its S3-compatible API.
 *
 * The bucket stays private: nothing is ever served directly. Uploads use a
 * presigned PUT whose Content-Length and Content-Type are part of the
 * signature, so B2 itself rejects an oversized or retyped body even if the
 * browser lies. Downloads are short-lived presigned GETs issued only after an
 * entitlement check.
 */

let cached: {
  client: import('@aws-sdk/client-s3').S3Client;
  bucket: string;
} | null = null;

export interface B2Config {
  endpoint: string;
  region: string;
  bucket: string;
  keyId: string;
  applicationKey: string;
}

export function b2Config(): B2Config {
  const config = env();
  const missing = [
    ['B2_ENDPOINT', config.B2_ENDPOINT],
    ['B2_REGION', config.B2_REGION],
    ['B2_BUCKET_NAME', config.B2_BUCKET_NAME],
    ['B2_KEY_ID', config.B2_KEY_ID],
    ['B2_APPLICATION_KEY', config.B2_APPLICATION_KEY]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new AppError('INTERNAL', `Storage is not configured (missing ${missing.join(', ')})`);
  }

  return {
    endpoint: config.B2_ENDPOINT as string,
    region: config.B2_REGION as string,
    bucket: config.B2_BUCKET_NAME as string,
    keyId: config.B2_KEY_ID as string,
    applicationKey: config.B2_APPLICATION_KEY as string
  };
}

async function s3() {
  if (cached) return cached;

  const config = b2Config();
  const { S3Client } = await import('@aws-sdk/client-s3');

  cached = {
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.keyId,
        secretAccessKey: config.applicationKey
      }
    }),
    bucket: config.bucket
  };

  return cached;
}

export async function presignUpload(input: {
  key: string;
  contentType: string;
  sizeBytes: number;
  expiresInSeconds?: number;
}): Promise<string> {
  const { client, bucket } = await s3();
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.sizeBytes
  });

  return getSignedUrl(client, command, { expiresIn: input.expiresInSeconds ?? 600 });
}

export async function presignDownload(input: {
  key: string;
  fileName: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { client, bucket } = await s3();
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ResponseContentDisposition: `attachment; filename="${input.fileName.replace(/["\\]/g, '')}"`
  });

  return getSignedUrl(client, command, { expiresIn: input.expiresInSeconds ?? 120 });
}

export async function presignPreview(key: string, expiresInSeconds = 600): Promise<string> {
  const { client, bucket } = await s3();
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function headObject(
  key: string
): Promise<{ sizeBytes: number; contentType: string } | null> {
  const { client, bucket } = await s3();
  const { HeadObjectCommand } = await import('@aws-sdk/client-s3');

  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      sizeBytes: Number(result.ContentLength ?? 0),
      contentType: String(result.ContentType ?? 'application/octet-stream')
    };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = await s3();
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
