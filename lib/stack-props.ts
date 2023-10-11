import * as cdk from 'aws-cdk-lib';

export interface AplaChitchatStackProps extends cdk.StackProps {
    certificateArn: string;
    language: string;
}

export interface AplaMatchingChannelsStackProps extends cdk.StackProps {
    certificateArn: string;
    adminKey?: string;
}
