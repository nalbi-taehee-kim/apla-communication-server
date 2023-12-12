import { DomainName, WebSocketApi, WebSocketStage } from '@aws-cdk/aws-apigatewayv2-alpha';
import { WebSocketLambdaAuthorizer } from '@aws-cdk/aws-apigatewayv2-authorizers-alpha';
import { WebSocketLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { TypeScriptCode } from '@mrgrain/cdk-esbuild';
import * as cdk from 'aws-cdk-lib';
import { aws_dynamodb, aws_lambda } from 'aws-cdk-lib';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { join } from 'path';
import { AplaChitchatStackProps, AplaMatchingChannelsStackProps } from './stack-props';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AplaChitchatTestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AplaChitchatStackProps) {
    super(scope, id, props);
    
    const certificateArn = props?.certificateArn;
    if (!certificateArn) {
      throw new Error("certificateArn is required");
    }
    const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(this, "Certificate", certificateArn);
    const domainName = `chitchat-test.apla.world`
    const domain = new DomainName(this, `ChitchatTestDomain`, {
        domainName: domainName,
        certificate: certificate,
    })

    const channelTableArn = props?.channelTableArn;
    if (!channelTableArn) {
      throw new Error("channelTableArn is required");
    }
    const channelTable = aws_dynamodb.Table.fromTableArn(this, "ChannelTable", channelTableArn);

    const lambdaPath = join(__dirname, 'lambda', 'communication-test');
    const connectionTable = new aws_dynamodb.Table(this, 'ChitchatConnectionsTestTable', {
        partitionKey: { name: 'aid', type: cdk.aws_dynamodb.AttributeType.STRING },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    connectionTable.addGlobalSecondaryIndex({
        indexName: "connction-id-index",
        partitionKey: { name: "connectionId", type: aws_dynamodb.AttributeType.STRING },
        projectionType: aws_dynamodb.ProjectionType.ALL
    })

    // match source aid, target aid, timestamp, response timestamp, result, reason
    const matchResultTable = new aws_dynamodb.Table(this, 'ChitchatStatisticsTestTable', {
        partitionKey: { name: 'source', type: cdk.aws_dynamodb.AttributeType.STRING },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
        sortKey: { name: 'timestamp', type: aws_dynamodb.AttributeType.NUMBER },
    });
    matchResultTable.addGlobalSecondaryIndex({
        indexName: "target-index",
        partitionKey: { name: "target", type: aws_dynamodb.AttributeType.STRING },
        projectionType: aws_dynamodb.ProjectionType.ALL
    });

    const addMatchHandlerCode = new TypeScriptCode(join(lambdaPath, 'match-result', 'add-match.ts'));
    const addMatchHandler = new aws_lambda.Function(this, 'ChitchatAddMatchHandler', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'add-match.handler',
        code: addMatchHandlerCode,
        environment: {
            MATCH_RESULT_TABLE_NAME: matchResultTable.tableName,
        },
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    matchResultTable.grantReadWriteData(addMatchHandler);

    const setMatchResultHandlerCode = new TypeScriptCode(join(lambdaPath, 'match-result', 'set-match-result.ts'));
    const setMatchResultHandler = new aws_lambda.Function(this, 'ChitchatSetMatchResultHandler', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'set-match-result.handler',
        code: setMatchResultHandlerCode,
        environment: {
            MATCH_RESULT_TABLE_NAME: matchResultTable.tableName,
        },
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    matchResultTable.grantReadWriteData(setMatchResultHandler);

    const connectionHandlerCode = new TypeScriptCode(join(lambdaPath, 'connection.ts'))
    const connectionHandler = new aws_lambda.Function(this, 'ChitchatWebSocketHandler', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'connection.handler',
        code: connectionHandlerCode, // lambda 폴더에 코드 저장
        environment: {
            CONNECTION_TABLE_NAME: connectionTable.tableName,
            WEBSOCKET_ENDPOINT: 'WEBSOCKET_ENDPOINT_PLACEHOLDER', // 이 값은 나중에 설정됩니다.
            API_ENDPOINT: 'API_ENDPOINT_PLACEHOLDER', // 이 값은 나중에 설정됩니다.
            BROADCAST_LAMBDA_NAME: 'BROADCAST_LAMBDA_NAME_PLACEHOLDER',
            NOTIFY_LAMBDA_NAME: 'NOTIFY_LAMBDA_NAME_PLACEHOLDER',
            ADD_MATCH_LAMBDA_NAME: addMatchHandler.functionName,
            SET_MATCH_RESULT_LAMBDA_NAME: setMatchResultHandler.functionName,
            DEBUG_BROADCAST_MODE: 'false',
        },
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    connectionTable.grantReadWriteData(connectionHandler);
    addMatchHandler.grantInvoke(connectionHandler);
    setMatchResultHandler.grantInvoke(connectionHandler);

    const broadcastHandlerCode = new TypeScriptCode(join(lambdaPath, 'broadcast.ts'))
    const broadcastHandler = new aws_lambda.Function(this, 'ChitchatBroadcastHandler', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'broadcast.handler',
        code: broadcastHandlerCode,
        environment: {
            CONNECTION_TABLE_NAME: connectionTable.tableName,
            API_ENDPOINT: 'API_ENDPOINT_PLACEHOLDER', // 이 값은 나중에 설정됩니다.
        },
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    connectionTable.grantReadData(broadcastHandler);
    connectionHandler.addEnvironment('BROADCAST_LAMBDA_NAME', broadcastHandler.functionName);
    broadcastHandler.grantInvoke(connectionHandler);

    const notifyHandlerCode = new TypeScriptCode(join(lambdaPath, 'notify.ts'))
    const notifyHandler = new aws_lambda.Function(this, 'ChitchatNotifyHandler', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'notify.handler',
        code: notifyHandlerCode,
        environment: {
            CONNECTION_TABLE_NAME: connectionTable.tableName,
            API_ENDPOINT: 'API_ENDPOINT_PLACEHOLDER', // 이 값은 나중에 설정됩니다.
        },
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    connectionTable.grantReadData(notifyHandler);
    connectionHandler.addEnvironment('NOTIFY_LAMBDA_NAME', notifyHandler.functionName);
    notifyHandler.grantInvoke(connectionHandler);

    const authorizeUserCode = new TypeScriptCode(join(lambdaPath, 'authorize-user.ts'))
    const authorizeUserHandler = new aws_lambda.Function(this, 'ChitchatAuthorizeUserHandler', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'authorize-user.handler',
        code: authorizeUserCode,
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    const userAuthorizer = new WebSocketLambdaAuthorizer('UserAuthorizer', authorizeUserHandler, {
        identitySource: ['route.request.querystring.token'],
    })
    
    const websocketApi = new WebSocketApi(this, 'ChitchatTestWebSocketApi', {
        routeSelectionExpression: '$request.body.action',
        connectRouteOptions: {
            authorizer: userAuthorizer,
            integration: new WebSocketLambdaIntegration('connect', connectionHandler),
        },
        disconnectRouteOptions: {
          integration: new WebSocketLambdaIntegration('disconnect', connectionHandler),
        },
        defaultRouteOptions: {
          integration: new WebSocketLambdaIntegration('default', connectionHandler),
        },
    });
    websocketApi.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const websocketProdStage = new WebSocketStage(this, 'ChitchatProdStage', {
        webSocketApi: websocketApi,
        stageName: 'prod',
        autoDeploy: true,
        domainMapping: {
            domainName: domain,
        }
    });

    const aRecord = new cdk.aws_route53.ARecord(this, `ChitchatARecord-test`, {
        zone: cdk.aws_route53.HostedZone.fromLookup(this, 'ChitchatHostedZone', {
            domainName: 'apla.world',
        }),
        recordName: domainName,
        target: cdk.aws_route53.RecordTarget.fromAlias(
            new cdk.aws_route53_targets.ApiGatewayv2DomainProperties(
                domain.regionalDomainName,
                domain.regionalHostedZoneId,
            )
        ),
    })
    connectionHandler.addEnvironment('API_ENDPOINT', websocketProdStage.url!);
    notifyHandler.addEnvironment('API_ENDPOINT', websocketProdStage.url!);

    aRecord.node.addDependency(websocketProdStage);
    aRecord.node.addDependency(domain);
    aRecord.node.addDependency(websocketApi);
    aRecord.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    function addManageConnectionPolicy(stage: WebSocketStage, handler: Function, stack: cdk.Stack) {
        const stageArn = stack.formatArn({
            service: 'execute-api',
            resource: websocketApi.apiId,
            resourceName: `${stage.stageName}/**`,
        });
        const stagePermission = new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['execute-api:Invoke', 'execute-api:ManageConnections'],
            resources: [stageArn]
        })
        handler.addToRolePolicy(stagePermission);
    }
    function addInvokePolicy(stage: WebSocketStage, handler: Function, stack: cdk.Stack) {
        const stageArn = stack.formatArn({
            service: 'execute-api',
            resource: websocketApi.apiId,
            resourceName: `${stage.stageName}/**`,
        });
        const stagePermission = new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['execute-api:Invoke'],
            resources: [stageArn]
        })
        handler.addToRolePolicy(stagePermission);
    }

    addManageConnectionPolicy(websocketProdStage, connectionHandler, this);
    addManageConnectionPolicy(websocketProdStage, broadcastHandler, this);
    addManageConnectionPolicy(websocketProdStage, notifyHandler, this);

    connectionHandler.addEnvironment('WEBSOCKET_ENDPOINT', websocketProdStage.url!);
    broadcastHandler.addEnvironment('API_ENDPOINT', websocketProdStage.url!);
    new cdk.CfnOutput(this, 'WebSocketURL', {
        value: aRecord.domainName
    });
    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AplaCommunicationServerQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
