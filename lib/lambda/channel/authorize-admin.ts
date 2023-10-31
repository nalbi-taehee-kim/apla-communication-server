
import { APIGatewayRequestAuthorizerEvent } from "aws-lambda";
const adminKey = process.env.ADMIN_KEY || '';

export const handler = async (event, context, callback) => {
    console.log('Authorizer event:', JSON.stringify(event, null, 2));
    const key = event.headers?.authorization;
    if (key === undefined || key === '') {
        const policy = generateDenyPolicy(event, 'anonymous');
        callback(null, policy);
    }
    if (key !== adminKey) {
        const policy = generateDenyPolicy(event, 'anonymous');
        callback(null, policy);
    }
    const policy = generateAllowPolicy(event, 'admin');
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

/**
 * Generates a deny policy for a given API Gateway request authorizer event and user ID.
 * @param event - The API Gateway request authorizer event.
 * @param userId - The user ID.
 * @returns An object containing the principal ID and the generated policy document.
 */
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
