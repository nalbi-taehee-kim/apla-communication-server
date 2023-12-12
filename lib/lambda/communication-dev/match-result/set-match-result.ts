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
        const params : DynamoDB.DocumentClient.PutItemInput = {
            TableName: MATCH_RESULT_TABLE_NAME,
            Item: {
                source,
                target,
                timestamp,
                serverTimestamp: prevResult.Item?.serverTimestamp,
                responseTimestamp,
                responseServerTimestamp: Date.now(),
                channelName,
                result,
                reason,
            }
        };
        await dynamodb.put(params).promise();
        console.log('Match result added successfully');
    } catch (error) {
        console.error('Error adding match result:', error);
        throw error;
    }
};
