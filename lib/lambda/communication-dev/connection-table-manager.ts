import { DynamoDB } from "aws-sdk";

export interface ConnectionRow {
    aid: string; // partition key
    connectionId: string;
}

export class ConnctionTableManager {
    ddb: DynamoDB.DocumentClient;
    connectionTableName: string;
    constructor(ddb: DynamoDB.DocumentClient, connectionTableName: string) {
        this.ddb = ddb;
        this.connectionTableName = connectionTableName;
    }

    async getAid(connectionId: string): Promise<string | undefined> {
        console.log("connectionTableManager.getAid: connectionId", connectionId)
        // query by connectionId
        const params = {
            TableName: this.connectionTableName,
            IndexName: 'connction-id-index',
            KeyConditionExpression: 'connectionId = :connectionId',
            ExpressionAttributeValues: {
                ':connectionId': connectionId
            }
        };
        const result = await this.ddb.query(params).promise();
        if (result.Items === undefined || result.Items.length === 0) {
            console.log("connectionTableManager.getAid: no item found")
            return undefined;
        }
        console.log("connectionTableManager.getAid: result.Items[0].aid", result.Items[0].aid)
        return result.Items[0].aid;
    }

    async addConnection(connectionId: string, aid: string): Promise<void> {
        console.log("connectionTableManager.addConnection: connectionId", connectionId)
        const params = {
            TableName: this.connectionTableName,
            Item: {
                aid: aid,
                connectionId: connectionId,
            }
        } as DynamoDB.DocumentClient.PutItemInput;
        await this.ddb.put(params).promise();
        return;
    }

    async removeConnection(connectionId: string) {
        console.log("connectionTableManager.removeConnection: connectionId", connectionId)
        const row = await this.getAid(connectionId);
        console.log("removeConnection: row", row)
        if (row === undefined) {
            return;
        }
        const params = {
            TableName: this.connectionTableName,
            Key: {
                aid: row,
            }
        };
        await this.ddb.delete(params).promise();
        return;
    }

    // list except self
    async listAllConnections(): Promise<ConnectionRow[]> {
        console.log("connectionTableManager.listAllConnections")
        // scan all connections
        const params = {
            TableName: this.connectionTableName
        };
        const result = await this.ddb.scan(params).promise();
        console.log("result.Items", result.Items);
        if (result.Items === undefined) { 
            return [];
        }
        return result.Items as ConnectionRow[];
    }
}
