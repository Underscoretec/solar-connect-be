import * as express from "express";
import { request, response } from "../interfaces";
import projection from "../projection";
import messages from "../messages.json";
import * as controllers from "./controllers";
import isValidToken from "../../middleware/isValidToken";

const router = express.Router();

/**
 * @type - POST
 * @route -  /api/form-configs
 * @desc - Create form config
 * @access - Private
 */
router.post("/", isValidToken as any, async (req, res) => {
  try {
    const formConfig = await controllers.createFormConfig({
      title: req.body.title,
      welcomeMessage: req.body.welcomeMessage,
      locale: req.body.locale,
      description: req.body.description,
      formJson: req.body.formJson,
      completionMessage: req.body.completionMessage,
      completionActions: req.body.completionActions,
      completionType: req.body.completionType,
      createdBy: req.body.createdBy,
      isActive: req.body.isActive,
    });

    return res.status(200).send(
      projection.successResponse(
        formConfig,
        200,
        "FORM_CONFIG_CREATED",
        "Form configuration created successfully"
      )
    );
  } catch (err: any) {
    return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
  }
});

/**
 * @type - GET
 * @route -  /api/form-configs/:id
 * @desc - Get form config by ID
 * @access - Private
 */
router.get("/:id", isValidToken as any, async (req, res) => {
  try {
    const formConfig = await controllers.getFormConfigById(req.params.id);

    if (!formConfig) {
      return res.status(404).send(
        projection.errorAPIResponse(null, 404, "FORM_CONFIG_NOT_FOUND", "Form configuration not found")
      );
    }

    return res.status(200).send(
      projection.successResponse(
        formConfig,
        200,
        "FORM_CONFIG_FOUND",
        "Form configuration found"
      )
    );
  } catch (err: any) {
    return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
  }
});

/**
 * @type - GET
 * @route -  /api/form-configs/active
 * @desc - Get active form config (public endpoint for chat)
 * @access - Public
 */
router.get("/active", async (req, res) => {
  try {
    const formConfig = await controllers.getFormConfigByLocale();

    if (!formConfig) {
      return res.status(404).send(
        projection.errorAPIResponse(null, 404, "FORM_CONFIG_NOT_FOUND", "No active form configuration found")
      );
    }

    return res.status(200).send(
      projection.successResponse(
        formConfig,
        200,
        "FORM_CONFIG_FOUND",
        "Active form configuration found"
      )
    );
  } catch (err: any) {
    return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
  }
});

/**
 * @type - GET
 * @route -  /api/form-configs
 * @desc - Get form configs list
 * @access - Private
 */
router.get("/", isValidToken as any, async (req, res) => {
  try {
    const { formConfigs, total } = await controllers.getFormConfigsList({
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      search: req.query.search as string,
      isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    });

    return res.status(200).send(
      projection.successResponse(
        formConfigs,
        200,
        "FORM_CONFIGS_FOUND",
        "Form configurations found",
        total
      )
    );
  } catch (err: any) {
    return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
  }
});

/**
 * @type - PUT
 * @route -  /api/form-configs/:id
 * @desc - Update form config
 * @access - Private
 */
router.put("/:id", isValidToken as any, async (req, res) => {
  try {
    const formConfig = await controllers.updateFormConfig(req.params.id, {
      title: req.body.title,
      welcomeMessage: req.body.welcomeMessage,
      locale: req.body.locale,
      description: req.body.description,
      formJson: req.body.formJson,
      completionMessage: req.body.completionMessage,
      completionActions: req.body.completionActions,
      completionType: req.body.completionType,
      isActive: req.body.isActive,
    });

    if (!formConfig) {
      return res.status(404).send(
        projection.errorAPIResponse(null, 404, "FORM_CONFIG_NOT_FOUND", "Form configuration not found")
      );
    }

    return res.status(200).send(
      projection.successResponse(
        formConfig,
        200,
        "FORM_CONFIG_UPDATED",
        "Form configuration updated successfully"
      )
    );
  } catch (err: any) {
    return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
  }
});

/**
 * @type - DELETE
 * @route -  /api/form-configs/:id
 * @desc - Delete form config
 * @access - Private
 */
router.delete("/:id", isValidToken as any, async (req, res) => {
  try {
    const deleted = await controllers.deleteFormConfig(req.params.id);

    if (!deleted) {
      return res.status(404).send(
        projection.errorAPIResponse(null, 404, "FORM_CONFIG_NOT_FOUND", "Form configuration not found")
      );
    }

    return res.status(200).send(
      projection.successResponse(
        null,
        200,
        "FORM_CONFIG_DELETED",
        "Form configuration deleted successfully"
      )
    );
  } catch (err: any) {
    return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
  }
});

/**
 * @type - PUT
 * @route -  /api/form-configs/:id/toggle-active
 * @desc - Toggle form config active status
 * @access - Private
 */
router.put("/:id/toggle-active", isValidToken as any, async (req, res) => {
  try {
    const formConfig = await controllers.toggleFormConfigActive(req.params.id);

    if (!formConfig) {
      return res.status(404).send(
        projection.errorAPIResponse(null, 404, "FORM_CONFIG_NOT_FOUND", "Form configuration not found")
      );
    }

    return res.status(200).send(
      projection.successResponse(
        formConfig,
        200,
        "FORM_CONFIG_TOGGLED",
        "Form configuration active status updated successfully"
      )
    );
  } catch (err: any) {
    return res.status(500).send(projection.errorAPIResponse(null, 500, "INTERNAL_SERVER_ERROR", err.message));
  }
});

export default router;

