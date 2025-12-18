import express from 'express';
import isValidToken from '../../middleware/isValidToken';
import { request, response } from '../interfaces';
import * as communicationController from './controllers';
import logger from '../logger';
import projection from '../projection';
import messages from '../messages.json';

const router = express.Router();

/**
 * Generate email template using LLM
 * POST /communications/generate-email
 */
router.post('/generate-email', isValidToken as any, async (req, res) => {
  try {
    const { customerId, prompt, context } = req.body;

    if (!customerId || !prompt) {
      return res.status(400).send(
        projection.errorAPIResponse(null, 400, 'MISSING_FIELDS', 'customerId and prompt are required')
      );
    }

    const result = await communicationController.generateEmail(customerId, prompt, context);

    return res.status(200).send(
      projection.successResponse(result as any, 200, 'EMAIL_GENERATED', 'Email template generated successfully')
    );
  } catch (error: any) {
    logger.error(`Generate email route error: ${error.message}`);
    return res.status(500).send(
      projection.errorAPIResponse(null, 500, 'GENERATION_FAILED', error.message || 'Failed to generate email')
    );
  }
});

/**
 * Send email to customer
 * POST /communications/send-email
 */
router.post('/send-email', isValidToken as any, async (req: request, res) => {
  try {
    const { customerId, subject, content } = req.body;
    const sentById = req.user?._id?.toString();

    if (!customerId || !subject || !content) {
      return res.status(400).send(
        projection.errorAPIResponse(null, 400, 'MISSING_FIELDS', 'customerId, subject, and content are required')
      );
    }

    if (!sentById) {
      return res.status(401).send(
        projection.errorAPIResponse(null, 401, 'UNAUTHORIZED', 'User not authenticated')
      );
    }

    const communication = await communicationController.sendEmailToCustomer(
      customerId,
      subject,
      content,
      sentById
    );

    return res.status(200).send(
      projection.successResponse(communication, 200, 'EMAIL_SENT', 'Email sent successfully')
    );
  } catch (error: any) {
    logger.error(`Send email route error: ${error.message}`);
    return res.status(500).send(
      projection.errorAPIResponse(null, 500, 'SEND_FAILED', error.message || 'Failed to send email')
    );
  }
});

/**
 * Get communication history for a customer
 * GET /communications/customer/:customerId
 */
router.get('/customer/:customerId', isValidToken as any, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { type, status, page, limit } = req.query;

    const result = await communicationController.getCustomerCommunications(customerId, {
      type: type as any,
      status: status as any,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined
    });

    return res.status(200).send(
      projection.successResponse(
        result.communications,
        200,
        'COMMUNICATIONS_FETCHED',
        'Communications fetched successfully',
        result.total
      )
    );
  } catch (error: any) {
    logger.error(`Get communications route error: ${error.message}`);
    return res.status(500).send(
      projection.errorAPIResponse(null, 500, 'FETCH_FAILED', error.message || 'Failed to fetch communications')
    );
  }
});

/**
 * Get communication by ID
 * GET /communications/:id
 */
router.get('/:id', isValidToken as any, async (req, res) => {
  try {
    const { id } = req.params;
    const communication = await communicationController.getCommunicationById(id);

    if (!communication) {
      return res.status(404).send(
        projection.errorAPIResponse(null, 404, 'NOT_FOUND', 'Communication not found')
      );
    }

    return res.status(200).send(
      projection.successResponse(communication, 200, 'COMMUNICATION_FETCHED', 'Communication fetched successfully')
    );
  } catch (error: any) {
    logger.error(`Get communication route error: ${error.message}`);
    return res.status(500).send(
      projection.errorAPIResponse(null, 500, 'FETCH_FAILED', error.message || 'Failed to fetch communication')
    );
  }
});

/**
 * Update communication
 * PATCH /communications/:id
 */
router.patch('/:id', isValidToken as any, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const communication = await communicationController.updateCommunication(id, updates);

    if (!communication) {
      return res.status(404).send(
        projection.errorAPIResponse(null, 404, 'NOT_FOUND', 'Communication not found')
      );
    }

    return res.status(200).send(
      projection.successResponse(communication, 200, 'COMMUNICATION_UPDATED', 'Communication updated successfully')
    );
  } catch (error: any) {
    logger.error(`Update communication route error: ${error.message}`);
    return res.status(500).send(
      projection.errorAPIResponse(null, 500, 'UPDATE_FAILED', error.message || 'Failed to update communication')
    );
  }
});

/**
 * Delete communication
 * DELETE /communications/:id
 */
router.delete('/:id', isValidToken as any, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await communicationController.deleteCommunication(id);

    if (!deleted) {
      return res.status(404).send(
        projection.errorAPIResponse(null, 404, 'NOT_FOUND', 'Communication not found')
      );
    }

    return res.status(200).send(
      projection.successResponse(null, 200, 'COMMUNICATION_DELETED', 'Communication deleted successfully')
    );
  } catch (error: any) {
    logger.error(`Delete communication route error: ${error.message}`);
    return res.status(500).send(
      projection.errorAPIResponse(null, 500, 'DELETE_FAILED', error.message || 'Failed to delete communication')
    );
  }
});

/**
 * Get communication stats
 * GET /communications/stats/overview
 */
router.get('/stats/overview', isValidToken as any, async (req, res) => {
  try {
    const stats = await communicationController.getCommunicationStats();

    return res.status(200).send(
      projection.successResponse(stats as any, 200, 'STATS_FETCHED', 'Communication stats fetched successfully')
    );
  } catch (error: any) {
    logger.error(`Get stats route error: ${error.message}`);
    return res.status(500).send(
      projection.errorAPIResponse(null, 500, 'FETCH_FAILED', error.message || 'Failed to fetch stats')
    );
  }
});

export default router;

