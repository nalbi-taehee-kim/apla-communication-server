import { WebSocketApi, WebSocketStage } from '@aws-cdk/aws-apigatewayv2-alpha';
import { WebSocketLambdaAuthorizer } from '@aws-cdk/aws-apigatewayv2-authorizers-alpha';
import { WebSocketLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { TypeScriptCode } from '@mrgrain/cdk-esbuild';
import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, aws_dynamodb, aws_lambda } from 'aws-cdk-lib';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { join } from 'path';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

interface ConnectionTableRow {
    connectionId: string;
    aid: string;
}

export class AplaCommunicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const lambdaPath = join(__dirname, 'lambda', 'communication');
    const connectionTable = new aws_dynamodb.Table(this, 'ConnectionsTable', {
        partitionKey: { name: 'connectionId', type: cdk.aws_dynamodb.AttributeType.STRING },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const connectionHandlerCode = new TypeScriptCode(join(lambdaPath, 'connection.ts'))
    const connectionHandler = new aws_lambda.Function(this, 'WebSocketHandler', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'connection.handler',
        code: connectionHandlerCode, // lambda 폴더에 코드 저장
        environment: {
          TABLE_NAME: connectionTable.tableName,
          WEBSOCKET_ENDPOINT: 'WEBSOCKET_ENDPOINT_PLACEHOLDER' // 이 값은 나중에 설정됩니다.
        },
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    connectionTable.grantReadWriteData(connectionHandler);

    const verifyTokenHandlerCode = new TypeScriptCode(join(lambdaPath, 'verify-token.ts'))
    const verifyTokenHandler = new aws_lambda.Function(this, 'VerifyTokenHandler', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'verify-token.handler',
        code: verifyTokenHandlerCode,
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    const verifyTokenAuthorizer = new WebSocketLambdaAuthorizer('VerifyTokenAuthorizer', verifyTokenHandler)
    
    const api = new WebSocketApi(this, 'CommunicationWebSocketApi', {
        routeSelectionExpression: '$request.body.action',
        connectRouteOptions: {
            authorizer: verifyTokenAuthorizer,
            integration: new WebSocketLambdaIntegration('connect', connectionHandler),
        },
        disconnectRouteOptions: {
          integration: new WebSocketLambdaIntegration('disconnect', connectionHandler),
        },
        defaultRouteOptions: {
          integration: new WebSocketLambdaIntegration('default', connectionHandler),
        },
    });

    const prodStage = new WebSocketStage(this, 'IngroupCommunicationStage', {
        webSocketApi: api,
        stageName: 'prod',
        autoDeploy: true,
    });

    function addManageConnectionPolicy(stage: WebSocketStage, handler: Function, stack: cdk.Stack) {
        const stageArn = stack.formatArn({
            service: 'execute-api',
            resource: api.apiId,
            resourceName: `${stage.stageName}/**`,
        });
        const stagePermission = new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['execute-api:Invoke', 'execute-api:ManageConnections'],
            resources: [stageArn]
        })
        handler.addToRolePolicy(stagePermission);
    }
    addManageConnectionPolicy(prodStage, connectionHandler, this);
    connectionHandler.addEnvironment('WEBSOCKET_ENDPOINT', prodStage.url!);
    new cdk.CfnOutput(this, 'WebSocketURL', {
        value: prodStage.url ?? 'Something went wrong with the deploy',
    });
    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AplaCommunicationServerQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
