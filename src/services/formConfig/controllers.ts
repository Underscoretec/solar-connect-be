import FormConfig from './model';
import logger from '../logger';
import { IFormConfig } from '../interfaces';

interface CreateFormConfigParams {
  title: string;
  welcomeMessage: string;
  locale: string;
  description: string;
  formJson: any;
  completionMessage?: string;
  completionActions?: string[];
  completionType?: string;
  createdBy?: string;
  isActive?: boolean;
}

export async function createFormConfig(
  params: CreateFormConfigParams
): Promise<IFormConfig> {
  try {
    // Handle formJson - it might be a string (minified) or an object
    let formJson = params.formJson;

    // If formJson is a string, parse it first
    if (typeof formJson === 'string') {
      try {
        formJson = JSON.parse(formJson);
      } catch (e) {
        // If parsing fails, use as-is (will be stored as string)
        logger.warn(`Failed to parse formJson string: ${e}`);
      }
    }

    // Merge completion settings into formJson if provided and formJson is an object
    if (typeof formJson === 'object' && formJson !== null && (params.completionMessage || params.completionActions || params.completionType)) {
      formJson = {
        ...formJson,
        completion: {
          message: params.completionMessage || formJson.completion?.message || "Thank you! I've collected all the necessary information. Our team will review your details and reach out within 24 hours.",
          actions: params.completionActions || formJson.completion?.actions || [],
          type: params.completionType || formJson.completion?.type || "summary",
        },
      };
      // Always keep formJson as an object, never stringify
    }

    // Check if there's already an active form config
    const activeFormConfig = await FormConfig.findOne({ isActive: true });
    const shouldBeActive = params.isActive !== undefined
      ? params.isActive
      : !activeFormConfig; // Default to true only if no active form exists

    // If enabling this form, disable all other forms
    if (shouldBeActive) {
      await FormConfig.updateMany(
        { isActive: true },
        { $set: { isActive: false } }
      );
    }

    const formConfig = new FormConfig({
      title: params.title,
      welcomeMessage: params.welcomeMessage,
      locale: params.locale,
      description: params.description,
      formJson: formJson,
      createdBy: params.createdBy,
      isActive: shouldBeActive,
    });

    await formConfig.save();
    logger.info(`Form config created: ${formConfig.title}`);
    return formConfig;
  } catch (error: any) {
    logger.error(`Error creating form config: ${error.message}`);
    throw error;
  }
}

export async function getFormConfigById(id: string): Promise<IFormConfig | null> {
  try {
    const formConfig = await FormConfig.findById(id);
    return formConfig;
  } catch (error: any) {
    logger.error(`Error getting form config by ID: ${error.message}`);
    throw error;
  }
}

export async function getFormConfigByLocale(): Promise<IFormConfig | null> {
  try {
    const formConfig = await FormConfig.findOne({ isActive: true });
    return formConfig;
  } catch (error: any) {
    logger.error(`Error getting form config by locale: ${error.message}`);
    throw error;
  }
}


export async function getFormConfigsList(params: {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}): Promise<{ formConfigs: IFormConfig[]; total: number }> {
  try {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const query: any = {};

    if (params.isActive !== undefined) {
      query.isActive = params.isActive;
    }

    if (params.search) {
      query.$or = [
        { title: { $regex: params.search, $options: 'i' } },
        { locale: { $regex: params.search, $options: 'i' } },
        { description: { $regex: params.search, $options: 'i' } },
      ];
    }

    const [formConfigs, total] = await Promise.all([
      FormConfig.find(query)
        .select('-formJson') // Exclude formJson from list
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      FormConfig.countDocuments(query),
    ]);

    return { formConfigs: formConfigs as IFormConfig[], total };
  } catch (error: any) {
    logger.error(`Error getting form configs list: ${error.message}`);
    throw error;
  }
}

export async function updateFormConfig(
  id: string,
  updates: Partial<CreateFormConfigParams>
): Promise<IFormConfig | null> {
  try {
    // Get existing form config to merge completion settings
    const existingConfig = await FormConfig.findById(id);
    if (!existingConfig) {
      return null;
    }

    // Handle formJson - it might be a string (minified) or an object
    let formJson = updates.formJson !== undefined ? updates.formJson : existingConfig.formJson;

    // If formJson is a string, parse it first
    if (typeof formJson === 'string') {
      try {
        formJson = JSON.parse(formJson);
      } catch (e) {
        // If parsing fails, use as-is
        logger.warn(`Failed to parse formJson string: ${e}`);
      }
    }

    // Merge completion settings into formJson if provided and formJson is an object
    if (typeof formJson === 'object' && formJson !== null && (updates.completionMessage || updates.completionActions || updates.completionType)) {
      formJson = {
        ...formJson,
        completion: {
          message: updates.completionMessage !== undefined
            ? updates.completionMessage
            : (formJson.completion?.message || "Thank you! I've collected all the necessary information. Our team will review your details and reach out within 24 hours."),
          actions: updates.completionActions !== undefined
            ? updates.completionActions
            : (formJson.completion?.actions || []),
          type: updates.completionType !== undefined
            ? updates.completionType
            : (formJson.completion?.type || "summary"),
        },
      };
      // Always keep formJson as an object, never stringify
    }

    const updateData: any = {
      ...updates,
      formJson: formJson,
      updatedAt: new Date(),
    };

    // Remove completion fields from update data as they're merged into formJson
    delete updateData.completionMessage;
    delete updateData.completionActions;
    delete updateData.completionType;

    const formConfig = await FormConfig.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    return formConfig;
  } catch (error: any) {
    logger.error(`Error updating form config: ${error.message}`);
    throw error;
  }
}

export async function deleteFormConfig(id: string): Promise<boolean> {
  try {
    const result = await FormConfig.findByIdAndDelete(id);
    return !!result;
  } catch (error: any) {
    logger.error(`Error deleting form config: ${error.message}`);
    throw error;
  }
}

export async function toggleFormConfigActive(id: string): Promise<IFormConfig | null> {
  try {
    const formConfig = await FormConfig.findById(id);
    if (!formConfig) {
      return null;
    }

    const newActiveStatus = !formConfig.isActive;

    // If enabling this form, disable all other forms
    if (newActiveStatus) {
      await FormConfig.updateMany(
        { _id: { $ne: id } },
        { $set: { isActive: false } }
      );
    }

    // Update this form's active status
    formConfig.isActive = newActiveStatus;
    await formConfig.save();

    logger.info(`Form config ${id} active status toggled to ${newActiveStatus}`);
    return formConfig;
  } catch (error: any) {
    logger.error(`Error toggling form config active status: ${error.message}`);
    throw error;
  }
}

/**
 * Get a specific field from the active FormConfig
 * @param field - The field to retrieve ('welcomeMessage' or 'formJson')
 * @returns The value of the requested field from the active FormConfig, or null if not found
 */
export async function getActiveFormConfigField(
  field: 'welcomeMessage' | 'formJson'
): Promise<string | any | null> {
  try {
    const activeFormConfig = await FormConfig.findOne({ isActive: true }).select(field);

    if (!activeFormConfig) {
      return null;
    }

    return activeFormConfig[field] || null;
  } catch (error: any) {
    logger.error(`Error getting active form config field: ${error.message}`);
    throw error;
  }
}

