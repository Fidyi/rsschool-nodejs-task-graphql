import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { parse, validate, execute, specifiedRules } from 'graphql';
import { schema } from './schema.js';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import depthLimit from 'graphql-depth-limit';
import DataLoader from 'dataloader';

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
        const loaders = {
          userById: new DataLoader(async (ids: readonly string[]) => {
            const users = await fastify.prisma.user.findMany({
              where: {
                id: {
                  in: ids as string[],
                },
              },
            });
            const userMap = new Map(users.map((user) => [user.id, user]));
            return ids.map((id) => userMap.get(id));
          }),
          profileByUserId: new DataLoader(async (userIds: readonly string[]) => {
            const profiles = await fastify.prisma.profile.findMany({
              where: {
                userId: {
                  in: userIds as string[],
                },
              },
            });
            const profileMap = new Map(
              profiles.map((profile) => [profile.userId, profile])
            );
            return userIds.map((userId) => profileMap.get(userId));
          }),
          postsByAuthorId: new DataLoader(async (authorIds: readonly string[]) => {
            const posts = await fastify.prisma.post.findMany({
              where: {
                authorId: {
                  in: authorIds as string[],
                },
              },
            });
            const postsMap = new Map<string, any[]>();
            posts.forEach((post) => {
              if (!postsMap.has(post.authorId)) {
                postsMap.set(post.authorId, []);
              }
              postsMap.get(post.authorId)!.push(post);
            });
            return authorIds.map((authorId) => postsMap.get(authorId) || []);
          }),
          subscribersByAuthorId: new DataLoader(
            async (authorIds: readonly string[]) => {
              const subscriptions =
                await fastify.prisma.subscribersOnAuthors.findMany({
                  where: {
                    authorId: {
                      in: authorIds as string[],
                    },
                  },
                  include: { subscriber: true },
                });
              const subscribersMap = new Map<string, any[]>();
              subscriptions.forEach((subscription) => {
                const authorId = subscription.authorId;
                if (!subscribersMap.has(authorId)) {
                  subscribersMap.set(authorId, []);
                }
                subscribersMap.get(authorId)!.push(subscription.subscriber);
              });
              return authorIds.map(
                (authorId) => subscribersMap.get(authorId) || []
              );
            }
          ),
          authorsBySubscriberId: new DataLoader(
            async (subscriberIds: readonly string[]) => {
              const subscriptions =
                await fastify.prisma.subscribersOnAuthors.findMany({
                  where: {
                    subscriberId: {
                      in: subscriberIds as string[],
                    },
                  },
                  include: { author: true },
                });
              const authorsMap = new Map<string, any[]>();
              subscriptions.forEach((subscription) => {
                const subscriberId = subscription.subscriberId;
                if (!authorsMap.has(subscriberId)) {
                  authorsMap.set(subscriberId, []);
                }
                authorsMap.get(subscriberId)!.push(subscription.author);
              });
              return subscriberIds.map(
                (subscriberId) => authorsMap.get(subscriberId) || []
              );
            }
          ),
          memberTypeById: new DataLoader(async (ids: readonly string[]) => {
            const memberTypes = await fastify.prisma.memberType.findMany({
              where: {
                id: {
                  in: ids as string[],
                },
              },
            });
            const memberTypeMap = new Map(
              memberTypes.map((memberType) => [memberType.id, memberType])
            );
            return ids.map((id) => memberTypeMap.get(id));
          }),
        };

        const result = await execute({
          schema,
          document: documentAST,
          variableValues: variables,
          contextValue: { prisma: fastify.prisma, loaders },
        });

        return result;
      } catch (error) {
        return { errors: [error] };
      }
    },
  });
};

export default plugin;
