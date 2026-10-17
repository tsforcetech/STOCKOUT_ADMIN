import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { ApiError } from "@/lib/api/errors";
import { isConcurrencyConflict, withCatalogErrors } from "./errors";

interface Options<TData, TVars> {
  mutationFn: (vars: TVars) => Promise<TData>;
  invalidate?: QueryKey[] | ((data: TData, vars: TVars) => QueryKey[]);
  successMessage?: string | ((data: TData, vars: TVars) => string);
  toastOnError?: boolean;
  onSuccess?: (data: TData, vars: TVars) => void;
  /** On a 409 concurrency conflict, refetch these queries so a retry uses the latest version. */
  refetchOnConflict?: QueryKey[];
}

/** useApiMutation with catalog error codes translated into readable messages. */
export function useCatalogMutation<TData = unknown, TVars = void>({ mutationFn, refetchOnConflict, ...rest }: Options<TData, TVars>) {
  const queryClient = useQueryClient();
  return useApiMutation<TData, TVars>({
    ...rest,
    mutationFn: async (vars) => {
      try {
        return await withCatalogErrors(mutationFn(vars));
      } catch (error) {
        if (refetchOnConflict && error instanceof ApiError && isConcurrencyConflict(error)) {
          await Promise.all(refetchOnConflict.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
          throw new ApiError({
            kind: error.kind,
            status: error.status,
            code: error.code,
            body: error.body,
            requestId: error.requestId,
            message: "This record was changed by someone else. The latest version has been loaded — review it and try again.",
          });
        }
        throw error;
      }
    },
  });
}
