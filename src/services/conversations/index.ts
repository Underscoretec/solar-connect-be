import * as express from "express";
import projection from "../projection";
import messages from "../messages.json";
import * as controllers from "./controllers";
import { WELCOME_MESSAGE } from "../../prompts/welcomeMessage";
import isValidToken from "../../middleware/isValidToken";

const router = express.Router();

/**
 * @type - GET
 * @route -  /api/conversations/welcome
 * @desc - Get welcome message without creating conversation
 * @access - Public
 */
router.get("/welcome", async (req, res) => {
    try {
        return res.status(200).send(
            projection.successResponse(
                WELCOME_MESSAGE as any,
                200,
                "WELCOME_FOUND",
                "Welcome message retrieved"
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - POST
 * @route -  /api/conversations
 * @desc - Create a new conversation
 * @access - Public
 */
router.post("/", async (req, res) => {
    try {
        const conversation = await controllers.createConversation({
            visitorFingerprint: req.body.visitorFingerprint,
            ip: req.ip || req.headers['x-forwarded-for'] as string,
            userAgent: req.headers['user-agent'],
            initialUserResponse: req.body.initialUserResponse, // 'interested' or undefined
        });

        return res.status(200).send(
            projection.successResponse(
                conversation,
                200,
                "CONVERSATION_CREATED",
                messages["CONVERSATION_CREATED"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - GET
 * @route -  /api/conversations/:id
 * @desc - Get conversation by ID
 * @access - Public
 */
router.get("/:id", async (req, res) => {
    try {
        const conversation = await controllers.getConversationById(req.params.id);

        if (!conversation) {
            return res.status(404).send(
                projection.errorAPIResponse(null, 404, "CONVERSATION_NOT_FOUND", messages["CONVERSATION_NOT_FOUND"])
            );
        }

        return res.status(200).send(
            projection.successResponse(
                conversation,
                200,
                "CONVERSATION_FOUND",
                messages["CONVERSATION_FOUND"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - GET
 * @route -  /api/conversations
 * @desc - Get conversations list
 * @access - Public
 */
router.get("/", isValidToken as any, async (req, res) => {
    try {
        const { conversations, total } = await controllers.getConversationsList({
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 10,
            status: req.query.status as string,
            customerId: req.query.customerId as string
        });

        return res.status(200).send(
            projection.successResponse(
                conversations,
                200,
                "CONVERSATION_FOUND",
                messages["CONVERSATION_FOUND"],
                total
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - PUT
 * @route -  /api/conversations/:id/status
 * @desc - Update conversation status
 * @access - Public
 */
router.put("/:id/status", async (req, res) => {
    try {
        const conversation = await controllers.updateConversationStatus(
            req.params.id,
            req.body.status
        );

        if (!conversation) {
            return res.status(404).send(
                projection.errorAPIResponse(null, 404, "CONVERSATION_NOT_FOUND", messages["CONVERSATION_NOT_FOUND"])
            );
        }

        return res.status(200).send(
            projection.successResponse(
                conversation,
                200,
                "CONVERSATION_UPDATED",
                messages["CONVERSATION_UPDATED"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - PUT
 * @route -  /api/conversations/:id/customer
 * @desc - Link customer to conversation
 * @access - Public
 */
router.put("/:id/customer", async (req, res) => {
    try {
        const conversation = await controllers.updateConversationCustomer(
            req.params.id,
            req.body.customerId
        );

        if (!conversation) {
            return res.status(404).send(
                projection.errorAPIResponse(null, 404, "CONVERSATION_NOT_FOUND", messages["CONVERSATION_NOT_FOUND"])
            );
        }

        return res.status(200).send(
            projection.successResponse(
                conversation,
                200,
                "CONVERSATION_UPDATED",
                messages["CONVERSATION_UPDATED"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});


/**
 * @type - POST
 * @route -  /api/conversations/:id/message
 * @desc - Send a message and get LLM response with business logic handling
 * @access - Public
 */
router.post('/:id/message', async (req, res) => {
    const conversationId = req.params.id;
    const { text, attachments, isConformed } = req.body;

    try {
        const { conversation, metadata } = await controllers.sendMessageWithBusinessLogic(
            conversationId,
            text,
            attachments,
            isConformed
        );

        // Build response with conversation and metadata
        const responseData = {
            ...conversation.toObject(),
            _metadata: metadata
        };

        return res.status(200).send(
            projection.successResponse(
                responseData as any,
                200,
                "MESSAGE_SENT",
                messages["MESSAGE_SENT"]
            )
        );
    } catch (error: any) {
        if (error.message === 'Conversation not found') {
            return res.status(404).send(
                projection.errorAPIResponse(
                    null,
                    404,
                    "CONVERSATION_NOT_FOUND",
                    messages["CONVERSATION_NOT_FOUND"]
                )
            );
        }

        return res.status(500).send(
            projection.errorAPIResponse(
                null,
                500,
                "MESSAGE_SEND_FAILED",
                error.message || messages["MESSAGE_SEND_FAILED"]
            )
        );
    }
});

/**
 * @type - GET
 * @route -  /api/conversations/stats/dashboard
 * @desc - Get dashboard statistics
 * @access - Public
 */
router.get("/stats/dashboard", isValidToken as any, async (req, res) => {
    try {
        const stats = await controllers.getDashboardStats();

        return res.status(200).send(
            projection.successResponse(
                stats as any,
                200,
                "DASHBOARD_STATS_FOUND",
                "Dashboard statistics retrieved"
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

export default router;

