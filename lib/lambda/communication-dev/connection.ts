import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { AWSError, ApiGatewayManagementApi, DynamoDB, Lambda} from 'aws-sdk';
import { eventTypes } from '../util/event-types';
import { ConnctionTableManager, ConnectionRow } from './connection-table-manager';

const endpoint = process.env.API_ENDPOINT.replace('wss://', 'https://');

const connectionTableName = process.env.CONNECTION_TABLE_NAME || '';
const broadcastLambdaName = process.env.BROADCAST_LAMBDA_NAME || '';
const notifyLambdaName = process.env.NOTIFY_LAMBDA_NAME || '';
const debugBroadcastMode = process.env.DEBUG_BROADCAST_MODE === 'true';
const connectionTableManager = new ConnctionTableManager(connectionTableName);
const lambda = new Lambda();

async function broadcastMessageWithLambda(message: string, connectionId: string) {
    const params = {
        FunctionName: broadcastLambdaName,
        InvocationType: 'Event',
        Payload: JSON.stringify({
            message: message,
            connectionId: connectionId
        })
    };
    await lambda.invoke(params).promise();
}

async function notifyMessageWithLambda(message: string, target: string) {
    const params = {
        FunctionName: notifyLambdaName,
        InvocationType: 'Event',
        Payload: JSON.stringify({
            message: message,
            target: target
        })
    }
    await lambda.invoke(params).promise();
}

async function connectHandler(connectionId: string, aid: string) {
    console.log("connectHandler: connectionId", connectionId)
    const timestamp = new Date().getTime();
    await connectionTableManager.addConnection(connectionId, aid);
    const userCount = await connectionTableManager.getUserCount();
    const connectEvent = {
        eventType: eventTypes.CONNECT,
        source: aid,
        userCount: userCount,
        st: timestamp
    }
    await broadcastMessageWithLambda(JSON.stringify(connectEvent), connectionId);
    return;
}

async function disconnectHandler(connectionId: string, aid: string) {
    console.log("disconnectHandler: connectionId", connectionId)
    const timestamp = new Date().getTime();
    await connectionTableManager.removeConnection(connectionId);
    const userCount = await connectionTableManager.getUserCount();
    const disconnectEvent = {
        eventType: eventTypes.DISCONNECT,
        source: aid,
        userCount: userCount,
        st: timestamp
    }
    await broadcastMessageWithLambda(JSON.stringify(disconnectEvent), connectionId);
    return;
}

async function getUserAidList(connectionId: string) {
    console.log("getUserAidList: connectionId", connectionId)
    const connections = (await connectionTableManager.listAllConnections()).map((connection) => ({aid: connection.aid}));
    console.log("getUserAidList: connections", connections)
    return connections;
}

async function requestUserListHandler(connectionId: string, api: ApiGatewayManagementApi) {
    const timestamp = new Date().getTime();
    const aidList = await getUserAidList(connectionId);
    console.log("requestUserListHandler: aidList", JSON.stringify(aidList));
    const listEvent = {
        eventType: eventTypes.LIST,
        userCount: aidList.length,
        aidList: aidList,
        st: timestamp,
    }
    try {
        await api.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(listEvent)}).promise();
    } catch (e) {
        const error = e as AWSError;
        if (error.statusCode === 410) {
            console.log(`Found stale connection: ${connectionId}`);
            //await connectionTableManager.removeConnection(connectionId);
        } else {
            throw e;
        }
    }
    return;
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
        case '$connect': {
            const aid = (event.requestContext as any)!.authorizer?.principalId as string;
            await connectHandler(connectionId, aid);
            return { statusCode: 200, body: 'Connected.'};
        }
        case '$disconnect': {
            const aid = await connectionTableManager.getAid(connectionId);
            await disconnectHandler(connectionId, aid);
            return { statusCode: 200, body: 'Disconnected.' };
        }
        case '$default':
            const message = event.body ?? '';
            if (message === eventTypes.PING) {
                const pongEvent = {
                    eventType: eventTypes.PONG,
                    st: new Date().getTime()
                }
                await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(pongEvent)}).promise();
                return { statusCode: 200, body: 'Ponged.'};
            }
            let parsedMessage;
            try {
                parsedMessage = JSON.parse(message);
            } catch (e) {
                console.error(`Failed to parse message: ${message}`);
                await broadcastMessageWithLambda(message, connectionId);
                return { statusCode: 200, body: 'Data sent.'};
            }
            const eventType = parsedMessage.eventType;
            console.log('parsedMessage:', JSON.stringify(parsedMessage, null, 2));
            switch (eventType) {
                case eventTypes.PING: {
                    const pongEvent = {
                        eventType: eventTypes.PONG,
                        st: new Date().getTime()
                    }
                    if (parsedMessage.t !== undefined) {
                        pongEvent['t'] = parsedMessage.t;
                    }
                    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(pongEvent)}).promise();
                    return { statusCode: 200, body: 'Ponged.'};
                } 
                case eventTypes.REQUEST_LIST: {
                    await requestUserListHandler(connectionId, apigwManagementApi);
                    return { statusCode: 200, body: 'Data sent.'};
                } 
                default: 
                {
                    const st = new Date().getTime();
                    parsedMessage['st'] = st;
                    const source = await connectionTableManager.getAid(connectionId);
                    if (source !== undefined) {
                        parsedMessage['source'] = source;
                    } else {
                        console.log("source is undefined");
                    }
                    await lambda.invoke({
                        FunctionName: broadcastLambdaName,
                        InvocationType: 'Event',
                        Payload: JSON.stringify({
                            message: JSON.stringify(parsedMessage),
                            connectionId: connectionId
                        })
                    }).promise();
                    return { statusCode: 200, body: 'Data sent.'};
                }
            }
        default:
            throw new Error(`Unsupported route: "${routeKey}"`);
    }
}
