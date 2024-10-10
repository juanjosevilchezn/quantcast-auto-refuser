import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import fetch from 'node-fetch';
import { parseNewFix } from 'services/compatibility';
import environment from 'services/environment';

export default (server: FastifyInstance, _options: RouteShorthandOptions, done: () => void) => {
  server.get('/data/', async (_request, reply) => {
    try {
      const url = `${environment.github.files}/database.json`;
      const result = await (await fetch(url)).json();

      reply.send({
        data: {
          ...result,
          fixes: result.fixes.map(parseNewFix),
        },
        success: true,
      });
    } catch (error) {
      reply.send({
        errors: [error.message],
        success: false,
      });
    }
  });

  done();
};
