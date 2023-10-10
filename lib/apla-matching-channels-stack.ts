import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, aws_dynamodb } from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AplaMatchingChannelsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const channelTable = new aws_dynamodb.Table(this, "ChannelTable", {
      partitionKey: { name: "channelName", type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });


    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AplaCommunicationServerQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
    
  }
}
