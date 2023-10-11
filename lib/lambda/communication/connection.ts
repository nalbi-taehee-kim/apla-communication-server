import { APIGatewayProxyWebsocketHandlerV2, Handler } from 'aws-lambda';
import {AWSError, ApiGatewayManagementApi, DynamoDB} from 'aws-sdk';

const ddb = new DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME || '';
const endpoint = process.env.API_ENDPOINT.replace('wss://', 'https://');
const language = process.env.LANGUAGE || 'korean';

const eventTypes = {
    CONNECT: 'connect',
    REQUEST_USER_LIST: 'requestUserList',
    USER_LIST: 'userList',
    DISCONNECT: 'disconnect',
}

async function listUsers() {
    const rows = await ddb.scan({ TableName: tableName }).promise();
    return rows.Items.map((row) => {
        return {aid: row.aid ?? null}
    });
}

async function buildUserListEvent(channelName: string) {
    const usersRow = await listUsers();
    const st = new Date().getTime();
    return {
        eventType: eventTypes.USER_LIST,
        data: {
            "channelName": channelName,
            "userCount": usersRow.length,
            "language": language,
            "users": usersRow
        },
        st
    }
}

function buildConnectEvent(source: string) {
    return {
        eventType: eventTypes.CONNECT,
        source,
        t: new Date().getTime()
    }
}

async function broadcastMessage({api, data, ddb, connectionId}: {api: ApiGatewayManagementApi, data: string, ddb: DynamoDB.DocumentClient, connectionId: string}) {
    const { Items } = await ddb.scan({ TableName: tableName }).promise();
    if (Items === undefined) {
        return;
    }
    const postCalls = Items.map(async ({ connectionId }) => {
        try {
            await api.postToConnection({ ConnectionId: connectionId, Data: data }).promise();
        } catch (e) {
            const error = e as AWSError;
            if (error.statusCode === 410) {
                console.log(`Found stale connection, deleting ${connectionId}`);
                await ddb.delete({ TableName: tableName, Key: { connectionId } }).promise();
            } else {
                throw e;
            }
        }
    });
    await Promise.all(postCalls);
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event, context, callback) => {
    const routeKey = event.requestContext.routeKey;
    const apigwManagementApi = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: endpoint
    });
    const connectionId = event.requestContext.connectionId;
    switch (routeKey) {
        case '$connect':
            const aid = (event.requestContext as any)!.authorizer?.principalId as string;
            const connectEvent = buildConnectEvent(aid);
            const broadcast = broadcastMessage({api: apigwManagementApi, data: JSON.stringify(connectEvent), ddb, connectionId});
            const ddbPut = ddb.put({
                TableName: tableName,
                Item: {
                    connectionId: event.requestContext.connectionId,
                    aid: aid
                }
            }).promise();
            await Promise.all([broadcast, ddbPut]);
            return { statusCode: 200, body: 'Connected.'};
        case '$disconnect':
            await ddb.delete({
                TableName: tableName,
                Key: { connectionId: connectionId }
            }).promise();
            const data = JSON.stringify({ eventType: eventTypes.DISCONNECT, source: connectionId, st: new Date().getTime() });
            await broadcastMessage({api: apigwManagementApi, data, ddb, connectionId});
            return { statusCode: 200, body: 'Disconnected.' };
        case '$default':
            const postData = event.body;
            try {
                const parsed = JSON.parse(postData);
                const { eventType } = parsed;
                if (eventType === eventTypes.REQUEST_USER_LIST) {
                    const channelName = `${language}-1`;
                    const userList = await buildUserListEvent(channelName);
                    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(userList)}).promise();
                    return { statusCode: 200, body: 'Data sent.'};
                }
            } catch (e) {   
                console.log('Error parsing JSON', e);
            }
            await broadcastMessage({api: apigwManagementApi, data: postData, ddb, connectionId});
            return { statusCode: 200, body: 'Data sent.'};
        default:
            throw new Error(`Unsupported route: "${routeKey}"`);
        }
}
