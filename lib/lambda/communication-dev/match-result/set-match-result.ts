import {DynamoDB} from 'aws-sdk';

const dynamodb = new DynamoDB.DocumentClient();
const MATCH_RESULT_TABLE_NAME = process.env.MATCH_RESULT_TABLE_NAME;

export const handler = async ({
    source,
    target,
    timestamp,
    responseTimestamp,
    channelName,
    result,
    reason,
}: MatchResultTableRow) => {
    const params : DynamoDB.DocumentClient.PutItemInput = {
        TableName: MATCH_RESULT_TABLE_NAME,
        Item: {
            source,
            target,
            timestamp,
            responseTimestamp,
            responseServerTimestamp: Date.now(),
            channelName,
            result,
            reason,
        }
    };

    try {
        const prevResult = await dynamodb.get({
            TableName: MATCH_RESULT_TABLE_NAME,
            Key: {
                source,
                timestamp
            },
            ConsistentRead: true,
        }).promise();
        if (prevResult.Item !== undefined && prevResult.Item?.reason !== undefined) {
            console.log("Match result already exists");
            return;
        }
        await dynamodb.put(params).promise();
        console.log('Match result added successfully');
    } catch (error) {
        console.error('Error adding match result:', error);
        throw error;
    }
};
