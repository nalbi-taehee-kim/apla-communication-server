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
            return undefined;
        }
        return result.Items[0].aid;
    }

    async addConnection(connectionId: string, aid: string): Promise<void> {
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
        const row = await this.getAid(connectionId);
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
        // scan all connections
        const params = {
            TableName: this.connectionTableName
        };
        const result = await this.ddb.scan(params).promise();
        if (result.Items === undefined) { 
            return [];
        }
        return result.Items as ConnectionRow[];
    }
}
