import express from "express";
import conversations from "../services/conversations/index";
import customers from "../services/customers/index";
import attachments from "../services/attachments/index";
import auth from "../services/authentication/index";
import formConfigs from "../services/formConfig/index";

const router = express.Router();

// Here create module routes
router.use("/auth", auth);
router.use("/conversations", conversations);
router.use("/customers", customers);
router.use("/attachments", attachments);
router.use("/form-configs", formConfigs);

export default router;

