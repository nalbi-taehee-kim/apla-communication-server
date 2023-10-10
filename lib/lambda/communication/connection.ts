import { Handler } from 'aws-lambda';
import {AWSError, ApiGatewayManagementApi, DynamoDB} from 'aws-sdk';

const ddb = new DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME || '';
const websocketEndpoint = process.env.WEBSOCKET_ENDPOINT;

interface ConnectionTableRow {
    aid: string;
}

async function listUsers() {
    const rows = await ddb.scan({ TableName: tableName }).promise();
    return rows.Items.map((row) => {
        return {aid: row.aid}
    });
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

export const handler:Handler = async (event) => {
    const routeKey = event.requestContext.routeKey;
    const endpoint = event.requestContext.domainName + '/' + event.requestContext.stag
    const apigwManagementApi = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: endpoint
    });
    switch (routeKey) {
        case '$connect':
            await ddb.put({
                TableName: tableName,
                Item: {
                connectionId: event.requestContext.connectionId,
                aid: event.requestContext.connectionId
            }
            }).promise();
            await apigwManagementApi.postToConnection({ ConnectionId: event.requestContext.connectionId, Data: JSON.stringify(listUsers())}).promise();
            return { statusCode: 200, body: 'Connected.' };
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
                if (eventType === 'request-user-list') {
                    await apigwManagementApi.postToConnection({ ConnectionId: event.requestContext.connectionId, Data: JSON.stringify(listUsers())}).promise();
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
