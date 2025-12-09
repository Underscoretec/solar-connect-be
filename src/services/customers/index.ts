import * as express from "express";
import { request, response } from "../interfaces";
import projection from "../projection";
import messages from "../messages.json";
import * as controllers from "./controllers";
import isValidToken from "../../middleware/isValidToken";

const router = express.Router();

/**
 * @type - POST
 * @route -  /api/customers
 * @desc - Create or update customer
 * @access - Public
 */
router.post("/", isValidToken as any, async (req, res) => {
    try {
        const customer = await controllers.createOrUpdateCustomer({
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone,
            address: req.body.address,
            attachments: req.body.attachments,
            meta: req.body.meta,
            conversationId: req.body.conversationId
        });

        return res.status(200).send(
            projection.successResponse(
                customer,
                200,
                "CUSTOMER_CREATED",
                messages["CUSTOMER_CREATED"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - GET
 * @route -  /api/customers/:id
 * @desc - Get customer by ID
 * @access - Public
 */
router.get("/:id", isValidToken as any, async (req, res) => {
    try {
        const customer = await controllers.getCustomerById(req.params.id);

        if (!customer) {
            return res.status(404).send(
                projection.errorAPIResponse(null, 404, "CUSTOMER_NOT_FOUND", messages["CUSTOMER_NOT_FOUND"])
            );
        }

        return res.status(200).send(
            projection.successResponse(
                customer,
                200,
                "CUSTOMER_FOUND",
                messages["CUSTOMER_FOUND"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - GET
 * @route -  /api/customers
 * @desc - Get customers list
 * @access - Public
 */
router.get("/", isValidToken as any, async (req, res) => {
    try {
        const { customers, total } = await controllers.getCustomersList({
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 10,
            status: req.query.status as string,
            search: req.query.search as string
        });

        return res.status(200).send(
            projection.successResponse(
                customers,
                200,
                "CUSTOMER_FOUND",
                messages["CUSTOMER_FOUND"],
                total
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

/**
 * @type - PUT
 * @route -  /api/customers/:id/profile
 * @desc - Update customer profile
 * @access - Public
 */
router.put("/:id/profile", isValidToken as any, async (req, res) => {
    try {
        const customer = await controllers.updateCustomerProfile(
            req.params.id,
            req.body.profile
        );

        if (!customer) {
            return res.status(404).send(
                projection.errorAPIResponse(null, 404, "CUSTOMER_NOT_FOUND", messages["CUSTOMER_NOT_FOUND"])
            );
        }

        return res.status(200).send(
            projection.successResponse(
                customer,
                200,
                "CUSTOMER_UPDATED",
                messages["CUSTOMER_UPDATED"]
            )
        );
    } catch (err: any) {
        return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
    }
});

export default router;

