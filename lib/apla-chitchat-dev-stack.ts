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

export class AplaChitchatDevStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AplaChitchatStackProps) {
    super(scope, id, props);
    
    const certificateArn = props?.certificateArn;
    if (!certificateArn) {
      throw new Error("certificateArn is required");
    }
    const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(this, "Certificate", certificateArn);
    const domainName = `chitchat-dev.apla.world`
    const domain = new DomainName(this, `ChitchatDevDomain`, {
        domainName: domainName,
        certificate: certificate,
    })

    const channelTableArn = props?.channelTableArn;
    if (!channelTableArn) {
      throw new Error("channelTableArn is required");
    }
    const channelTable = aws_dynamodb.Table.fromTableArn(this, "ChannelTable", channelTableArn);

    const lambdaPath = join(__dirname, 'lambda', 'communication-dev');
    const connectionTable = new aws_dynamodb.Table(this, 'ChitchatConnectionsDevTable', {
        partitionKey: { name: 'aid', type: cdk.aws_dynamodb.AttributeType.STRING },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    connectionTable.addGlobalSecondaryIndex({
        indexName: "connction-id-index",
        partitionKey: { name: "connectionId", type: aws_dynamodb.AttributeType.STRING },
        projectionType: aws_dynamodb.ProjectionType.ALL
    })

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
        },
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    connectionTable.grantReadWriteData(connectionHandler);

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
    
    const websocketApi = new WebSocketApi(this, 'ChitchatDevWebSocketApi', {
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

    const websocketProdStage = new WebSocketStage(this, 'ChitchatProgStage', {
        webSocketApi: websocketApi,
        stageName: 'prod',
        autoDeploy: true,
        domainMapping: {
            domainName: domain,
        }
    });

    const aRecord = new cdk.aws_route53.ARecord(this, `ChitchatARecord-dev`, {
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
