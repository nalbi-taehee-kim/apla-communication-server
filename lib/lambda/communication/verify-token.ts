import { APIGatewayRequestAuthorizerEvent } from "aws-lambda";
import {verify} from 'jsonwebtoken';

const pubkey = '02ace5244aeb11ee90160242ac110002';
const expectedIss = 'https://api.apla.world';

async function verifyToken(token: string): Promise<[boolean, string]> {
    const decoded = verify(token, pubkey, { algorithms: ['HS256'] });
    console.log("decoded", decoded);
    if (typeof decoded === 'string') {
        return [false, decoded];
    }
    const iss = decoded['iss'];
    if (typeof iss !== 'string' || iss !== expectedIss) {
        return [false, 'anonymous'];
    }
    const mid = decoded['mid'];
    if (typeof mid !== 'string') {
        return [false, 'anonymous'];
    }
    return [true, mid];
}

export async function handler(event, context, callback): Promise<void> {
    console.log('Authorizer event:', JSON.stringify(event, null, 2));
    const token = event.headers.Authorization.split(' ')[1];
    if (token === undefined) {
        const policy = generateDenyPolicy(event, 'anonymous');
        callback(null, policy);
    }
    console.log("token", token);
    const [verified, mid] = await verifyToken(token);
    if (!verified) {
        const policy = generateDenyPolicy(event, mid);
        callback(null, policy);
    }
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
