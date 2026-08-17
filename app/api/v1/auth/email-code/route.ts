import { apiError } from "@/src/server/http";
import { requestEmailCodeRequest } from "@/src/server/request";
import { requestEmailCode } from "@/src/services/auth";

export async function POST(request: Request) {
  try {
    const input = requestEmailCodeRequest.parse(await request.json());
    const devCode = await requestEmailCode(input.email, input.purpose);
    return Response.json({ accepted: true, expires_in: 600, ...(devCode ? { dev_code: devCode } : {}) });
  } catch (error) { return apiError(error); }
}
