interface  MatchResultTableRow {
    source: string; // partition key
    target: string; // sort key
    timestamp: number;
    responseTimestamp?: number;
    result?: boolean;
    reason?: string; // reject reason
}
