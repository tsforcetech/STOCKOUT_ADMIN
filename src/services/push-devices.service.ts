import { http } from "@/lib/api/client";
import { unwrapData, type Envelope } from "@/lib/api/envelope";
import type { PushDeviceDto, RegisterPushDeviceRequest, RegisterPushDeviceResultDto, RevokePushDevicesResultDto } from "@/api/types/notifications";

const BASE = "/api/v1/notifications/devices";

/**
 * Browser push enrollment for the signed-in user (identity comes from the token only). The FCM token is sent here and
 * nowhere else; it is never logged and GET /devices never returns it.
 */
export const pushDevicesService = {
  register: async (body: RegisterPushDeviceRequest) => unwrapData<RegisterPushDeviceResultDto>(await http.post<Envelope<RegisterPushDeviceResultDto>>(BASE, body)),
  list: async (signal?: AbortSignal) => unwrapData<PushDeviceDto[]>(await http.get<Envelope<PushDeviceDto[]>>(BASE, { signal })),
  revoke: async (deviceId: string) => unwrapData<RevokePushDevicesResultDto>(await http.delete<Envelope<RevokePushDevicesResultDto>>(`${BASE}/${encodeURIComponent(deviceId)}`)),
  /** Call BEFORE sign-out / account switch, while the access token is still valid. */
  revokeInstallation: async (installationId: string) =>
    unwrapData<RevokePushDevicesResultDto>(await http.delete<Envelope<RevokePushDevicesResultDto>>(`${BASE}/installations/${encodeURIComponent(installationId)}`)),
};
