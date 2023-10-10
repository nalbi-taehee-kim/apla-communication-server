import { APIGatewayProxyWebsocketHandlerV2, Handler } from 'aws-lambda';
import {AWSError, ApiGatewayManagementApi, DynamoDB} from 'aws-sdk';

const ddb = new DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME || '';
const websocketEndpoint = process.env.WEBSOCKET_ENDPOINT;

interface ConnectionTableRow {
    aid: string;
}

const eventTypes = {
    REQUEST_USER_LIST: 'requestUserList',
    USER_LIST: 'userList',
}

async function listUsers() {
    const rows = await ddb.scan({ TableName: tableName }).promise();
    return rows.Items.map((row) => {
        return {aid: row.aid ?? null}
    });
}

async function buildUserListEvent() {
    const usersRow = await listUsers();
    return {
        eventType: eventTypes.USER_LIST,
        data: {
            "channelName": "korean-1",
            "userCount": usersRow.length,
            "language": "ko",
            "users": usersRow
        }
    }
}

function buildConnectEvent(source: string, connectionId: string) {
    return {
        eventType: 'connect',
        source,
        timestamp: new Date().getTime()
    }
}

async function broadcastExceptSelf(api: ApiGatewayManagementApi, data: string, ddb: DynamoDB.DocumentClient, connectionId: string) {
    const { Items } = await ddb.scan({ TableName: tableName }).promise();
    if (Items === undefined) {
        return;
    }
    const postCalls = Items.map(async ({ connectionId: targetConnectionId }) => {
        if (targetConnectionId === connectionId) {
            return;
        }
        try {
            await api.postToConnection({ ConnectionId: targetConnectionId, Data: data }).promise();
        } catch (e) {
            const error = e as AWSError;
            if (error.statusCode === 410) {
                console.log(`Found stale connection, deleting ${targetConnectionId}`);
                await ddb.delete({ TableName: tableName, Key: { connectionId: targetConnectionId } }).promise();
            } else {
                throw e;
            }
        }
    });
    await Promise.all(postCalls);
}

async function broadcastMessage(api: ApiGatewayManagementApi, data: string, ddb: DynamoDB.DocumentClient) {
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
    const endpoint = event.requestContext.domainName + '/' + event.requestContext.stage;
    const apigwManagementApi = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: endpoint
    });
    switch (routeKey) {
        case '$connect':
            const aid = (event.requestContext as any)!.authorizer?.principalId as string;
            const connectEvent = buildConnectEvent(aid, event.requestContext.connectionId);
            const broadcast = broadcastExceptSelf(apigwManagementApi, JSON.stringify(connectEvent), ddb, event.requestContext.connectionId);
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
                Key: { connectionId: event.requestContext.connectionId }
            }).promise();
            return { statusCode: 200, body: 'Disconnected.' };
        case '$default':
            const postData = event.body;
            try {
                const parsed = JSON.parse(postData);
                const { eventType } = parsed;
                if (eventType === eventTypes.REQUEST_USER_LIST) {
                    const userList = await buildUserListEvent();
                    await apigwManagementApi.postToConnection({ ConnectionId: event.requestContext.connectionId, Data: JSON.stringify(userList)}).promise();
                    return { statusCode: 200, body: 'Data sent.'};
                }
            } catch (e) {   
                console.log('Error parsing JSON', e);
            }
            await broadcastMessage(apigwManagementApi, postData, ddb);
            return { statusCode: 200, body: 'Data sent.'};
        default:
            throw new Error(`Unsupported route: "${routeKey}"`);
        }
}
