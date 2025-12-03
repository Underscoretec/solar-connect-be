import { request, response, User } from "../interfaces";
import logger from "../logger";
import { validationResult } from 'express-validator';
import projection from "../projection";
import Users from "./model";
import messages from '../messages.json';
import passwordValidation from "../../security/passwordValidation";
import bcrypt from "bcrypt";
import config from "../../config";
import generateAccessToken from "../../security/generateAccessToken";
import jwt from "jsonwebtoken";


export async function login(req: request): Promise<any> {
    const { email, password } = req?.body;
    logger.info(`[Auth] Login API called for email: ${email}`);

    return new Promise<any>(async function (resolve, reject) {
        try {
            if (!email || !password) {
                return reject(projection.errorAPIResponse(null, 400, "INVALID_CREDENTIALS", messages["INVALID_CREDENTIALS"]));
            }

            const user: User | null = await Users.findOne({
                email: email.toLowerCase().trim(),
                enabled: 1
            });


            if (!user) {
                return reject(projection.errorAPIResponse(null, 401, "INVALID_CREDENTIALS", messages["INVALID_CREDENTIALS"]));
            }

            if (user.isVerified !== 1) {
                return reject(projection.errorAPIResponse(null, 401, "USER_NOT_VERIFIED", messages["USER_NOT_VERIFIED"] || "User not verified"));
            }

            const isPasswordValid = await bcrypt.compare(password, user.password || '');

            if (!isPasswordValid) {
                return reject(projection.errorAPIResponse(null, 401, "INVALID_CREDENTIALS", messages["INVALID_CREDENTIALS"]));
            }

            const payload = {
                id: user._id,
            };

            const tokenData = await generateAccessToken(payload, config.tokenSecret, config.jwtExpires);

            if (!tokenData) {
                return reject(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", messages["INTERNAL_SERVER_ERROR"]));
            }

            return resolve({
                statusCode: 200,
                error: false,
                result: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token: tokenData.token,
                expiresAt: tokenData.expiresAt,
                code: "LOGIN_SUCCESS",
                message: messages["LOGIN_SUCCESS"],
            });
        } catch (error) {
            logger.error(`[Auth] Error when user login with email: ${email}`, error);
            return reject(projection.errorResponse(error));
        }
    });
}

export async function signUp(req: request): Promise<any> {
    const { name, email, password } = req?.body;
    logger.info(`[Auth] Sign up API called for email: ${email}`);

    return new Promise<any>(async function (resolve, reject) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return reject(projection.validationError(errors.array() as any));
            }

            const existingUser = await Users.findOne({
                email: email?.toLowerCase().trim()
            });

            if (existingUser) {
                return reject(projection.errorAPIResponse({}, 403, "EMAIL_EXISTS_ERROR", messages["EMAIL_EXISTS_ERROR"]));
            }

            const validPassword = await passwordValidation(password);

            if (typeof validPassword !== "string") {
                return reject(projection.validationError(validPassword as any));
            }

            const newUser = await new Users({
                name: name,
                email: email?.toLowerCase().trim(),
                password: validPassword,
                role: "admin",
                emailVerified: {
                    verifiedAt: Date.now(),
                    verified: true
                }
            }).save();

            if (newUser) {
                return resolve(projection.successResponse(
                    {
                        _id: newUser._id,
                        name: newUser.name,
                        email: newUser.email
                    },
                    201,
                    "USER_CREATE_SUCCESS",
                    messages["USER_CREATE_SUCCESS"]
                ));
            }
        } catch (error) {
            logger.error(`[Auth] Error when user sign up with email: ${email}`, error);
            return reject(projection.errorResponse(error));
        }
    });
}

export async function refreshToken(req: request): Promise<any> {
    logger.info(`[Auth] Refresh token API called`);

    return new Promise<any>(async function (resolve, reject) {
        try {
            const authHeader = req?.headers?.authorization;
            const token = authHeader?.startsWith('Bearer ')
                ? authHeader.substring(7)
                : authHeader;

            if (!token) {
                return reject(projection.errorAPIResponse(null, 401, "INVALID_TOKEN", messages["INVALID_TOKEN"]));
            }

            // Verify the token
            const tokenSec = config.tokenSecret || "test_sec";

            let decoded: any;
            try {
                decoded = jwt.verify(token, tokenSec);
            } catch (error: any) {
                if (error.name === 'TokenExpiredError') {
                    // Token is expired, but we can still refresh if user exists
                    decoded = jwt.decode(token);
                } else {
                    return reject(projection.errorAPIResponse(null, 401, "INVALID_TOKEN", messages["INVALID_TOKEN"]));
                }
            }

            if (!decoded || !decoded.id) {
                return reject(projection.errorAPIResponse(null, 401, "INVALID_TOKEN", messages["INVALID_TOKEN"]));
            }

            // Find user
            const user: User | null = await Users.findOne({
                _id: decoded.id,
                enabled: 1
            });

            if (!user) {
                return reject(projection.errorAPIResponse(null, 401, "UNAUTHORIZED", messages["UNAUTHORIZED"]));
            }

            if (user.isVerified !== 1) {
                return reject(projection.errorAPIResponse(null, 401, "USER_NOT_VERIFIED", messages["USER_NOT_VERIFIED"] || "User not verified"));
            }

            // Generate new token
            const payload = {
                id: user._id,
            };

            const tokenData = await generateAccessToken(payload, config.tokenSecret, config.jwtExpires);

            if (!tokenData) {
                return reject(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", messages["INTERNAL_SERVER_ERROR"]));
            }

            return resolve({
                statusCode: 200,
                error: false,
                result: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token: tokenData.token,
                expiresAt: tokenData.expiresAt,
                code: "TOKEN_REFRESHED",
                message: "Token refreshed successfully",
            });
        } catch (error) {
            logger.error(`[Auth] Error when refreshing token`, error);
            return reject(projection.errorResponse(error));
        }
    });
}

export async function getUser(req: request): Promise<any> {
    logger.info(`[Auth] Get user API called`);

    return new Promise<any>(async function (resolve, reject) {
        try {
            // User is already attached to request by isValidToken middleware
            const user = req.user;

            if (!user) {
                return reject(projection.errorAPIResponse(null, 401, "UNAUTHORIZED", messages["UNAUTHORIZED"]));
            }

            return resolve({
                statusCode: 200,
                error: false,
                result: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                code: "USER_FETCH_SUCCESS",
                message: "User fetched successfully",
            });
        } catch (error) {
            logger.error(`[Auth] Error when fetching user`, error);
            return reject(projection.errorResponse(error));
        }
    });
}


