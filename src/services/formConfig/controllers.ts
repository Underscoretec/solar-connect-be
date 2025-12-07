import FormConfig from './model';
import logger from '../logger';
import { IFormConfig } from '../interfaces';

interface CreateFormConfigParams {
  name: string;
  slug: string;
  description?: string;
  version: number;
  formJson: any;
  createdBy?: string;
  isActive?: boolean;
}

export async function createFormConfig(
  params: CreateFormConfigParams
): Promise<IFormConfig> {
  try {
    const formConfig = new FormConfig({
      name: params.name,
      slug: params.slug,
      description: params.description,
      version: params.version,
      formJson: params.formJson,
      createdBy: params.createdBy,
      isActive: params.isActive !== undefined ? params.isActive : true,
    });

    await formConfig.save();
    logger.info(`Form config created: ${formConfig.slug}`);
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

export async function getFormConfigBySlug(slug: string): Promise<IFormConfig | null> {
  try {
    const formConfig = await FormConfig.findOne({ slug, isActive: true });
    return formConfig;
  } catch (error: any) {
    logger.error(`Error getting form config by slug: ${error.message}`);
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
        { name: { $regex: params.search, $options: 'i' } },
        { slug: { $regex: params.search, $options: 'i' } },
        { description: { $regex: params.search, $options: 'i' } },
      ];
    }

    const [formConfigs, total] = await Promise.all([
      FormConfig.find(query)
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
    const formConfig = await FormConfig.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
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

