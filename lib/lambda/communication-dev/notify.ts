import { AWSError, ApiGatewayManagementApi, DynamoDB } from "aws-sdk";
import { ConnctionTableManager, ConnectionRow } from "./connection-table-manager";

const endpoint = process.env.API_ENDPOINT.replace('wss://', 'https://');
const connectionTableName = process.env.CONNECTION_TABLE_NAME || '';
const ddb = new DynamoDB.DocumentClient();
const connectionTableManager = new ConnctionTableManager(connectionTableName);

async function broadcastMessage(api: ApiGatewayManagementApi, message: string, connections: ConnectionRow[], skipConnectionId: string) {
    console.log("broadcastMessage: message", message)
    const postCalls = connections.map(async ({ connectionId }) => {
        if (connectionId === skipConnectionId) {
            return;
        }
        try {
            await api.postToConnection({ ConnectionId: connectionId, Data: message }).promise();
        } catch (e) {
            const error = e as AWSError;
            if (error.statusCode === 410) {
                console.log(`Found stale connection: ${connectionId}`);
            //     await ddb.delete({ TableName: connectionTableName, Key: { connectionId } }).promise();
            } else {
                throw e;
            }
        }
    });
    await Promise.all(postCalls);
}

async function notifyMessage(api: ApiGatewayManagementApi, message: string, target: string) {
    const targetConnection = await connectionTableManager.getConnection(target);
    if (targetConnection) {
        try {
            await api.postToConnection({ ConnectionId: targetConnection, Data: message }).promise();
        } catch (e) {
            console.log("notifyMessage: error", e)
        }
    }
}

export const handler = async (event, context, callback) => {
    // load message event payload
    console.log('event:', JSON.stringify(event, null, 2));
    const message = event.message;
    const connectionId = event.connectionId;
    const target = event.target;
    const api = new ApiGatewayManagementApi({ 
        apiVersion: '2018-11-29',
        endpoint: endpoint
    });
    await notifyMessage(api, message, target);
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'OK' })
    };
}
