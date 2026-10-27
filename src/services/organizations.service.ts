import { http } from "@/lib/api/client";
import { expectArray, unwrapData, type Envelope } from "@/lib/api/envelope";
import type {
  AdminRejectBusinessChangeRequest,
  AdminReviewBusinessChangeRequest,
  BusinessChangePage,
  BusinessChangeQueueQuery,
  BusinessChangeRequestResponse,
  CalendarConfigurationDto,
  ConfirmPublicHolidayRequest,
  PublicHolidayDto,
  UpdateCalendarConfigRequest,
} from "@/api/types/organizations";

/** PA-1B.2 admin APIs (user-organization, enveloped). Permission failures are 403 { Error: "FORBIDDEN" }. */
const BC = "/api/v1/admin/organizations/business-changes";
const CAL = "/api/v1/admin/calendar";

export const organizationsService = {
  businessChanges: async (q: BusinessChangeQueueQuery, signal?: AbortSignal): Promise<BusinessChangePage> => {
    const params = new URLSearchParams();
    if (q.status) params.set("status", q.status);
    if (q.changeCategory) params.set("changeCategory", q.changeCategory);
    if (q.overdueOnly) params.set("overdueOnly", "true");
    params.set("pageNumber", String(q.pageNumber ?? 1));
    params.set("pageSize", String(q.pageSize ?? 50));
    const data = unwrapData<BusinessChangePage | BusinessChangeRequestResponse[]>(await http.get<Envelope<BusinessChangePage>>(`${BC}?${params}`, { signal }));
    // The guide documents a bare array; the live API pages. Accept both.
    if (Array.isArray(data)) return { items: data, totalCount: data.length, pageNumber: 1, pageSize: data.length };
    return { ...data, items: expectArray<BusinessChangeRequestResponse>(data?.items) };
  },
  approveBusinessChange: async (id: string, body: AdminReviewBusinessChangeRequest) =>
    unwrapData<BusinessChangeRequestResponse>(await http.post<Envelope<BusinessChangeRequestResponse>>(`${BC}/${encodeURIComponent(id)}/approve`, body)),
  rejectBusinessChange: async (id: string, body: AdminRejectBusinessChangeRequest) =>
    unwrapData<BusinessChangeRequestResponse>(await http.post<Envelope<BusinessChangeRequestResponse>>(`${BC}/${encodeURIComponent(id)}/reject`, body)),

  calendarConfig: async (signal?: AbortSignal) => unwrapData<CalendarConfigurationDto>(await http.get<Envelope<CalendarConfigurationDto>>(`${CAL}/configuration`, { signal })),
  updateCalendarConfig: async (body: UpdateCalendarConfigRequest) =>
    unwrapData<CalendarConfigurationDto>(await http.put<Envelope<CalendarConfigurationDto>>(`${CAL}/configuration`, body)),
  holidays: async (year: number, signal?: AbortSignal) =>
    expectArray<PublicHolidayDto>(unwrapData(await http.get<Envelope<PublicHolidayDto[]>>(`${CAL}/holidays?year=${year}`, { signal }))),
  confirmHoliday: async (id: string, body: ConfirmPublicHolidayRequest) =>
    unwrapData<PublicHolidayDto>(await http.post<Envelope<PublicHolidayDto>>(`${CAL}/holidays/${encodeURIComponent(id)}/confirm`, body)),
};
