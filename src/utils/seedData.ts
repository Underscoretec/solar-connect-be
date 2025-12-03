import logger from "../services/logger";
import Users from "../services/authentication/model";
import config from "../config";
import passwordValidation from "../security/passwordValidation";

export default async function seedData() {
  try {
    // Validate that admin credentials are provided
    if (!config.adminEmail || !config.adminPassword) {
      logger.warn('⚠️  Admin email or password not provided in environment variables. Skipping admin seed.');
      return;
    }

    const adminEmail = config.adminEmail.toLowerCase().trim();

    // Check if any user with this email already exists
    const existingUser = await Users.findOne({ email: adminEmail });

    if (existingUser) {
      // Check if it's already an admin
      if (existingUser.role === "admin" || existingUser.role === "superAdmin") {
        logger.info(`👑 Admin user already exists with email: ${adminEmail}`);
      } else {
        logger.warn(`⚠️  User with email ${adminEmail} already exists with role: ${existingUser.role}. Skipping admin seed.`);
      }
      return;
    }

    // Validate and hash the password
    const passwordHash = await passwordValidation(config.adminPassword);

    if (typeof passwordHash !== "string") {
      logger.error('❌ Admin password validation failed. Please ensure password meets requirements:', passwordHash);
      return;
    }

    // Create the admin user
    const newAdmin = await new Users({
      name: config.adminName || "Admin",
      email: config.adminEmail.toLowerCase().trim(),
      password: passwordHash,
      role: config.adminRole || "admin",
      enabled: 1,
      isVerified: 1,
      emailVerified: {
        verifiedAt: Date.now(),
        verified: true
      }
    }).save();

    if (newAdmin) {
      logger.info(`✅ Admin user created successfully. Email: ${newAdmin.email}, Role: ${newAdmin.role}`);
    }
  } catch (error) {
    logger.error(`❌ Error creating admin user during seed:`, error);
  }
}

