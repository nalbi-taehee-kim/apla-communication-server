import { APIGatewayRequestAuthorizerEvent } from "aws-lambda";
import { verifyToken } from "../util/verify-token";

export async function handler(event, context, callback): Promise<void> {
    console.log('Authorizer event:', JSON.stringify(event, null, 2));
    const authorization = event.queryStringParameters.token;
    if (authorization === undefined) {
        const policy = generateDenyPolicy(event, 'anonymous');
        callback(null, policy);
        return;
    }
    // //const token = authorization.split(' ')[1];
    // const token = authorization;
    // if (token === undefined) {
    //     const policy = generateDenyPolicy(event, 'anonymous');
    //     callback(null, policy);
    //     return;
    // }
    // console.log("token", token);
    // const [verified, mid] = await verifyToken(token);
    // if (!verified) {
    //     const policy = generateDenyPolicy(event, mid);
    //     callback(null, policy);
    //     return;
    // }
    const mid = authorization;
    const policy = generateAllowPolicy(event, mid);
    callback(null, policy);
}


function generateAllowPolicy(event: APIGatewayRequestAuthorizerEvent, userId: string) {
    const methodArn = event.methodArn;
    const policyDocument = generatePolicyDocument('Allow', methodArn);
    return {
        principalId: userId,
        policyDocument,
        context: {
          userId: userId
        }
    };
}

function generateDenyPolicy(event: APIGatewayRequestAuthorizerEvent, userId: string) {
    const methodArn = event.methodArn;
    const policyDocument = generatePolicyDocument('Deny', methodArn);
    return {
        principalId: userId,
        policyDocument,
    };
}

function generatePolicyDocument(effect: string, methodArn: string) {
    if (!effect || !methodArn) return null;
    const policyDocument = {
        Version: '2012-10-17',
        Statement: [
            {
                Action: 'execute-api:Invoke',
                Effect: effect,
                Resource: methodArn
            }
        ]
    };
    return policyDocument;
}
