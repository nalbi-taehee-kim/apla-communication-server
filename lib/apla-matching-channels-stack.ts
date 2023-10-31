import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, aws_dynamodb, aws_lambda } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DomainName, HttpApi, HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import { HttpLambdaAuthorizer } from '@aws-cdk/aws-apigatewayv2-authorizers-alpha'
import { AplaMatchingChannelsStackProps } from './stack-props';
import { join } from 'path';
import { TypeScriptCode } from '@mrgrain/cdk-esbuild';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

interface ChannelTableRow {
  channelName: string;
  region: string;
  id: number;
  language: string;
}


export class AplaMatchingChannelsStack extends cdk.Stack {
  public readonly channelTable: aws_dynamodb.Table;

  constructor(scope: Construct, id: string, props?: AplaMatchingChannelsStackProps) {
    super(scope, id, props);
    const certificateArn = props?.certificateArn;
    if (!certificateArn) {
      throw new Error("certificateArn is required");
    }
    const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(this, "Certificate", certificateArn);
    const domain = "channels.apla.world"
    const domainName = new DomainName(this, "MatchingChannelsDomain", {
      domainName: domain,
      certificate: certificate
    });

    const channelTable = new aws_dynamodb.Table(this, "ChannelTable", {
      partitionKey: { name: "channelName", type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      replicationRegions: ["ap-northeast-1", "us-east-1"]
    });
    channelTable.addGlobalSecondaryIndex({
      indexName: "language-index",
      partitionKey: { name: "language", type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL
    });
    this.channelTable = channelTable;
    
    const lambdaPath = join(__dirname, 'lambda', 'channel');
    
    const authorizeUserCode = new TypeScriptCode(join(lambdaPath, 'authorize-user.ts'))
    const authorizeUserHandler = new aws_lambda.Function(this, 'AuthorizeUserHandler', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'authorize-user.handler',
        code: authorizeUserCode,
        logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    const userAuthorizer = new HttpLambdaAuthorizer('UserAuthorizer', authorizeUserHandler)

    
    if (props.adminKey === undefined) {
      throw new Error("adminKey is required");
    }
    const authorizeAdminCode = new TypeScriptCode(join(lambdaPath, 'authorize-admin.ts'))
    const authorizeAdminHandler = new aws_lambda.Function(this, 'AuthorizeAdminHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      handler: 'authorize-admin.handler',
      code: authorizeAdminCode,
      environment: {
        ADMIN_KEY: props.adminKey
      },
      logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    })
    const adminAuthorizer = new HttpLambdaAuthorizer('AdminAuthorizer', authorizeAdminHandler)


    const channelsApi = new HttpApi(this, "MatchingChannelsApi", {
      createDefaultStage: false,
    });
    const channelsProdStage = channelsApi.addStage("prod", {
      autoDeploy: true,
      stageName: "prod",
      domainMapping: {
        domainName: domainName,
        mappingKey: "api",
      },
    });

    // channel list
    const channelHandlerCode = new TypeScriptCode(join(lambdaPath, 'list.ts'))
    const channelListHandler = new cdk.aws_lambda.Function(this, "ChannelListHandler", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      handler: "list.handler",
      code: channelHandlerCode,
      environment: {
        CHANNEL_TABLE_NAME: channelTable.tableName
      },
      logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    channelTable.grantReadData(channelListHandler);
    channelsApi.addRoutes({
      path: "/channel",
      methods: [HttpMethod.GET],
      authorizer: userAuthorizer,
      integration: new HttpLambdaIntegration('ChannelListHandlerIntegration', channelListHandler)
    })

    // add channel
    const channelAddHandlerCode = new TypeScriptCode(join(lambdaPath, 'add.ts'))
    const channelAddHandler = new cdk.aws_lambda.Function(this, "ChannelAddHandler", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      handler: "add.handler",
      code: channelAddHandlerCode,
      environment: {
        CHANNEL_TABLE_NAME: channelTable.tableName
      },
      logRetention: cdk.aws_logs.RetentionDays.FIVE_DAYS,
    });
    channelTable.grantReadWriteData(channelAddHandler);
    channelsApi.addRoutes({
      path: "/channel",
      methods: [HttpMethod.POST],
      authorizer: adminAuthorizer,
      integration: new HttpLambdaIntegration('ChannelListHandlerIntegration', channelListHandler)
    })
    
    const aRecord = new cdk.aws_route53.ARecord(this, `AplaMathingARecord`, {
      zone: cdk.aws_route53.HostedZone.fromLookup(this, 'AplaMatchingHostedZone', {
          domainName: 'apla.world',
      }),
      recordName: domain,
      target: cdk.aws_route53.RecordTarget.fromAlias(
          new cdk.aws_route53_targets.ApiGatewayv2DomainProperties(
              domainName.regionalDomainName,
              domainName.regionalHostedZoneId,
          )
      ),
    })

    new cdk.CfnOutput(this, "ChannelTableArn", {
      value: channelTable.tableArn
    });

    new cdk.CfnOutput(this, "ChannelTableName", {
      value: channelTable.tableName
    });

    new cdk.CfnOutput(this, "ChannelsApiEndpoint", {
      value: channelsApi.url || ""
    });

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AplaCommunicationServerQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // }); 
  }
}
