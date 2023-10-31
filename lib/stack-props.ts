import * as cdk from 'aws-cdk-lib';

export interface AplaChitchatStackProps extends cdk.StackProps {
    certificateArn: string;
    channelTableArn: string;
}

export interface AplaMatchingChannelsStackProps extends cdk.StackProps {
    certificateArn: string;
    adminKey?: string;
}
