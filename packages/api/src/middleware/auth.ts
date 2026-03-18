import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

// Augment Fastify types for JWT payload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sellerId: string; email?: string; type?: string };
    user: { sellerId: string; email?: string; type?: string };
  }
}
