/**
 * Schema version meta DTO（GK-03）。
 * 配套 GET /scene/schema/version 返回结构，PATCH 后 version+1 也返回此结构。
 */
export class VersionDto {
  version: number;
  updatedAt: string | null;
}
