import { APIGatewayProxyWebsocketHandlerV2, Handler } from 'aws-lambda';
import {AWSError, ApiGatewayManagementApi, DynamoDB} from 'aws-sdk';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { ConnectionRow } from '../../db/types';

const dynamoDb= new DynamoDB();
const ddb = new DynamoDB.DocumentClient();
const connectionTableName = process.env.CONNECTION_TABLE_NAME || '';
const channelTableName = process.env.CHANNEL_TABLE_NAME || '';
const endpoint = process.env.API_ENDPOINT.replace('wss://', 'https://');
const language = process.env.LANGUAGE || 'korean';
const region = process.env.REGION || 'ap-northeast-2';

const eventTypes = {
    CONNECT: 'connect',
    REQUEST_USER_LIST: 'requestUserList',
    USER_LIST: 'userList',
    DISCONNECT: 'disconnect',
    PING: 'ping',
    PONG: 'pong',
}

async function listUsers(channelName?: string) {
    let rows
    if (channelName === undefined) {
        rows = await ddb.scan({ TableName: connectionTableName }).promise();
    } else {
        rows = await ddb.query({
            TableName: connectionTableName,
            IndexName: 'channel-name-index',
            KeyConditionExpression: 'channelName = :channelName',
            ExpressionAttributeValues: {
                ':channelName': channelName
            }
        }).promise();
    }
    return rows.Items.map((row) => {
        return {aid: row.aid ?? null}
    });
}

async function buildUserListResponse(channelName?: string) {
    const usersRow = await listUsers(channelName);
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

async function broadcastMessageToChannel({api, data, ddb, channelName}: {api: ApiGatewayManagementApi, data: string, ddb: DynamoDB.DocumentClient, channelName: string}) {
    console.log(`Broadcasting message to channel ${channelName}`);
    const { Items } = await ddb.query({
        TableName: connectionTableName,
        IndexName: 'channel-name-index',
        KeyConditionExpression: 'channelName = :channelName',
        ExpressionAttributeValues: {
            ':channelName': channelName
        }
    }).promise();
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
                await ddb.delete({ TableName: connectionTableName, Key: { connectionId } }).promise();
            } else {
                throw e;
            }
        }
    });
    await Promise.all(postCalls);
}

async function getConnectionInfo({connectionId}: {connectionId: string}) : Promise<{channelName: string, aid: string}> {
    const row = await ddb.get({
        TableName: connectionTableName,
        Key: { connectionId: connectionId }
    }).promise();
    if (row.Item === undefined) {
        console.error(`Channel of connection ${connectionId} not found.`);
        return {channelName: 'default', aid: 'anonymous'};
    }
    return {channelName: row.Item.channelName, aid: row.Item.aid};
}

async function broadcastMessageToSelfChannel({api, data, ddb, connectionId}: {api: ApiGatewayManagementApi, data: string, ddb: DynamoDB.DocumentClient, connectionId: string}) {
    const {channelName} = await getConnectionInfo({connectionId});
    await broadcastMessageToChannel({api, data, ddb, channelName});
}

async function removeDuplicateConnections({aid, channelName, ddb, api}: {aid: string, channelName: string, connectionId: string, ddb: DynamoDB.DocumentClient, api: ApiGatewayManagementApi}) {
    const { Items } = await ddb.query({
        TableName: connectionTableName,
        IndexName: 'aid-index',
        KeyConditionExpression: 'aid = :aid',
        ExpressionAttributeValues: {
            ':aid': aid
        }
    }).promise();
    if (Items === undefined) {
        return;
    }
    const deleteCalls = Items.map(async ({ connectionId }) => {
        await ddb.delete({ TableName: connectionTableName, Key: { connectionId } }).promise();
        try {
            await api.deleteConnection({ ConnectionId: connectionId }).promise();
        } catch (e) {
        }
    });
    await Promise.all(deleteCalls);
}

async function connectHandler({aid, channelName, connectionId, ddb, api}: {aid: string, channelName: string, connectionId: string, ddb: DynamoDB.DocumentClient, api: ApiGatewayManagementApi}) {
    const connectEvent = {
        eventType: eventTypes.CONNECT,
        source: aid,
        t: new Date().getTime()
    }
    //await removeDuplicateConnections({aid, channelName, ddb, api, connectionId});
    const ddbPut = ddb.put({
        TableName: connectionTableName,
        Item: {
            connectionId: connectionId,
            aid: aid,
            channelName: channelName
        }
    }).promise().then (async () => {
        // console.log(`Updating user count for channel ${channelName}`);
        // const userCount = await dynamoDb.describeTable({
        //     // @ts-ignore
        //     TableName: channelTableName
        // }).promise().then((data) => {
        //     return data.Table?.ItemCount ?? 0;
        // });
        // console.log(`User count for channel ${channelName} is ${userCount}`);
        // await ddb.update({
        //     TableName: channelTableName,
        //     Key: { channelName: channelName },
        //     UpdateExpression: 'SET userCount = :userCount',
        //     ExpressionAttributeValues: {
        //         ':userCount': userCount
        //     }
        // }).promise();
    })
    const broadcast = broadcastMessageToChannel({api, data: JSON.stringify(connectEvent), ddb, channelName});
    await Promise.all([broadcast, ddbPut]);
}

async function disconnectHandler({connectionId, ddb, api}: {connectionId: string, ddb: DynamoDB.DocumentClient, api: ApiGatewayManagementApi}) {
    const {channelName, aid} = await getConnectionInfo({connectionId});
    const disconnectEvent = {
        eventType: eventTypes.DISCONNECT,
        source: aid,
        t: new Date().getTime()
    }
    const ddbDelete = ddb.delete({
        TableName: connectionTableName,
        Key: { connectionId: connectionId }
    }).promise().then(async () => {
        // console.log(`Updating user count for channel ${channelName}`);
        // const userCount = await dynamoDb.describeTable({
        //     // @ts-ignore
        //     TableName: channelTableName
        // }).promise().then((data) => {
        //     return data.Table?.ItemCount ?? 0;
        // });
        // console.log(`User count for channel ${channelName} is ${userCount}`);
        // await ddb.update({
        //     TableName: channelTableName,
        //     Key: { channelName: channelName },
        //     UpdateExpression: 'SET userCount = :userCount',
        //     ExpressionAttributeValues: {
        //         ':userCount': userCount
        //     }
        // }).promise();
    });
    const broadcast = broadcastMessageToChannel({api, data: JSON.stringify(disconnectEvent), ddb, channelName});
    await Promise.all([broadcast, ddbDelete]);
}

async function requestUserListHandler({connectionId, ddb, api}: {connectionId: string, ddb: DynamoDB.DocumentClient, api: ApiGatewayManagementApi}) {
    const {channelName} = await getConnectionInfo({connectionId});
    const channelInfo = await ddb.get({
        TableName: channelTableName,
        Key: { channelName: channelName }
    }).promise();
    if (channelInfo.Item === undefined) {
        return;
    }
    const userList = await buildUserListResponse(channelName);
    await api.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(userList)}).promise();
}


export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event, context, callback) => {
    const routeKey = event.requestContext.routeKey;
    const apigwManagementApi = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: endpoint
    });
    const connectionId = event.requestContext.connectionId;
    console.log('event:', JSON.stringify(event, null, 2));
    switch (routeKey) {
        case '$connect':
            const aid = (event.requestContext as any)!.authorizer?.principalId as string;
            const connectionChannel = event['queryStringParameters']?.channel ?? 'default';
            await connectHandler({aid, channelName: connectionChannel, connectionId, ddb, api: apigwManagementApi});
            return { statusCode: 200, body: 'Connected.'};
        case '$disconnect':
            await disconnectHandler({connectionId, ddb, api: apigwManagementApi});
            return { statusCode: 200, body: 'Disconnected.' };
        case '$default':
            const message = event.body ?? '';
            let parsedMessage;
            try {
                parsedMessage = JSON.parse(message);
            } catch (e) {
                console.error(`Failed to parse message: ${message}`);
                await broadcastMessageToSelfChannel({api: apigwManagementApi, data: event.body ?? '', ddb, connectionId});
                return { statusCode: 200, body: 'Data sent.'};
            }
            const eventType = parsedMessage.eventType;
            switch (eventType) {
                case eventTypes.PING:
                    const pongEvent = {
                        eventType: eventTypes.PONG,
                        st: new Date().getTime()
                    }
                    if (parsedMessage.t !== undefined) {
                        pongEvent['t'] = parsedMessage.t;
                    }
                    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(pongEvent)}).promise();
                    return { statusCode: 200, body: 'Ponged.'};
                case eventTypes.REQUEST_USER_LIST:
                    await requestUserListHandler({connectionId, ddb, api: apigwManagementApi});
                    return { statusCode: 200, body: 'Data sent.'};
                default:
                    await broadcastMessageToSelfChannel({api: apigwManagementApi, data: event.body ?? '', ddb, connectionId});
                    return { statusCode: 200, body: 'Data sent.'};
            }
        default:
            throw new Error(`Unsupported route: "${routeKey}"`);
    }
}
