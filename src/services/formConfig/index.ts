import * as express from "express";
import { request, response } from "../interfaces";
import projection from "../projection";
import messages from "../messages.json";
import * as controllers from "./controllers";

const router = express.Router();

/**
 * @type - POST
 * @route -  /api/form-configs
 * @desc - Create form config
 * @access - Public
 */
router.post("/", async (req, res) => {
  try {
    const formConfig = await controllers.createFormConfig({
      name: req.body.name,
      slug: req.body.slug,
      description: req.body.description,
      version: req.body.version,
      formJson: req.body.formJson,
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
 * @access - Public
 */
router.get("/:id", async (req, res) => {
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
 * @route -  /api/form-configs/slug/:slug
 * @desc - Get form config by slug
 * @access - Public
 */
router.get("/slug/:slug", async (req, res) => {
  try {
    const formConfig = await controllers.getFormConfigBySlug(req.params.slug);

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
 * @route -  /api/form-configs
 * @desc - Get form configs list
 * @access - Public
 */
router.get("/", async (req, res) => {
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
 * @access - Public
 */
router.put("/:id", async (req, res) => {
  try {
    const formConfig = await controllers.updateFormConfig(req.params.id, {
      name: req.body.name,
      slug: req.body.slug,
      description: req.body.description,
      version: req.body.version,
      formJson: req.body.formJson,
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
 * @access - Public
 */
router.delete("/:id", async (req, res) => {
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

export default router;

