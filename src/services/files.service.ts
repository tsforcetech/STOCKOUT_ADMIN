import { http } from "@/lib/api/client";
import { ApiError, defaultMessageFor } from "@/lib/api/errors";
import { unwrapData } from "@/lib/api/envelope";
import type {
  CreateUploadEnvelope,
  CreateUploadResponse,
  DownloadUrlEnvelope,
  DownloadUrlResponse,
  FileAssetEnvelope,
  FileAssetResponse,
  FilePurpose,
} from "@/api/types/files";

/**
 * inventory-media /api/v1/files. Success: { data }, errors: { errorCode, message }.
 * Upload flow: request presigned URL → PUT bytes directly to S3 → complete → use fileId in the
 * domain API. Files are owner-scoped: an admin can only read files they uploaded.
 * Contract: docs/contracts/files-notifications-search.md §A
 */

/** Per-purpose limits from the inventory-media service (docs/frontend/STAGE_4E_FILE_MEDIA_FRONTEND_INTEGRATION_v1.0.md). */
export const FILE_LIMITS: Record<FilePurpose, { maxBytes: number; accept: string }> = {
  USER_PROFILE_PHOTO: { maxBytes: 5 * 1024 * 1024, accept: "image/jpeg,image/png,image/webp" },
  SELLER_PROFILE_LOGO: { maxBytes: 5 * 1024 * 1024, accept: "image/jpeg,image/png,image/webp" },
  LISTING_IMAGE: { maxBytes: 10 * 1024 * 1024, accept: "image/jpeg,image/png,image/webp" },
  SELLER_DOCUMENT: { maxBytes: 20 * 1024 * 1024, accept: "application/pdf,image/jpeg,image/png" },
  LISTING_DOCUMENT: { maxBytes: 20 * 1024 * 1024, accept: "application/pdf,image/jpeg,image/png" },
  INSPECTION_EVIDENCE: { maxBytes: 20 * 1024 * 1024, accept: "application/pdf,image/jpeg,image/png,image/webp" },
  CHAT_ATTACHMENT: { maxBytes: 20 * 1024 * 1024, accept: "*/*" },
  RETURN_EVIDENCE: { maxBytes: 20 * 1024 * 1024, accept: "application/pdf,image/jpeg,image/png" },
  INVOICE_DOCUMENT: { maxBytes: 20 * 1024 * 1024, accept: "application/pdf" },
  GENERAL_ATTACHMENT: { maxBytes: 20 * 1024 * 1024, accept: "*/*" },
};

/** PUT to the presigned S3 URL with progress. No Authorization header is sent to S3. */
function putToStorage(upload: CreateUploadResponse, file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!upload.uploadUrl) {
      reject(new ApiError({ kind: "server", status: 0, message: "The server did not return an upload URL." }));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(upload.httpMethod ?? "PUT", upload.uploadUrl);
    for (const [name, value] of Object.entries(upload.requiredHeaders ?? {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError({ kind: "http", status: xhr.status, message: "The file could not be stored. Please try again." }));
    xhr.onerror = () => reject(new ApiError({ kind: "network", status: 0, message: defaultMessageFor("network") }));
    xhr.onabort = () => reject(new ApiError({ kind: "aborted", status: 0, message: defaultMessageFor("aborted") }));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export const filesService = {
  requestUpload: async (file: File, purpose: FilePurpose) =>
    unwrapData<CreateUploadResponse>(
      await http.post<CreateUploadEnvelope>("/api/v1/files/upload-requests", {
        originalFileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        purpose,
      }),
    ),

  complete: async (fileId: string) => unwrapData<FileAssetResponse>(await http.post<FileAssetEnvelope>(`/api/v1/files/${encodeURIComponent(fileId)}/complete`)),

  get: async (fileId: string, signal?: AbortSignal) => unwrapData<FileAssetResponse>(await http.get<FileAssetEnvelope>(`/api/v1/files/${encodeURIComponent(fileId)}`, { signal })),

  downloadUrl: async (fileId: string) => unwrapData<DownloadUrlResponse>(await http.post<DownloadUrlEnvelope>(`/api/v1/files/${encodeURIComponent(fileId)}/download-url`)),

  delete: (fileId: string) => http.delete<unknown>(`/api/v1/files/${encodeURIComponent(fileId)}`),

  /** Validates locally, then runs the full request → S3 PUT → complete flow. Returns the AVAILABLE asset. */
  async upload(file: File, purpose: FilePurpose, options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<FileAssetResponse> {
    const limit = FILE_LIMITS[purpose];
    if (file.size > limit.maxBytes) {
      throw new ApiError({ kind: "validation", status: 413, code: "FILE_SIZE_EXCEEDED", message: `The file is larger than ${Math.round(limit.maxBytes / 1024 / 1024)} MB.` });
    }
    const upload = await filesService.requestUpload(file, purpose);
    await putToStorage(upload, file, options.onProgress, options.signal);
    return filesService.complete(upload.fileId);
  },
};
