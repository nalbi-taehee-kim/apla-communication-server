export const eventTypes = {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    REQUEST_LIST: 'requestList',
    LIST: 'list',
    MATCH_REQUEST: 'matchRequest',
    MATCH_RESPONSE: 'matchResponse',
    MATCHED: 'matched',
    PING: 'ping',
    PONG: 'pong',
    GET_TIME: 'getTime',
} as const;
export type EventType = typeof eventTypes[keyof typeof eventTypes];