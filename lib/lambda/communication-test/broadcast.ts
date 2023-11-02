import { AWSError, ApiGatewayManagementApi, DynamoDB } from "aws-sdk";
import { ConnctionTableManager, ConnectionRow } from "./connection-table-manager";

const endpoint = process.env.API_ENDPOINT.replace('wss://', 'https://');
const connectionTableName = process.env.CONNECTION_TABLE_NAME || '';
const ddb = new DynamoDB.DocumentClient();
const connectionTableManager = new ConnctionTableManager(connectionTableName);

async function broadcastMessage(api: ApiGatewayManagementApi, message: string, connections: ConnectionRow[], skipConnectionId: string) {
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
                await ddb.delete({ TableName: connectionTableName, Key: { connectionId } }).promise();
            } else {
                throw e;
            }
        }
    });
    await Promise.all(postCalls);
}

export const handler = async (event, context, callback) => {
    // load message event payload
    const message = event.message;
    const connectionId = event.connectionId;
    const api = new ApiGatewayManagementApi({ 
        apiVersion: '2018-11-29',
        endpoint: endpoint
    });
    const connections = await connectionTableManager.listAllConnections();
    await broadcastMessage(api, message, connections, connectionId);
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'OK' })
    };
}
