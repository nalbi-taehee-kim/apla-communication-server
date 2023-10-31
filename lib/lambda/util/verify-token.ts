import {verify} from 'jsonwebtoken';

const pubkey = '02ace5244aeb11ee90160242ac110002';
const expectedIss = 'https://api.apla.world';

export async function verifyToken(token: string): Promise<[boolean, string]> {
    try {
        const decoded = verify(token, pubkey, { algorithms: ['HS256'] });
        console.log("decoded", decoded);
        if (typeof decoded === 'string') {
            return [false, decoded];
        }
        const iss = decoded['iss'];
        if (typeof iss !== 'string' || iss !== expectedIss) {
            return [false, 'anonymous'];
        }
        const mid = decoded['sub'];
        if (typeof mid !== 'string') {
            return [false, 'anonymous'];
        }
        return [true, mid];
    } catch (e) {
        console.log("error", e);
        return [false, 'anonymous'];
    }
}

