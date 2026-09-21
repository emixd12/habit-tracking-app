export type AdvisorDayContextRejection = {
  status: 401 | 403;
  code: "unauthenticated" | "access_denied";
};

export function rejectUnavailableAdvisorDayContextRequest(
  authorization: string | null,
): AdvisorDayContextRejection {
  if (!authorization) {
    return { status: 401, code: "unauthenticated" };
  }

  if (/^Bearer\s+\S+$/i.test(authorization)) {
    return { status: 403, code: "access_denied" };
  }

  return { status: 401, code: "unauthenticated" };
}
