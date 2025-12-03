import * as express from "express";
import { upload } from "../../middleware/upload";
import { request, response } from "../interfaces";
import projection from "../projection";
import messages from "../messages.json";
import * as controllers from "./controllers";

const router = express.Router();

/**
 * @type - POST
 * @route -  /api/attachments
 * @desc - Upload a file attachment
 * @access - Public
 */
router.post("/", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send(
                projection.errorAPIResponse(null, 400, "FILE_EMPTY", messages["FILE_EMPTY"])
            );
        }

        const attachment = await controllers.uploadFile({
            file: req.file.buffer,
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            conversationId: req.body.conversationId,
            customerId: req.body.customerId,
            type: req.body.type,
            messageId: req.body.messageId
        });

        return res.status(200).send(
            projection.successResponse(
                attachment,
                200,
                "ATTACHMENT_UPLOADED",
                messages["ATTACHMENT_UPLOADED"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - GET
 * @route -  /api/attachments/conversation/:conversationId
 * @desc - Get attachments by conversation
 * @access - Public
 */
router.get("/conversation/:conversationId", async (req, res) => {
    try {
        const attachments = await controllers.getAttachmentsByConversation(req.params.conversationId);

        return res.status(200).send(
            projection.successResponse(
                attachments,
                200,
                "FOUND",
                messages["FOUND"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - GET
 * @route -  /api/attachments/customer/:customerId
 * @desc - Get attachments by customer
 * @access - Public
 */
router.get("/customer/:customerId", async (req, res) => {
    try {
        const attachments = await controllers.getAttachmentsByCustomer(req.params.customerId);

        return res.status(200).send(
            projection.successResponse(
                attachments,
                200,
                "FOUND",
                messages["FOUND"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - GET
 * @route -  /api/attachments/:id
 * @desc - Get attachment by ID
 * @access - Public
 */
router.get("/:id", async (req, res) => {
    try {
        const attachment = await controllers.getAttachmentById(req.params.id);

        if (!attachment) {
            return res.status(404).send(
                projection.errorAPIResponse(null, 404, "ATTACHMENT_NOT_FOUND", messages["ATTACHMENT_NOT_FOUND"])
            );
        }

        return res.status(200).send(
            projection.successResponse(
                attachment,
                200,
                "FOUND",
                messages["FOUND"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

export default router;

