import { request, response, User } from "../services/interfaces";
import logger from "../services/logger";
import projection from "../services/projection";
import messages from '../services/messages.json';
import jwt from 'jsonwebtoken';
import config from "../config";
import Users from "../services/authentication/model";

export default async function isValidToken(req: request, res: response, next: any) {
    try {
        const authHeader = req?.headers?.authorization;
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.substring(7)
            : authHeader || decodeURIComponent(req?.query?.accessToken as string || '');

        const tokenSec = config?.tokenSecret || "test_sec";

        if (!token) {
            return res.status(401).send(projection.errorAPIResponse(null, 401, "UNAUTHORIZED", messages["UNAUTHORIZED"]));
        }

        const decoded: any = jwt.verify(token, tokenSec);

        if (decoded) {
            const user: User | null = await Users.findOne({ _id: decoded?.id, enabled: 1 });

            if (!user) {
                return res.status(401).send(projection.errorAPIResponse(null, 401, "UNAUTHORIZED", messages["UNAUTHORIZED"]));
            }

            if (user?.isVerified !== 1) {
                return res.status(401).send(projection.errorAPIResponse(null, 401, "UNAUTHORIZED", messages["UNAUTHORIZED"]));
            }

            req.user = user;
            return next();
        } else {
            return res.status(401).send(projection.errorAPIResponse(null, 401, "UNAUTHORIZED", messages["UNAUTHORIZED"]));
        }
    } catch (error) {
        logger.error('Error in isValidToken', error);
        return res.status(401).send(projection.errorAPIResponse(null, 401, "UNAUTHORIZED", messages["UNAUTHORIZED"]));
    }
}

