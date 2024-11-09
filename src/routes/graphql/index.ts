import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { parse, validate, execute, specifiedRules, GraphQLError } from 'graphql';
import { schema } from './schema.js';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import depthLimit from 'graphql-depth-limit';


const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      ...createGqlResponseSchema,
      response: {
        200: gqlResponseSchema,
      },
    },
    async handler(req) {
      const { query, variables } = req.body;

      try {
        const documentAST = parse(query);
        const errors = validate(schema, documentAST, [
          ...specifiedRules,
          depthLimit(5),
        ]);

        if (errors.length > 0) {
          return { errors };
        }
        const result = await execute({
          schema,
          document: documentAST,
          variableValues: variables,
          contextValue: { prisma: fastify.prisma },
        });

        return result;
      } catch (error) {
        return { errors: [error] };
      }
    },
  });
};

export default plugin;
