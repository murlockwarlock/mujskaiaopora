import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('OBJECT_STORAGE_BUCKET');
    this.publicUrl = config.getOrThrow<string>('OBJECT_STORAGE_PUBLIC_URL').replace(/\/$/, '');
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('OBJECT_STORAGE_ENDPOINT'),
      region: config.getOrThrow<string>('OBJECT_STORAGE_REGION'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('OBJECT_STORAGE_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('OBJECT_STORAGE_SECRET_KEY')
      }
    });
  }

  createAvatarUploadUrl(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }),
      { expiresIn: 300 }
    );
  }

  async verifyObject(key: string, expectedContentType: string, expectedByteSize: number): Promise<boolean> {
    const object = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return object.ContentType === expectedContentType && object.ContentLength === expectedByteSize;
  }

  getPublicUrl(key: string | null): string | null {
    return key ? `${this.publicUrl}/${key}` : null;
  }
}
