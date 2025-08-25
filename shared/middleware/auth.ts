import {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
    tenantId?: string;
    scopes?: string;
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if(!authHeader || !authHeader.startsWith('Bearer ')){
            return res.status(401).json({
                error: 'Missing or invalid authorization header'
            });
        }
    
        const token = authHeader.substring(7);
    
        const jwtSecret = process.env.JWT_SECRET || '5e8f894aa9a8cdf107d46b2b79801a43';
    
        const decoded = jwt.verify(token, jwtSecret) as any;
        req.tenantId = decoded.tenantId;
        req.scopes = decoded.scopes || [];
        
        // adding tenant id to request headers for downstram service
        req.headers['tenant-id'] = decoded.tenantId;
    
        next();
    } catch (error) {
        return res.status(401).json({error: 'Invalid token'});
    }
};