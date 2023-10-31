const regions = [
    "ap-northeast-2",
    "us-east-1"
] as const

type Region = typeof regions[number];

export interface ChannelRow {
    channelName: string;
    region: Region;
    language: string;
    endpoint: string;
    userCount: number;
}

export interface ConnectionRow {
    connectionId: string;
    channelName: string;
    aid: string;
}
