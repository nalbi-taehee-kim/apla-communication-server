import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, aws_dynamodb } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AplaMatchingChannelsStackProps } from './stack-props';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AplaMatchingChannelsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AplaMatchingChannelsStackProps) {
    super(scope, id, props);
    const certificateArn = props?.certificateArn;
    if (!certificateArn) {
      throw new Error("certificateArn is required");
    }
    const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(this, "Certificate", certificateArn);
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
    
    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AplaCommunicationServerQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
    
  }
}
