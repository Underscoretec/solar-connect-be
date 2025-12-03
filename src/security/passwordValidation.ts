import passwordValidator from "password-validator"
import bcrypt from "bcrypt"
import logger from "../services/logger";

export default async function passwordValidation(password: string) {
    try {
        let schema = new passwordValidator();

        schema
            .is().min(8)
            .is().max(16)
            .has().uppercase(1)
            .has().lowercase()
            .has().digits(1)
            .has().symbols()
            .has().not().spaces()
            .is().not().oneOf(['Passw0rd@', 'Password@123', 'Pass@12345']);

        const check: any = schema.validate(password, { details: true });
        let passwordHash

        if (check?.length === 0) {
            const salt = await bcrypt.genSalt(12);
            passwordHash = await bcrypt.hash(password, salt);
        }

        return passwordHash ?? check
    } catch (err) {
        logger.error("Error in password validation process", err)
        return null;
    }
}

