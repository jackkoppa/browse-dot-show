import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { AuthStore, MirroredSubscription, SupportingCastMirror, SyncState } from '@browse-dot-show/auth';
import type { Storage } from './dependencies.js';

/**
 * Storage in one DynamoDB table (on-demand; `pk` + `sk` keys, `ttl` expiry). Items:
 *
 * - `counter#<key>` / `-`: rate-limit counters (`n`), expiring with their hour or day
 * - `once#<key>` / `-`: used login links, expiring with the link
 * - `sc#<site>#email#<hash>` / `-`: Supporting Cast user ID (`userId`) for an email hash
 * - `sc#<site>#user#<id>` / `profile`: the user's current email hash; `sub#<id>`: a subscription
 * - `sc#<site>#sync` / `-`: where the sync is up to (`state`, JSON)
 *
 * DynamoDB deletes expired items lazily, so counter keys include their hour or day.
 */

export function createDynamoStorage(tableName: string, client = new DynamoDBClient({})): Storage {
  const key = (pk: string, sk = '-') => ({ pk: { S: pk }, sk: { S: sk } });

  const store: AuthStore = {
    async increment(name, expiresAt) {
      const { Attributes } = await client.send(new UpdateItemCommand({
        TableName: tableName,
        Key: key(`counter#${name}`),
        UpdateExpression: 'ADD #n :one SET #ttl = :ttl',
        ExpressionAttributeNames: { '#n': 'n', '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':one': { N: '1' }, ':ttl': { N: String(expiresAt) } },
        ReturnValues: 'UPDATED_NEW',
      }));
      return Number(Attributes?.n?.N ?? 1);
    },
    async count(name) {
      const { Item } = await client.send(new GetItemCommand({ TableName: tableName, Key: key(`counter#${name}`) }));
      return Number(Item?.n?.N ?? 0);
    },
    async claimOnce(name, expiresAt) {
      try {
        await client.send(new PutItemCommand({
          TableName: tableName,
          Item: { ...key(`once#${name}`), ttl: { N: String(expiresAt) } },
          ConditionExpression: 'attribute_not_exists(pk)',
        }));
        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return false;
        throw error;
      }
    },
  };

  function supportingCastMirror(siteId: string): SupportingCastMirror {
    const emailKey = (hash: string) => key(`sc#${siteId}#email#${hash}`);
    const userPk = (userId: string) => `sc#${siteId}#user#${userId}`;

    return {
      async getUserIdByEmailHash(emailHash) {
        const { Item } = await client.send(new GetItemCommand({ TableName: tableName, Key: emailKey(emailHash) }));
        return Item?.userId?.S ?? null;
      },

      async getSubscriptions(userId) {
        const { Items = [] } = await client.send(new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sub)',
          ExpressionAttributeValues: { ':pk': { S: userPk(userId) }, ':sub': { S: 'sub#' } },
        }));
        return Items.map(item => ({
          id: item.sk.S!.slice('sub#'.length),
          planId: item.planId?.N ? Number(item.planId.N) : null,
          status: item.status.S as MirroredSubscription['status'],
          endsAt: item.endsAt?.S ?? null,
        }));
      },

      async putUser(userId, emailHash) {
        const { Item } = await client.send(new GetItemCommand({ TableName: tableName, Key: key(userPk(userId), 'profile') }));
        const previous = Item?.emailHash?.S;
        if (previous && previous !== emailHash) {
          // Only if it's still this user's: someone else may have that email now
          await client.send(new DeleteItemCommand({
            TableName: tableName,
            Key: emailKey(previous),
            ConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': { S: userId } },
          })).catch(error => {
            if (!(error instanceof ConditionalCheckFailedException)) throw error;
          });
        }
        if (emailHash) {
          await client.send(new PutItemCommand({ TableName: tableName, Item: { ...emailKey(emailHash), userId: { S: userId } } }));
        }
        if (previous !== emailHash) {
          await client.send(new PutItemCommand({
            TableName: tableName,
            Item: { ...key(userPk(userId), 'profile'), ...(emailHash ? { emailHash: { S: emailHash } } : {}) },
          }));
        }
      },

      async putSubscription(userId, subscription) {
        await client.send(new PutItemCommand({
          TableName: tableName,
          Item: {
            ...key(userPk(userId), `sub#${subscription.id}`),
            status: { S: subscription.status },
            ...(subscription.planId !== null ? { planId: { N: String(subscription.planId) } } : {}),
            ...(subscription.endsAt ? { endsAt: { S: subscription.endsAt } } : {}),
          },
        }));
      },

      async getSyncState() {
        const { Item } = await client.send(new GetItemCommand({ TableName: tableName, Key: key(`sc#${siteId}#sync`) }));
        return Item?.state?.S ? (JSON.parse(Item.state.S) as SyncState) : {};
      },

      async putSyncState(state) {
        await client.send(new PutItemCommand({ TableName: tableName, Item: { ...key(`sc#${siteId}#sync`), state: { S: JSON.stringify(state) } } }));
      },
    };
  }

  return { store, supportingCastMirror };
}
