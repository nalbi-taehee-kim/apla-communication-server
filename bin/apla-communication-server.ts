#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AplaMatchingChannelsStack } from '../lib/apla-matching-channels-stack';
import { AplaChitchatStack } from '../lib/apla-chitchat-stack';

const certificateArn = "arn:aws:acm:ap-northeast-2:218279748716:certificate/d8af70cb-373d-4b34-9504-8b7abc990692";

const app = new cdk.App();
const channelsStack = new AplaMatchingChannelsStack(app, 'AplaMatchingChannelsStack', {
  certificateArn: certificateArn,
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },
  env: {account: '218279748716', region: 'ap-northeast-2'}
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

const ChitchatStackApne2 = new AplaChitchatStack(app, 'AplaChitchatStack-apne2', {
  certificateArn: "arn:aws:acm:ap-northeast-2:218279748716:certificate/d8af70cb-373d-4b34-9504-8b7abc990692",
  language: 'ko',
  env: {account: '218279748716', region: 'ap-northeast-2'}
});

const ChitchatStackUse1 = new AplaChitchatStack(app, 'AplaChitchatStack-use1', {
  certificateArn: "arn:aws:acm:us-east-1:218279748716:certificate/dc1f2f8c-b766-4bd0-b24c-75a2873f1535",
  language: 'en',
  env: {account: '218279748716', region: 'us-east-1'}
});

