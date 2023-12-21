import { DynamoDB } from "aws-sdk";

export interface ConnectionRow {
    aid: string; // partition key
    connectionId: string;
    connectionTime?: number;
}

export class ConnctionTableManager {
    ddb = new DynamoDB.DocumentClient();
    db = new DynamoDB();
    connectionTableName: string;
    constructor(connectionTableName: string) {
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
            console.log("connectionTableManager.getAid: no item found")
            return undefined;
        }
        return result.Items[0].aid;
    }

    async getConnection(aid: string): Promise<string | undefined> {
        const params = {
            TableName: this.connectionTableName,
            KeyConditionExpression: 'aid = :aid',
            ExpressionAttributeValues: {
                ':aid': aid
            }
        };
        const result = await this.ddb.query(params).promise();
        if (result.Items === undefined || result.Items.length === 0) {
            return undefined;
        }
        return result.Items[0].connectionId;
    }

    async addConnection(connectionId: string, aid: string): Promise<void> {
        const params = {
            TableName: this.connectionTableName,
            Item: {
                aid: aid,
                connectionId: connectionId,
                connectionTime: Date.now(),
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
    async listAllConnections(limit?: number): Promise<ConnectionRow[]> {
        // scan all connections
        const params = {
            TableName: this.connectionTableName,
        };
        // if (limit !== undefined) {
        //     params['Limit'] = limit;
        // }
        const result = await this.ddb.scan(params).promise();
        console.log("result.Items", result.Items);
        if (result.Items === undefined) { 
            return [];
        }
        return result.Items as ConnectionRow[];
    }

    async getUserCount(): Promise<number> {
        const table = await this.db.describeTable({ TableName: this.connectionTableName }).promise();
        return table.Table?.ItemCount || 0;
    }
}
