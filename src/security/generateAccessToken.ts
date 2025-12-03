import jwt, { SignOptions } from "jsonwebtoken";
import { Payload } from "../services/interfaces";
import logger from "../services/logger";

export default async function generateAccessToken(payload: Payload, tokenSecret: string, expires: string) {
  try {
    const tokenSec = tokenSecret || "test_sec";
    const options: SignOptions = { expiresIn: expires || "24h" } as SignOptions;

    const token = jwt.sign(payload, tokenSec, options);

    const decode = jwt.verify(token, tokenSec) as { exp: number };
    const expiryAt = new Date(decode.exp * 1000);

    return {
      token: token,
      expiresAt: expiryAt
    };
  } catch (error) {
    logger.error("Error when generating access token", error);
    return null;
  }
}

