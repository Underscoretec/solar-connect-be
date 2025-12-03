import * as express from "express";
import { Request, Response } from "express";
import { request } from "../interfaces";
import { signupSchema, loginSchema } from "../../validationSchema/auth.schema";
import * as controllers from "./controllers";
import { checkSchema } from "express-validator";
import isValidToken from "../../middleware/isValidToken";

const router = express.Router();

/**
 * @type - POST
 * @route -  /api/auth/login
 * @desc - route for login user
 * @access - Public
 */
router.post("/login", checkSchema(loginSchema), async (req: Request, res: Response) => {
    controllers
        .login(req as request)
        .then((response: any) => {
            return res.status(response.statusCode).send(response);
        })
        .catch((err) => {
            return res.status(err.status).send(err);
        });
});

/**
 * @type - POST
 * @route -  /api/auth/signup
 * @desc - route for create user
 * @access - Public
 */
router.post("/signup", checkSchema(signupSchema), async (req: Request, res: Response) => {
    controllers
        .signUp(req as request)
        .then((response: any) => {
            return res.status(response.statusCode).send(response);
        })
        .catch((err) => {
            return res.status(err.status).send(err);
        });
});

/**
 * @type - POST
 * @route -  /api/auth/refresh
 * @desc - route for refresh token
 * @access - Public (requires valid token)
 */
router.post("/refresh", async (req: Request, res: Response) => {
    controllers
        .refreshToken(req as request)
        .then((response: any) => {
            return res.status(response.statusCode).send(response);
        })
        .catch((err) => {
            return res.status(err.status).send(err);
        });
});

/**
 * @type - GET
 * @route -  /api/auth/user
 * @desc - route for get current authenticated user
 * @access - Private (requires valid token)
 */
router.get("/user", isValidToken as any, async (req: Request, res: Response) => {
    controllers
        .getUser(req as request)
        .then((response: any) => {
            return res.status(response.statusCode).send(response);
        })
        .catch((err) => {
            return res.status(err.status || 500).send(err);
        });
});

export default router;

