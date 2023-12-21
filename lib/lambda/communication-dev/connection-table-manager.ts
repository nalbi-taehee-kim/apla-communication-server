import { DynamoDB } from "aws-sdk";

export interface ConnectionRow {
    aid: string; // partition key
    connectionId: string;
    connectionTime?: number;
    lastPingTime?: number;
}

export class ConnctionTableManager {
    ddb = new DynamoDB.DocumentClient();
    db = new DynamoDB();
    connectionTableName: string;
    constructor(connectionTableName: string) {
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

    async getConnection(aid: string): Promise<string | undefined> {
        console.log("connectionTableManager.getConnection: aid", aid)
        const params = {
            TableName: this.connectionTableName,
            KeyConditionExpression: 'aid = :aid',
            ExpressionAttributeValues: {
                ':aid': aid
            }
        };
        const result = await this.ddb.query(params).promise();
        if (result.Items === undefined || result.Items.length === 0) {
            console.log("connectionTableManager.getConnection: no item found")
            return undefined;
        }
        console.log("connectionTableManager.getConnection: result.Items[0]", result.Items[0])
        return result.Items[0].connectionId;
    }

    async addConnection(connectionId: string, aid: string): Promise<void> {
        console.log("connectionTableManager.addConnection: connectionId", connectionId)
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
    async listAllConnections(limit?: number): Promise<ConnectionRow[]> {
        console.log("connectionTableManager.listAllConnections")
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

    async updatePing(connectionId: string): Promise<void> {
        console.log("connectionTableManager.updatePing: connectionId", connectionId)
        const aid = await this.getAid(connectionId);
        if (aid === undefined) {
            return;
        }
        const params = {
            TableName: this.connectionTableName,
            Key: {
                aid: aid,
            },
            UpdateExpression: 'set lastPingTime = :lastPingTime',
            ExpressionAttributeValues: {
                ':lastPingTime': Date.now(),
            }
        };
        await this.ddb.update(params).promise();
        return;
    }

    async getUserCount(): Promise<number> {
        const table = await this.db.describeTable({ TableName: this.connectionTableName }).promise();
        return table.Table?.ItemCount || 0;
    }
}
