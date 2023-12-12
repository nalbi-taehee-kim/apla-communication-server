interface  MatchResultTableRow {
    source: string; // partition key
    target: string; 
    timestamp: number; // sort key
    serverTimestamp?: number;
    responseTimestamp?: number;
    responseServerTimestamp?: number;
    channelName?: string;
    result?: boolean;
    reason?: string; // reject reason
}
