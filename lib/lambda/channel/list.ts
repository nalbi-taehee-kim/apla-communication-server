import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { ChannelRow } from '../../db/types';

const channelTableName = process.env.CHANNEL_TABLE_NAME || '';
const ddb = new DynamoDB.DocumentClient();

export const handler: APIGatewayProxyHandler = async (event, context, callback) => {
    const rows = await ddb.scan({ TableName: channelTableName }).promise();
    const list = {
        channels: rows.Items,
    } 
    return {
        statusCode: 200,
        body: JSON.stringify(list)
    }
}
