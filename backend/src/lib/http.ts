import type { FastifyReply, FastifyRequest } from "fastify";

export type ErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  const payload: ErrorPayload = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return reply.status(status).send(payload);
}

export function logAndSendInternalError(
  req: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
  code = "INTERNAL_ERROR",
  message = "Internal server error"
) {
  req.log.error({ err }, message);
  return sendError(reply, 500, code, message);
}
