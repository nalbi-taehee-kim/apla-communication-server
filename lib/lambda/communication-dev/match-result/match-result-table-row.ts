interface  MatchResultTableRow {
    source: string; // partition key
    target: string; 
    timestamp: number; // sort key
    responseTimestamp?: number;
    channelName?: string;
    result?: boolean;
    reason?: string; // reject reason
}
