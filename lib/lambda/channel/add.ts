import { APIGatewayProxyHandler } from "aws-lambda"

export const handler: APIGatewayProxyHandler = async (event, context, callback) => {
    return {
        statusCode: 200,
        body: "ok"
    }
}
